import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBlock } from '../../components/AppUI';
import { useAuth } from '../../contexts/AuthContext';
import { realRows } from '../../utils/realData';
import { supabase } from '../../lib/supabase';
import { color, radius, tapTarget } from '../../constants/theme';
import { transitStyles } from '../../constants/transitStyles';
import {
  currentReportingPeriod,
  formatReportingPeriod,
  periodContains,
  periodRangeUtc,
  type ReportingPeriod,
} from '../../utils/reportingPeriod';
import { calculateSafetyScore } from '../../utils/operationsSummary';

type SpeedRecord = { id: string; created_at: string; speed_kph: number; limit_kph: number; score_deduction: number | null };
type RouteRecord = { id: string; created_at: string; status: string; reason: string | null };

async function readDriverRecords<T>(
  table: 'speed_events' | 'trip_violations',
  columns: string,
  driverId: string,
  start: string,
  end: string
): Promise<T[]> {
  const records: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase
      .from(table)
      .select('*')
      .eq('driver_id', driverId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data || []) as T[];
    records.push(...realRows(page));
    if (page.length < pageSize) return records;
  }
}

export default function RecordsScreen() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<ReportingPeriod>(currentReportingPeriod('day'));
  const [speeds, setSpeeds] = useState<SpeedRecord[]>([]);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoadError('Sign in to view records.');
      setLoading(false);
      return;
    }
    const { start, end } = periodRangeUtc(period);
    try {
      const readiness = await supabase.rpc('driver_records_access_ready');
      if (readiness.error || readiness.data !== true) throw readiness.error || new Error('Not ready');
      const [speedRecords, routeRecords] = await Promise.all([
        readDriverRecords<SpeedRecord>('speed_events', 'id,created_at,speed_kph,limit_kph,score_deduction', user.id, start, end),
        readDriverRecords<RouteRecord>('trip_violations', 'id,created_at,status,reason', user.id, start, end),
      ]);
      setSpeeds(speedRecords);
      setRoutes(routeRecords);
      setLoadError('');
    } catch {
      setSpeeds([]);
      setRoutes([]);
      setLoadError('Records unavailable. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmed = routes.filter((item) => item.status === 'confirmed');
  const pendingCount = routes.filter((item) => item.status !== 'confirmed' && item.status !== 'dismissed').length;
  const speedDeduction = speeds.reduce((sum, item) => sum + Number(item.score_deduction || 0), 0);
  const score = calculateSafetyScore(speedDeduction, confirmed.length);

  const stepPeriod = (delta: number) => {
    if (period.mode === 'day') {
      const d = new Date(`${period.key}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta);
      setPeriod({ mode: 'day', key: d.toISOString().slice(0, 10) });
    } else if (period.mode === 'week') {
      const d = new Date(`${period.key}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta * 7);
      setPeriod({ mode: 'week', key: d.toISOString().slice(0, 10) });
    } else if (period.mode === 'month') {
      const [y, m] = period.key.split('-').map(Number);
      const next = new Date(Date.UTC(y, (m || 1) - 1 + delta, 1));
      setPeriod({
        mode: 'month',
        key: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`,
      });
    } else {
      const y = Number(period.key) + delta;
      setPeriod({ mode: 'year', key: String(y) });
    }
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <View style={styles.periodPanel}>
        <View style={styles.masthead}>
          <Text accessibilityRole="header" style={styles.title}>Safety records</Text>
          <View style={styles.dateNavRow}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous reporting period" onPress={() => stepPeriod(-1)} style={styles.arrowBtn}>
              <Ionicons name="chevron-back" size={20} color={color.onDark} />
            </TouchableOpacity>
            <Text style={styles.dateNavText}>{formatReportingPeriod(period)}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next reporting period" onPress={() => stepPeriod(1)} style={styles.arrowBtn}>
              <Ionicons name="chevron-forward" size={20} color={color.onDark} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.segmentBar}>
          {(
            [
              { key: 'day', label: 'Day' },
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
              { key: 'year', label: 'Year' },
            ] as const
          ).map((m) => {
            const active = period.mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setPeriod(currentReportingPeriod(m.key))}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </View>

      {loading ? (
        <View style={{ gap: 14, marginTop: 6 }}>
          <SkeletonBlock height={140} />
          <SkeletonBlock height={180} />
        </View>
      ) : loadError ? <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text> : (
        <>
          <View style={styles.gradePanel}>
            <View style={styles.scorePanel}>
              <Text accessibilityRole="header" style={styles.gradeTitle}>Company safety grade</Text>
              <Text style={styles.scoreBig}>
                {score}<Text style={styles.scoreDenom}> / 100</Text>
              </Text>
              <View style={styles.scoreNote}>
                <Ionicons
                  name={score === 100 ? 'checkmark-circle' : 'information-circle'}
                  size={18}
                  color={score === 100 ? color.success : color.inkMuted}
                />
                <Text style={styles.scoreSubText}>
                  {score === 100 ? 'No deductions in this period' : 'Recorded deductions applied'}
                </Text>
              </View>
            </View>

            <View style={styles.breakdownList}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Starting score</Text>
                <Text style={styles.breakdownVal}>100</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Speed deductions</Text>
                <Text style={styles.breakdownVal}>{speedDeduction}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Confirmed route cuts</Text>
                <Text style={styles.breakdownVal}>{confirmed.length}</Text>
              </View>
              <Text style={styles.formulaText}>100 − speed deductions − 10 × confirmed route cuts</Text>
            </View>
          </View>

          <View style={[styles.pendingBanner, pendingCount > 0 && styles.pending]}>
            <Ionicons name="information-circle-outline" size={19} color={pendingCount > 0 ? color.warning : color.inkMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingTitle, pendingCount > 0 && { color: color.warning }]}>
                {pendingCount > 0
                  ? `${pendingCount} route flag${pendingCount === 1 ? '' : 's'} awaiting review`
                  : 'No route flags awaiting review'}
              </Text>
              <Text style={styles.pendingSub}>Pending flags are not confirmed deductions.</Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: transitStyles.page,
  content: transitStyles.content,
  periodPanel: { ...transitStyles.panel, overflow: 'hidden' },
  masthead: { ...transitStyles.masthead, borderRadius: 0 },
  title: transitStyles.heading,
  dateNavRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrowBtn: { width: tapTarget, minHeight: tapTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.onDark, borderRadius: radius.sm },
  dateNavText: { flex: 1, textAlign: 'center', fontSize: 16, color: color.onDark, fontWeight: '600' },
  segmentBar: { flexDirection: 'row', padding: 4, gap: 4 },
  segmentBtn: { flex: 1, minHeight: tapTarget, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentBtnActive: transitStyles.selected,
  segmentText: { fontSize: 14, fontWeight: '600', color: color.inkMuted },
  segmentTextActive: transitStyles.selectedText,
  gradePanel: { ...transitStyles.panel, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  scorePanel: { flexGrow: 1, flexShrink: 1, flexBasis: 230, padding: 18, gap: 6, justifyContent: 'center', backgroundColor: color.sand },
  gradeTitle: { fontSize: 18, fontWeight: '700', color: color.ink },
  scoreBig: { fontSize: 38, fontWeight: '800', color: color.ink, fontVariant: ['tabular-nums'] },
  scoreDenom: { fontSize: 20, fontWeight: '500', color: color.inkMuted },
  scoreNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreSubText: { flexShrink: 1, color: color.ink, fontSize: 14 },
  breakdownList: { flexGrow: 2, flexShrink: 1, flexBasis: 260, paddingHorizontal: 18 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: color.border },
  breakdownLabel: { flex: 1, fontSize: 14, color: color.inkMuted },
  breakdownVal: { fontSize: 16, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
  formulaText: { fontSize: 13, lineHeight: 19, paddingVertical: 12, color: color.inkMuted },
  pendingBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, backgroundColor: color.paper, borderWidth: 1, borderColor: color.border, borderRadius: radius.md },
  pending: { backgroundColor: color.warningBg, borderColor: color.warningBorder },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: color.ink },
  pendingSub: { fontSize: 13, lineHeight: 19, color: color.inkMuted, marginTop: 2 },
  error: { backgroundColor: color.dangerBg, color: color.ember, padding: 14, borderRadius: radius.md },
});
