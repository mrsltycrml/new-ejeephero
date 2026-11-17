import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
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
  const [unitLoading, setUnitLoading] = useState(true);
  const [telemetryError, setTelemetryError] = useState('');
  const [shiftError, setShiftError] = useState('');
  const [starting, setStarting] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Location.LocationObjectCoords | null>(null);
  const [passengerCount, setPassengerCount] = useState<number | null>(null);
  const [maxCapacity, setMaxCapacity] = useState<number | null>(null);
  const [shiftStartedAt, setShiftStartedAt] = useState<string>('Unavailable');
  const [locationGranted, setLocationGranted] = useState<boolean>(false);
  const [passengerSheetOpen, setPassengerSheetOpen] = useState(false);
  const [endShiftSheetOpen, setEndShiftSheetOpen] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const checkLocationPerm = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      setLocationGranted(perm.status === 'granted');
    } catch {
      setLocationGranted(false);
    }
  }, []);

  const requestLocationPerm = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(perm.status === 'granted');
      if (perm.status === 'granted') setShiftError('');
    } catch {
      setLocationGranted(false);
    }
  };

  useEffect(() => {
    void checkLocationPerm();
  }, [checkLocationPerm]);

  const publishPosition = useCallback(async (activeVehicleId: string, coords: Location.LocationObjectCoords) => {
    const rawKph = coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null;
    if (rawKph != null && rawKph > 130) {
      setTelemetryError('');
      return;
    }
    const { error } = await supabase.from('vehicle_positions').insert({
      vehicle_id: activeVehicleId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed: rawKph,
      heading: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
    });
    if (error) throw new Error(error.message);
    setCurrentPosition(coords);
    setTelemetryError('');
  }, []);

  const startGpsTracking = useCallback(
    async (activeVehicleId: string, permissionGranted = false) => {
      if (!permissionGranted) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationGranted(status === 'granted');
        if (status !== 'granted') throw new Error('Allow location access to monitor this active shift.');
      }
      locationSub.current?.remove();
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        async (loc) => {
          setCurrentPosition(loc.coords);
          try {
            await publishPosition(activeVehicleId, loc.coords);
          } catch {
            setTelemetryError('GPS is not reaching the fleet monitor. Check your connection.');
          }
        }
      );
    },
    [publishPosition]
  );

  useEffect(() => {
    void offlineTransit.getTransitData().then((data) => {
      const validRoutes = data.routes.filter((route) => !route.is_coming_soon);
      setRoutes(validRoutes);
      setMapRoutes(validRoutes);
      if (data.status !== 'ready') setShiftError(data.syncedAt ? `Routes cached at ${new Date(data.syncedAt).toLocaleString()}; refresh unavailable.` : 'Routes unavailable.');
      setMapTerminals(data.terminals);
      if (validRoutes.length > 0) {
        setSelectedRoute((prev) => prev || validRoutes[0].id);
      }
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
        await startGpsTracking(data.id);
      } catch {
        setTelemetryError('GPS monitoring is paused. Allow location access and reopen this shift.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, startGpsTracking]);

  const updatePassengerCount = async (nextCount: number) => {
    if (maxCapacity == null) { setShiftError('Vehicle capacity unavailable.'); return; }
    const clamped = Math.max(0, Math.min(maxCapacity, nextCount));
    triggerHaptic('light');
    if (!vehicleId) return;
    const { error } = await supabase.from('vehicles').update({ passenger_count: clamped }).eq('id', vehicleId);
    if (error) { setShiftError('Passenger count could not be saved.'); return; }
    setPassengerCount(clamped);
  };

  const toggleShift = async () => {
    if (starting) return;
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
        locationSub.current?.remove();
        locationSub.current = null;
        stopAnomalyDetection();
        setVehicleId(null);
        setCurrentPosition(null);
        setPassengerCount(0);
        setTelemetryError('');
        setEndShiftSheetOpen(false);
        setIsActive(false);
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

      const permission = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(permission.status === 'granted');
      if (permission.status !== 'granted') throw new Error('Allow location access to start a live shift.');
      const firstFix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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
      await publishPosition(newVehicleId, firstFix.coords);
      await startGpsTracking(newVehicleId, true);
      setVehicleId(newVehicleId);
      setPassengerCount(0);
      setIsActive(true);
      triggerHaptic('success');
      startAnomalyDetection(newVehicleId);
    } catch (error) {
      triggerHaptic('error');
      let rollbackFailed = false;
      if (insertedId) {
        locationSub.current?.remove();
        locationSub.current = null;
        const rollback = await supabase
          .from('vehicles')
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq('id', insertedId);
        rollbackFailed = Boolean(rollback.error);
      }
      const message =
        error instanceof Error ? error.message : 'The shift could not start. Check your connection and try again.';
      setShiftError(
        rollbackFailed ? `${message} The unit may still appear active. Ask a supervisor to check it.` : message
      );
    } finally {
      setStarting(false);
    }
  };

  const currentRouteName = routes.find((r) => r.id === selectedRoute)?.name || 'Route unavailable';
  const currentSpeedKph = currentPosition?.speed != null && currentPosition.speed >= 0 ? Math.round(currentPosition.speed * 3.6) : null;
  const seatStatus = maxCapacity == null || passengerCount == null ? null :
    passengerCount >= maxCapacity
      ? 'Puno'
      : passengerCount >= Math.ceil(maxCapacity * 0.7)
        ? 'Sakto'
        : 'Maluwag';

  const liveVehicle: VehicleData | null =
    vehicleId && currentPosition
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
          passenger_count: passengerCount,
          max_capacity: maxCapacity,
          is_full: maxCapacity == null || passengerCount == null ? null : passengerCount >= maxCapacity,
          status: seatStatus,
        }
      : null;

  return (
    <View style={styles.container}>
      {!isActive ? (
        /* BOARD 01: START YOUR SHIFT */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Start your shift</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Route</Text>
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
            <Text style={styles.fieldHelper}>{routes.find(route => route.id === selectedRoute)?.description || 'Route description unavailable'}</Text>

            {routeMenuOpen && (
              <View style={styles.optionList}>
                {routes.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.optionRow, selectedRoute === r.id && { backgroundColor: Colors.paleGreen }]}
                    onPress={() => {
                      setSelectedRoute(r.id);
                      setRouteMenuOpen(false);
                      setShiftError('');
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.optionTitle}>{r.name}</Text>
                    {selectedRoute === r.id && <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Assigned unit</Text>
            <View style={{ gap: 10 }}>
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
                        color={isSelected && !busy ? Colors.brandGreen : Colors.subtleGray}
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

          {/* Location Permission State (Board 01 middle vs right) */}
          {locationGranted ? (
            <View style={styles.locationEnabledRow}>
              <Ionicons name="location-outline" size={20} color={Colors.brandGreen} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="checkmark" size={15} color={Colors.brandGreen} />
                  <Text style={styles.locationEnabledTitle}>Location enabled</Text>
                </View>
                <Text style={styles.fieldHelper}>Your GPS location will be shared while on duty.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.locationRequiredBox}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Ionicons name="location-outline" size={20} color={Colors.ink} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.unitTitle}>Location is required</Text>
                  <Text style={styles.fieldHelper}>
                    Allow location access to share your unit position while on duty.
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

          {!!shiftError && (
            <Text accessibilityRole="alert" style={styles.shiftError}>
              {shiftError}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, (!locationGranted || starting) && styles.disabledBtn]}
            onPress={toggleShift}
            disabled={!locationGranted || starting}
            accessibilityRole="button"
            accessibilityState={{ disabled: !locationGranted || starting, busy: starting }}
          >
            {starting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={[styles.primaryBtnText, !locationGranted && { color: Colors.subtleGray }]}>
                Start shift
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* BOARD 02 LEFT: ON DUTY */
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.onDutyHeaderRow}>
            <Text style={styles.pageTitle}>On duty</Text>
            <View style={styles.shiftActivePill}>
              <View style={styles.greenDot} />
              <Text style={styles.shiftActiveText}>Shift active</Text>
            </View>
          </View>

          <View style={styles.vehicleIdentityRow}>
            <View style={styles.busCircle}>
              <Ionicons name="bus-outline" size={20} color={Colors.brandGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unitTitle}>
                {bodyNumber} · {plateNumber}
              </Text>
              <Text style={styles.unitPlate}>{currentRouteName}</Text>
            </View>
          </View>

          <View style={styles.mapFrame}>
            <LeafletMap
              routes={mapRoutes}
              terminals={mapTerminals}
              vehicles={liveVehicle ? [liveVehicle] : []}
              selectedVehicle={liveVehicle}
              fleetMode
            />
            <View style={styles.gpsOverlayPill}>
              <View style={styles.greenDot} />
              <Text style={styles.gpsOverlayText}>
                {currentPosition ? 'GPS updated just now' : 'Waiting for GPS fix…'}
              </Text>
            </View>
          </View>

          {!!telemetryError && (
            <Text accessibilityRole="alert" style={styles.shiftError}>
              {telemetryError}
            </Text>
          )}

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
                {currentSpeedKph ?? 'Unavailable'} <Text style={styles.telemetryUnit}>km/h</Text>
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

          <View style={styles.routeStatusRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />
              <Text style={styles.onRouteText}>On route</Text>
            </View>
            <Text style={styles.startedTimeText}>Started {shiftStartedAt}</Text>
          </View>

          {/* Tappable Passengers Row -> Opens Passenger Count Sheet */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Update passenger count"
            onPress={() => setPassengerSheetOpen(true)}
            style={styles.passengersRow}
          >
            <View style={styles.busCircle}>
              <Ionicons name="people-outline" size={20} color={Colors.brandGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unitTitle}>Passengers</Text>
              <Text style={styles.unitPlate}>Update seats when safely stopped.</Text>
            </View>
            <Text style={styles.passengerCountNum}>{passengerCount ?? 'Unavailable'}</Text>
            <View style={styles.seatStatusPill}>
              <Text style={styles.seatStatusText}>{seatStatus || 'Occupancy unavailable'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
          </TouchableOpacity>

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

      {/* BOARD 02 MIDDLE: PASSENGER COUNT BOTTOM SHEET */}
      <BottomSheetModal
        visible={passengerSheetOpen}
        onClose={() => setPassengerSheetOpen(false)}
        maxWidth={480}
        contentContainerStyle={{ gap: 16 }}
      >
        <View style={styles.sheetHeaderRow}>
          <View>
            <Text style={styles.sheetTitle}>Passenger count</Text>
            <Text style={styles.unitPlate}>
              {bodyNumber || 'Unit unavailable'} · {currentRouteName || 'Route unavailable'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close passenger count"
            onPress={() => setPassengerSheetOpen(false)}
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={24} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.stepperBox}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => updatePassengerCount((passengerCount ?? 0) - 1)}
            accessibilityLabel="Decrease passenger count"
          >
            <Ionicons name="remove" size={24} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{passengerCount ?? 'Unavailable'}</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => updatePassengerCount((passengerCount ?? 0) + 1)}
            accessibilityLabel="Increase passenger count"
          >
            <Ionicons name="add" size={24} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldHelper}>Enter the observed passenger count. Changes are saved to this shift.</Text>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setPassengerSheetOpen(false)}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </BottomSheetModal>

      {/* BOARD 03 RIGHT: END SHIFT CONFIRMATION BOTTOM SHEET */}
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
          disabled={starting}
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
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  optionList: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
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
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  unitRadioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  unitRadioCardSelected: {
    backgroundColor: Colors.paleGreen,
    borderColor: Colors.brandGreen,
    borderWidth: 1.5,
  },
  unitRadioCardBusy: {
    backgroundColor: Colors.canvas,
    opacity: 0.75,
  },
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
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  locationEnabledTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  locationRequiredBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    gap: 12,
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
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  shiftError: {
    color: Colors.primaryRed,
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.primaryRed,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  onDutyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shiftActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brandGreen,
  },
  shiftActiveText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  vehicleIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 4,
  },
  busCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFrame: {
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  gpsOverlayPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gpsOverlayText: {
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
  routeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  onRouteText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  startedTimeText: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  passengersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  passengerCountNum: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
    fontVariant: ['tabular-nums'],
  },
  seatStatusPill: {
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  seatStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  endShiftOutlineBtn: {
    minHeight: 52,
    borderRadius: 12,
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
    borderRadius: 12,
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
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.paleGreen,
    borderColor: Colors.brandGreen,
    borderWidth: 1.5,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
  },
  presetChipTextActive: {
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  liveUpdatedText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brandGreen,
  },
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
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  keepActiveBtn: {
    minHeight: 50,
    borderRadius: 12,
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
    borderRadius: 12,
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
