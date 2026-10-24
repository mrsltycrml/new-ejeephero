import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { offlineTransit } from '../../services/offlineTransitService';
import type { RouteData, TerminalData, VehicleData } from '../../services/offlineTransitService';

type Violation = {
  id: string;
  driver_id: string;
  reason: string;
  status: 'pending_review' | 'confirmed' | 'dismissed';
  created_at: string;
};

type Scorecard = { driverId: string; name: string; score: number; speedEvents: number; confirmedTrips: number };

export default function SupervisorDashboardScreen() {
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [terminals, setTerminals] = useState<TerminalData[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [pendingSpeedLimitSetup, setPendingSpeedLimitSetup] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    const [transit, vehicleResult, eventResult, limitResult, violationResult, profileResult] = await Promise.all([
      offlineTransit.getTransitData(),
      supabase.from('vehicles').select('id,driver_id,route_id,body_number,plate_number,passenger_count,max_capacity,is_active').eq('is_active', true),
      supabase.from('speed_events').select('id,vehicle_id,driver_id,speed_kph,limit_kph,score_deduction,created_at').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(500),
      supabase.from('road_speed_limits').select('id,label,center_latitude,center_longitude,radius_meters,max_speed_kph,source_url').eq('is_active', true),
      supabase.from('trip_violations').select('id,driver_id,reason,status,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('id,email,full_name').eq('role', 'driver'),
    ]);

    setRoutes(transit.routes);
    setTerminals(transit.terminals);
    const missingNewTables = Boolean(eventResult.error || limitResult.error || violationResult.error);
    setSchemaMissing(missingNewTables);
    setPendingSpeedLimitSetup(!limitResult.error && (limitResult.data?.length ?? 0) === 0);

    const active = vehicleResult.data ?? [];
    const positionsResult = active.length
      ? await supabase.from('vehicle_positions')
          .select('vehicle_id,latitude,longitude,speed,heading,timestamp')
          .in('vehicle_id', active.map((vehicle) => vehicle.id))
          .order('timestamp', { ascending: false })
      : { data: [], error: null };
    const latestPosition = new Map<string, any>();
    for (const position of positionsResult.data ?? []) {
      if (!latestPosition.has(position.vehicle_id) && Date.now() - Date.parse(position.timestamp) <= 120_000) latestPosition.set(position.vehicle_id, position);
    }
    const recentEvents = (eventResult.data ?? []).filter((event: any) => Date.now() - Date.parse(event.created_at) < 120_000);
    const speedingIds = new Set(recentEvents.map((event: any) => event.vehicle_id));
    const mappedVehicles = active.flatMap((vehicle: any) => {
      const position = latestPosition.get(vehicle.id);
      if (!position) return [];
      const count = vehicle.passenger_count ?? 0;
      const capacity = vehicle.max_capacity ?? 22;
      return [{
        id: vehicle.id,
        vehicle_id: vehicle.id,
        plate_number: vehicle.plate_number ?? '',
        body_number: vehicle.body_number ?? '',
        route_id: vehicle.route_id,
        latitude: position.latitude,
        longitude: position.longitude,
        speed: position.speed ?? 0,
        heading: position.heading ?? 0,
        passenger_count: count,
        max_capacity: capacity,
        is_full: count >= capacity,
        status: count >= capacity ? 'Puno' as const : count >= capacity * 0.7 ? 'Sakto' as const : 'Maluwag' as const,
        isSpeeding: speedingIds.has(vehicle.id),
      }];
    });
    setVehicles(mappedVehicles);
    setViolations(violationResult.data ?? []);

    const eventRows = eventResult.data ?? [];
    const violationRows = violationResult.data ?? [];
    const driverIds = new Set<string>([
      ...eventRows.map((event: any) => event.driver_id),
      ...violationRows.map((violation: any) => violation.driver_id),
    ]);
    const profileNames = new Map((profileResult.data ?? []).map((profile: any) => [profile.id, profile.full_name || profile.email || 'Driver']));
    setScorecards([...driverIds].map((driverId) => {
      const driverEvents = eventRows.filter((event: any) => event.driver_id === driverId);
      const confirmedTrips = violationRows.filter((violation: any) => violation.driver_id === driverId && violation.status === 'confirmed').length;
      const deductions = driverEvents.reduce((sum: number, event: any) => sum + Number(event.score_deduction || 0), 0);
      return {
        driverId,
        name: profileNames.get(driverId) ?? 'Driver',
        score: Math.max(0, Math.round(100 - deductions - confirmedTrips * 10)),
        speedEvents: driverEvents.length,
        confirmedTrips,
      };
    }).sort((a, b) => a.score - b.score).slice(0, 10));

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
    const channel = supabase.channel('supervisor-live-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_positions' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => loadDashboard())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const reviewViolation = async (violation: Violation, status: 'confirmed' | 'dismissed') => {
    const { error } = await supabase.from('trip_violations').update({ status }).eq('id', violation.id);
    if (error) Alert.alert('Could not update violation', error.message);
    else await loadDashboard();
  };

  const pendingCount = useMemo(() => violations.filter((item) => item.status === 'pending_review').length, [violations]);
  const speedCount = useMemo(() => vehicles.filter((vehicle) => vehicle.isSpeeding).length, [vehicles]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primaryRed} /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.title}>Fleet safety monitor</Text>
      <Text style={styles.subtitle}>Live driver locations, configured speed zones, and route review queue.</Text>

      {schemaMissing && <View style={styles.notice}><Text style={styles.noticeText}>Apply the deployment readiness Supabase migration to enable speed and route-compliance records.</Text></View>}
      {pendingSpeedLimitSetup && <View style={styles.notice}><Text style={styles.noticeText}>No sourced speed zones are configured. Add official road limits and source links in Supabase before using speeding alerts.</Text></View>}

      <View style={styles.metricsRow}>
        <Metric label="Active vehicles" value={vehicles.length} icon="bus" />
        <Metric label="Recent speeding" value={speedCount} icon="speedometer" danger={speedCount > 0} />
        <Metric label="Needs review" value={pendingCount} icon="alert-circle" danger={pendingCount > 0} />
      </View>

      <View style={styles.mapCard}>
        <Text style={styles.sectionTitle}>Live fleet map</Text>
        <View style={styles.map}><LeafletMap routes={routes} terminals={terminals} vehicles={vehicles} /></View>
        <Text style={styles.smallNote}>Recent speeding counts events from the last two minutes. Red markers indicate one such event. Locations older than two minutes are hidden.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Driver safety report cards</Text>
        {scorecards.length === 0 ? <Text style={styles.empty}>No recorded safety events yet.</Text> : scorecards.map((item) => (
          <View key={item.driverId} style={styles.listRow}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowSub}>{item.speedEvents} speed events · {item.confirmedTrips} confirmed route violations</Text></View>
            <Text style={[styles.score, item.score < 80 && styles.scoreLow]}>{item.score}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Route compliance review</Text>
        {violations.length === 0 ? <Text style={styles.empty}>No route issues recorded.</Text> : violations.map((item) => (
          <View key={item.id} style={styles.violationRow}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.reason}</Text><Text style={styles.rowSub}>{item.status.replace('_', ' ')} · {new Date(item.created_at).toLocaleString()}</Text></View>
            {item.status === 'pending_review' && <View style={styles.actionRow}>
              <TouchableOpacity accessibilityLabel="Confirm route violation" style={styles.confirmButton} onPress={() => reviewViolation(item, 'confirmed')}><Ionicons name="checkmark" size={20} color="#fff" /></TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Dismiss route flag" style={styles.dismissButton} onPress={() => reviewViolation(item, 'dismissed')}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
            </View>}
          </View>
        ))}
        <Text style={styles.smallNote}>Route flags require human confirmation. Three confirmed violations trigger account suspension. Scorecards cover the last 30 days (up to 500 speed events).</Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value, icon, danger = false }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; danger?: boolean }) {
  return <View style={styles.metric}><Ionicons name={icon} size={19} color={danger ? '#C62828' : Colors.primaryRed} /><Text style={[styles.metricValue, danger && { color: '#C62828' }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '900', color: Colors.primaryRed },
  subtitle: { fontSize: 13, color: '#666', lineHeight: 19, marginTop: -8 },
  notice: { padding: 12, borderRadius: 10, backgroundColor: '#FFF3CD', borderWidth: 1, borderColor: '#FFE08A' },
  noticeText: { color: '#674D00', fontSize: 12, lineHeight: 17 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minHeight: 84, borderRadius: 12, padding: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee' },
  metricValue: { color: Colors.darkText, fontWeight: '900', fontSize: 20, marginTop: 3 },
  metricLabel: { color: '#666', fontSize: 10, textAlign: 'center', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee', padding: 14 },
  mapCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee', padding: 12 },
  map: { height: 300, overflow: 'hidden', borderRadius: 10, marginTop: 8 },
  sectionTitle: { color: Colors.darkText, fontWeight: '800', fontSize: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  violationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowTitle: { fontSize: 13, color: Colors.darkText, fontWeight: '700' },
  rowSub: { fontSize: 11, color: '#777', marginTop: 3, lineHeight: 15 },
  score: { minWidth: 42, textAlign: 'center', color: '#2E7D32', fontWeight: '900', fontSize: 20 },
  scoreLow: { color: '#C62828' },
  actionRow: { flexDirection: 'row', gap: 6 },
  confirmButton: { backgroundColor: '#2E7D32', borderRadius: 8, padding: 7 },
  dismissButton: { backgroundColor: '#777', borderRadius: 8, padding: 7 },
  smallNote: { color: '#777', fontSize: 10, lineHeight: 14, marginTop: 9 },
  empty: { color: '#777', fontSize: 12, paddingVertical: 12 },
});
