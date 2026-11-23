import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { BottomSheetModal, ScreenSkeleton, triggerHaptic } from '../../components/AppUI';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import PeekSheet from '../../components/ui/PeekSheet';
import { operationsStyles as ops } from './operationsStyles';
import SupervisorRouteManager from '../../components/SupervisorRouteManager';
import FleetIncidentInbox from '../../components/FleetIncidentInbox';
import { supabase } from '../../lib/supabase';
import { color, radius, tapTarget, sheetSnap } from '../../constants/theme';
import { offlineTransit } from '../../services/offlineTransitService';
import type { RouteData, TerminalData, VehicleData } from '../../services/offlineTransitService';
import { useRoute } from '@react-navigation/native';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import { realRows } from '../../utils/realData';
import { locationQuality, telemetryFix, type MeasuredFix } from '../../services/locationQuality';
import {
  currentReportingPeriod,
  formatReportingPeriod,
  periodRangeUtc,
  type ReportingPeriod,
} from '../../utils/reportingPeriod';
import {
  calculateSafetyScore,
  FRESH_TELEMETRY_WINDOW_MS,
  pickLatestFreshPositions,
} from '../../utils/operationsSummary';

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
  driverName?: string;
  unitDisplay?: string;
};

type SpeedEvent = {
  id: string;
  driver_id: string;
  vehicle_id: string;
  body_number?: string | null;
  plate_number?: string | null;
  zone_label?: string | null;
  policy_type?: 'operator_cap' | 'road_zone';
  speed_kph: number;
  limit_kph: number;
  score_deduction: number;
  created_at: string;
};

type LiveUnit = {
  id: string;
  driverId: string;
  body: string;
  plate: string;
  speed: number | null;
  lastSeen: string;
  isSpeeding: boolean;
  stale?: boolean;
  fix: MeasuredFix | null;
};

type Scorecard = {
  driverId: string;
  name: string;
  unitLabel: string;
  status: string;
  score: number;
  speedEvents: number;
  confirmedTrips: number;
  pendingFlags: number;
};

type UnitChoice = { key: string; label: string; routeId: string };

let monitorChannelSequence = 0;

async function readPeriodRows<T>(table: string, start: string, end: string): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase
      .from(table)
      .select('*')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) return { data: [], error: result.error.message };
    const page = (result.data ?? []) as T[];
    rows.push(...realRows(page));
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

function unitKey(unit: { id: string; body_number?: string | null; plate_number?: string | null }): string {
  return (unit.plate_number?.trim() || unit.body_number?.trim() || unit.id).toUpperCase();
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function FlagStatus({ status }: { status: Violation['status'] }) {
  const [label, backgroundColor, textColor] = status === 'confirmed'
    ? ['Confirmed', color.dangerBg, color.ember]
    : status === 'dismissed'
      ? ['Dismissed', color.sand, color.inkMuted]
      : ['Pending review', color.warningBg, color.warning];
  return <Text style={[styles.flagStatus, { backgroundColor, color: textColor }]}>{label}</Text>;
}

export default function SupervisorDashboardScreen() {
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
  const [telemetryNow, setTelemetryNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setTelemetryNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  const [unitChoices, setUnitChoices] = useState<UnitChoice[]>([]);
  const [mapRouteFilter, setMapRouteFilter] = useState('all');
  const [mapUnitFilter, setMapUnitFilter] = useState('all');
  const [vehicleFocusRequestId, setVehicleFocusRequestId] = useState<string | number>();
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [activityView, setActivityView] = useState<'map' | 'live' | 'grades' | 'speed' | 'cuts'>('map');
  const [driverNames, setDriverNames] = useState<Map<string, string>>(new Map());
  const [unitDetails, setUnitDetails] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState<ReportingPeriod>(currentReportingPeriod('day'));
  const [periodTripCount, setPeriodTripCount] = useState<number | null>(0);
  const [cutFilter, setCutFilter] = useState<'pending' | 'confirmed' | 'dismissed'>('pending');
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [manageMode, setManageMode] = useState<'none' | 'list' | 'route1' | 'add'>('none');
  const { width } = useWindowDimensions();
  const [dataError, setDataError] = useState('');
  const [transitNotice, setTransitNotice] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
    const { start, end } = periodRangeUtc(period);
    const [transit, vehicleResult, eventResult, violationResult, profileResult, recentSpeedResult, tripCountResult] =
      await Promise.all([
        offlineTransit.getTransitData(),
        supabase
          .from('vehicles')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000),
        readPeriodRows<SpeedEvent>('speed_events', start, end),
        readPeriodRows<Violation>('trip_violations', start, end),
        supabase.from('profiles').select('*').eq('role', 'driver').eq('supervisor_hidden', false),
        supabase
          .from('speed_events')
          .select('*')
          .gte('created_at', new Date(Date.now() - 120_000).toISOString())
          .limit(100),
        readPeriodRows<{ id: string }>('vehicles', start, end),
      ]);

    const failures = [vehicleResult, eventResult, violationResult, profileResult, recentSpeedResult, tripCountResult].filter(result => result.error);
    if (failures.length) throw new Error('Operations data unavailable. Refresh to try again.');
    setDataError('');
    setTransitNotice(transit.status === 'ready' ? '' : transit.syncedAt ? `Routes cached at ${new Date(transit.syncedAt).toLocaleString()}; refresh unavailable.` : 'Route data unavailable.');
    setPeriodTripCount(tripCountResult.data.length);
    setRoutes(transit.routes);
    setTerminals(transit.terminals);

    const allUnits = realRows<any>(vehicleResult.data ?? []);
    const active = allUnits.filter((vehicle: any) => vehicle.is_active);
    const choices = new Map<string, UnitChoice>();
    for (const vehicle of allUnits) {
      const key = unitKey(vehicle);
      if (!choices.has(key))
        choices.set(key, {
          key,
          label: [vehicle.body_number, vehicle.plate_number].filter(Boolean).join(' · ') || 'Unnumbered unit',
          routeId: vehicle.route_id,
        });
    }
    setUnitChoices([...choices.values()].sort((a, b) => a.label.localeCompare(b.label)));
    const details = new Map<string, string>(
      allUnits.map((vehicle: any) => [
        vehicle.id,
        `${vehicle.body_number || 'Unit unavailable'} · ${vehicle.plate_number || 'Plate unavailable'}`,
      ])
    );
    setUnitDetails(details);

    const sincePositions = new Date(Date.now() - FRESH_TELEMETRY_WINDOW_MS).toISOString();
    const positionsResult = active.length
      ? await supabase
          .from('vehicle_positions')
          .select('*')
          .in(
            'vehicle_id',
            active.map((vehicle) => vehicle.id)
          )
          .gte('timestamp', sincePositions)
          .order('timestamp', { ascending: false })
          .limit(300)
      : { data: [], error: null };
    if (positionsResult.error) throw new Error('Vehicle locations unavailable. Refresh to try again.');
    const latestPosition = pickLatestFreshPositions(realRows(positionsResult.data ?? []));
    const recentEvents = realRows(recentSpeedResult.data ?? []);
    const speedingIds = new Set(recentEvents.map((event: any) => event.vehicle_id));

    const mappedVehicles = active.flatMap((vehicle: any) => {
      const position = latestPosition.get(vehicle.id);
      if (!position) return [];
      const fix = telemetryFix(position);
      const count = vehicle.passenger_count ?? null;
      const capacity = vehicle.max_capacity ?? null;
      return [
        {
          id: vehicle.id,
          vehicle_id: vehicle.id,
          plate_number: vehicle.plate_number ?? '',
          body_number: vehicle.body_number ?? '',
          route_id: vehicle.route_id,
          latitude: position.latitude,
          longitude: position.longitude,
          speed: fix.speed,
          recorded_at: position.captured_at || undefined,
          accuracy: fix.accuracy,
          heading: fix.heading,
          passenger_count: count,
          max_capacity: capacity,
          is_full: count == null || capacity == null ? null : count >= capacity,
          status: count == null || capacity == null ? null : count >= capacity ? ('Puno' as const) : count >= capacity * 0.7 ? ('Sakto' as const) : ('Maluwag' as const),
          isSpeeding: speedingIds.has(vehicle.id),
        },
      ];
    });
    setVehicles(mappedVehicles);

    const profileNames = new Map(
      realRows<any>(profileResult.data ?? []).map((profile: any) => [profile.id, profile.full_name || profile.email || 'Driver'])
    );
    setDriverNames(profileNames);

    const computedLiveUnits: LiveUnit[] = active.map((vehicle: any) => {
      const position = latestPosition.get(vehicle.id);
      return {
        id: vehicle.id,
        driverId: vehicle.driver_id,
        body: vehicle.body_number || 'Unit unavailable',
        plate: vehicle.plate_number || 'Plate unavailable',
        speed: position?.speed ?? null,
        lastSeen: position?.captured_at ?? '',
        isSpeeding: speedingIds.has(vehicle.id),
        stale: !position,
        fix: position ? telemetryFix(position) : null,
      };
    });

    setLiveUnits(computedLiveUnits);

    const violationRows = violationResult.data ?? [];
    setViolations(violationRows);

    const eventRows = eventResult.data ?? [];
    setSpeedEvents(eventRows as SpeedEvent[]);

    const previewCards: Scorecard[] = realRows<any>(profileResult.data ?? []).map((profile: any) => {
      const driverId = profile.id;
      const driverEvents = eventRows.filter((event: any) => event.driver_id === driverId);
      const confirmedTrips = violationRows.filter(
        (violation: any) => violation.driver_id === driverId && violation.status === 'confirmed'
      ).length;
      const pendingFlags = violationRows.filter(
        (violation: any) =>
          violation.driver_id === driverId &&
          (violation.status === 'pending_review' || violation.status === 'flagged')
      ).length;
      const deductions = driverEvents.reduce((sum: number, event: any) => sum + Number(event.score_deduction || 0), 0);
      return {
        driverId,
        name: profileNames.get(driverId) ?? 'Driver',
        unitLabel: allUnits.find(unit => unit.driver_id === driverId)?.body_number || 'Unit unavailable',
        status: profile.status,
        score: calculateSafetyScore(deductions, confirmedTrips),
        speedEvents: driverEvents.length,
        confirmedTrips,
        pendingFlags,
      };
    });

    setScorecards(previewCards);
    } catch (cause) {
      setDataError(cause instanceof Error ? cause.message : 'Operations data unavailable.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadDashboard();
    const refreshTimer = setInterval(() => {
      void loadDashboard();
    }, 15_000);
    const channel = supabase
      .channel(`supervisor-live-monitor-${++monitorChannelSequence}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => loadDashboard())
      .subscribe();
    return () => {
      clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!requestedTrackKey) return;
    setMapRouteFilter('all');
    setMapUnitFilter(requestedTrackKey);
    setVehicleFocusRequestId(route.params?.trackRequestId);
    setActivityView('map');
    setManageMode('none');
  }, [requestedTrackKey, route.params?.trackRequestId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const reviewViolation = async (violation: Violation, status: 'confirmed' | 'dismissed') => {
    const { error } = await supabase.from('trip_violations').update({ status }).eq('id', violation.id);
    if (error) {
      triggerHaptic('error');
      Alert.alert('Could not update violation', error.message);
      return;
    }
    triggerHaptic(status === 'confirmed' ? 'success' : 'medium');
    setSelectedViolation(null);
    await loadDashboard();
  };

  const unitLabel = (vehicleId: string, body?: string | null, plate?: string | null) =>
    body || plate
      ? `${body || 'Unit unavailable'} · ${plate || 'Plate unavailable'}`
      : unitDetails.get(vehicleId) || 'Unit unavailable';

  const allCuts = violations;
  const pendingCount = allCuts.filter((item) => item.status === 'pending_review' || item.status === 'flagged').length;

  const visibleCuts = allCuts.filter(item => cutFilter === 'pending'
    ? item.status === 'pending_review' || item.status === 'flagged'
    : item.status === cutFilter);

  const mapVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          (mapRouteFilter === 'all' || vehicle.route_id === mapRouteFilter) &&
          (mapUnitFilter === 'all' || unitKey(vehicle) === mapUnitFilter)
      ),
    [vehicles, mapRouteFilter, mapUnitFilter]
  );
  const mapRoutes = useMemo(
    () => routes.filter((r) => !r.is_coming_soon && (mapRouteFilter === 'all' || r.id === mapRouteFilter)),
    [routes, mapRouteFilter]
  );
  const mapTerminals = useMemo(
    () => terminals.filter((t) => mapRouteFilter === 'all' || t.route_id === mapRouteFilter),
    [terminals, mapRouteFilter]
  );
  const shownUnitChoices = useMemo(() => {
    const matching = unitChoices.filter(
      (unit) => mapRouteFilter === 'all' || unit.routeId === mapRouteFilter
    );
    if (mapRouteFilter === 'all' && mapUnitFilter !== 'all' && !matching.some((unit) => unit.key === mapUnitFilter)) {
      return [{ key: mapUnitFilter, label: requestedTrackLabel || mapUnitFilter, routeId: '' }, ...matching];
    }
    return matching;
  }, [unitChoices, routes, mapRouteFilter, mapUnitFilter, requestedTrackLabel]);

  const selectedMapVehicle =
    mapUnitFilter === 'all' ? null : mapVehicles.find((vehicle) => unitKey(vehicle) === mapUnitFilter) || null;
  const currentLiveUnits = liveUnits.map(unit => {
    const quality = locationQuality(unit.fix, telemetryNow);
    return { ...unit, quality, stale: quality !== 'live', speed: quality === 'live' ? unit.fix?.speed ?? null : null };
  });

  const gpsIssueCount = currentLiveUnits.filter(unit => unit.stale).length;

  if (manageMode !== 'none') return <SupervisorRouteManager initialPage={manageMode} onChanged={loadDashboard} onBack={() => setManageMode('none')} />;
  const addRouteButton = <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add route" style={styles.routeAction} onPress={() => setManageMode('add')}>
    <Ionicons aria-hidden name="add" size={18} color={color.action} />
    <Text style={styles.routeActionText}>Add route</Text>
  </TouchableOpacity>;
  const route1ReviewButton = <TouchableOpacity accessibilityRole="button" accessibilityLabel="Review Route 1 map and stops" style={styles.routeAction} onPress={()=>setManageMode('route1')}>
    <Ionicons aria-hidden name="git-branch-outline" size={18} color={color.action} />
    <Text style={styles.routeActionText}>Review Route 1 map and stops</Text>
  </TouchableOpacity>;
  if (loading) return <ScreenSkeleton preset="dashboard" />;
  if (dataError) return <ScrollView style={ops.page} contentContainerStyle={ops.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
    <Text accessibilityRole="alert" style={ops.errorBanner}>{dataError}</Text>
    {route1ReviewButton}
    {addRouteButton}
    <TouchableOpacity accessibilityRole="button" style={styles.backNavRow} onPress={() => setManageMode('list')}>
      <Text style={styles.rowTitle}>Manage routes and stops</Text>
    </TouchableOpacity>
  </ScrollView>;


  const activeRouteLabel =
    mapRouteFilter === 'all'
      ? 'All routes'
      : routes.find((r) => r.id === mapRouteFilter)?.name || 'Route unavailable';
  const activeUnitLabel =
    mapUnitFilter === 'all'
      ? 'All units'
      : shownUnitChoices.find((u) => u.key === mapUnitFilter)?.label || mapUnitFilter;
  const viewLabels: Record<typeof activityView, string> = {
    map: 'Live map',
    live: 'Live speeds',
    grades: 'Driver grades',
    speed: 'Speeding',
    cuts: 'Route flags',
  };

  const wideMap = width >= 860;
  const [sheetInset, setSheetInset] = useState<number>(sheetSnap.peek);
  return (
    <>
      <View style={styles.homeFill}>
        <View style={styles.mapFill}>
          <LeafletMap
            routes={mapRoutes}
            terminals={mapTerminals}
            vehicles={mapVehicles}
            selectedVehicle={selectedMapVehicle}
            vehicleSelectionKey={mapUnitFilter === 'all' ? null : mapUnitFilter}
            vehicleFocusRequestId={vehicleFocusRequestId}
            selectedRouteId={mapRouteFilter === 'all' ? null : mapRouteFilter}
            fleetMode
            defaultMovable
            mapControlsCorner={wideMap ? 'bottom-left' : 'top-right'}
            mapControlsOffsetTop={wideMap ? 0 : 12}
            bottomInset={wideMap ? 0 : sheetInset}
          />
        </View>
        <PeekSheet
          peekHeight={168}
          wide={wideMap}
          onSnapChange={(_snap, height) => setSheetInset(height)}
          expandAccessibilityLabel="Fleet details"
          collapseAccessibilityLabel="Hide fleet details"
          peek={
            <>
              <Text accessibilityRole="header" style={styles.rowTitle}>Fleet monitor</Text>
              <Text style={styles.rowSub}>Live units {currentLiveUnits.length - gpsIssueCount}</Text>
            </>
          }
        >
      <ScrollView
        style={ops.page}
        contentContainerStyle={ops.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={ops.masthead}>
          <Text accessibilityRole="header" style={ops.mastheadTitle}>Fleet monitor</Text>
          <Text style={ops.mastheadMeta}>{formatReportingPeriod(period)}</Text>
        </View>

        {!!transitNotice && <Text accessibilityRole="alert" style={styles.rowSub}>{transitNotice}</Text>}
        <FleetIncidentInbox />

        <View style={ops.panel}>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Live units</Text>
              <Text style={[styles.kpiNumber, { color: color.success }]}>{currentLiveUnits.length - gpsIssueCount}</Text>
            </View>

            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Shifts started</Text>
              <Text style={styles.kpiNumber}>{periodTripCount ?? 'Unavailable'}</Text>
            </View>

            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Speed offenses</Text>
              <Text style={styles.kpiNumber}>{speedEvents.length}</Text>
            </View>

            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Pending flags</Text>
              <Text style={[styles.kpiNumber, pendingCount > 0 && { color: color.warning }]}>{pendingCount}</Text>
            </View>
          </View>
          <View style={styles.routeActions}>{route1ReviewButton}{addRouteButton}</View>
        </View>

        <View style={ops.segmentBar}>
          {(['map', 'live', 'grades', 'speed', 'cuts'] as const).map(key => (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: activityView === key }}
              onPress={() => {
                setActivityView(key);
                setRouteMenuOpen(false);
                setUnitMenuOpen(false);
              }}
              style={[ops.segmentBtn, activityView === key && ops.segmentBtnActive]}
            >
              <Text style={[ops.segmentText, activityView === key && ops.segmentTextActive]}>{viewLabels[key]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {(activityView === 'speed' || activityView === 'grades') && (
          <View style={ops.segmentBar}>
            {(['day', 'week', 'month', 'year'] as const).map((m) => {
              const active = period.mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPeriod(currentReportingPeriod(m))}
                  style={[ops.segmentBtn, active && ops.segmentBtnActive]}
                >
                  <Text style={[ops.segmentText, active && ops.segmentTextActive]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {activityView === 'live' && !liveUnits.length && <Text style={ops.emptyState}>No active units.</Text>}
        {activityView === 'grades' && !scorecards.length && <Text style={ops.emptyState}>No driver records.</Text>}
        {activityView === 'speed' && !speedEvents.length && <Text style={ops.emptyState}>No speed offenses in this period.</Text>}
        {activityView === 'map' && (
          <View style={styles.mapLayout}>
            <View style={[ops.panel, styles.mapColumn]}>
              <View style={styles.filterDropdownRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Route filter, ${activeRouteLabel}`}
                  accessibilityState={{ expanded: routeMenuOpen }}
                  onPress={() => {
                    setRouteMenuOpen(!routeMenuOpen);
                    setUnitMenuOpen(false);
                  }}
                  style={styles.dropdownPill}
                >
                  <Text style={styles.dropdownPillText} numberOfLines={1}>
                    {activeRouteLabel}
                  </Text>
                  <Ionicons name={routeMenuOpen ? 'chevron-up' : 'chevron-down'} size={16} color={color.inkMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Unit filter, ${activeUnitLabel}`}
                  accessibilityState={{ expanded: unitMenuOpen }}
                  onPress={() => {
                    setUnitMenuOpen(!unitMenuOpen);
                    setRouteMenuOpen(false);
                  }}
                  style={styles.dropdownPill}
                >
                  <Text style={styles.dropdownPillText} numberOfLines={1}>
                    {activeUnitLabel}
                  </Text>
                  <Ionicons name={unitMenuOpen ? 'chevron-up' : 'chevron-down'} size={16} color={color.inkMuted} />
                </TouchableOpacity>
              </View>

              {routeMenuOpen && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.dropdownItem}
                    onPress={() => {
                      setMapRouteFilter('all');
                      setRouteMenuOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>All active routes</Text>
                  </TouchableOpacity>
                  {routes.map((r) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={r.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setMapRouteFilter(r.id);
                        setRouteMenuOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{r.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {unitMenuOpen && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.dropdownItem}
                    onPress={() => {
                      setMapUnitFilter('all');
                      setUnitMenuOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>All units</Text>
                  </TouchableOpacity>
                  {shownUnitChoices.map((u) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      key={u.key}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setMapUnitFilter(u.key);
                        setUnitMenuOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{u.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.mapActions}>
              {gpsIssueCount > 0 && <View style={styles.staleBanner}>
                <Ionicons name="warning-outline" size={18} color={color.warning} />
                <Text style={styles.staleBannerText}>{gpsIssueCount} {gpsIssueCount === 1 ? 'active shift has' : 'active shifts have'} stale, weak or unavailable GPS</Text>
              </View>}

              <View style={ops.panel}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setManageMode('list')}
                  style={styles.listRow}
                >
                  <Ionicons aria-hidden name="git-branch-outline" size={20} color={color.action} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Manage routes and stops</Text>
                    <Text style={styles.rowSub}>Published routes and verified stops</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={color.inkMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setActivityView('cuts')}
                  style={styles.listRow}
                >
                  <Ionicons aria-hidden name="flag-outline" size={20} color={pendingCount > 0 ? color.warning : color.ink} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Review route flags</Text>
                    <Text style={styles.rowSub}>{pendingCount} awaiting review</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={color.inkMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {activityView === 'live' && (
          <View style={{ gap: 10 }}>
            <View style={styles.capStrip}>
              <Text style={styles.capStripText}>
                Operator cap: {ESAKAY_OPERATIONS.operatorSpeedCapKph} km/h
              </Text>
            </View>
            <View style={ops.panel}>
              {currentLiveUnits.map((unit) => (
                <View key={unit.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{unit.body}</Text>
                    <Text style={styles.rowSub}>
                      {driverNames.get(unit.driverId) || 'Driver unavailable'} · {unit.plate}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: unit.stale ? color.warning : color.success },
                        ]}
                      />
                      <Text
                        style={[
                          styles.rowSub,
                          { marginTop: 0, color: unit.stale ? color.warning : color.success, fontWeight: '600' },
                        ]}
                      >
                        {unit.stale
                          ? `GPS ${unit.quality}${unit.quality === 'weak' ? ' — accuracy unknown or poor' : ''}`
                          : `GPS measured ${new Date(unit.lastSeen).toLocaleTimeString()}`}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.speedBig,
                      unit.isSpeeding && { color: color.ember },
                      unit.stale && { color: color.inkMuted },
                    ]}
                  >
                    {unit.speed === null ? '—' : `${Math.round(unit.speed)} km/h`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activityView === 'grades' && (
          <View style={{ gap: 12 }}>

            <View style={ops.panel}>
              {scorecards.map((item) => (
                <View key={item.driverId} style={styles.listRow}>
                  <View style={styles.initialsCircle}>
                    <Text style={styles.initialsText}>{initialsOf(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowHeading}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      <Text style={styles.gradeRatio}>
                        {item.score} <Text style={styles.gradeDenom}>/ 100</Text>
                      </Text>
                    </View>
                    <Text style={styles.rowSub}>{item.unitLabel}</Text>
                    <Text
                      style={[
                        styles.rowSub,
                        {
                          color: item.pendingFlags > 0 ? color.warning : color.success,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {item.pendingFlags > 0
                        ? `${item.pendingFlags} flag awaiting review`
                        : item.score === 100 ? 'No deductions in this period' : 'Recorded deductions applied'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {activityView === 'speed' && (
          <View style={{ gap: 12 }}>

            {(speedEvents.map((ev) => ({
                  id: ev.id,
                  driver: driverNames.get(ev.driver_id) || 'Driver',
                  unit: unitLabel(ev.vehicle_id, ev.body_number, ev.plate_number),
                  speedKph: Math.round(Number(ev.speed_kph)),
                  limitKph: Math.round(Number(ev.limit_kph)),
                  createdAt: ev.created_at,
                }))
            ).map((ev) => (
              <View key={ev.id} style={styles.speedOffenseCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons aria-hidden name="warning-outline" size={20} color={color.ember} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: color.ember }]}>
                      Operator cap exceeded
                    </Text>
                    <Text style={styles.rowSub}>
                      {ev.driver} · {ev.unit}
                    </Text>
                  </View>
                </View>
                <View style={styles.kvGroup}>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvLabel}>Recorded speed</Text>
                    <Text style={[styles.kvValue, { color: color.ember }]}>{ev.speedKph} km/h</Text>
                  </View>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvLabel}>Operator cap</Text>
                    <Text style={styles.kvValue}>{ev.limitKph} km/h</Text>
                  </View>
                  <View style={styles.kvRow}>
                    <Text style={styles.kvLabel}>Time</Text>
                    <Text style={styles.kvValue}>
                      {new Date(ev.createdAt).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {activityView === 'cuts' && (
          <View style={{ gap: 12 }}>
            <View style={ops.segmentBar}>
              {(['pending', 'confirmed', 'dismissed'] as const).map((tab) => {
                const active = cutFilter === tab;
                const label =
                  tab === 'pending'
                    ? `Pending (${pendingCount})`
                    : tab.charAt(0).toUpperCase() + tab.slice(1);
                return (
                  <TouchableOpacity
                    key={tab}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCutFilter(tab)}
                    style={[ops.segmentBtn, active && ops.segmentBtnActive]}
                  >
                    <Text style={[ops.segmentText, active && ops.segmentTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={ops.panel}>
              {!visibleCuts.length && <Text style={ops.emptyState}>No {cutFilter} route flags in this period.</Text>}
              {visibleCuts.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => setSelectedViolation(item)}
                  style={styles.listRow}
                >
                  <Ionicons aria-hidden name="git-branch-outline" size={19} color={color.warning} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowHeading}>
                      <Text style={styles.rowTitle}>
                        {item.driverName || driverNames.get(item.driver_id) || 'Driver unavailable'}
                      </Text>
                      <FlagStatus status={item.status} />
                    </View>
                    <Text style={styles.rowSub}>
                      {item.unitDisplay || unitLabel(item.vehicle_id, item.body_number, item.plate_number)}
                    </Text>
                    <Text style={styles.rowSub}>{item.reason}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={color.inkMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
        </PeekSheet>
      </View>

      <BottomSheetModal
        visible={Boolean(selectedViolation)}
        onClose={() => setSelectedViolation(null)}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        {selectedViolation && (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setSelectedViolation(null)}
              style={styles.backNavRow}
            >
              <Ionicons name="chevron-back" size={20} color={color.ink} />
              <Text style={styles.sectionTitle}>Review route flag</Text>
            </TouchableOpacity>

            <FlagStatus status={selectedViolation.status} />

            <Text style={styles.pageTitle}>Potential route cut</Text>

            <View style={styles.kvGroup}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Driver</Text>
                <Text style={styles.kvValue}>
                  {selectedViolation.driverName || driverNames.get(selectedViolation.driver_id) || 'Driver unavailable'}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Unit</Text>
                <Text style={styles.kvValue}>
                  {selectedViolation.unitDisplay ||
                    unitLabel(
                      selectedViolation.vehicle_id,
                      selectedViolation.body_number,
                      selectedViolation.plate_number
                    )}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Detected</Text>
                <Text style={styles.kvValue}>
                  {new Date(selectedViolation.created_at).toLocaleString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Route</Text>
                <Text style={styles.kvValue}>Unavailable</Text>
              </View>
            </View>

            <View style={styles.mapFrameSmall}>
              <LeafletMap routes={mapRoutes} terminals={mapTerminals} vehicles={[]} fleetMode />
            </View>

            <Text style={styles.smallHelper}>
              Confirming adds 1 confirmed route cut (−10 points).
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void reviewViolation(selectedViolation, 'confirmed');
              }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Confirm route cut</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void reviewViolation(selectedViolation, 'dismissed');
              }}
              style={styles.outlineDarkBtn}
            >
              <Text style={styles.outlineDarkText}>Dismiss flag</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    color: color.ink,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  filterDropdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  dropdownPill: {
    flex: 1,
    minHeight: tapTarget,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
    flex: 1,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.paper,
    overflow: 'hidden',
  },
  dropdownItem: {
    minHeight: tapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  dropdownItemText: {
    fontSize: 15,
    color: color.ink,
    fontWeight: '500',
  },
  rowHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  routeActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 12, columnGap: 16, borderTopWidth: 1, borderTopColor: color.border },
  routeAction: { flexDirection: 'row', alignItems: 'center', minHeight: tapTarget, gap: 6, paddingHorizontal: 4, flexShrink: 1 },
  routeActionText: { fontSize: 14, fontWeight: '700', color: color.action, flexShrink: 1 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  kpiTile: {
    flexGrow: 1,
    flexBasis: 140,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
  },
  kpiLabel: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: color.inkMuted },
  kpiNumber: { fontSize: 22, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
  mapLayout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  mapColumn: { flexBasis: 510, flexGrow: 3, flexShrink: 1, minWidth: 0 },
  mapActions: { flexBasis: 260, flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 10 },
  homeFill: { flex: 1, backgroundColor: color.canvas },
  mapFill: { ...StyleSheet.absoluteFill },
  mapFrame: { height: 300, overflow: 'hidden', borderTopWidth: 1, borderColor: color.border, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  mapFrameSmall: {
    height: 170,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.warningBg,
    borderWidth: 1,
    borderColor: color.warningBorder,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  staleBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: color.warning,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  initialsCircle: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: color.sand, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 14, fontWeight: '800', color: color.ink },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  rowSub: {
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 2,
  },
  flagStatus: { alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, fontSize: 12, fontWeight: '700' },
  capStrip: {
    backgroundColor: color.canvas,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  capStripText: {
    fontSize: 13,
    fontWeight: '600',
    color: color.inkMuted,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  speedBig: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  gradeRatio: {
    fontSize: 17,
    fontWeight: '800',
    color: color.ink,
  },
  gradeDenom: {
    fontSize: 13,
    color: color.inkMuted,
  },
  speedOffenseCard: {
    borderWidth: 1.5,
    borderColor: color.ember,
    borderRadius: radius.md,
    padding: 14,
    gap: 12,
    backgroundColor: color.paper,
  },
  kvGroup: {
    borderTopWidth: 1,
    borderColor: color.border,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  kvLabel: {
    fontSize: 14,
    color: color.inkMuted,
  },
  kvValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  backNavRow: { flexDirection: 'row', alignItems: 'center', minHeight: tapTarget, gap: 6 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: color.ink,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: color.onDark,
  },
  outlineDarkBtn: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineDarkText: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  smallHelper: {
    fontSize: 13,
    color: color.inkMuted,
    lineHeight: 18,
  },
});
