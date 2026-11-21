import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { locationDescription, locationQuality, type MeasuredFix } from '../../services/locationQuality';
import { startAnomalyDetection, stopAnomalyDetection } from '../../services/anomalyDetector';
import {
  offlineTransit,
  type RouteData,
  type TerminalData,
  type VehicleData,
} from '../../services/offlineTransitService';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../../components/LeafletMap';
import { BottomSheetModal, triggerHaptic } from '../../components/AppUI';
import { loadActiveFleetUnits } from '../../services/fleetRegistryService';

type ShiftUnit = { bodyNumber: string; plateNumber: string; busyElsewhere?: boolean };

export default function DashboardScreen() {
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
  const [currentPosition, setCurrentPosition] = useState<MeasuredFix | null>(null);
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

  useEffect(() => {
    setServiceIds(null);
    if (!foreground || !isConnected || !user?.id) return;
    void checkService();
    const timer = isActive ? setInterval(() => { void checkService(); }, 15_000) : undefined;
    return () => { clearInterval(timer); serviceRequest.current = null; };
  }, [foreground, isConnected, user?.id, isActive, vehicleId, checkService]);

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
    if (!isActive || !vehicleId || !fix || !foreground) return;
    setCurrentPosition(previous => !previous || fix.timestamp > previous.timestamp ? fix : previous);
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
      if (activeVehicle.current === vehicleId) setTelemetryError('Position was not published. Check connection and telemetry schema; retrying with fresh GPS.');
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
      } catch (error) {
        setTelemetryError(error instanceof Error ? error.message : 'GPS monitoring is paused.');
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
      const { error } = await supabase.from('vehicles').update({ passenger_count: clamped }).eq('id', vehicleId);
      if (error) throw error;
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
        stopAnomalyDetection();
        setVehicleId(null);
        setCurrentPosition(null);
        setPublishedAt(null);
        setPassengerCount(0);
        setTelemetryError('');
        setEndShiftSheetOpen(false);
        setIsActive(false);
        setClosingUnconfirmed(false);
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
      setCurrentPosition(first.fix);
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
  const gpsUsable = foreground && !locationError && locationQuality(currentPosition, now) === 'live';
  const currentSpeedKph = gpsUsable && currentPosition?.speed != null ? Math.round(currentPosition.speed) : null;
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
          speed: currentSpeedKph,
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
            <View style={styles.masthead}>
              <Text accessibilityRole="header" style={styles.pageTitle}>Start your shift</Text>
              <Text style={styles.mastheadLabel}>Route</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setRouteMenuOpen(!routeMenuOpen)}
                accessibilityRole="button"
                accessibilityLabel="Choose route"
                accessibilityState={{ expanded: routeMenuOpen }}
              >
                <Text style={styles.selectButtonText}>{currentRouteName || 'Route unavailable'}</Text>
                <Ionicons name={routeMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray} />
              </TouchableOpacity>
              <Text style={styles.mastheadDescription}>{routes.find(route => route.id === selectedRoute)?.description || 'Route description unavailable'}</Text>

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
                      {selectedRoute === r.id && <Ionicons name="checkmark-circle" size={18} color={Colors.action} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {locationReady ? (
              <View style={styles.locationEnabledRow}>
                <Ionicons name="location-outline" size={20} color={Colors.brandGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationEnabledTitle}>Location enabled</Text>
                  <Text style={styles.fieldHelper}>Foreground only: keep this app open and the screen active during your shift.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.locationRequiredBox}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Ionicons name="location-outline" size={20} color={Colors.ink} style={{ marginTop: 2 }} />
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
                          color={isSelected && !busy ? Colors.action : Colors.subtleGray}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.unitTitle, busy && { color: Colors.subtleGray }]}>
                            {unit.bodyNumber}
                          </Text>
                          <Text style={styles.unitPlate}>Plate {unit.plateNumber}</Text>
                        </View>
                        {busy ? (
                          <Text style={styles.busyLabel}>Already on shift</Text>
                        ) : (
                          <View style={styles.availableBadge}>
                            <Ionicons name="checkmark" size={14} color={Colors.brandGreen} />
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
              style={[styles.primaryBtn, !canStartShift && styles.disabledBtn]}
              onPress={toggleShift}
              disabled={!canStartShift}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canStartShift, busy: starting }}
            >
              {starting ? (
                <ActivityIndicator color={Colors.subtleGray} />
              ) : (
                <Text style={[styles.primaryBtnText, !locationReady && { color: Colors.subtleGray }]}>
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
            </View>
            <View style={styles.passengerAction}>
              <Ionicons name="create-outline" size={20} color={Colors.action} />
              <Text style={styles.passengerTitle}>Update count</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.fieldHelper}>Update seats when safely stopped.</Text>

          <View style={styles.trackingPanel}>
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
              <Ionicons name="locate-outline" size={16} color={gpsUsable ? Colors.success : Colors.subtleGray} />
              <Text style={styles.gpsText}>{locationDescription(currentPosition, now)}</Text>
            </View>

            <Text style={styles.fieldHelper}>Foreground only. Background or a locked screen can pause tracking.</Text>
            <Text style={styles.fieldHelper}>{!isConnected ? 'Offline — position is not shared.' : publishedAt ? `Last shared measurement: ${new Date(publishedAt).toLocaleTimeString()} (${Math.max(0, Math.floor((now - publishedAt) / 1000))}s ago)` : 'No position published yet.'}</Text>
            {(!!telemetryError || !!locationError) && (
              <Text accessibilityRole="alert" style={styles.shiftError}>
                {locationError || telemetryError}
              </Text>
            )}
            {!routeInService && <Text accessibilityRole="alert" style={styles.shiftError}>{selectedRoute && serviceIds && !serviceIds.has(selectedRoute)
              ? 'This shift’s route is out of service. GPS sharing is paused. You can end the shift.'
              : 'Route service is unconfirmed. GPS sharing is paused. You can end the shift.'}</Text>}
            {(!!locationError || (foreground && locationQuality(fix, now) !== 'live')) && <TouchableOpacity accessibilityRole="button" onPress={requestLocationPerm} style={styles.keepActiveBtn}><Text style={styles.keepActiveText}>Enable location / retry</Text></TouchableOpacity>}

            {/* 2-Column Telemetry */}
            <View style={styles.telemetryGrid}>
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>Current speed</Text>
                <Text
                  style={[
                    styles.telemetryValue,
                    currentSpeedKph != null && currentSpeedKph > ESAKAY_OPERATIONS.operatorSpeedCapKph && { color: Colors.primaryRed },
                  ]}
                >
                  {currentSpeedKph == null ? <Text style={styles.telemetryUnit}>Unavailable</Text> : <>{currentSpeedKph} <Text style={styles.telemetryUnit}>km/h</Text></>}
                </Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryCol}>
                <Text style={styles.telemetryLabel}>Operator cap</Text>
                <Text style={styles.telemetryValue}>
                  {ESAKAY_OPERATIONS.operatorSpeedCapKph} <Text style={styles.telemetryUnit}>km/h</Text>
                </Text>
              </View>
            </View>

            <Text style={styles.fieldHelper}>Route adherence unverified</Text>
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
            <Ionicons name="close" size={24} color={Colors.ink} />
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
            <Ionicons name="remove" size={24} color={Colors.ink} />
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
            <Ionicons name="add" size={24} color={Colors.ink} />
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
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          <Text style={styles.unitTitle}>End shift</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
          <View style={styles.endShiftBusIcon}>
            <Ionicons name="bus-outline" size={28} color={Colors.ink} />
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
            <Text style={styles.summaryLabel}>Current speed</Text>
            <Text style={styles.summaryValue}>{currentSpeedKph == null ? 'Unavailable' : `${currentSpeedKph} km/h`}</Text>
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
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.confirmEndText}>End shift</Text>
          )}
        </TouchableOpacity>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 36, gap: 12 },
  masthead: { backgroundColor: Colors.midnight, padding: 20, borderRadius: 10, gap: 8 },
  mastheadLabel: { color: Colors.onDark, fontSize: 14, fontWeight: '600' },
  mastheadDescription: { color: Colors.onDarkMuted, fontSize: 14, lineHeight: 20 },
  pageTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: Colors.onDark, marginBottom: 4 },
  submitBar: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Colors.paper, borderTopColor: Colors.border, borderTopWidth: 1 },
  submitUnit: { flexBasis: 140, flexGrow: 1, flexShrink: 1, color: Colors.ink, fontSize: 15, fontWeight: '600' },
  fieldGroup: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  fieldLabel: { color: Colors.ink, fontSize: 18, fontWeight: '700', padding: 16, paddingBottom: 12 },
  unitList: { paddingHorizontal: 12, paddingBottom: 10 },
  fieldHelper: {
    color: Colors.subtleGray,
    fontSize: 13,
    lineHeight: 18,
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
    backgroundColor: Colors.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  optionList: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  optionRow: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionTitle: {
    flex: 1,
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  unitRadioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  unitRadioCardSelected: { borderLeftWidth: 3, borderLeftColor: Colors.action, backgroundColor: Colors.actionTint },
  unitRadioCardBusy: { backgroundColor: Colors.canvas },
  unitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  unitPlate: {
    fontSize: 13,
    color: Colors.subtleGray,
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
    color: Colors.brandGreen,
  },
  busyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  locationEnabledRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: Colors.successBg,
  },
  locationEnabledTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  locationRequiredBox: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    gap: 12,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: Colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  disabledBtn: {
    backgroundColor: Colors.border,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  shiftError: {
    color: Colors.primaryRed,
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.primaryRed,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  onDutyHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shiftActiveText: { backgroundColor: Colors.successBg, color: Colors.success, fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  passengersRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12,
    backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 4, borderLeftColor: Colors.action, padding: 16, borderRadius: 8,
  },
  passengerTitle: { fontSize: 15, fontWeight: '700', color: Colors.action },
  passengerCountNum: { fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '700', color: Colors.ink },
  passengerAction: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  trackingPanel: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
  mapFrame: {
    height: 248,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  gpsCaption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
  },
  telemetryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
  },
  telemetryCol: {
    flex: 1,
    gap: 4,
  },
  telemetryDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  telemetryLabel: {
    fontSize: 13,
    color: Colors.subtleGray,
  },
  telemetryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  telemetryUnit: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  endShiftOutlineBtn: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  endShiftOutlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.paper,
  },
  stepperBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 42,
    fontWeight: '800',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  closeButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  endShiftBusIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  endShiftTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.ink,
  },
  summaryList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  summaryValue: {
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 16,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  keepActiveBtn: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepActiveText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  confirmEndBtn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: Colors.primaryRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmEndText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});
