import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { realRows } from '../../utils/realData';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { driverSpeed, LIVE_FIX_MS, locationQuality, type MeasuredFix } from '../../services/locationQuality';
import { startAnomalyDetection, stopAnomalyDetection } from '../../services/anomalyDetector';
import {
  offlineTransit,
  type RouteData,
  type TerminalData,
  type VehicleData,
} from '../../services/offlineTransitService';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import { color, elevation, radius, tapTarget } from '../../constants/theme';
import { transitStyles } from '../../constants/transitStyles';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import { BottomSheetModal, triggerHaptic } from '../../components/AppUI';
import { loadActiveFleetUnits } from '../../services/fleetRegistryService';

type ShiftUnit = { bodyNumber: string; plateNumber: string; busyElsewhere?: boolean };

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const { fix, now, foreground, errorMsg: locationError, enableLocation } = location;
  const latestLocation = useRef(location);
  latestLocation.current = location;
  const { isConnected } = useNetwork();
  const [catalogRoutes, setCatalogRoutes] = useState<RouteData[]>([]);
  const [serviceIds, setServiceIds] = useState<ReadonlySet<string> | null>(null);
  const serviceRequest = useRef<Promise<Set<string> | null> | null>(null);
  const checkService = useCallback(() => {
    if (serviceRequest.current) return serviceRequest.current;
    const request = offlineTransit.getInServiceRouteIds().catch(() => null).then(ids => {
      if (serviceRequest.current !== request) return null;
      serviceRequest.current = null;
      setServiceIds(ids);
      return ids;
    });
    serviceRequest.current = request;
    return request;
  }, []);
  const routes = catalogRoutes.filter(route => serviceIds?.has(route.id));
  const [mapTerminals, setMapTerminals] = useState<TerminalData[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [bodyNumber, setBodyNumber] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [units, setUnits] = useState<ShiftUnit[]>([]);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [unitLoading, setUnitLoading] = useState(true);
  const [telemetryError, setTelemetryError] = useState('');
  const [shiftError, setShiftError] = useState('');
  const [starting, setStarting] = useState(false);
  const [closingUnconfirmed, setClosingUnconfirmed] = useState(false);
  const trail = useRef<{ vehicleId: string; points: MeasuredFix[] } | null>(null);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const [passengerCount, setPassengerCount] = useState<number | null>(null);
  const [savingPassengerCount, setSavingPassengerCount] = useState(false);
  const [maxCapacity, setMaxCapacity] = useState<number | null>(null);
  const [shiftStartedAt, setShiftStartedAt] = useState<string>('Unavailable');
  const [nativePermissionGranted, setNativePermissionGranted] = useState(false);
  const locationReady = Platform.OS === 'web'
    ? foreground && !locationError && locationQuality(fix, now) === 'live'
    : nativePermissionGranted;
  const [passengerSheetOpen, setPassengerSheetOpen] = useState(false);
  const [endShiftSheetOpen, setEndShiftSheetOpen] = useState(false);
  const publishing = useRef(false);
  const activeVehicle = useRef<string | null>(null);
  const passengerCountPending = useRef(false);
  const routeInService = !!selectedRoute && routes.some(route => route.id === selectedRoute);
  const canSharePosition = routeInService && !closingUnconfirmed;
  const canStartShift = locationReady && routeInService && !starting;

  const clearShift = useCallback((message = '') => {
    activeVehicle.current = null;
    stopAnomalyDetection();
    setVehicleId(null);
    setPublishedAt(null);
    setPassengerCount(0);
    setTelemetryError('');
    setPassengerSheetOpen(false);
    setEndShiftSheetOpen(false);
    setIsActive(false);
    setClosingUnconfirmed(false);
    setShiftError(message);
  }, []);

  const checkActiveShift = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase.from('vehicles').select('is_active').eq('id', id).maybeSingle();
      if (!error && data?.is_active === false && activeVehicle.current === id) clearShift('This shift has ended.');
    } catch {
      // A failed read cannot confirm the shift ended. The next refresh retries it.
    }
  }, [clearShift]);

  useEffect(() => {
    setServiceIds(null);
    if (!foreground || !isConnected || !user?.id) return;
    const refresh = () => {
      void checkService();
      if (isActive && vehicleId) void checkActiveShift(vehicleId);
    };
    refresh();
    const timer = isActive ? setInterval(refresh, 15_000) : undefined;
    return () => { clearInterval(timer); serviceRequest.current = null; };
  }, [foreground, isConnected, user?.id, isActive, vehicleId, checkService, checkActiveShift]);

  const checkNativePermission = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      const granted = perm.status === 'granted';
      setNativePermissionGranted(granted);
      return granted;
    } catch {
      setNativePermissionGranted(false);
      return false;
    }
  }, []);

  const requestLocationPerm = async () => {
    try {
      await enableLocation();
      if (Platform.OS === 'web' || await checkNativePermission()) setShiftError('');
    } catch {
      setNativePermissionGranted(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') void checkNativePermission();
  }, [checkNativePermission]);

  const checkTrackingAccess = useCallback(
    async (permissionMessage: string) => {
      if (Platform.OS === 'web') return;
      if (!await checkNativePermission()) throw new Error(permissionMessage);
      if (!await Location.hasServicesEnabledAsync()) throw new Error('Device location services are disabled.');
    },
    [checkNativePermission]
  );

  useEffect(() => {
    activeVehicle.current = isActive ? vehicleId : null;
    return () => { activeVehicle.current = null; };
  }, [isActive, vehicleId]);
  useEffect(() => {
    if (!isActive || !vehicleId || !foreground || locationError || !fix || locationQuality(fix, now) !== 'live') {
      trail.current = null;
      return;
    }
    const points = trail.current?.vehicleId === vehicleId ? trail.current.points : [];
    trail.current = { vehicleId, points: [...points.filter(point => point.timestamp < fix.timestamp && fix.timestamp - point.timestamp <= LIVE_FIX_MS), fix] };
  }, [isActive, vehicleId, foreground, locationError, fix?.timestamp, fix?.accuracy, now]);
  useEffect(() => {
    if (!isActive || !vehicleId || !fix || !foreground) return;
    if (!selectedRoute || !canSharePosition || locationError || !isConnected || locationQuality(fix, now) !== 'live' || (publishedAt != null && publishedAt >= fix.timestamp) || publishing.current) return;
    publishing.current = true;
    void checkService().then(async ids => {
      const latest = latestLocation.current;
      if (!ids?.has(selectedRoute) || activeVehicle.current !== vehicleId || !latest.foreground || latest.errorMsg ||
          !latest.fix || locationQuality(latest.fix) !== 'live') return;
      const measured = latest.fix;
      await offlineTransit.publishPosition(vehicleId, measured);
      if (activeVehicle.current === vehicleId) { setPublishedAt(measured.timestamp); setTelemetryError(''); }
    }).catch(() => {
      if (activeVehicle.current === vehicleId) setTelemetryError('shareFailed');
    }).finally(() => { publishing.current = false; });
  }, [isActive, vehicleId, selectedRoute, canSharePosition, fix?.timestamp, now, foreground, isConnected, locationError, publishedAt, checkService]);

  useEffect(() => {
    let current = true;
    if (foreground && user?.id) void offlineTransit.getTransitData().then((data) => {
      if (!current) return;
      const validRoutes = data.routes.filter((route) => !route.is_coming_soon);
      setCatalogRoutes(validRoutes);
      if (data.status !== 'ready') setShiftError(data.syncedAt ? `Routes cached at ${new Date(data.syncedAt).toLocaleString()}; refresh unavailable.` : 'Routes unavailable.');
      setMapTerminals(data.terminals);
      if (validRoutes.length > 0) {
        setSelectedRoute((prev) => prev || validRoutes[0].id);
      }
    });

    return () => { current = false; };
  }, [foreground, isConnected, user?.id]);
  useEffect(() => () => stopAnomalyDetection(), []);

  useEffect(() => {
    if (isActive) return;
    let cancelled = false;
    const loadUnits = async () => {
      try {
        const [registeredUnits, historyResult] = await Promise.all([
          loadActiveFleetUnits(),
          supabase
            .from('vehicles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500),
        ]);
        if (cancelled) return;
        if (historyResult.error) throw historyResult.error;
        const activeElsewhere = new Set<string>();
        for (const row of realRows(historyResult.data || [])) {
          const body = String(row.body_number || '').trim().toUpperCase();
          if (body && row.is_active && row.driver_id !== user?.id) {
            activeElsewhere.add(body);
          }
        }
        const available = new Map<string, ShiftUnit>();
        for (const row of registeredUnits) {
          const body = String(row.body_number || '').trim();
          const plate = String(row.plate_number || '').trim();
          if (body && plate) {
            available.set(body.toUpperCase(), {
              bodyNumber: body,
              plateNumber: plate,
              busyElsewhere: activeElsewhere.has(body.toUpperCase()),
            });
          }
        }
        const sorted = Array.from(available.values()).sort((a, b) => a.bodyNumber.localeCompare(b.bodyNumber));
        setUnits(sorted);
        const firstReady = sorted.find((u) => !u.busyElsewhere) || sorted[0];
        if (firstReady) {
          setBodyNumber((prev) => prev || firstReady.bodyNumber);
          setPlateNumber((prev) => prev || firstReady.plateNumber);
        }
      } catch {
        if (!cancelled) setShiftError('Units could not be loaded. Check your connection and try again.');
      } finally {
        if (!cancelled) setUnitLoading(false);
      }
    };
    void loadUnits();
    const timer = setInterval(() => {
      void loadUnits();
    }, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.id, isActive]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data || data.is_sample || cancelled) return;
      setClosingUnconfirmed(false);
      setVehicleId(data.id);
      setSelectedRoute(data.route_id);
      setBodyNumber(data.body_number || '');
      setPlateNumber(data.plate_number || '');
      setPassengerCount(data.passenger_count ?? null);
      setMaxCapacity(data.max_capacity ?? null);
      if (data.created_at) {
        setShiftStartedAt(
          new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        );
      }
      setIsActive(true);
      startAnomalyDetection(data.id);
      try {
        await checkTrackingAccess('Allow location access to monitor this active shift.');
      } catch {
        setTelemetryError('locationHelp');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, checkTrackingAccess]);

  const updatePassengerCount = async (nextCount: number) => {
    if (!isActive || !vehicleId || activeVehicle.current !== vehicleId || starting || passengerCountPending.current) return;
    if (maxCapacity == null) { setShiftError('Vehicle capacity unavailable.'); return; }
    const clamped = Math.max(0, Math.min(maxCapacity, nextCount));
    triggerHaptic('light');
    passengerCountPending.current = true;
    setSavingPassengerCount(true);
    setShiftError('');
    try {
      const { data, error } = await supabase.from('vehicles').update({ passenger_count: clamped })
        .eq('id', vehicleId).eq('is_active', true).select('id').maybeSingle();
      if (error) throw error;
      if (!data) {
        await checkActiveShift(vehicleId);
        throw new Error('Passenger count could not be saved.');
      }
      if (activeVehicle.current === vehicleId) setPassengerCount(clamped);
    } catch {
      if (activeVehicle.current === vehicleId) setShiftError('Passenger count could not be saved.');
    } finally {
      passengerCountPending.current = false;
      setSavingPassengerCount(false);
    }
  };

  const toggleShift = async () => {
    if (starting || passengerCountPending.current) return;
    setShiftError('');
    setStarting(true);
    let insertedId: string | null = null;
    try {
      if (isActive) {
        if (!vehicleId) throw new Error('The active unit could not be found. Refresh and try again.');
        const { error } = await supabase
          .from('vehicles')
          .update({ is_active: false, passenger_count: 0 })
          .eq('id', vehicleId);
        if (error) throw new Error(error.message);
        clearShift();
        triggerHaptic('medium');
        return;
      }

      if (!user?.id) throw new Error('Sign in again before starting a shift.');
      if (!selectedRoute || !routes.some(route => route.id === selectedRoute)) throw new Error('Choose a route before starting a shift.');
      if (!units.some((unit) => unit.bodyNumber === bodyNumber && unit.plateNumber === plateNumber)) {
        throw new Error('Choose a registered unit before starting a shift.');
      }
      const assignedElsewhere = await supabase
        .from('vehicles')
        .select('id,driver_id')
        .eq('body_number', bodyNumber)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (assignedElsewhere.error) throw new Error(assignedElsewhere.error.message);
      if (assignedElsewhere.data)
        throw new Error(
          'This unit is already on a shift. Select another unit or ask a supervisor to end its current shift.'
        );

      if (!isConnected) throw new Error('Connect to the internet before starting a shift.');
      await checkTrackingAccess('Allow location access to start a live shift.');
      if (!(await checkService())?.has(selectedRoute)) throw new Error('Route service could not be confirmed. Choose a current route.');
      const { fix: measured, foreground: active, errorMsg } = latestLocation.current;
      if (!measured || !active || errorMsg || locationQuality(measured) !== 'live') throw new Error('Wait for a fresh GPS fix with accuracy within 30 m before starting.');
      const created = await supabase
        .from('vehicles')
        .insert({
          driver_id: user.id,
          route_id: selectedRoute,
          body_number: bodyNumber.trim(),
          plate_number: plateNumber.trim(),
          passenger_count: 0,
          is_active: true,
        })
        .select('*')
        .single();
      if (created.error || !created.data) throw new Error(created.error?.message || 'The shift could not be created.');
      setMaxCapacity(created.data.max_capacity ?? null);
      const newVehicleId: string = created.data.id;
      insertedId = newVehicleId;
      if (created.data.created_at) {
        setShiftStartedAt(
          new Date(created.data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        );
      } else {
        setShiftStartedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
      }
      if (!(await checkService())?.has(selectedRoute)) throw new Error('Route service changed before the first GPS reading could be shared.');
      const first = latestLocation.current;
      if (!first.foreground || first.errorMsg || !first.fix || locationQuality(first.fix) !== 'live') throw new Error('A fresh foreground GPS reading is required to start the shift.');
      await offlineTransit.publishPosition(newVehicleId, first.fix);
      setPublishedAt(first.fix.timestamp);
      setVehicleId(newVehicleId);
      setPassengerCount(0);
      setIsActive(true);
      triggerHaptic('success');
      startAnomalyDetection(newVehicleId);
    } catch (error) {
      triggerHaptic('error');
      let rollbackFailed = false;
      if (insertedId) {
        try {
          const rollback = await supabase.from('vehicles')
            .update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', insertedId);
          rollbackFailed = Boolean(rollback.error);
        } catch { rollbackFailed = true; }
        if (rollbackFailed) {
          setClosingUnconfirmed(true);
          setVehicleId(insertedId);
          setIsActive(true);
        }
      }
      const message =
        error instanceof Error ? error.message : 'The shift could not start. Check your connection and try again.';
      setShiftError(
        rollbackFailed ? `${message} Closing the shift could not be confirmed. Use End shift to retry.` : message
      );
    } finally {
      setStarting(false);
    }
  };

  const currentRouteName = routes.find((r) => r.id === selectedRoute)?.name || 'Route unavailable';
  const currentPosition = isActive && foreground && !locationError ? fix : null;
  const gpsUsable = locationQuality(currentPosition, now) === 'live';
  const previous = trail.current?.vehicleId === vehicleId && currentPosition
    ? trail.current?.points.find(point => point.timestamp < currentPosition.timestamp && locationQuality(point, now) === 'live') : null;
  const speed = driverSpeed(previous ?? null, currentPosition, now);
  const overLimit = speed && !speed.estimated && speed.kph > ESAKAY_OPERATIONS.operatorSpeedCapKph;
  const speedText = speed ? `${Number(speed.kph.toFixed(1))} km/h` : t('passenger.driverSpeed.unavailable');
  const seatStatus = maxCapacity == null || passengerCount == null ? null :
    passengerCount >= maxCapacity
      ? 'Puno'
      : passengerCount >= Math.ceil(maxCapacity * 0.7)
        ? 'Sakto'
        : 'Maluwag';

  const liveVehicle: VehicleData | null =
    canSharePosition && vehicleId && currentPosition && gpsUsable
      ? {
          id: vehicleId,
          vehicle_id: vehicleId,
          body_number: bodyNumber,
          plate_number: plateNumber,
          route_id: selectedRoute || '',
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          speed: currentPosition.speed,
          heading: currentPosition.heading != null && currentPosition.heading >= 0 ? currentPosition.heading : null,
          accuracy: currentPosition.accuracy,
          recorded_at: new Date(currentPosition.timestamp).toISOString(),
          passenger_count: passengerCount,
          max_capacity: maxCapacity,
          is_full: maxCapacity == null || passengerCount == null ? null : passengerCount >= maxCapacity,
          status: seatStatus,
        }
      : null;

  return (
    <View style={styles.container}>
      {!isActive ? (
        <>
          <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.fieldGroup}>
              <View style={styles.setupHeader}>
                <Ionicons aria-hidden name="bus-outline" color={color.signal} size={26} />
                <Text accessibilityRole="header" style={styles.pageTitle}>Start your shift</Text>
              </View>
              <View style={styles.routeFields}>
                <Text style={styles.unitTitle}>Route</Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setRouteMenuOpen(!routeMenuOpen)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose route"
                  accessibilityState={{ expanded: routeMenuOpen }}
                >
                  <Text style={styles.selectButtonText}>{currentRouteName || 'Route unavailable'}</Text>
                  <Ionicons name={routeMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.inkMuted} />
                </TouchableOpacity>
                <Text style={styles.fieldHelper}>{routes.find(route => route.id === selectedRoute)?.description || 'Route description unavailable'}</Text>

                {routeMenuOpen && (
                  <View style={styles.optionList}>
                    {routes.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={styles.optionRow}
                        accessibilityState={{ selected: selectedRoute === r.id }}
                        onPress={() => {
                          setSelectedRoute(r.id);
                          setRouteMenuOpen(false);
                          setShiftError('');
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.optionTitle}>{r.name}</Text>
                        {selectedRoute === r.id && <Ionicons name="checkmark-circle" size={18} color={color.success} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {locationReady ? (
              <View style={styles.locationEnabledRow}>
                <Ionicons name="location-outline" size={20} color={color.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationEnabledTitle}>Location enabled</Text>
                  <Text style={styles.fieldHelper}>Foreground only: keep this app open and the screen active during your shift.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.locationRequiredBox}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Ionicons name="location-outline" size={20} color={color.ink} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.unitTitle}>Location is required</Text>
                    <Text style={styles.fieldHelper}>
                      {Platform.OS === 'web'
                        ? locationError || 'Allow browser location access and wait for a fresh GPS reading within 30 m accuracy.'
                        : 'Allow location access to share your unit position while on duty.'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    void requestLocationPerm();
                  }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Enable location</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text accessibilityRole="header" style={styles.fieldLabel}>Assigned unit</Text>
              <View style={styles.unitList}>
                {units.length ? (
                  units.map((unit) => {
                    const isSelected = unit.bodyNumber === bodyNumber && unit.plateNumber === plateNumber;
                    const busy = Boolean(unit.busyElsewhere);
                    return (
                      <TouchableOpacity
                        key={`${unit.bodyNumber}-${unit.plateNumber}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected, disabled: busy }}
                        disabled={busy}
                        onPress={() => {
                          setBodyNumber(unit.bodyNumber);
                          setPlateNumber(unit.plateNumber);
                          setShiftError('');
                        }}
                        style={[
                          styles.unitRadioCard,
                          isSelected && !busy && styles.unitRadioCardSelected,
                          busy && styles.unitRadioCardBusy,
                        ]}
                      >
                        <Ionicons
                          name={isSelected && !busy ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={isSelected && !busy ? color.success : color.inkMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.unitTitle, busy && { color: color.inkMuted }]}>
                            {unit.bodyNumber}
                          </Text>
                          <Text style={styles.unitPlate}>Plate {unit.plateNumber}</Text>
                        </View>
                        {busy ? (
                          <Text style={styles.busyLabel}>Already on shift</Text>
                        ) : (
                          <View style={styles.availableBadge}>
                            <Ionicons name="checkmark" size={14} color={color.success} />
                            <Text style={styles.availableText}>Available</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.fieldHelper}>
                    {unitLoading ? 'Loading units…' : 'No units are available. Ask a supervisor to add your unit.'}
                  </Text>
                )}
              </View>
            </View>

          </ScrollView>
          <View style={styles.submitBar}>
            {!!shiftError && (
              <Text accessibilityRole="alert" style={[styles.shiftError, { width: '100%' }]}>
                {shiftError}
              </Text>
            )}
            <Text style={styles.submitUnit}>{[bodyNumber, plateNumber].filter(Boolean).join(' · ') || 'Select an assigned unit'}</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, transitStyles.selected, !canStartShift && styles.disabledBtn]}
              onPress={toggleShift}
              disabled={!canStartShift}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canStartShift, busy: starting }}
            >
              {starting ? (
                <ActivityIndicator color={color.inkMuted} />
              ) : (
                <Text style={[styles.primaryBtnText, transitStyles.selectedText, !canStartShift && { color: color.inkMuted }]}>
                  Start shift
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.masthead}>
            <View style={styles.onDutyHeaderRow}>
              <Text style={styles.shiftActiveText}>On duty</Text>
              <Text style={styles.mastheadDescription}>Started {shiftStartedAt}</Text>
            </View>
            <Text accessibilityRole="header" style={styles.pageTitle}>{bodyNumber} · {plateNumber}</Text>
            <Text style={styles.mastheadDescription}>{currentRouteName}</Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Update passenger count"
            accessibilityValue={{ text: `${passengerCount ?? 'Unavailable'} · ${seatStatus || 'Occupancy unavailable'}` }}
            onPress={() => setPassengerSheetOpen(true)}
            style={styles.passengersRow}
          >
            <View style={{ flexGrow: 1, flexBasis: 146 }}>
              <Text style={styles.unitTitle}>Passengers</Text>
              <Text style={styles.passengerCountNum}>{passengerCount ?? 'Unavailable'}</Text>
              <Text style={styles.unitPlate}>{seatStatus || 'Occupancy unavailable'}</Text>
              <Text style={styles.fieldHelper}>Update seats when safely stopped.</Text>
            </View>
            <View style={styles.passengerAction}>
              <Ionicons aria-hidden name="create-outline" size={20} color={color.action} />
              <Text style={styles.passengerTitle}>Update count</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.trackingPanel}>
            <View style={styles.telemetryGrid}>
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>{t(speed?.estimated ? 'passenger.driverSpeed.estimate' : 'passenger.driverSpeed.speed')}</Text>
                <Text style={[speed ? styles.telemetryValue : styles.telemetryUnit, overLimit && { color: color.ember }]}>
                  {speed ? speedText : t(gpsUsable ? 'passenger.driverSpeed.missing' : 'passenger.driverSpeed.waiting')}
                </Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>{t('passenger.driverSpeed.limit')}</Text>
                <Text style={styles.telemetryValue}>{ESAKAY_OPERATIONS.operatorSpeedCapKph} <Text style={styles.telemetryUnit}>km/h</Text></Text>
              </View>
            </View>
            {overLimit && <Text accessibilityRole="alert" style={styles.shiftError}>{t('passenger.driverSpeed.high')}</Text>}
            {speed?.estimated && <Text style={styles.fieldHelper}>{t('passenger.driverSpeed.estimated')}</Text>}
            <View style={styles.mapFrame}>
              <LeafletMap
                routes={routes}
                terminals={mapTerminals}
                vehicles={liveVehicle ? [liveVehicle] : []}
                selectedVehicle={liveVehicle}
                vehicleSelectionKey={vehicleId}
                selectedRouteId={selectedRoute}
                fleetMode
              />
            </View>
            <View style={styles.gpsCaption}>
              <Ionicons name="locate-outline" size={16} color={gpsUsable ? color.success : color.inkMuted} />
              <Text style={styles.gpsText}>{gpsUsable && currentPosition ? t('passenger.driverSpeed.precision', { meters: Math.round(currentPosition.accuracy!) }) : t('passenger.driverSpeed.waiting')}</Text>
            </View>

            <Text style={styles.fieldHelper}>{t('passenger.driverSpeed.keepOpen')}</Text>
            <Text style={styles.fieldHelper}>{!isConnected ? t('passenger.driverSpeed.offline') : publishedAt ? t('passenger.driverSpeed.shared', { time: new Date(publishedAt).toLocaleTimeString() }) : t('passenger.driverSpeed.notShared')}</Text>
            {(!!telemetryError || !!locationError) && (
              <Text accessibilityRole="alert" style={styles.shiftError}>
                {t('passenger.driverSpeed.' + (locationError ? 'locationHelp' : telemetryError))}
              </Text>
            )}
            {!routeInService && <Text accessibilityRole="alert" style={styles.shiftError}>{selectedRoute && serviceIds && !serviceIds.has(selectedRoute)
              ? t('passenger.driverSpeed.routeClosed') : t('passenger.driverSpeed.routeUnknown')}</Text>}
            {(!!locationError || (foreground && locationQuality(fix, now) !== 'live')) && <TouchableOpacity accessibilityRole="button" onPress={requestLocationPerm} style={styles.keepActiveBtn}><Text style={styles.keepActiveText}>{t('passenger.driverSpeed.retry')}</Text></TouchableOpacity>}

          </View>

          {!!shiftError && (
            <Text accessibilityRole="alert" style={styles.shiftError}>
              {shiftError}
            </Text>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setEndShiftSheetOpen(true)}
            style={styles.endShiftOutlineBtn}
          >
            <Text style={styles.endShiftOutlineText}>End shift</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <BottomSheetModal
        visible={passengerSheetOpen}
        onClose={() => setPassengerSheetOpen(false)}
        maxWidth={480}
        contentContainerStyle={{ gap: 16 }}
      >
        <View style={styles.sheetHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Passenger count</Text>
            <Text style={styles.unitPlate}>
              {bodyNumber || 'Unit unavailable'} · {currentRouteName || 'Route unavailable'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close passenger count"
            onPress={() => setPassengerSheetOpen(false)}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={color.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.stepperBox}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.stepperBtn}
            disabled={savingPassengerCount || starting || !isActive || maxCapacity == null}
            accessibilityState={{ disabled: savingPassengerCount || starting || !isActive || maxCapacity == null }}
            onPress={() => updatePassengerCount((passengerCount ?? 0) - 1)}
            accessibilityLabel="Decrease passenger count"
          >
            <Ionicons name="remove" size={24} color={color.ink} />
          </TouchableOpacity>
          <Text style={passengerCount == null ? styles.unitPlate : styles.stepperValue}>{passengerCount ?? 'Unavailable'}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.stepperBtn}
            disabled={savingPassengerCount || starting || !isActive || maxCapacity == null}
            accessibilityState={{ disabled: savingPassengerCount || starting || !isActive || maxCapacity == null }}
            onPress={() => updatePassengerCount((passengerCount ?? 0) + 1)}
            accessibilityLabel="Increase passenger count"
          >
            <Ionicons name="add" size={24} color={color.ink} />
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldHelper}>{savingPassengerCount ? 'Saving passenger count…' : 'Enter the observed passenger count. Changes are saved to this shift.'}</Text>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setPassengerSheetOpen(false)}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </BottomSheetModal>

      <BottomSheetModal
        visible={endShiftSheetOpen}
        onClose={() => setEndShiftSheetOpen(false)}
        maxWidth={480}
        contentContainerStyle={{ gap: 16 }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setEndShiftSheetOpen(false)}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4 }}
        >
          <Ionicons name="chevron-back" size={20} color={color.ink} />
          <Text style={styles.unitTitle}>End shift</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
          <View style={styles.endShiftBusIcon}>
            <Ionicons name="bus-outline" size={28} color={color.ink} />
          </View>
          <Text style={styles.endShiftTitle}>End this shift?</Text>
          <Text style={styles.unitPlate}>Your unit will no longer be shown as on duty.</Text>
        </View>

        <View style={styles.summaryList}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Unit</Text>
            <Text style={styles.summaryValue}>
              {bodyNumber} · {plateNumber}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Route</Text>
            <Text style={styles.summaryValue}>{currentRouteName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Started</Text>
            <Text style={styles.summaryValue}>{shiftStartedAt}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t(speed?.estimated ? 'passenger.driverSpeed.estimate' : 'passenger.driverSpeed.speed')}</Text>
            <Text style={styles.summaryValue}>{speedText}</Text>
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setEndShiftSheetOpen(false)}
          style={styles.keepActiveBtn}
        >
          <Text style={styles.keepActiveText}>Keep shift active</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={starting || savingPassengerCount}
          onPress={toggleShift}
          style={styles.confirmEndBtn}
        >
          {starting ? (
            <ActivityIndicator color={color.onDark} />
          ) : (
            <Text style={styles.confirmEndText}>End shift</Text>
          )}
        </TouchableOpacity>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: transitStyles.page,
  scrollContent: transitStyles.content,
  masthead: transitStyles.masthead,
  setupHeader: { ...transitStyles.masthead, borderRadius: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeFields: { padding: 16, gap: 8 },
  mastheadDescription: transitStyles.description,
  pageTitle: { ...transitStyles.heading, flexShrink: 1 },
  submitBar: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: color.paper, borderTopColor: color.border, borderTopWidth: 1 },
  submitUnit: { flexBasis: 140, flexGrow: 1, flexShrink: 1, color: color.ink, fontSize: 15, fontWeight: '600' },
  fieldGroup: { ...transitStyles.panel, overflow: 'hidden' },
  fieldLabel: { color: color.ink, fontSize: 18, fontWeight: '700', padding: 16, paddingBottom: 12 },
  unitList: { paddingHorizontal: 12, paddingBottom: 10 },
  fieldHelper: {
    color: color.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    backgroundColor: color.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  selectButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: color.ink,
  },
  optionList: {
    backgroundColor: color.paper,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  optionRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionTitle: {
    flex: 1,
    color: color.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  unitRadioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderColor: color.border,
    backgroundColor: color.paper,
  },
  unitRadioCardSelected: { backgroundColor: color.successBg },
  unitRadioCardBusy: { backgroundColor: color.canvas },
  unitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  unitPlate: {
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 2,
  },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  availableText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.success,
  },
  busyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: color.inkMuted,
  },
  locationEnabledRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: color.successBg,
  },
  locationEnabledTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: color.success,
  },
  locationRequiredBox: {
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.paper,
    gap: 12,
  },
  primaryBtn: transitStyles.primaryButton,
  disabledBtn: {
    backgroundColor: color.border,
  },
  primaryBtnText: transitStyles.primaryText,
  shiftError: {
    color: color.ember,
    backgroundColor: color.dangerBg,
    borderColor: color.ember,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  onDutyHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shiftActiveText: { backgroundColor: color.successBg, color: color.success, fontSize: 15, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, overflow: 'hidden' },
  passengersRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12,
    ...transitStyles.panel, padding: 16,
  },
  passengerTitle: { fontSize: 15, fontWeight: '700', color: color.action, flexShrink: 1 },
  passengerCountNum: { fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '700', color: color.ink },
  passengerAction: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: tapTarget, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: color.successBg },
  trackingPanel: { backgroundColor: color.paper, borderColor: color.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 12, ...elevation.card },
  mapFrame: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
    position: 'relative',
  },
  gpsCaption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: color.ink,
  },
  telemetryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.border,
    paddingVertical: 12,
  },
  telemetryCol: {
    flex: 1,
    gap: 4,
  },
  telemetryDivider: {
    width: 1,
    height: 40,
    backgroundColor: color.border,
    marginHorizontal: 16,
  },
  telemetryLabel: {
    fontSize: 13,
    color: color.inkMuted,
  },
  telemetryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  telemetryUnit: {
    fontSize: 15,
    fontWeight: '600',
    color: color.inkMuted,
  },
  endShiftOutlineBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.ember,
    backgroundColor: color.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  endShiftOutlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ember,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: color.ink,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: color.paper,
  },
  stepperBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 42,
    fontWeight: '800',
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  closeButton: { width: tapTarget, height: tapTarget, justifyContent: 'center', alignItems: 'center' },
  endShiftBusIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.canvas,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  endShiftTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: color.ink,
  },
  summaryList: {
    borderTopWidth: 1,
    borderColor: color.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  summaryLabel: {
    fontSize: 14,
    color: color.inkMuted,
  },
  summaryValue: {
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 16,
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  keepActiveBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.ink,
    backgroundColor: color.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepActiveText: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  confirmEndBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: color.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmEndText: {
    fontSize: 16,
    fontWeight: '700',
    color: color.onDark,
  },
});
