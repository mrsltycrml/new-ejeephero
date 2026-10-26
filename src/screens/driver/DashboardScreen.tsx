import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { startAnomalyDetection, stopAnomalyDetection } from '../../services/anomalyDetector';
import { offlineTransit, MAKATI_PRIMARY_ROUTE, type RouteData, type TerminalData, type VehicleData } from '../../services/offlineTransitService';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import { loadActiveFleetUnits } from '../../services/fleetRegistryService';

type ShiftUnit = { bodyNumber: string; plateNumber: string };

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { height: viewportHeight } = useWindowDimensions();
  const [routes, setRoutes] = useState<any[]>([]);
  const [mapRoutes, setMapRoutes] = useState<RouteData[]>([]);
  const [mapTerminals, setMapTerminals] = useState<TerminalData[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [bodyNumber, setBodyNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [units, setUnits] = useState<ShiftUnit[]>([]);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [unitLoading, setUnitLoading] = useState(true);
  const [telemetryError, setTelemetryError] = useState('');
  const [shiftError, setShiftError] = useState('');
  const [starting, setStarting] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Location.LocationObjectCoords | null>(null);
  const [passengerCount, setPassengerCount] = useState(0);
  const [maxCapacity] = useState(22);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const publishPosition = useCallback(async (activeVehicleId: string, coords: Location.LocationObjectCoords) => {
    const { error } = await supabase.from('vehicle_positions').insert({
      vehicle_id: activeVehicleId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed: Math.max(0, (coords.speed || 0) * 3.6),
      heading: coords.heading || 0,
    });
    if (error) throw new Error(error.message);
    setCurrentPosition(coords);
    setTelemetryError('');
  }, []);

  const startGpsTracking = useCallback(async (activeVehicleId: string, permissionGranted = false) => {
    if (!permissionGranted) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Allow location access to monitor this active shift.');
    }
    locationSub.current?.remove();
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      async (loc) => {
        setCurrentPosition(loc.coords);
        try { await publishPosition(activeVehicleId, loc.coords); }
        catch { setTelemetryError('GPS is not reaching the fleet monitor. Check your connection.'); }
      }
    );
  }, [publishPosition]);

  useEffect(() => {
    supabase.from('routes').select('*').then(async ({ data }) => {
      if (data && data.length > 0) {
        setRoutes(data.filter((r: any) => !r.is_coming_soon).map((route: any) => route.id === MAKATI_PRIMARY_ROUTE.id ? { ...route, operating_hours: ESAKAY_OPERATIONS.serviceHours } : route));
      } else {
        const cached = await offlineTransit.getTransitData();
        setRoutes(cached.routes.filter((r: any) => !r.is_coming_soon));
      }
    });
    void offlineTransit.getTransitData().then((data) => {
      setMapRoutes(data.routes.filter((route) => !route.is_coming_soon));
      setMapTerminals(data.terminals);
    });

    return () => {
      if (locationSub.current) {
        locationSub.current.remove();
        locationSub.current = null;
      }
      stopAnomalyDetection();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadUnits = async () => {
      try {
        const [registeredUnits, historyResult] = await Promise.all([
          loadActiveFleetUnits(),
          supabase.from('vehicles').select('body_number,plate_number,is_active,driver_id').order('created_at', { ascending: false }).limit(500),
        ]);
        if (cancelled) return;
        const available = new Map<string, ShiftUnit>();
        for (const row of registeredUnits) {
          const body = String(row.body_number || '').trim();
          const plate = String(row.plate_number || '').trim();
          if (body && plate) available.set(body.toUpperCase(), { bodyNumber: body, plateNumber: plate });
        }
        for (const row of historyResult.data || []) {
          const body = String(row.body_number || '').trim();
          const plate = String(row.plate_number || '').trim();
          if (body && plate && (!row.is_active || row.driver_id === user?.id) && !available.has(body.toUpperCase())) {
            available.set(body.toUpperCase(), { bodyNumber: body, plateNumber: plate });
          }
        }
        setUnits(Array.from(available.values()).sort((a, b) => a.bodyNumber.localeCompare(b.bodyNumber)));
      } catch {
        if (!cancelled) setShiftError('Units could not be loaded. Check your connection and try again.');
      } finally {
        if (!cancelled) setUnitLoading(false);
      }
    };
    void loadUnits();
    const timer = setInterval(() => { void loadUnits(); }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('vehicles').select('id,route_id,body_number,plate_number,passenger_count').eq('driver_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!data || cancelled) return;
      setVehicleId(data.id);
      setSelectedRoute(data.route_id);
      setBodyNumber(data.body_number || '');
      setPlateNumber(data.plate_number || '');
      setPassengerCount(data.passenger_count || 0);
      setIsActive(true);
      startAnomalyDetection(data.id);
      const latest = await supabase.from('vehicle_positions').select('latitude,longitude,speed,heading')
        .eq('vehicle_id', data.id).order('timestamp', { ascending: false }).limit(1).maybeSingle();
      if (latest.data && !cancelled) setCurrentPosition({
        latitude: latest.data.latitude, longitude: latest.data.longitude,
        speed: Number(latest.data.speed || 0) / 3.6, heading: latest.data.heading || 0,
        accuracy: 0, altitude: null, altitudeAccuracy: null,
      });
      try { await startGpsTracking(data.id); }
      catch (error) {
        setTelemetryError('GPS monitoring is paused. Allow location access and reopen this shift.');
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, startGpsTracking]);

  const updatePassengerCount = async (nextCount: number) => {
    const clamped = Math.max(0, Math.min(maxCapacity, nextCount));
    setPassengerCount(clamped);
    if (vehicleId) {
      await supabase
        .from('vehicles')
        .update({ passenger_count: clamped })
        .eq('id', vehicleId);
    }
  };

  const toggleShift = async () => {
    if (starting) return;
    setShiftError('');
    setStarting(true);
    let insertedId: string | null = null;
    try {
      if (isActive) {
        if (!vehicleId) throw new Error('The active unit could not be found. Refresh and try again.');
        const { error } = await supabase.from('vehicles')
          .update({ is_active: false, passenger_count: 0, ended_at: new Date().toISOString() })
          .eq('id', vehicleId);
        if (error) throw new Error(error.message);
        locationSub.current?.remove();
        locationSub.current = null;
        stopAnomalyDetection();
        setVehicleId(null);
        setCurrentPosition(null);
        setPassengerCount(0);
        setTelemetryError('');
        setIsActive(false);
        return;
      }

      if (!user?.id) throw new Error('Sign in again before starting a shift.');
      if (!selectedRoute) throw new Error('Choose a route before starting a shift.');
      if (!units.some((unit) => unit.bodyNumber === bodyNumber && unit.plateNumber === plateNumber)) {
        throw new Error('Choose a registered unit before starting a shift.');
      }
      const assignedElsewhere = await supabase.from('vehicles').select('id,driver_id')
        .eq('body_number', bodyNumber).eq('is_active', true).limit(1).maybeSingle();
      if (assignedElsewhere.error) throw new Error(assignedElsewhere.error.message);
      if (assignedElsewhere.data) throw new Error('This unit is already on a shift. Select another unit or ask a supervisor to end its current shift.');

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Allow location access to start a live shift.');
      const firstFix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const created = await supabase.from('vehicles').insert({
        driver_id: user.id,
        route_id: selectedRoute,
        body_number: bodyNumber.trim(),
        plate_number: plateNumber.trim(),
        passenger_count: 0,
        max_capacity: maxCapacity,
        is_active: true,
      }).select('id').single();
      if (created.error || !created.data) throw new Error(created.error?.message || 'The shift could not be created.');
      const newVehicleId: string = created.data.id;
      insertedId = newVehicleId;
      await publishPosition(newVehicleId, firstFix.coords);
      await startGpsTracking(newVehicleId, true);
      setVehicleId(newVehicleId);
      setPassengerCount(0);
      setIsActive(true);
      startAnomalyDetection(newVehicleId);
    } catch (error) {
      let rollbackFailed = false;
      if (insertedId) {
        locationSub.current?.remove();
        locationSub.current = null;
        const rollback = await supabase.from('vehicles').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', insertedId);
        rollbackFailed = Boolean(rollback.error);
      }
      const message = error instanceof Error ? error.message : 'The shift could not start. Check your connection and try again.';
      setShiftError(rollbackFailed ? `${message} The unit may still appear active. Ask a supervisor to check it.` : message);
    } finally {
      setStarting(false);
    }
  };

  const currentRouteName = routes.find(r => r.id === selectedRoute)?.name || '';
  const selectedUnit = units.find((unit) => unit.bodyNumber === bodyNumber && unit.plateNumber === plateNumber);
  const liveVehicle: VehicleData | null = vehicleId && currentPosition ? {
    id: vehicleId, vehicle_id: vehicleId, body_number: bodyNumber, plate_number: plateNumber,
    route_id: selectedRoute || '', latitude: currentPosition.latitude, longitude: currentPosition.longitude,
    speed: Math.max(0, (currentPosition.speed || 0) * 3.6), heading: currentPosition.heading || 0,
    passenger_count: passengerCount, max_capacity: maxCapacity, is_full: passengerCount >= maxCapacity,
    status: passengerCount >= maxCapacity ? 'Puno' : passengerCount >= Math.ceil(maxCapacity * 0.7) ? 'Sakto' : 'Maluwag',
  } : null;
  const capacityStatus =
    passengerCount >= maxCapacity
      ? 'Puno (Full)'
      : passengerCount >= Math.ceil(maxCapacity * 0.7)
        ? 'Sakto (Moderate)'
        : 'Maluwag (Spacious)';

  const shiftAction = (!routeMenuOpen && !unitMenuOpen) && <View style={styles.buttonWrapper}>
        {!!shiftError && <Text accessibilityRole="alert" style={styles.shiftError}>{shiftError}</Text>}
        <TouchableOpacity
          style={[styles.toggleButton, isActive ? styles.buttonStop : styles.buttonStart]}
          onPress={toggleShift}
          disabled={starting}
          accessibilityRole="button"
          accessibilityState={{ disabled: starting, busy: starting }}
        >
          {starting ? <ActivityIndicator color={Colors.white} style={{ marginRight: 8 }} /> : <Ionicons
            name={isActive ? "stop" : "play"}
            size={22}
            color={Colors.white}
            style={{ marginRight: 8 }}
          />}
          <Text style={styles.buttonText}>
            {starting ? (isActive ? 'Ending shift…' : 'Starting shift…') : isActive ? t('dashboard.endShift') : t('dashboard.startShift')}
          </Text>
        </TouchableOpacity>
      </View>;

  return (
    <View style={styles.container}>
      {!isActive ? (
        <View style={styles.routeContainer}>
          <View style={styles.driverIntro}>
            <Text style={styles.sectionHeader}>Start your shift</Text>
            <Text style={styles.sectionSub}>{t('dashboard.selectRouteSub')}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.fieldLabel}>Route</Text>
            <TouchableOpacity style={styles.selectButton} onPress={() => { setRouteMenuOpen(!routeMenuOpen); setUnitMenuOpen(false); }} accessibilityRole="button" accessibilityLabel="Choose route" accessibilityState={{ expanded: routeMenuOpen }}>
              <View style={styles.routeIcon}><Ionicons name="bus-outline" size={21} color={Colors.subtleGray} /></View>
              <View style={{ flex: 1 }}><Text style={selectedRoute ? styles.routeName : styles.placeholder}>{currentRouteName || 'Choose a route'}</Text>
                {!!selectedRoute && <Text style={styles.routeHours}>{t('dashboard.operating', { hours: routes.find(r => r.id === selectedRoute)?.operating_hours })}</Text>}</View>
              <Ionicons name={routeMenuOpen ? 'chevron-up' : 'chevron-down'} size={19} color={Colors.subtleGray} />
            </TouchableOpacity>
            {routeMenuOpen && <View style={styles.optionList}>
              {routes.map(r => <TouchableOpacity key={r.id} style={styles.optionRow} onPress={() => { setSelectedRoute(r.id); setRouteMenuOpen(false); setShiftError(''); }} accessibilityRole="button">
                <Text style={styles.optionTitle}>{r.name}</Text>{selectedRoute === r.id && <Ionicons name="checkmark" size={18} color={Colors.ink} />}
              </TouchableOpacity>)}
              <View style={[styles.optionRow, styles.optionDisabled]}><Text style={styles.disabledText}>Route 2: Coming soon</Text></View>
            </View>}
            <Text style={styles.fieldLabel}>Assigned unit</Text>
            <TouchableOpacity style={styles.selectButton} onPress={() => { setUnitMenuOpen(!unitMenuOpen); setRouteMenuOpen(false); }} accessibilityRole="button" accessibilityLabel="Choose assigned unit" accessibilityState={{ expanded: unitMenuOpen }}>
              <View style={styles.routeIcon}><Ionicons name="car-outline" size={21} color={Colors.subtleGray} /></View>
              <View style={{ flex: 1 }}><Text style={selectedUnit ? styles.routeName : styles.placeholder}>{selectedUnit ? selectedUnit.bodyNumber : 'Choose a unit'}</Text>
                {!!selectedUnit && <Text style={styles.routeHours}>Plate {selectedUnit.plateNumber}</Text>}</View>
              <Ionicons name={unitMenuOpen ? 'chevron-up' : 'chevron-down'} size={19} color={Colors.subtleGray} />
            </TouchableOpacity>
            {unitMenuOpen && <View style={styles.optionList}><ScrollView style={{ maxHeight: Math.max(96, Math.min(220, viewportHeight * 0.22)) }} nestedScrollEnabled>
              {units.length ? units.map((unit) => <TouchableOpacity key={`${unit.bodyNumber}-${unit.plateNumber}`} style={styles.optionRow} onPress={() => { setBodyNumber(unit.bodyNumber); setPlateNumber(unit.plateNumber); setUnitMenuOpen(false); setShiftError(''); }} accessibilityRole="button">
                <View><Text style={styles.optionTitle}>{unit.bodyNumber}</Text><Text style={styles.optionMeta}>Plate {unit.plateNumber}</Text></View>
                {selectedUnit?.bodyNumber === unit.bodyNumber && <Ionicons name="checkmark" size={18} color={Colors.ink} />}
              </TouchableOpacity>) : <Text style={styles.emptyOptions}>{unitLoading ? 'Loading units…' : 'No units are available. Ask an admin to add your unit.'}</Text>}
            </ScrollView></View>}
            {shiftAction}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.activeScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.liveMapCard}>
            <View style={styles.liveMapHeader}><View><Text style={styles.liveMapTitle}>Live map</Text><Text style={styles.liveMapSub}>{bodyNumber} · {currentRouteName}</Text></View><View style={styles.liveBadge}><View style={styles.activeDot} /><Text style={styles.liveBadgeText}>On duty</Text></View></View>
            <View style={[styles.liveMap, { height: Math.max(220, Math.min(340, viewportHeight * 0.45)) }]}><LeafletMap routes={mapRoutes} terminals={mapTerminals} vehicles={liveVehicle ? [liveVehicle] : []} selectedVehicle={liveVehicle} fleetMode /></View>
            <Text style={styles.liveMapFoot}>{currentPosition ? 'Your location is shared with the fleet monitor and passenger map while this shift is active.' : 'Waiting for a GPS location. Keep location access enabled.'}</Text>
          </View>
          <View style={styles.glowCard}>
            <Text style={styles.activeText}>Shift details</Text>
            {!!telemetryError && <Text accessibilityRole="alert" style={{ color: Colors.primaryRed, backgroundColor: '#FFF0EE', borderRadius: 8, padding: 10, marginTop: 8, textAlign: 'center', fontSize: 12, fontWeight: '700' }}>{telemetryError}</Text>}

            <View style={styles.divider} />

            <View style={styles.routeDetails}>
              <Text style={styles.detailsLabel}>{t('dashboard.currentRoute')}</Text>
              <Text style={styles.detailsValue}>{currentRouteName}</Text>
              <Text style={styles.vehicleBadgeText}>{bodyNumber} · {plateNumber}</Text>
            </View>

            <View style={styles.divider} />

            {/* Live Passenger Occupancy Controls */}
            <View style={styles.capacitySection}>
              <Text style={styles.detailsLabel}>Passengers on board</Text>
              <Text style={styles.capacityStatusText}>{capacityStatus}</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => updatePassengerCount(passengerCount - 1)}
                  accessibilityLabel="Decrease passenger count"
                >
                  <Ionicons name="remove" size={24} color={Colors.white} />
                </TouchableOpacity>
                <View style={styles.counterDisplay}>
                  <Text style={styles.counterValue}>{passengerCount}</Text>
                  <Text style={styles.counterMax}>/ {maxCapacity} seats</Text>
                </View>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => updatePassengerCount(passengerCount + 1)}
                  accessibilityLabel="Increase passenger count"
                >
                  <Ionicons name="add" size={24} color={Colors.white} />
                </TouchableOpacity>
              </View>
              <View style={styles.presetRow}>
                <TouchableOpacity style={[styles.presetChip, passengerCount < 15 && styles.presetChipActive]} onPress={() => updatePassengerCount(6)}>
                  <Text style={styles.presetChipText}>Maluwag</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.presetChip, passengerCount >= 15 && passengerCount < maxCapacity && styles.presetChipActive]} onPress={() => updatePassengerCount(16)}>
                  <Text style={styles.presetChipText}>Sakto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.presetChip, passengerCount >= maxCapacity && styles.presetChipActive]} onPress={() => updatePassengerCount(maxCapacity)}>
                  <Text style={styles.presetChipText}>Puno</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {isActive && shiftAction}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    justifyContent: 'space-between',
    position: 'relative',
  },
  routeContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
  driverIntro: { paddingVertical: 8, marginBottom: 14 },
  scrollContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    fontSize: 23,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 4,
    marginTop: 0,
  },
  sectionSub: {
    fontSize: 14,
    color: Colors.subtleGray,
    marginBottom: 0,
    lineHeight: 18,
  },
  fieldLabel: { color: Colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 6 },
  selectButton: {
    flexDirection: 'row',
    padding: 13,
    backgroundColor: Colors.paper,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeholder: { fontSize: 14, color: Colors.subtleGray },
  routeIcon: { width: 42, height: 42, borderRadius: 6, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  routeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  routeHours: {
    fontSize: 12,
    color: '#56696D',
    marginTop: 4,
  },
  optionList: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginTop: -6, marginBottom: 14, overflow: 'hidden' },
  optionRow: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionTitle: { color: Colors.ink, fontSize: 14, fontWeight: '700' },
  optionMeta: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  optionDisabled: { backgroundColor: Colors.offWhite, borderBottomWidth: 0 },
  disabledText: { color: Colors.subtleGray, fontSize: 13 },
  emptyOptions: { color: Colors.subtleGray, fontSize: 13, padding: 16 },
  activeScroll: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 18,
    gap: 12,
  },
  liveMapCard: { width: '100%', backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, overflow: 'hidden' },
  liveMapHeader: { padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  liveMapTitle: { color: Colors.ink, fontSize: 18, fontWeight: '600' },
  liveMapSub: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  liveBadge: { backgroundColor: '#E5F3E8', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  liveBadgeText: { color: '#24643E', fontSize: 12, fontWeight: '700' },
  liveMap: { height: 340, width: '100%' },
  liveMapFoot: { color: Colors.subtleGray, fontSize: 12, paddingHorizontal: 15, paddingVertical: 10, lineHeight: 16 },
  glowCard: {
    backgroundColor: Colors.white,
    borderRadius: 15,
    padding: 24,
    width: '100%',
    maxWidth: 920,
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeIndicator: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#E5F3E8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#28764A' },
  activeIndicatorText: { color: '#24643E', fontSize: 12, fontWeight: '700' },
  activeText: {
    fontSize: 19,
    fontWeight: '700',
    color: Colors.navy,
    letterSpacing: -0.2,
    marginBottom: 6
  },
  subActiveText: {
    fontSize: 13,
    color: '#53666A',
    textAlign: 'center',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    width: '100%',
    marginVertical: 16,
  },
  routeDetails: {
    alignItems: 'flex-start',
    width: '100%',
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.subtleGray,
    letterSpacing: 0,
    marginBottom: 4,
  },
  detailsValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.darkText,
    textAlign: 'left',
  },
  vehicleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryRed,
    marginTop: 4,
  },
  capacitySection: {
    width: '100%',
    alignItems: 'center',
  },
  capacityStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryRed,
    marginBottom: 10,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 12,
  },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterDisplay: {
    alignItems: 'center',
    minWidth: 90,
  },
  counterValue: {
    fontSize: 34,
    fontWeight: '600',
    color: Colors.darkText,
  },
  counterMax: {
    fontSize: 12,
    color: Colors.subtleGray,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.mutedBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: '#F5DEC4',
    borderColor: Colors.primaryYellow,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.darkText,
  },
  buttonWrapper: {
    paddingVertical: 10,
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
  shiftError: { color: Colors.primaryRed, backgroundColor: '#FFF0EE', borderColor: '#E7BAB1', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12, lineHeight: 17 },
  toggleButton: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 6,
    elevation: 0,
  },
  buttonStart: {
    backgroundColor: Colors.ink,
  },
  buttonStop: {
    backgroundColor: Colors.darkText,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold'
  },
});
