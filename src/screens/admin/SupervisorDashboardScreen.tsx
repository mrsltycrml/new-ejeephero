import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PassengerSelect } from '../../components/PassengerUI';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { offlineTransit } from '../../services/offlineTransitService';
import type { RouteData, TerminalData, VehicleData } from '../../services/offlineTransitService';
import { useRoute } from '@react-navigation/native';
import { ESAKAY_OPERATIONS, ROUTE_WAYPOINT_REVIEW } from '../../constants/esakayOperations';
import { SAMPLE_UNITS } from '../../constants/sampleFleet';
import { SAMPLE_ROUTE_CUTS, SAMPLE_SPEED_OFFENSES, SAMPLE_TELEMETRY } from '../../constants/sampleMonitoring';
import ReportingPeriodPicker from '../../components/ReportingPeriodPicker';
import { currentReportingPeriod, formatReportingPeriod, periodContains, periodRangeUtc } from '../../utils/reportingPeriod';
import { downloadAdminPeriodReport, openAdminPeriodReport, type PreparedAdminReport } from '../../services/adminReportService';
import { useAuth } from '../../contexts/AuthContext';

type Violation = {
  id: string;
  driver_id: string;
  vehicle_id: string;
  body_number?: string | null;
  plate_number?: string | null;
  missed_stops?: string[];
  auto_confirmed?: boolean;
  reason: string;
  status: 'pending_review' | 'flagged' | 'confirmed' | 'dismissed';
  created_at: string;
};

type SpeedEvent = { id: string; driver_id: string; vehicle_id: string; body_number?: string | null; plate_number?: string | null; zone_label?: string | null; policy_type?: 'operator_cap' | 'road_zone'; speed_kph: number; limit_kph: number; score_deduction: number; created_at: string };
type LiveUnit = { id: string; driverId: string; body: string; plate: string; speed: number; lastSeen: string; isSpeeding: boolean };
type Scorecard = { driverId: string; name: string; status: string; score: number; speedEvents: number; confirmedTrips: number; totalConfirmedTrips?: number };
type UnitChoice = { key: string; label: string; routeId: string };
let monitorChannelSequence = 0;

async function readPeriodRows<T>(table: string, start: string, end: string): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.from(table).select('*').gte('created_at', start).lt('created_at', end)
      .order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
    if (result.error) return { data: [], error: result.error.message };
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

function unitKey(unit: { id: string; body_number?: string | null; plate_number?: string | null }): string {
  return (unit.plate_number?.trim() || unit.body_number?.trim() || unit.id).toUpperCase();
}

export default function SupervisorDashboardScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [periodExpanded, setPeriodExpanded] = useState(false);
  const route = useRoute<any>();
  const requestedTrackKey = typeof route.params?.trackUnitKey === 'string' ? route.params.trackUnitKey : null;
  const requestedTrackLabel = typeof route.params?.trackUnitLabel === 'string' ? route.params.trackUnitLabel : null;
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [terminals, setTerminals] = useState<TerminalData[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [speedEvents, setSpeedEvents] = useState<SpeedEvent[]>([]);
  const [liveUnits, setLiveUnits] = useState<LiveUnit[]>([]);
  const [unitChoices, setUnitChoices] = useState<UnitChoice[]>([]);
  const [mapRouteFilter, setMapRouteFilter] = useState('all');
  const [mapUnitFilter, setMapUnitFilter] = useState('all');
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const [activityView, setActivityView] = useState<'live' | 'grades' | 'speed' | 'cuts'>('live');
  const [driverNames, setDriverNames] = useState<Map<string, string>>(new Map());
  const [unitDetails, setUnitDetails] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState(currentReportingPeriod());
  const [periodTripCount, setPeriodTripCount] = useState<number | null>(0);
  const [safetyDataAvailable, setSafetyDataAvailable] = useState({ speed: true, cuts: true });
  const [scoreFilter, setScoreFilter] = useState<'all' | 'attention' | 'sample'>('all');
  const [speedFilter, setSpeedFilter] = useState<'all' | 'recorded' | 'sample'>('all');
  const [cutFilter, setCutFilter] = useState<'all' | 'review' | 'sample'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [readyPdf, setReadyPdf] = useState<PreparedAdminReport | null>(null);

  useEffect(() => () => { if (readyPdf) URL.revokeObjectURL(readyPdf.url); }, [readyPdf]);

  const loadDashboard = useCallback(async () => {
    const { start, end } = periodRangeUtc(period);
    const [transit, vehicleResult, eventResult, violationResult, profileResult, recentSpeedResult, tripCountResult] = await Promise.all([
      offlineTransit.getTransitData(),
      supabase.from('vehicles').select('id,driver_id,route_id,body_number,plate_number,passenger_count,max_capacity,is_active').order('created_at', { ascending: false }).limit(1000),
      readPeriodRows<SpeedEvent>('speed_events', start, end),
      readPeriodRows<Violation>('trip_violations', start, end),
      supabase.from('profiles').select('id,email,full_name,status').eq('role', 'driver'),
      supabase.from('speed_events').select('vehicle_id').gte('created_at', new Date(Date.now() - 120_000).toISOString()).limit(100),
      supabase.from('vehicles').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end),
    ]);
    setPeriodTripCount(tripCountResult.error ? null : (tripCountResult.count ?? 0));
    setSafetyDataAvailable({ speed: !eventResult.error, cuts: !violationResult.error });

    setRoutes(transit.routes);
    setTerminals(transit.terminals);

    const allUnits = vehicleResult.data ?? [];
    const active = allUnits.filter((vehicle: any) => vehicle.is_active);
    const choices = new Map<string, UnitChoice>();
    for (const vehicle of allUnits) {
      const key = unitKey(vehicle);
      if (!choices.has(key)) choices.set(key, {
        key,
        label: [vehicle.body_number, vehicle.plate_number].filter(Boolean).join(' · ') || 'Unnumbered unit',
        routeId: vehicle.route_id,
      });
    }
    setUnitChoices([...choices.values()].sort((a, b) => a.label.localeCompare(b.label)));
    const details = new Map<string, string>(allUnits.map((vehicle: any) => [vehicle.id, `${vehicle.body_number || 'No body number'} · ${vehicle.plate_number || 'No plate number'}`]));
    setUnitDetails(details);
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
    const recentEvents = recentSpeedResult.data ?? [];
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
    setLiveUnits(active.flatMap((vehicle: any) => {
      const position = latestPosition.get(vehicle.id);
      if (!position) return [];
      return [{ id: vehicle.id, driverId: vehicle.driver_id, body: vehicle.body_number || 'No body number', plate: vehicle.plate_number || 'No plate number', speed: Number(position.speed || 0), lastSeen: position.timestamp, isSpeeding: speedingIds.has(vehicle.id) }];
    }));
    setViolations(violationResult.data ?? []);

    const eventRows = eventResult.data ?? [];
    setSpeedEvents(eventRows as SpeedEvent[]);
    const violationRows = violationResult.data ?? [];
    const profileNames = new Map((profileResult.data ?? []).map((profile: any) => [profile.id, profile.full_name || profile.email || 'Driver']));
    setDriverNames(profileNames);
    const previewCards = (profileResult.data ?? []).map((profile: any) => {
      const driverId = profile.id;
      const driverEvents = eventRows.filter((event: any) => event.driver_id === driverId);
      const confirmedTrips = violationRows.filter((violation: any) => violation.driver_id === driverId && violation.status === 'confirmed').length;
      const deductions = driverEvents.reduce((sum: number, event: any) => sum + Number(event.score_deduction || 0), 0);
      return {
        driverId,
        name: profileNames.get(driverId) ?? 'Driver',
        status: profile.status,
        score: Math.max(0, Math.round(100 - deductions - confirmedTrips * 10)),
        speedEvents: driverEvents.length,
        confirmedTrips,
      };
    }).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    setScorecards(eventResult.error || violationResult.error ? [] : previewCards);

    setLoading(false);
  }, [period]);

  useEffect(() => {
    loadDashboard();
    const refreshTimer = setInterval(() => { void loadDashboard(); }, 15_000);
    const channel = supabase.channel(`supervisor-live-monitor-${++monitorChannelSequence}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_positions' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => loadDashboard())
      .subscribe();
    return () => { clearInterval(refreshTimer); supabase.removeChannel(channel); };
  }, [loadDashboard]);

  useEffect(() => {
    if (!requestedTrackKey) return;
    setMapRouteFilter('all');
    setMapUnitFilter(requestedTrackKey);
  }, [requestedTrackKey, route.params?.trackRequestId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const exportReport = async () => {
    if (exporting) return;
    if (readyPdf?.periodKey === period.key && readyPdf.periodMode === period.mode) {
      downloadAdminPeriodReport(readyPdf);
      return;
    }
    setExporting(true);
    try {
      const prepared = await openAdminPeriodReport(period, liveUnits, user?.id || 'admin-preview');
      setReadyPdf(prepared);
      downloadAdminPeriodReport(prepared);
    }
    catch (cause) { Alert.alert('Could not prepare report', cause instanceof Error ? cause.message : 'Try again.'); }
    finally { setExporting(false); }
  };

  const reviewViolation = async (violation: Violation, status: 'confirmed' | 'dismissed') => {
    const { error } = await supabase.from('trip_violations').update({ status }).eq('id', violation.id);
    if (error) {
      Alert.alert('Could not update violation', error.message);
      return;
    }
    await loadDashboard();
  };

  const unitLabel = (vehicleId: string, body?: string | null, plate?: string | null) =>
    body || plate ? `${body || 'No body number'} · ${plate || 'No plate number'}` : unitDetails.get(vehicleId) || 'Unit details unavailable';

  const pendingCount = useMemo(() => violations.filter((item) => item.status === 'pending_review' || item.status === 'flagged' || item.status === 'confirmed').length, [violations]);
  const sampleSpeedRows = useMemo(() => SAMPLE_SPEED_OFFENSES.filter((item) => periodContains(item.createdAt, period)), [period]);
  const sampleCutRows = useMemo(() => SAMPLE_ROUTE_CUTS.filter((item) => periodContains(item.createdAt, period)), [period]);
  const sampleScorecards = useMemo(() => {
    const drivers = new Map<string, { speed: number; cuts: number }>();
    for (const row of sampleSpeedRows) drivers.set(row.driver, { speed: (drivers.get(row.driver)?.speed ?? 0) + 1, cuts: drivers.get(row.driver)?.cuts ?? 0 });
    for (const row of sampleCutRows) drivers.set(row.driver, { speed: drivers.get(row.driver)?.speed ?? 0, cuts: (drivers.get(row.driver)?.cuts ?? 0) + (row.status === 'confirmed' ? 1 : 0) });
    return [...drivers].map(([name, totals]) => ({ name, ...totals, score: Math.max(0, 100 - totals.speed * 5 - totals.cuts * 10) })).sort((a, b) => a.score - b.score);
  }, [sampleSpeedRows, sampleCutRows]);
  const mapVehicles = useMemo(() => vehicles.filter((vehicle) =>
    (mapRouteFilter === 'all' || vehicle.route_id === mapRouteFilter)
    && (mapUnitFilter === 'all' || unitKey(vehicle) === mapUnitFilter)
  ), [vehicles, mapRouteFilter, mapUnitFilter]);
  const mapRoutes = useMemo(() => routes.filter((route) => !route.is_coming_soon && (mapRouteFilter === 'all' || route.id === mapRouteFilter)), [routes, mapRouteFilter]);
  const mapTerminals = useMemo(() => terminals.filter((terminal) => mapRouteFilter === 'all' || terminal.route_id === mapRouteFilter), [terminals, mapRouteFilter]);
  const shownUnitChoices = useMemo(() => {
    const primaryRouteId = routes.find((item) => !item.is_coming_soon)?.id || '';
    const sampleChoices = SAMPLE_UNITS.map((unit) => ({ key: unit.key, label: `${unit.name} · sample`, routeId: primaryRouteId }));
    const matching = [...unitChoices, ...sampleChoices].filter((unit) => mapRouteFilter === 'all' || unit.routeId === mapRouteFilter);
    if (mapRouteFilter === 'all' && mapUnitFilter !== 'all' && !matching.some((unit) => unit.key === mapUnitFilter)) {
      return [{ key: mapUnitFilter, label: requestedTrackLabel || mapUnitFilter, routeId: '' }, ...matching];
    }
    return matching;
  }, [unitChoices, routes, mapRouteFilter, mapUnitFilter, requestedTrackLabel]);
  const selectedMapVehicle = mapUnitFilter === 'all' ? null : mapVehicles.find((vehicle) => unitKey(vehicle) === mapUnitFilter) || null;
  const selectedUnitLabel = shownUnitChoices.find((unit) => unit.key === mapUnitFilter)?.label || requestedTrackLabel || 'unit';

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primaryRed} /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.pageTitle}>Monitor</Text>
      <View style={styles.reportToolbar}>
        <View style={[styles.reportPeriod, compact && { flexBasis: periodExpanded ? '100%' : 170 }]}><ReportingPeriodPicker value={period} onChange={setPeriod} label="Reporting period" onExpandedChange={setPeriodExpanded} /></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Download selected period PDF report" onPress={() => { void exportReport(); }} style={[styles.exportButton, compact && styles.exportButtonCompact]}>
          <Ionicons name="download-outline" size={17} color={Colors.white} />
          <Text style={styles.exportText}>{exporting ? 'Preparing…' : readyPdf?.periodKey === period.key && readyPdf.periodMode === period.mode ? 'Save PDF' : compact ? 'PDF' : 'Download PDF'}</Text>
        </TouchableOpacity>
      </View>
      {readyPdf?.periodKey === period.key && readyPdf.periodMode === period.mode && <Text style={styles.pdfReady}>Report ready. If the download did not start, select Save PDF.</Text>}
      <View style={styles.metricsRow}>
        <Metric label="Live units" value={vehicles.length} compact={compact} />
        <Metric label="Shifts started" value={periodTripCount ?? '—'} compact={compact} />
        <Metric label="Speed offenses" value={safetyDataAvailable.speed ? speedEvents.length : '—'} danger={safetyDataAvailable.speed && speedEvents.length > 0} compact={compact} />
        <Metric label="Route flags" value={safetyDataAvailable.cuts ? pendingCount : '—'} danger={safetyDataAvailable.cuts && pendingCount > 0} compact={compact} />
      </View>
      {(!safetyDataAvailable.speed || !safetyDataAvailable.cuts || periodTripCount === null) && <Text accessibilityRole="alert" style={styles.dataWarning}>Some recorded totals are unavailable right now. A dash means the app could not confirm a count.</Text>}


      <View style={styles.mapCard}>
        <View style={styles.mapHeading}><Text style={styles.sectionTitle}>Live fleet map</Text><Text style={styles.mapCount}>{mapVehicles.length} live {mapVehicles.length === 1 ? 'unit' : 'units'} shown</Text></View>
        <View style={styles.mapFilters}>
          <View style={styles.mapFilterField}><PassengerSelect label="Route" value={mapRouteFilter} options={[{ value: 'all', label: 'All routes' }, ...routes.map(route => ({ value: route.id, label: route.is_coming_soon ? 'Route 2: Coming soon' : route.name }))]} onSelect={value => { setMapRouteFilter(value); setMapUnitFilter('all'); }} /></View>
          <View style={styles.mapFilterField}><PassengerSelect label="Unit" value={mapUnitFilter} options={[{ value: 'all', label: 'All units' }, ...shownUnitChoices.map(unit => ({ value: unit.key, label: unit.label }))]} onSelect={setMapUnitFilter} /></View>
        </View>
        {mapUnitFilter !== 'all' && <View style={styles.trackStatus}>
          <Ionicons name={selectedMapVehicle ? 'locate' : 'radio-outline'} size={17} color={selectedMapVehicle ? '#1F6944' : Colors.primaryRed} />
          <Text style={styles.trackStatusText}>{selectedMapVehicle ? `Following ${selectedUnitLabel} live` : mapUnitFilter.startsWith('SAMPLE-') ? `${selectedUnitLabel} is a sample and has no live GPS.` : `Waiting for current GPS from ${selectedUnitLabel}.`}</Text>
        </View>}
        {routes.find((item) => item.id === mapRouteFilter)?.is_coming_soon && <Text style={styles.comingSoonNote}>Route 2 is coming soon. No route or unit tracking is available yet.</Text>}
        <View style={styles.map}><LeafletMap routes={mapRoutes} terminals={mapTerminals} vehicles={mapVehicles} selectedVehicle={selectedMapVehicle} fleetMode /></View>
        <Text style={styles.smallNote}>Locations update when a driver shares GPS. Route geometry and boarding pins are pending verification.</Text>
      </View>

      <View style={styles.routeDisclosure}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: routeDetailsOpen }} onPress={() => setRouteDetailsOpen((open) => !open)} style={styles.collapsibleHeading}>
          <Text style={styles.sectionTitle}>Route verification</Text>
          <Ionicons name={routeDetailsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray} />
        </TouchableOpacity>
        {routeDetailsOpen && <><Text style={styles.sectionSub}>Outbound landmarks are listed below. Road access and the return path still need checking.</Text>
        {ROUTE_WAYPOINT_REVIEW.map((waypoint, index) => (
          <View key={waypoint.name} style={styles.waypointRow}>
            <View style={styles.waypointNumber}><Text style={styles.waypointNumberText}>{index + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{waypoint.name}</Text>
              <Text style={styles.rowSub}>{waypoint.confidence} · {waypoint.finding}</Text>
              {waypoint.source && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(waypoint.source)}><Text style={styles.sourceLink}>View OpenStreetMap source</Text></TouchableOpacity>}
            </View>
          </View>
        ))}</>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activityTabs}>
        {([{ key: 'live', label: 'Live speeds' }, { key: 'grades', label: 'Driver grades' }, { key: 'speed', label: 'Speeding' }, { key: 'cuts', label: 'Trip cuts' }] as const).map(item => <TouchableOpacity key={item.key} accessibilityRole="tab" accessibilityState={{ selected: activityView === item.key }} onPress={() => setActivityView(item.key)} style={[styles.activityTab, activityView === item.key && styles.activityTabActive]}><Text style={[styles.activityTabText, activityView === item.key && { color: Colors.ink }]}>{item.label}</Text></TouchableOpacity>)}
      </ScrollView>
      {activityView === 'live' && <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live speed telemetry</Text>
        <Text style={styles.sectionSub}>Latest GPS readings from units seen in the last two minutes · company cap {ESAKAY_OPERATIONS.operatorSpeedCapKph} km/h</Text>
        {liveUnits.length === 0 ? <Text style={styles.empty}>No units are broadcasting a current location.</Text> : liveUnits.map((unit) => (
          <View key={unit.id} style={styles.listRow}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{unit.body} · {unit.plate}</Text><Text style={styles.rowSub}>{driverNames.get(unit.driverId) || 'Driver'} · Updated {new Date(unit.lastSeen).toLocaleTimeString()}</Text></View>
            <Text style={[styles.speedValue, !unit.isSpeeding && styles.normalSpeed]}>{Math.round(unit.speed)}<Text style={styles.speedLimit}> km/h</Text></Text>
          </View>
        ))}
        <Text style={styles.sampleHeading}>Sample readings</Text>
        {SAMPLE_TELEMETRY.map((unit) => <View key={unit.id} style={styles.listRow}>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{unit.unit} <Text style={styles.sampleInline}>SAMPLE</Text></Text><Text style={styles.rowSub}>{unit.driver}</Text></View>
          <Text style={[styles.speedValue, unit.speedKph <= ESAKAY_OPERATIONS.operatorSpeedCapKph && styles.normalSpeed]}>{unit.speedKph}<Text style={styles.speedLimit}> km/h</Text></Text>
        </View>)}
      </View>}

      {activityView === 'grades' && <View style={styles.card}>
        <Text style={styles.sectionTitle}>Driver safety report cards</Text>
        <Text style={styles.sectionSub}>{formatReportingPeriod(period)} · 100 points minus recorded safety deductions</Text>
        <View style={styles.sectionFilters}>
          <MapFilter label="All" selected={scoreFilter === 'all'} onPress={() => setScoreFilter('all')} />
          <MapFilter label="Needs attention" selected={scoreFilter === 'attention'} onPress={() => setScoreFilter('attention')} />
          <MapFilter label="Samples" selected={scoreFilter === 'sample'} onPress={() => setScoreFilter('sample')} />
        </View>
        {(!safetyDataAvailable.speed || !safetyDataAvailable.cuts) && <Text style={styles.empty}>Recorded safety scores are unavailable for this period.</Text>}
        {scoreFilter !== 'sample' && scorecards.filter((item) => scoreFilter !== 'attention' || item.score < 90).map((item) => (
          <View key={item.driverId} style={styles.listRow}>
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowSub}>{item.speedEvents} speed events · {item.confirmedTrips} confirmed route cuts · {item.status}</Text></View>
            <Text style={[styles.score, item.score < 80 && styles.scoreLow]}>{item.score}</Text>
          </View>
        ))}
        {scoreFilter !== 'attention' && sampleScorecards.map((item) => <View key={item.name} style={styles.listRow}>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.name} <Text style={styles.sampleInline}>SAMPLE</Text></Text><Text style={styles.rowSub}>{item.speed} speed events · {item.cuts} route cuts</Text></View>
          <Text style={[styles.score, item.score < 80 && styles.scoreLow]}>{item.score}</Text>
        </View>)}
        {scoreFilter === 'attention' && safetyDataAvailable.speed && safetyDataAvailable.cuts && !scorecards.some((item) => item.score < 90) && <Text style={styles.empty}>No recorded drivers need attention in this period.</Text>}
        {scoreFilter === 'sample' && sampleScorecards.length === 0 && <Text style={styles.empty}>No sample records for this period.</Text>}
      </View>}

      {activityView === 'speed' && <View style={styles.card}>
        <Text style={styles.sectionTitle}>Speeding offenses</Text>
        <Text style={styles.sectionSub}>Phone GPS speed compared with the 20 km/h eSAKAY limit · {formatReportingPeriod(period)}</Text>
        <View style={styles.sectionFilters}>
          <MapFilter label="All" selected={speedFilter === 'all'} onPress={() => setSpeedFilter('all')} />
          <MapFilter label="Recorded" selected={speedFilter === 'recorded'} onPress={() => setSpeedFilter('recorded')} />
          <MapFilter label="Samples" selected={speedFilter === 'sample'} onPress={() => setSpeedFilter('sample')} />
        </View>
        {speedFilter !== 'sample' && speedEvents.slice(0, 25).map((event) => (
          <View key={event.id} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{driverNames.get(event.driver_id) || 'Driver'} · {unitLabel(event.vehicle_id, event.body_number, event.plate_number)}</Text>
              <Text style={styles.rowSub}>{event.zone_label || (event.policy_type === 'operator_cap' ? 'eSAKAY company cap' : 'Configured zone')} · {new Date(event.created_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.speedValue}>{Math.round(Number(event.speed_kph))}<Text style={styles.speedLimit}>/{Math.round(Number(event.limit_kph))}</Text></Text>
          </View>
        ))}
        {speedFilter !== 'recorded' && sampleSpeedRows.map((event) => <View key={event.id} style={styles.listRow}>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{event.driver} · {event.unit} <Text style={styles.sampleInline}>SAMPLE</Text></Text><Text style={styles.rowSub}>{new Date(event.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text></View>
          <Text style={styles.speedValue}>{event.speedKph}<Text style={styles.speedLimit}>/{event.limitKph}</Text></Text>
        </View>)}
        {speedFilter === 'recorded' && safetyDataAvailable.speed && speedEvents.length === 0 && <Text style={styles.empty}>No recorded speed offenses in this period.</Text>}
        {!safetyDataAvailable.speed && <Text style={styles.empty}>Recorded speed offenses are unavailable.</Text>}
        {speedFilter === 'sample' && sampleSpeedRows.length === 0 && <Text style={styles.empty}>No sample records for this period.</Text>}
        <Text style={styles.smallNote}>Company-cap alerts require two GPS readings above 22 km/h within one minute. Review the recorded trail before taking action.</Text>
      </View>}

      {activityView === 'cuts' && <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trip-cutting records</Text>
        <Text style={styles.sectionSub}>Ordered stop visits checked when a shift ends · {formatReportingPeriod(period)}</Text>
        <View style={styles.sectionFilters}>
          <MapFilter label="All" selected={cutFilter === 'all'} onPress={() => setCutFilter('all')} />
          <MapFilter label="Needs review" selected={cutFilter === 'review'} onPress={() => setCutFilter('review')} />
          <MapFilter label="Samples" selected={cutFilter === 'sample'} onPress={() => setCutFilter('sample')} />
        </View>
        {cutFilter !== 'sample' && violations.filter((item) => cutFilter !== 'review' || item.status === 'pending_review' || item.status === 'flagged').map((item) => (
          <View key={item.id} style={styles.violationRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{driverNames.get(item.driver_id) || 'Driver'} · {unitLabel(item.vehicle_id, item.body_number, item.plate_number)}</Text>
              <Text style={styles.rowSub}>{item.reason}</Text>
              {!!item.missed_stops?.length && <Text style={styles.rowSub}>Missed: {item.missed_stops.join(', ')}</Text>}
              <Text style={styles.rowSub}>{item.status.replace('_', ' ')}{item.auto_confirmed ? ' · detected automatically' : ''} · {new Date(item.created_at).toLocaleString()}</Text>
            </View>
            {(item.status === 'pending_review' || item.status === 'flagged') && <View style={styles.actionRow}>
              <TouchableOpacity accessibilityLabel="Confirm route violation" style={styles.confirmButton} onPress={() => reviewViolation(item, 'confirmed')}><Ionicons name="checkmark" size={20} color="#fff" /></TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Dismiss route flag" style={styles.dismissButton} onPress={() => reviewViolation(item, 'dismissed')}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
            </View>}
          </View>
        ))}
        {cutFilter !== 'review' && sampleCutRows.map((item) => <View key={item.id} style={styles.violationRow}>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.driver} · {item.unit} <Text style={styles.sampleInline}>SAMPLE</Text></Text><Text style={styles.rowSub}>{item.reason}</Text><Text style={styles.rowSub}>{item.status.replace('_', ' ')} · {new Date(item.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text></View>
        </View>)}
        {cutFilter === 'review' && safetyDataAvailable.cuts && !violations.some((item) => item.status === 'pending_review' || item.status === 'flagged') && <Text style={styles.empty}>No recorded route flags need review in this period.</Text>}
        {!safetyDataAvailable.cuts && <Text style={styles.empty}>Recorded route flags are unavailable.</Text>}
        {cutFilter === 'sample' && sampleCutRows.length === 0 && <Text style={styles.empty}>No sample records for this period.</Text>}
        <Text style={styles.smallNote}>Reliable GPS trails can confirm route cuts automatically. Incomplete coverage requires review. Three confirmed route cuts automatically suspend the driver account.</Text>
      </View>}


    </ScrollView>
  );
}

function Metric({ label, value, danger = false, compact = false }: { label: string; value: number | string; danger?: boolean; compact?: boolean }) {
  return <View style={[styles.metric, compact && styles.metricCompact]}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, danger && { color: Colors.primaryRed }]}>{value}</Text></View>;
}

function MapFilter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filterChip, selected && styles.filterChipSelected]}>
    <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: 20 },
  routeDisclosure: { paddingHorizontal: 2, paddingVertical: 4 },
  activityTabs: { gap: 24, borderBottomWidth: 1, borderBottomColor: Colors.border },
  activityTab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 2 },
  activityTabActive: { borderBottomColor: Colors.ink },
  activityTabText: { fontSize: 14, color: Colors.subtleGray, fontWeight: '500' },
  pageTitle: { color: Colors.ink, fontSize: 23, fontWeight: '600', letterSpacing: -0.4 },
  reportToolbar: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap', gap: 8, zIndex: 30 },
  reportPeriod: { flexGrow: 1, flexShrink: 1, flexBasis: 550, minWidth: 0, maxWidth: '100%', zIndex: 30 },
  exportButton: { minHeight: 44, alignSelf: 'center', backgroundColor: Colors.ink, paddingHorizontal: 15, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  exportButtonCompact: { minHeight: 44 },
  exportText: { color: Colors.white, fontWeight: '600', fontSize: 12 },
  pdfReady: { color: Colors.ink, fontSize: 12, marginTop: -8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  metric: { flexGrow: 1, flexBasis: 125, minHeight: 65, paddingHorizontal: 4, paddingVertical: 8, justifyContent: 'space-between' },
  metricCompact: { flexBasis: '45%', minHeight: 48, paddingVertical: 4 },
  metricValue: { color: Colors.ink, fontWeight: '500', fontSize: 26, marginTop: 3, fontVariant: ['tabular-nums'] },
  metricLabel: { color: Colors.subtleGray, fontSize: 12, fontWeight: '600' },
  metricNote: { color: '#53656B', fontSize: 12, lineHeight: 16, marginTop: -7 },
  dataWarning: { color: '#79431E', backgroundColor: '#FFF0DB', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, lineHeight: 16 },
  card: { backgroundColor: Colors.paper, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 18 },
  mapCard: { backgroundColor: Colors.paper, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 18 },
  collapsibleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  mapHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  mapFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 },
  mapFilterField: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, maxWidth: '100%' },
  mapCount: { color: '#52666B', fontSize: 12, fontWeight: '600' },
  filterLabel: { color: Colors.subtleGray, fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  filterRow: { gap: 7, paddingRight: 12 },
  filterChip: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.paper, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 230 },
  filterChipSelected: { borderColor: Colors.ink, backgroundColor: Colors.paper },
  filterChipText: { color: Colors.navy, fontWeight: '700', fontSize: 12 },
  filterChipTextSelected: { color: Colors.ink },
  unitSelect: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.paper },
  unitSelectText: { flex: 1, color: Colors.navy, fontSize: 12, fontWeight: '700' },
  unitOptions: { maxHeight: 180, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, backgroundColor: '#FFFFFF', marginTop: 4 },
  unitOption: { minHeight: 39, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#F2EEEA' },
  unitOptionActive: { backgroundColor: Colors.paper },
  unitOptionText: { flex: 1, color: Colors.navy, fontSize: 12 },
  unitOptionTextActive: { color: Colors.ink, fontWeight: '600' },
  comingSoonNote: { color: '#704F39', backgroundColor: '#FFF6EA', borderRadius: 6, padding: 10, marginTop: 12, fontSize: 12, fontWeight: '600' },
  map: { height: 330, overflow: 'hidden', borderRadius: 6, marginTop: 12 },
  trackStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, borderRadius: 6, backgroundColor: '#FBF3EF', paddingHorizontal: 11, paddingVertical: 9 },
  trackStatusText: { flex: 1, color: Colors.navy, fontSize: 12, fontWeight: '700' },
  waypointRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F1F2' },
  waypointNumber: { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center' },
  waypointNumberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  sectionTitle: { color: Colors.ink, fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
  sectionSub: { color: '#52666B', fontSize: 12, lineHeight: 17, marginTop: 4 },
  sectionFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13, marginBottom: 5 },
  sampleHeading: { color: Colors.ink, fontSize: 12, fontWeight: '600', letterSpacing: 0.3, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  sampleInline: { color: '#8B4D27', fontSize: 12, fontWeight: '600', letterSpacing: 0.7 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  violationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  rowTitle: { fontSize: 13, color: Colors.darkText, fontWeight: '700' },
  rowSub: { fontSize: 12, color: '#52666B', marginTop: 3, lineHeight: 16 },
  score: { minWidth: 42, textAlign: 'center', color: '#2E7D32', fontWeight: '600', fontSize: 20 },
  scoreLow: { color: '#C62828' },
  speedValue: { color: '#A62B36', fontWeight: '600', fontSize: 17, marginLeft: 10 },
  normalSpeed: { color: Colors.navy },
  speedLimit: { color: '#74818B', fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 6 },
  confirmButton: { backgroundColor: '#2E7D32', borderRadius: 8, padding: 7 },
  dismissButton: { backgroundColor: '#777', borderRadius: 8, padding: 7 },
  smallNote: { color: '#777', fontSize: 12, lineHeight: 14, marginTop: 9 },
  empty: { color: '#777', fontSize: 12, paddingVertical: 12 },
  sourceLink: { color: '#235A8B', fontSize: 12, textDecorationLine: 'underline' },
});
