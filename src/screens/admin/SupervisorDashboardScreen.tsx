import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheetModal, ScreenSkeleton, triggerHaptic } from '../../components/AppUI';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { offlineTransit } from '../../services/offlineTransitService';
import type { RouteData, TerminalData, VehicleData } from '../../services/offlineTransitService';
import { useRoute } from '@react-navigation/native';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import DirectoryScreen from '../passenger/DirectoryScreen';
import { realRows } from '../../utils/realData';
import {
  currentReportingPeriod,
  formatReportingPeriod,
  periodContains,
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
  const [unitChoices, setUnitChoices] = useState<UnitChoice[]>([]);
  const [mapRouteFilter, setMapRouteFilter] = useState('all');
  const [mapUnitFilter, setMapUnitFilter] = useState('all');
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [activityView, setActivityView] = useState<'map' | 'live' | 'grades' | 'speed' | 'cuts'>('map');
  const [driverNames, setDriverNames] = useState<Map<string, string>>(new Map());
  const [unitDetails, setUnitDetails] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState<ReportingPeriod>(currentReportingPeriod('day'));
  const [periodTripCount, setPeriodTripCount] = useState<number | null>(0);
  const [cutFilter, setCutFilter] = useState<'pending' | 'confirmed' | 'dismissed'>('pending');
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [manageMode, setManageMode] = useState<'none' | 'list'>('none');
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
          speed: position.speed ?? null,
          recorded_at: position.timestamp,
          heading: position.heading ?? null,
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
        lastSeen: position?.timestamp ?? '',
        isSpeeding: speedingIds.has(vehicle.id),
        stale: !position,
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

  if (loading) return <ScreenSkeleton preset="dashboard" />;
  if (dataError) return <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}><Text accessibilityRole="alert">{dataError}</Text></ScrollView>;

  if (manageMode === 'list') return (
    <View style={styles.container}>
      <TouchableOpacity accessibilityRole="button" onPress={() => setManageMode('none')} style={styles.backNavRow}>
        <Ionicons name="chevron-back" size={22} color={Colors.ink} />
        <Text style={styles.pageTitle}>Routes</Text>
      </TouchableOpacity>
      <Text style={styles.rowSub}>Published routes are read-only here. Route editing and driver assignment are unavailable in this app.</Text>
      <DirectoryScreen />
    </View>
  );

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
    cuts: 'Trip cuts',
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.pageTitle}>Fleet monitor</Text>

        {/* Route & Unit Dropdown Row */}
        <View style={styles.filterDropdownRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setRouteMenuOpen(!routeMenuOpen);
              setUnitMenuOpen(false);
              setViewMenuOpen(false);
            }}
            style={styles.dropdownPill}
          >
            <Text style={styles.dropdownPillText} numberOfLines={1}>
              {activeRouteLabel}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setUnitMenuOpen(!unitMenuOpen);
              setRouteMenuOpen(false);
              setViewMenuOpen(false);
            }}
            style={styles.dropdownPill}
          >
            <Text style={styles.dropdownPillText} numberOfLines={1}>
              {activeUnitLabel}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} />
          </TouchableOpacity>
        </View>

        {routeMenuOpen && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
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

        {!!transitNotice && <Text accessibilityRole="alert" style={styles.rowSub}>{transitNotice}</Text>}
        <Text style={styles.scopeDateText}>{formatReportingPeriod(period)}</Text>

        {/* 2x2 KPI Grid */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiTile, styles.kpiTileGreen]}>
            <View style={styles.kpiTopRow}>
              <Text style={styles.kpiLabel}>Live units</Text>
              <Ionicons name="bus-outline" size={17} color={Colors.brandGreen} />
            </View>
            <Text style={styles.kpiNumber}>{vehicles.length}</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={styles.kpiTopRow}>
              <Text style={styles.kpiLabel}>Shifts started</Text>
              <Ionicons name="people-outline" size={17} color={Colors.ink} />
            </View>
            <Text style={styles.kpiNumber}>{periodTripCount ?? 'Unavailable'}</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={styles.kpiTopRow}>
              <Text style={styles.kpiLabel}>Speed offenses</Text>
              <Ionicons name="speedometer-outline" size={17} color={Colors.ink} />
            </View>
            <Text style={styles.kpiNumber}>{speedEvents.length}</Text>
          </View>

          <View style={[styles.kpiTile, styles.kpiTileAmber]}>
            <View style={styles.kpiTopRow}>
              <Text style={styles.kpiLabel}>Route flags</Text>
              <Ionicons name="flag-outline" size={17} color={Colors.warning} />
            </View>
            <Text style={styles.kpiNumber}>{pendingCount}</Text>
          </View>
        </View>

        {/* View Selector Dropdown */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setViewMenuOpen(!viewMenuOpen);
            setRouteMenuOpen(false);
            setUnitMenuOpen(false);
          }}
          style={styles.viewSelectorBtn}
        >
          <Text style={styles.viewSelectorText}>View: {viewLabels[activityView]}</Text>
          <Ionicons name={viewMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.ink} />
        </TouchableOpacity>

        {viewMenuOpen && (
          <View style={styles.dropdownMenu}>
            {(['map', 'live', 'grades', 'speed', 'cuts'] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.dropdownItem, activityView === key && { backgroundColor: Colors.paleGreen }]}
                onPress={() => {
                  setActivityView(key);
                  setViewMenuOpen(false);
                }}
              >
                <Text style={[styles.dropdownItemText, activityView === key && { fontWeight: '700' }]}>
                  {viewLabels[key]}
                </Text>
                {activityView === key && <Ionicons name="checkmark" size={18} color={Colors.brandGreen} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activityView === 'live' && !liveUnits.length && <Text style={styles.rowSub}>No active units.</Text>}
        {activityView === 'grades' && !scorecards.length && <Text style={styles.rowSub}>No driver records.</Text>}
        {activityView === 'speed' && !speedEvents.length && <Text style={styles.rowSub}>No speed offenses in this period.</Text>}
        {activityView === 'cuts' && !allCuts.length && <Text style={styles.rowSub}>No route flags in this period.</Text>}
        {/* 1) VIEW: LIVE MAP */}
        {activityView === 'map' && (
          <View style={{ gap: 12 }}>
            <View style={styles.mapFrame}>
              <LeafletMap
                routes={mapRoutes}
                terminals={mapTerminals}
                vehicles={mapVehicles}
                selectedVehicle={selectedMapVehicle}
                fleetMode
              />
            </View>

            <View style={styles.staleBanner}>
              <Ionicons name="warning-outline" size={18} color={Colors.warning} />
              <Text style={styles.staleBannerText}>{liveUnits.filter(unit => unit.stale).length} active shifts have unavailable GPS</Text>
            </View>

            <View style={styles.dividerList}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setManageMode('list')}
                style={styles.listRow}
              >
                <View style={styles.routeIconCircle}>
                  <Ionicons name="git-branch-outline" size={19} color={Colors.brandGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>View routes</Text>
                  <Text style={styles.rowSub}>Published routes and verified stops</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setActivityView('cuts')}
                style={styles.listRow}
              >
                <View style={[styles.routeIconCircle, { backgroundColor: Colors.warningBg }]}>
                  <Ionicons name="flag-outline" size={19} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Review route flags</Text>
                  <Text style={styles.rowSub}>Pending route compliance queue</Text>
                </View>
                <View style={[styles.statusBadge, styles.badgeAmber]}>
                  <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>
                    {pendingCount} pending
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 2) VIEW: LIVE SPEEDS */}
        {activityView === 'live' && (
          <View style={{ gap: 10 }}>
            <View style={styles.capStrip}>
              <Text style={styles.capStripText}>
                Operator cap: {ESAKAY_OPERATIONS.operatorSpeedCapKph} km/h
              </Text>
            </View>
            <View style={styles.dividerList}>
              {liveUnits.map((unit) => (
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
                          { backgroundColor: unit.stale ? Colors.warning : Colors.brandGreen },
                        ]}
                      />
                      <Text
                        style={[
                          styles.rowSub,
                          { marginTop: 0, color: unit.stale ? Colors.warning : Colors.brandGreen, fontWeight: '600' },
                        ]}
                      >
                        {unit.stale
                          ? 'GPS unavailable'
                          : `GPS measured ${new Date(unit.lastSeen).toLocaleTimeString()}`}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.speedBig,
                      unit.isSpeeding && { color: Colors.primaryRed },
                      unit.stale && { color: Colors.subtleGray },
                    ]}
                  >
                    {unit.speed === null ? '—' : `${Math.round(unit.speed)} km/h`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 3) VIEW: DRIVER GRADES */}
        {activityView === 'grades' && (
          <View style={{ gap: 12 }}>
            <View style={styles.segmentBar}>
              {(['day', 'week', 'month', 'year'] as const).map((m) => {
                const active = period.mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setPeriod(currentReportingPeriod(m))}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.dividerList}>
              {scorecards.map((item) => (
                <View key={item.driverId} style={styles.listRow}>
                  <View style={styles.initialsCircle}>
                    <Text style={styles.initialsText}>{initialsOf(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
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
                          color: item.pendingFlags > 0 ? Colors.warning : Colors.brandGreen,
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

        {/* 4) VIEW: SPEEDING */}
        {activityView === 'speed' && (
          <View style={{ gap: 12 }}>
            <View style={styles.segmentBar}>
              {(['day', 'week', 'month', 'year'] as const).map((m) => {
                const active = period.mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setPeriod(currentReportingPeriod(m))}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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
                  <View style={[styles.routeIconCircle, { backgroundColor: Colors.dangerBg }]}>
                    <Ionicons name="warning-outline" size={20} color={Colors.primaryRed} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: Colors.primaryRed }]}>
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
                    <Text style={[styles.kvValue, { color: Colors.primaryRed }]}>{ev.speedKph} km/h</Text>
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

        {/* 5) VIEW: TRIP CUTS */}
        {activityView === 'cuts' && (
          <View style={{ gap: 12 }}>
            <View style={styles.segmentBar}>
              {(['pending', 'confirmed', 'dismissed'] as const).map((tab) => {
                const active = cutFilter === tab;
                const label =
                  tab === 'pending'
                    ? `Pending (${pendingCount})`
                    : tab.charAt(0).toUpperCase() + tab.slice(1);
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setCutFilter(tab)}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.dividerList}>
              {allCuts
                .filter((v) =>
                  cutFilter === 'pending'
                    ? v.status === 'pending_review' || v.status === 'flagged'
                    : v.status === cutFilter
                )
                .map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedViolation(item)}
                    style={styles.listRow}
                  >
                    <View style={[styles.routeIconCircle, { backgroundColor: Colors.warningBg }]}>
                      <Ionicons name="git-branch-outline" size={19} color={Colors.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.rowTitle}>
                          {item.driverName || driverNames.get(item.driver_id) || 'Driver unavailable'}
                        </Text>
                        <View style={[styles.statusBadge, styles.badgeAmber]}>
                          <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>
                            {item.status === 'confirmed'
                              ? 'Confirmed'
                              : item.status === 'dismissed'
                                ? 'Dismissed'
                                : 'Pending review'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub}>
                        {item.unitDisplay || unitLabel(item.vehicle_id, item.body_number, item.plate_number)}
                      </Text>
                      <Text style={styles.rowSub}>{item.reason}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* BOARD 02 RIGHT: REVIEW ROUTE FLAG BOTTOM SHEET */}
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
              <Ionicons name="chevron-back" size={20} color={Colors.ink} />
              <Text style={styles.sectionTitle}>Review route flag</Text>
            </TouchableOpacity>

            <View style={[styles.statusBadge, styles.badgeAmber, { alignSelf: 'flex-start' }]}>
              <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>Pending review</Text>
            </View>

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

            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 16, height: 3, backgroundColor: Colors.brandGreen }} />
                <Text style={styles.rowSub}>Assigned route</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 16, height: 3, backgroundColor: Colors.warning }} />
                <Text style={styles.rowSub}>Recorded path</Text>
              </View>
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
  container: { flex: 1, backgroundColor: Colors.paper },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 14,
  },
  pageTitle: {
    color: Colors.ink,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitleText: {
    fontSize: 15,
    color: Colors.subtleGray,
  },
  filterDropdownRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dropdownPill: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
    flex: 1,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  dropdownItemText: {
    fontSize: 15,
    color: Colors.ink,
    fontWeight: '500',
  },
  scopeDateText: {
    fontSize: 13,
    color: Colors.subtleGray,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 82,
    borderRadius: 12,
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    justifyContent: 'space-between',
  },
  kpiTileGreen: {
    backgroundColor: Colors.paleGreen,
    borderColor: Colors.brandGreen,
  },
  kpiTileAmber: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
  },
  kpiNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  viewSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  viewSelectorText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  mapFrame: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mapFrameSmall: {
    height: 170,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  staleBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },
  dividerList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  routeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  rowSub: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeGreen: {
    backgroundColor: Colors.paleGreen,
  },
  badgeAmber: {
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  badgeGray: {
    backgroundColor: Colors.canvas,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeGreenText: {
    color: Colors.brandGreen,
    fontWeight: '700',
    fontSize: 12,
  },
  badgeAmberText: {
    color: Colors.warning,
  },
  badgeGrayText: {
    color: Colors.subtleGray,
  },
  capStrip: {
    backgroundColor: Colors.canvas,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  capStripText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  speedBig: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
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
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandGreen,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  gradeRatio: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
  },
  gradeDenom: {
    fontSize: 13,
    color: Colors.subtleGray,
  },
  speedOffenseCard: {
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    backgroundColor: Colors.paper,
  },
  kvGroup: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  kvLabel: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  kvValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  topAddText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink,
  },
  restoreOutlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
  },
  restoreOutlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
  },
  textInput: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.ink,
    backgroundColor: Colors.paper,
  },
  stopNumBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  disabledBtn: {
    backgroundColor: '#D5DBD6',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  outlineGreenBtn: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineGreenText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  outlineDarkBtn: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineDarkText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  smallHelper: {
    fontSize: 13,
    color: Colors.subtleGray,
    lineHeight: 18,
  },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  radioCardSelected: {
    backgroundColor: Colors.paleGreen,
    borderColor: Colors.brandGreen,
    borderWidth: 1.5,
  },
  radioCardDisabled: {
    backgroundColor: Colors.canvas,
    opacity: 0.75,
  },
});
