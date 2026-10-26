import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import ReportingPeriodPicker from '../../components/ReportingPeriodPicker';
import { currentReportingPeriod, periodContains, periodRangeUtc, type ReportingPeriod } from '../../utils/reportingPeriod';

type SpeedRecord = { id: string; created_at: string; speed_kph: number; limit_kph: number; score_deduction: number | null };
type RouteRecord = { id: string; created_at: string; status: string; reason: string | null };
type DriverRecord = { id: string; kind: 'speed' | 'route'; title: string; detail: string; date: string };

const recordDate = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const previewEnabled = typeof __DEV__ !== 'undefined' && __DEV__;

function sampleRecordsForPeriod(period: ReportingPeriod): { speeds: SpeedRecord[]; routes: RouteRecord[] } {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const speeds: SpeedRecord[] = [
    { id: 'sample-speed-1', created_at: hoursAgo(0), speed_kph: 27, limit_kph: 20, score_deduction: 3 },
    { id: 'sample-speed-2', created_at: hoursAgo(72), speed_kph: 24, limit_kph: 20, score_deduction: 2 },
  ];
  const routes: RouteRecord[] = [
    { id: 'sample-route-review', created_at: hoursAgo(28), status: 'pending_review', reason: 'Final checkpoint was not reached; route under review.' },
    { id: 'sample-route-cut', created_at: hoursAgo(168), status: 'confirmed', reason: 'Shift ended before the final route checkpoint.' },
  ];
  return {
    speeds: speeds.filter((item) => periodContains(item.created_at, period)),
    routes: routes.filter((item) => periodContains(item.created_at, period)),
  };
}

async function readDriverRecords<T>(table: 'speed_events' | 'trip_violations', columns: string, driverId: string, start: string, end: string): Promise<T[]> {
  const records: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.from(table).select(columns).eq('driver_id', driverId)
      .gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data || []) as T[];
    records.push(...page);
    if (page.length < pageSize) return records;
  }
}

export default function RecordsScreen() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(currentReportingPeriod('month'));
  const [speeds, setSpeeds] = useState<SpeedRecord[]>([]);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sampleMode, setSampleMode] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const { start, end } = periodRangeUtc(period);
    try {
      const readiness = await supabase.rpc('driver_records_access_ready');
      if (readiness.error || readiness.data !== true) throw readiness.error || new Error('Driver record access is not ready.');
      const [speedRecords, routeRecords] = await Promise.all([
        readDriverRecords<SpeedRecord>('speed_events', 'id,created_at,speed_kph,limit_kph,score_deduction', user.id, start, end),
        readDriverRecords<RouteRecord>('trip_violations', 'id,created_at,status,reason', user.id, start, end),
      ]);
      const useSamples = previewEnabled && speedRecords.length === 0 && routeRecords.length === 0;
      const rows = useSamples ? sampleRecordsForPeriod(period) : { speeds: speedRecords, routes: routeRecords };
      setSpeeds(rows.speeds);
      setRoutes(rows.routes);
      setSampleMode(useSamples);
      setError('');
    } catch (cause) {
      console.warn('Could not load driver records:', cause instanceof Error ? cause.message : JSON.stringify(cause));
      if (previewEnabled) {
        const rows = sampleRecordsForPeriod(period);
        setSpeeds(rows.speeds);
        setRoutes(rows.routes);
        setSampleMode(true);
        setError('');
      } else {
        setSampleMode(false);
        setError('Your company grade will appear when driver records are enabled.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, period]);

  useEffect(() => { void load(); }, [load]);
  const confirmed = routes.filter((item) => item.status === 'confirmed');
  const speedDeduction = speeds.reduce((sum, item) => sum + Number(item.score_deduction || 0), 0);
  const score = Math.max(0, Math.round(100 - speedDeduction - confirmed.length * 10));
  const records: DriverRecord[] = [
    ...speeds.map((item) => ({ id: item.id, kind: 'speed' as const, title: 'Speeding offense', detail: `${Math.round(item.speed_kph)} km/h recorded · ${Math.round(item.limit_kph)} km/h limit`, date: item.created_at })),
    ...routes.map((item) => ({ id: item.id, kind: 'route' as const, title: item.status === 'confirmed' ? 'Confirmed route cut' : 'Route review', detail: item.reason || 'Route compliance record', date: item.created_at })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
    <Text style={styles.title}>Records</Text>
    <Text style={styles.subtitle}>Your company safety grade and recorded driving events.</Text>
    <ReportingPeriodPicker value={period} onChange={setPeriod} label="Reporting period" />
    {loading ? <ActivityIndicator style={styles.loader} color={Colors.primaryRed} /> : error ? <View style={styles.messageCard}><Text style={styles.message}>{error}</Text><TouchableOpacity onPress={() => { setLoading(true); void load(); }}><Text style={styles.retry}>Refresh records</Text></TouchableOpacity></View> : <>
      <View style={styles.gradeCard}>
        <View style={styles.gradeHeading}><View><View style={styles.gradeTitleRow}><Text style={styles.gradeTitle}>Company grade</Text>{sampleMode && <Text style={styles.sampleBadge}>Sample</Text>}</View><Text style={styles.gradeHint}>Based on recorded events in this period</Text></View><Text style={styles.gradeValue}>{score}<Text style={styles.gradeTotal}> / 100</Text></Text></View>
        <View style={styles.gradeBreakdown}>
          <View style={styles.breakdownItem}><Text style={styles.breakdownNumber}>{speeds.length}</Text><Text style={styles.breakdownLabel}>Speed offenses</Text></View>
          <View style={styles.breakdownItem}><Text style={styles.breakdownNumber}>{confirmed.length}</Text><Text style={styles.breakdownLabel}>Confirmed route cuts</Text></View>
          <View style={styles.breakdownItem}><Text style={styles.breakdownNumber}>{routes.length - confirmed.length}</Text><Text style={styles.breakdownLabel}>For review</Text></View>
        </View>
        <Text style={styles.gradeFootnote}>Grade = 100 minus recorded speed deductions and 10 points per confirmed route cut.</Text>
      </View>
      <View style={styles.recordsCard}>
        <Text style={styles.sectionTitle}>{sampleMode ? 'Example driving records' : 'Driving records'}</Text>
        {records.length ? records.map((item) => <View key={`${item.kind}-${item.id}`} style={styles.recordRow}>
          <View style={styles.recordIcon}><Ionicons name={item.kind === 'speed' ? 'speedometer-outline' : 'git-branch-outline'} size={19} color={Colors.primaryRed} /></View>
          <View style={styles.recordContent}><Text style={styles.recordTitle}>{item.title}</Text><Text style={styles.recordDetail}>{item.detail}</Text><Text style={styles.recordDate}>{recordDate(item.date)}</Text></View>
        </View>) : <Text style={styles.empty}>No driving events recorded for this period.</Text>}
      </View>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 18, paddingBottom: 38, gap: 14 },
  title: { color: Colors.ink, fontSize: 24, fontWeight: '600' },
  subtitle: { color: Colors.subtleGray, fontSize: 13, marginTop: -9, marginBottom: 4 },
  loader: { marginTop: 38 },
  messageCard: { backgroundColor: Colors.paper, padding: 18, borderRadius: 8 },
  message: { color: Colors.ink, fontSize: 13 },
  retry: { color: Colors.primaryRed, fontWeight: '700', marginTop: 12 },
  gradeCard: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, padding: 20, gap: 18 },
  gradeHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  gradeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sampleBadge: { color: Colors.primaryRed, backgroundColor: Colors.paper, borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '600' },
  gradeTitle: { color: Colors.ink, fontSize: 19, fontWeight: '600' },
  gradeHint: { color: Colors.subtleGray, fontSize: 12, marginTop: 4 },
  gradeValue: { color: Colors.ink, fontSize: 36, fontWeight: '600' },
  gradeTotal: { color: Colors.subtleGray, fontSize: 16, fontWeight: '600' },
  gradeBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  breakdownItem: { flex: 1, minWidth: 100, paddingVertical: 8 },
  breakdownNumber: { color: Colors.ink, fontSize: 20, fontWeight: '600' },
  breakdownLabel: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  gradeFootnote: { color: Colors.subtleGray, fontSize: 12, lineHeight: 16 },
  recordsCard: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 6 },
  sectionTitle: { color: Colors.ink, fontSize: 17, fontWeight: '600', marginVertical: 14 },
  recordRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopColor: Colors.border, borderTopWidth: 1 },
  recordIcon: { width: 38, height: 38, borderRadius: 6, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  recordContent: { flex: 1 },
  recordTitle: { color: Colors.ink, fontSize: 14, fontWeight: '700' },
  recordDetail: { color: Colors.ink, fontSize: 12, marginTop: 3 },
  recordDate: { color: Colors.subtleGray, fontSize: 12, marginTop: 5 },
  empty: { color: Colors.subtleGray, fontSize: 13, paddingBottom: 18 },
});
