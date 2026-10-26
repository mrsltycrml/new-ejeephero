import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, FlatList, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { SAMPLE_DRIVERS, SAMPLE_UNITS, type SampleDriver, type SampleUnit } from '../../constants/sampleFleet';
import ReportingPeriodPicker from '../../components/ReportingPeriodPicker';
import AdminRegistryManager from '../../components/AdminRegistryManager';
import FleetRosterRow from '../../components/FleetRosterRow';
import { useAuth } from '../../contexts/AuthContext';
import { loadRegistry, saveRegistryRecord, setRegistryDeleted, type ManagedUnit, type ManagedDriver, type RegistryMode } from '../../services/fleetRegistryService';
import { currentReportingPeriod, periodContains } from '../../utils/reportingPeriod';
import {
  loadAdminOperations,
  summarizeDrivers,
  summarizeUnits,
  type DriverSummary,
  type OperationsData,
  type UnitSummary,
} from '../../services/adminOperationsService';

const emptyData: OperationsData = { shifts: [], drivers: [], routes: [], speedEvents: null, tripViolations: null };
let operationsChannelSequence = 0;

function useOperationsData() {
  const [data, setData] = useState<OperationsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await loadAdminOperations());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load operations data. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    const channel = supabase.channel(`admin-operations-live-${++operationsChannelSequence}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => { void load(); })
      .subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [load]));

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  return { data, loading, refreshing, error, refresh };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function StatusPill({ label, tone }: { label: string; tone: 'green' | 'blue' | 'gray' | 'red' | 'sample' }) {
  const toneStyle = {
    green: styles.statusGreen,
    blue: styles.statusBlue,
    gray: styles.statusGray,
    red: styles.statusRed,
    sample: styles.statusSample,
  }[tone];
  return <View style={[styles.statusPill, toneStyle]}><Text style={styles.statusText}>{label}</Text></View>;
}

function SummaryMetric({ value, label }: { value: number; label: string }) {
  return <View style={styles.summaryItem}>
    <Text style={styles.summaryNumber}>{value}</Text>
    <Text style={styles.summaryText}>{label}</Text>
  </View>;
}

function TrackButton({ onPress }: { onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Track unit on Fleet Monitor" onPress={onPress} style={styles.trackButton}>
    <Ionicons name="navigate-outline" size={16} color={Colors.white} />
    <Text style={styles.trackButtonText}>Track unit</Text>
  </TouchableOpacity>;
}

function Filters<T extends string>({ options, selected, onChange }: {
  options: { key: T; label: string }[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
    {options.map((option) => <TouchableOpacity
      key={option.key}
      accessibilityRole="button"
      accessibilityState={{ selected: option.key === selected }}
      onPress={() => onChange(option.key)}
      style={[styles.filter, option.key === selected && styles.filterActive]}
    ><Text style={[styles.filterText, option.key === selected && styles.filterTextActive]}>{option.label}</Text></TouchableOpacity>)}
  </ScrollView>;
}

function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.searchBox}>
    <Ionicons name="search" size={18} color={Colors.tabInactive} />
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#6B7784" style={styles.searchInput} autoCapitalize="none" />
    {value ? <TouchableOpacity accessibilityLabel="Clear search" onPress={() => onChangeText('')}><Ionicons name="close-circle" size={18} color={Colors.tabInactive} /></TouchableOpacity> : null}
  </View>;
}

function LoadingView() {
  return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primaryRed} /><Text style={styles.loadingText}>Loading operations…</Text></View>;
}

function UnitCard({ item, driverName, routeName, onTrack, onDelete }: { item: UnitSummary; driverName: string; routeName: string; onTrack: () => void; onDelete: () => void }) {
  const shift = item.activeShift || item.latestShift;
  return <FleetRosterRow body={item.bodyNumber || item.plateNumber || 'Unit'} plate={item.plateNumber || ''} driver={driverName} route={routeName} trips={item.tripsToday} total={item.totalTrips} started={formatDateTime(shift.created_at)} ended={item.activeShift ? 'In progress' : formatDateTime(shift.ended_at)} status={item.state === 'on_trip' ? 'On trip' : item.state === 'traveled_today' ? 'Traveled today' : 'No trip today'} onTrack={onTrack} onDelete={onDelete} />;
}
function SampleUnitCard({ item, onTrack }: { item: SampleUnit; onTrack: () => void }) {
  return <FleetRosterRow body={item.name} plate={item.plateNumber} driver={item.driverName} route={item.routeName} trips={item.tripsToday} total={item.totalTrips} started={item.lastTripStarted} ended={item.shiftEnded} status="Sample" onTrack={onTrack} />;
}

type UnitFilter = 'all' | 'on_trip' | 'traveled_today' | 'no_trip_today';
type UnitRow = { kind: 'recorded'; key: string; unit: UnitSummary } | { kind: 'sample'; key: string; unit: SampleUnit };

export function AdminUnitsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useOperationsData();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UnitFilter>('all');
  const [registryRows, setRegistryRows] = useState<ManagedUnit[]>([]);
  const [registryRevision, setRegistryRevision] = useState(0);
  const onRegistryRowsChange = useCallback((rows: (ManagedUnit | ManagedDriver)[], _mode: RegistryMode) => { setRegistryRows(rows.filter((row): row is ManagedUnit => 'body_number' in row)); }, []);
  const hiddenKeys = useMemo(() => new Set(registryRows.filter((entry) => entry.deleted_at).flatMap((entry) => [entry.body_number, entry.plate_number || ''].filter(Boolean).map((value) => value.trim().toUpperCase()))), [registryRows]);
  const units = useMemo(() => summarizeUnits(data.shifts), [data.shifts]);
  const visibleUnits = units.filter((unit) => !hiddenKeys.has(unit.bodyNumber.trim().toUpperCase()) && !hiddenKeys.has(unit.plateNumber.trim().toUpperCase()));
  const drivers = useMemo(() => new Map(data.drivers.map((profile) => [profile.id, profile.full_name || profile.email || 'Unknown driver'])), [data.drivers]);
  const routes = useMemo(() => new Map(data.routes.map((route) => [route.id, route.name])), [data.routes]);
  const search = query.trim().toLowerCase();
  const recordedRows: UnitRow[] = visibleUnits.filter((unit) => {
    if (filter !== 'all' && unit.state !== filter) return false;
    const shift = unit.activeShift || unit.latestShift;
    const haystack = `${unit.bodyNumber} ${unit.plateNumber} ${drivers.get(shift.driver_id) || ''}`.toLowerCase();
    return haystack.includes(search);
  }).map((unit) => ({ kind: 'recorded', key: unit.key, unit }));
  const recordedKeys = new Set(visibleUnits.flatMap((unit) => [unit.bodyNumber, unit.plateNumber].map((value) => value.trim().toUpperCase())));
  const sampleRows: UnitRow[] = filter === 'all'
    ? SAMPLE_UNITS.filter((unit) => !recordedKeys.has(unit.name.toUpperCase()) && !recordedKeys.has(unit.plateNumber.toUpperCase()) && `${unit.name} ${unit.driverName} ${unit.routeName}`.toLowerCase().includes(search))
        .map((unit) => ({ kind: 'sample', key: unit.key, unit }))
    : [];
  const shown = [...recordedRows, ...sampleRows];
  const trackUnit = (key: string, label: string) => navigation.navigate('Fleet', {
    trackUnitKey: key,
    trackUnitLabel: label,
    trackRequestId: Date.now(),
  });
  const deleteRecordedUnit = (record: UnitSummary) => {
    const name = record.bodyNumber || record.plateNumber || 'this unit';
    const action = async () => {
      try {
        const adminId = user?.id || 'admin-preview';
        const first = await loadRegistry('units', adminId);
        const body = record.bodyNumber || record.plateNumber;
        let entry = first.rows.find((row) => !row.deleted_at && (row.body_number.trim().toUpperCase() === body.trim().toUpperCase() || (!!record.plateNumber && row.plate_number?.trim().toUpperCase() === record.plateNumber.trim().toUpperCase())));
        if (!entry) {
          const shift = record.activeShift || record.latestShift;
          await saveRegistryRecord('units', adminId, first.mode, { body_number: body, plate_number: record.plateNumber || null, route_name: routes.get(shift.route_id) || 'Unknown route', assigned_driver: drivers.get(shift.driver_id) || null, notes: 'Recorded unit; trip history retained.' });
          const afterAdd = await loadRegistry('units', adminId);
          entry = afterAdd.rows.find((row) => !row.deleted_at && row.body_number.trim().toUpperCase() === body.trim().toUpperCase());
        }
        if (!entry) throw new Error('Could not locate the unit in the roster.');
        await setRegistryDeleted('units', adminId, first.mode, entry.id, true);
        const updated = await loadRegistry('units', adminId);
        setRegistryRows(updated.rows);
        setRegistryRevision((value) => value + 1);
      } catch (cause) { Alert.alert('Could not delete unit', cause instanceof Error ? cause.message : 'Try again.'); }
    };
    if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm(`Move ${name} to Recently deleted? Its trip history will remain in reports.`)) void action(); }
    else Alert.alert('Delete unit?', `${name} can be restored from Recently deleted. Trip history will remain.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void action(); } }]);
  };

  if (loading) return <LoadingView />;
  return <FlatList
    style={styles.page}
    data={shown}
    keyExtractor={(item) => item.key}
    contentContainerStyle={[styles.listContent, width >= 900 && styles.listContentWide]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.primaryRed]} />}
    ListHeaderComponent={<>
      <View style={styles.header}>
      <Text style={styles.title}>Units</Text>
      <View style={styles.summaryStrip}>
        <SummaryMetric value={visibleUnits.length} label="Registered" />
        <SummaryMetric value={visibleUnits.filter((unit) => unit.state === 'on_trip').length} label="On trip" />
        <SummaryMetric value={visibleUnits.filter((unit) => unit.tripsToday > 0).length} label="Traveled today" />
      </View>
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search body number, plate, or driver" />
      <Filters<UnitFilter> selected={filter} onChange={setFilter} options={[
        { key: 'all', label: 'All units' },
        { key: 'on_trip', label: 'On trip' },
        { key: 'traveled_today', label: 'Traveled today' },
        { key: 'no_trip_today', label: 'No trip today' },
      ]} />
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      <AdminRegistryManager kind="units" refreshToken={registryRevision} onRowsChange={onRegistryRowsChange} excludeUnitKeys={units.flatMap((unit) => [unit.bodyNumber, unit.plateNumber])} />
    </>}
    renderItem={({ item }) => {
      if (item.kind === 'sample') return <SampleUnitCard item={item.unit} onTrack={() => trackUnit(item.unit.key, item.unit.name)} />;
      const shift = item.unit.activeShift || item.unit.latestShift;
      return <UnitCard item={item.unit} driverName={drivers.get(shift.driver_id) || 'Unknown driver'} routeName={routes.get(shift.route_id) || 'Unknown route'} onTrack={() => trackUnit(item.unit.key, item.unit.bodyNumber || item.unit.plateNumber || 'Unit')} onDelete={() => deleteRecordedUnit(item.unit)} />;
    }}
    ItemSeparatorComponent={() => <View style={styles.itemGap} />}
    ListEmptyComponent={<View style={styles.empty}><Ionicons name="bus-outline" size={36} color={Colors.tabInactive} /><Text style={styles.emptyTitle}>No matching units</Text><Text style={styles.emptyBody}>Try another search or filter.</Text></View>}
  />;
}

function DriverCard({ item, routeName, speedCount, routeCutCount, periodTrips }: { item: DriverSummary; routeName: string; speedCount: number | null; routeCutCount: number | null; periodTrips: number }) {
  const [expanded, setExpanded] = useState(false);
  const shift = item.activeShift || item.latestShift;
  const accountBlocked = Boolean(item.profile.status && item.profile.status !== 'approved');
  const status = accountBlocked
    ? `${item.profile.status?.charAt(0).toUpperCase()}${item.profile.status?.slice(1)}`
    : item.activeShift ? 'On trip' : 'Off duty';
  const tone = accountBlocked ? 'red' : item.activeShift ? 'green' : 'gray';
  const totalViolations = speedCount === null || routeCutCount === null ? null : speedCount + routeCutCount;
  return <View style={styles.card}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Details for ${item.profile.full_name || 'driver'}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.cardHeader}>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>{item.profile.full_name || 'Unnamed driver'}</Text>
        <Text style={styles.cardSub} numberOfLines={2}>{item.profile.email || 'No email recorded'}</Text>
      </View>
      <StatusPill label={status} tone={tone} />
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.subtleGray}/>
    </TouchableOpacity>
    <View style={styles.violationStrip}>
      <View style={styles.violationTotal}><Text style={[styles.violationNumber, totalViolations !== null && totalViolations > 0 && styles.violationNumberAlert]}>{totalViolations ?? '—'}</Text><Text style={styles.violationCaption}>Total violations</Text></View>
      <View style={styles.violationBreakdown}><Ionicons name="speedometer-outline" size={17} color={Colors.primaryRed} /><Text style={styles.violationBreakdownText}>{speedCount ?? '—'} speed</Text></View>
      <View style={styles.violationBreakdown}><Ionicons name="git-branch-outline" size={17} color={Colors.primaryRed} /><Text style={styles.violationBreakdownText}>{routeCutCount ?? '—'} route cuts</Text></View>
    </View>
    {expanded && <View style={styles.detailsGrid}>
      <Detail label="Current / last unit" value={shift ? (shift.body_number || shift.plate_number || 'Unnumbered unit') : 'No unit assigned'} />
      <Detail label="Route" value={shift ? routeName : 'No trip yet'} />
      <Detail label={item.activeShift ? 'Shift started' : 'Last trip'} value={shift ? formatDateTime(shift.created_at) : 'No trip yet'} />
      <Detail label="Selected period / total trips" value={`${periodTrips} / ${item.totalTrips}`} />
    </View>}
  </View>;
}

function SampleDriverCard({ item }: { item: SampleDriver }) {
  return <View style={[styles.card, styles.sampleCard]}>
    <View style={styles.sampleCardRow}>
      <View style={styles.sampleIcon}><Ionicons name="person-outline" size={20} color={Colors.subtleGray} /></View>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardSub}>{item.unitName} · {item.routeName}</Text>
      </View>
      <StatusPill label="Sample" tone="sample" />
    </View>
  </View>;
}

type DriverFilter = 'all' | 'on_trip' | 'off_duty';
type DriverRow = { kind: 'recorded'; key: string; driver: DriverSummary } | { kind: 'sample'; key: string; driver: SampleDriver };

export function AdminDriversScreen() {
  const { data, loading, refreshing, error, refresh } = useOperationsData();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DriverFilter>('all');
  const [period, setPeriod] = useState(currentReportingPeriod());
  const drivers = useMemo(() => summarizeDrivers(data.drivers, data.shifts), [data.drivers, data.shifts]);
  const tripsInPeriod = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shift of data.shifts) if (periodContains(shift.created_at, period)) counts.set(shift.driver_id, (counts.get(shift.driver_id) ?? 0) + 1);
    return counts;
  }, [data.shifts, period]);
  const speedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of data.speedEvents ?? []) if (periodContains(event.created_at, period)) counts.set(event.driver_id, (counts.get(event.driver_id) ?? 0) + 1);
    return counts;
  }, [data.speedEvents, period]);
  const routeCutCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const violation of data.tripViolations ?? []) if (violation.status === 'confirmed' && periodContains(violation.created_at, period)) counts.set(violation.driver_id, (counts.get(violation.driver_id) ?? 0) + 1);
    return counts;
  }, [data.tripViolations, period]);
  const routes = useMemo(() => new Map(data.routes.map((route) => [route.id, route.name])), [data.routes]);
  const search = query.trim().toLowerCase();
  const recordedRows: DriverRow[] = drivers.filter((driver) => {
    if (filter === 'on_trip' && !driver.activeShift) return false;
    if (filter === 'off_duty' && driver.activeShift) return false;
    return `${driver.profile.full_name || ''} ${driver.profile.email || ''} ${driver.activeShift?.body_number || ''}`.toLowerCase().includes(search);
  }).map((driver) => ({ kind: 'recorded', key: driver.profile.id, driver }));
  const sampleRows: DriverRow[] = filter === 'all' || filter === 'off_duty'
    ? SAMPLE_DRIVERS.filter((driver) => `${driver.name} ${driver.unitName} ${driver.routeName}`.toLowerCase().includes(search))
        .map((driver) => ({ kind: 'sample', key: driver.key, driver }))
    : [];
  const shown = [...recordedRows, ...sampleRows];

  if (loading) return <LoadingView />;
  return <FlatList
    style={styles.page}
    data={shown}
    keyExtractor={(item) => item.key}
    contentContainerStyle={[styles.listContent, width >= 900 && styles.listContentWide]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.primaryRed]} />}
    ListHeaderComponent={<>
      <View style={styles.header}>
      <Text style={styles.title}>Drivers</Text>
      <View style={styles.summaryStrip}>
        <SummaryMetric value={drivers.length} label="Registered" />
        <SummaryMetric value={drivers.filter((driver) => Boolean(driver.activeShift)).length} label="On trip" />
        <SummaryMetric value={drivers.filter((driver) => !driver.activeShift).length} label="Off duty" />
      </View>
      <ReportingPeriodPicker value={period} onChange={setPeriod} label="Driver metrics" />
      <SearchBox value={query} onChangeText={setQuery} placeholder="Search name, email, or unit" />
      <Filters<DriverFilter> selected={filter} onChange={setFilter} options={[
        { key: 'all', label: 'All drivers' },
        { key: 'on_trip', label: 'On trip' },
        { key: 'off_duty', label: 'Off duty' },
      ]} />
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      <AdminRegistryManager kind="drivers" />
    </>}
    renderItem={({ item }) => item.kind === 'sample'
      ? <SampleDriverCard item={item.driver} />
      : <DriverCard item={item.driver} routeName={routes.get((item.driver.activeShift || item.driver.latestShift)?.route_id || '') || 'Unknown route'} speedCount={data.speedEvents === null ? null : speedCounts.get(item.driver.profile.id) ?? 0} routeCutCount={data.tripViolations === null ? null : routeCutCounts.get(item.driver.profile.id) ?? 0} periodTrips={tripsInPeriod.get(item.driver.profile.id) ?? 0} />}
    ItemSeparatorComponent={() => <View style={styles.itemGap} />}
    ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={36} color={Colors.tabInactive} /><Text style={styles.emptyTitle}>No matching drivers</Text><Text style={styles.emptyBody}>Try another search or filter.</Text></View>}
  />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.canvas },
  listContent: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 14, paddingBottom: 32 },
  listContentWide: { paddingHorizontal: 24, paddingTop: 22 },
  header: { gap: 14, paddingVertical: 6, marginBottom: 18 },
  title: { fontSize: 23, fontWeight: '600', color: Colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, lineHeight: 18, color: Colors.subtleGray },
  summaryStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  summaryItem: { flexGrow: 1, flexBasis: 75, minHeight: 52, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'flex-start', justifyContent: 'center' },
  summaryText: { fontSize: 12, fontWeight: '600', color: Colors.subtleGray, marginTop: 2, textAlign: 'center' },
  summaryNumber: { fontSize: 22, fontWeight: '600', color: Colors.ink, fontVariant: ['tabular-nums'], textAlign: 'center' },
  searchBox: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 6, backgroundColor: Colors.paper, borderWidth: 1, borderColor: '#C7B9AA' },
  searchInput: { flex: 1, fontSize: 14, color: Colors.darkText, paddingVertical: 10 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.paper },
  filterActive: { borderColor: Colors.ink, backgroundColor: Colors.paper },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.ink },
  filterTextActive: { color: Colors.ink },
  card: { backgroundColor: Colors.paper, padding: 16, borderBottomWidth: 1, borderColor: Colors.border },
  sampleCard: { backgroundColor: Colors.paper, paddingVertical: 14 },
  sampleCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sampleIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  itemGap: { height: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  cardIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  cardSub: { fontSize: 12, color: '#4A5D60', marginTop: 3 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20 },
  statusGreen: { backgroundColor: '#DDF4E5' },
  statusBlue: { backgroundColor: '#DCEBFA' },
  statusGray: { backgroundColor: '#E8EDF1' },
  statusRed: { backgroundColor: '#FCE3E5' },
  statusSample: { backgroundColor: Colors.sand },
  statusText: { fontSize: 12, fontWeight: '600', color: Colors.navy },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 13, paddingTop: 14 },
  detail: { flexGrow: 1, flexBasis: 210, minWidth: 125 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: '#53686B', textTransform: 'none', letterSpacing: 0.6 },
  detailValue: { marginTop: 4, fontSize: 14, lineHeight: 19, fontWeight: '700', color: Colors.ink },
  unitAssignment: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8DED2' },
  assignmentItem: { flexGrow: 1, flexBasis: 240, minWidth: 150 },
  assignmentLabel: { color: '#53686B', fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  assignmentValue: { color: Colors.ink, fontSize: 15, fontWeight: '600', marginTop: 4 },
  violationStrip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, paddingTop: 8 },
  violationTotal: { flexDirection: 'row', alignItems: 'center', gap: 5, flexGrow: 1 },
  violationNumber: { color: Colors.ink, fontSize: 14, fontWeight: '600', lineHeight: 20, fontVariant: ['tabular-nums'] },
  violationNumberAlert: { color: Colors.primaryRed },
  violationCaption: { color: '#53686B', fontSize: 12, fontWeight: '600', textTransform: 'none', letterSpacing: 0.5 },
  violationBreakdown: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100 },
  violationBreakdownText: { color: Colors.ink, fontSize: 12, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEEAE6' },
  cardFooterHint: { flex: 1, minWidth: 160, fontSize: 12, lineHeight: 15, color: '#665E5A' },
  trackButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 6, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: Colors.ink },
  trackButtonText: { fontSize: 12, fontWeight: '600', color: Colors.white },
  deleteButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, borderWidth: 1, borderColor: '#E1ADA6', paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFF4F0' },
  deleteButtonText: { color: Colors.ember, fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.navy },
  emptyBody: { fontSize: 13, color: '#4D5C68', textAlign: 'center' },
  footerNote: { paddingTop: 16, fontSize: 12, lineHeight: 18, color: '#4D5C68', textAlign: 'center' },
  error: { padding: 12, borderRadius: 6, color: '#8A1C26', backgroundColor: '#FCE7E8', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.offWhite },
  loadingText: { fontSize: 13, color: '#4D5C68' },
});
