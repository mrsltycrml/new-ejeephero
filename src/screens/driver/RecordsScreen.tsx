import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBlock } from '../../components/AppUI';
import { useAuth } from '../../contexts/AuthContext';
import { realRows } from '../../utils/realData';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
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
      <View style={{ gap: 2 }}>
        <Text style={styles.title}>Records</Text>
        <Text style={styles.subtitle}>Company Safety Grade</Text>
      </View>

      {/* 4-Segment Period Control */}
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

      {/* Date Navigator Row */}
      <View style={styles.dateNavRow}>
        <TouchableOpacity accessibilityRole="button" onPress={() => stepPeriod(-1)} style={styles.arrowBtn}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </TouchableOpacity>
        <Text style={styles.dateNavText}>{formatReportingPeriod(period)}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => stepPeriod(1)} style={styles.arrowBtn}>
          <Ionicons name="chevron-forward" size={18} color={Colors.ink} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ gap: 14, marginTop: 6 }}>
          <SkeletonBlock height={140} />
          <SkeletonBlock height={180} />
        </View>
      ) : loadError ? <Text accessibilityRole="alert">{loadError}</Text> : (
        <>
          {/* Pale-Green Score Box */}
          <View style={styles.scorePanel}>
            <Text style={styles.scoreBig}>
              {score} <Text style={styles.scoreDenom}>/ 100</Text>
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons
                name={score === 100 ? 'checkmark-circle' : 'information-circle'}
                size={16}
                color={Colors.brandGreen}
              />
              <Text style={styles.scoreSubText}>
                {score === 100 ? 'No deductions in this period' : 'Recorded deductions applied'}
              </Text>
            </View>
          </View>

          {/* Clean Breakdown Rows */}
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
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { fontWeight: '700', color: Colors.ink }]}>Safety grade</Text>
              <Text style={[styles.breakdownVal, { fontSize: 18 }]}>{score}</Text>
            </View>
          </View>

          <Text style={styles.formulaText}>
            100 − speed deductions − 10 × confirmed route cuts
          </Text>

          {/* Pending Route Flag Notice */}
          <View style={styles.pendingBanner}>
            <Ionicons name="information-circle-outline" size={19} color={Colors.warning} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
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
  page: { flex: 1, backgroundColor: Colors.paper },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 16,
  },
  title: { color: Colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: Colors.subtleGray, fontSize: 15 },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: Colors.canvas,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandGreen,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
  },
  scorePanel: {
    backgroundColor: Colors.paleGreen,
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  scoreBig: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  scoreDenom: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.subtleGray,
  },
  scoreSubText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brandGreen,
  },
  breakdownList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  breakdownLabel: {
    fontSize: 15,
    color: Colors.subtleGray,
  },
  breakdownVal: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  formulaText: {
    fontSize: 13,
    color: Colors.subtleGray,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },
  pendingSub: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
});
