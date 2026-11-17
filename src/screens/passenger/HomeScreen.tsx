import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Linking, Platform, Vibration, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap, { type LeafletMapRef } from '../../components/LeafletMap';
import PassengerStopGuide from '../../components/PassengerStopGuide';
import { passengerStyles as s } from '../../components/PassengerUI';
import { FormScrollView, triggerHaptic } from '../../components/AppUI';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { type TerminalData, type VehicleData } from '../../services/offlineTransitService';
import { loadLoadingZones } from '../../services/passengerDataService';
import { evaluateBoardingLocation, type LoadingZone } from '../../services/passengerSafety';
import { searchPassengerPlaces } from '../../services/placeSearchService';
import { type PassengerPlace } from '../../services/passengerPlaces';
import { locationDescription, locationQuality } from '../../services/locationQuality';
import { rideLeg, selectJourneyStop } from '../../services/routeMap';
import { Colors } from '../../constants/theme';

export default function PassengerHomeScreen({ route, navigation }: any) {
  const { fix, quality, errorMsg, foreground, enableLocation } = useLocation();
  const { isConnected } = useNetwork();
  const { unit, setUnit, destination, setDestination, place, setPlace, vehicles, vehicleError, nearby, endRide, selectedRouteId, setSelectedRouteId, boardingStop, setBoardingStop, alightingStop, walkingRoutes, transit } = usePassengerJourney();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const map = useRef<LeafletMapRef>(null);

  const stops = transit.terminals;
  const routes = transit.routes;
  const [inspectedStop, setInspectedStop] = useState<TerminalData | null>(null);
  const [query, setQuery] = useState(place?.name || destination?.name || '');
  const [searchOpen, setSearchOpen] = useState(false);
  const [boardingOpen, setBoardingOpen] = useState(false);
  const [places, setPlaces] = useState<PassengerPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);
  const searchVersion = useRef(0);
  const [selected, setSelected] = useState<VehicleData | null>(null);
  const [zones, setZones] = useState<LoadingZone[]>([]);
  const [now, setNow] = useState(Date.now());
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState(false);

  useEffect(() => {
    if (route?.params?.showStopGuide) {
      setBoardingOpen(true);
      setSearchOpen(false);
    }
  }, [route?.params?.showStopGuide]);

  const refreshZones = async () => {
    setZonesLoading(true);
    setZonesError(false);
    try {
      setZones(await loadLoadingZones());
    } catch {
      setZonesError(true);
    } finally {
      setZonesLoading(false);
    }
  };

  const lastWarning = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setZonesLoading(true);
    loadLoadingZones()
      .then((data) => {
        if (active) {
          setZones(data);
          setZonesError(false);
        }
      })
      .catch(() => {
        if (active) setZonesError(true);
      })
      .finally(() => {
        if (active) setZonesLoading(false);
      });
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isConnected]);

  const boarding = evaluateBoardingLocation(foreground && !errorMsg ? fix : null, zonesError ? [] : zones, now);
  const warningKey = boarding.kind === 'prohibited' ? boarding.zone!.id : null;
  useEffect(() => {
    if (warningKey && lastWarning.current !== warningKey) {
      if (Platform.OS !== 'web') Vibration.vibrate([0, 150, 100, 150]);
    }
    lastWarning.current = warningKey;
  }, [warningKey]);

  const activeStop = inspectedStop ? stops.find(stop => stop.id === inspectedStop.id && (!selectedRouteId || stop.route_id === selectedRouteId)) ?? null : null;
  const stopBadgeCode = activeStop ? 'VERIFIED STOP' : 'NO STOP SELECTED';
  const routeName = (id?: string) => routes.find(item => item.id === id)?.name || 'Route unavailable';

  const routeStops = stops.filter(t => !selectedRouteId || t.route_id === selectedRouteId).sort((a, b) => a.sequence_order - b.sequence_order);
  const results = routeStops.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const allModeVehicles = isConnected ? vehicles.filter(vehicle => !vehicle.is_sample && ['live', 'weak'].includes(locationQuality({ ...vehicle, timestamp: Date.parse(vehicle.recorded_at || '') }, now))) : [];
  const displayed = selectedRouteId
    ? allModeVehicles.filter((v) => v.route_id === selectedRouteId)
    : allModeVehicles;
  const currentSelected = selected
    ? displayed.find((v) => v.vehicle_id === selected.vehicle_id) || null
    : null;
  const locationFresh = foreground && !errorMsg && quality === 'live';

  const chooseDestination = (stop: TerminalData) => {
    triggerHaptic('light');
    setInspectedStop(stop);
    setSearchOpen(false);
    setSelected(null);
  };

  const searchPlaces = async () => {
    const version = ++searchVersion.current;
    setSearching(true);
    setSearchError('');
    setSearchOpen(true);
    try {
      const found = await searchPassengerPlaces(query);
      if (version === searchVersion.current) {
        setPlaces(found);
        setSearched(true);
      }
    } catch (error: any) {
      if (version === searchVersion.current) setSearchError(error.message);
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  };

  const choosePlace = (value: PassengerPlace) => {
    triggerHaptic('light');
    setPlace(value);
    setDestination(null);
    setQuery(value.name);
    setSearchOpen(false);
    setSelected(null);
  };

  const selectVehicle = (vehicle: VehicleData) => {
    triggerHaptic('light');
    setSelected(vehicle);
  };

  const boardUnit = (vehicle: VehicleData) => {
    if (vehicle.is_sample || !nearby.some(item => item.vehicle_id === vehicle.vehicle_id)) return;
    triggerHaptic('success');
    setUnit({
      vehicle_id: vehicle.vehicle_id,
      body_number: vehicle.body_number,
      plate_number: vehicle.plate_number,
      source: 'confirmed',
    });
    setBoardingOpen(false);
  };

  const selectedRoute = routes.find(r => r.id === selectedRouteId);
  const selection = { selectedRouteId, boardingStop, alightingStop };
  const canChooseStop = (role: 'boarding' | 'alighting') => activeStop && selectJourneyStop(selection, activeStop, role, routes, stops) !== selection;
  const transitNotice = transit.status === 'ready'
    ? (routes.length ? `Routes read ${transit.syncedAt ? new Date(transit.syncedAt).toLocaleString() : 'at an unknown time'}.` : 'No published active routes.')
    : transit.syncedAt ? `Cached routes from ${new Date(transit.syncedAt).toLocaleString()}; refresh unavailable.` : transit.error || 'Route data unavailable.';
  const journeyControls = <View style={{ padding: 16, gap: 10 }}>
    <Text style={s.muted}>{transitNotice}</Text>
    <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !selectedRouteId }} onPress={() => { setSelectedRouteId(null); setInspectedStop(null); }} style={s.input}><Text>All routes</Text></TouchableOpacity>
      {routes.map(r => <TouchableOpacity key={r.id} accessibilityRole="button" accessibilityState={{ selected: r.id === selectedRouteId }} onPress={() => { setSelectedRouteId(r.id); setInspectedStop(null); setSelected(null); }} style={[s.input, r.id === selectedRouteId && { backgroundColor: Colors.paleGreen }]}><Text>{r.name}</Text></TouchableOpacity>)}
    </ScrollView>
    {!(selectedRoute ? selectedRoute.coordinates.length > 1 : routes.some(r => r.coordinates.length > 1)) && <Text style={s.muted}>Verified route geometry unavailable. No route line can be shown.</Text>}
    {!routeStops.length && <Text style={s.muted}>Verified stop locations unavailable for this selection.</Text>}
    <Text style={s.muted}>Boarding: {boardingStop?.name || 'Not selected'} · Alighting: {alightingStop?.name || 'Not selected'}</Text>
    <Text style={s.muted}>Destination place: {place?.name || 'Not selected'}</Text>
    {boardingStop && alightingStop && !rideLeg(selectedRoute, boardingStop, alightingStop).length && <Text style={s.muted}>Ride leg unavailable: verified geometry must connect these stops in route order.</Text>}
    {!!selectedRoute?.coordinates.length && <Text style={s.muted}>Arrows follow published geometry order. Green highlights the selected ride leg.</Text>}
    {!!activeStop && <View style={{ gap: 8 }}>
      <Text style={s.label}>{activeStop.name} · {routeName(activeStop.route_id)}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TouchableOpacity accessibilityRole="button" disabled={!canChooseStop('boarding')} accessibilityState={{ disabled: !canChooseStop('boarding') }} onPress={() => setBoardingStop(activeStop)} style={[s.input, !canChooseStop('boarding') && { opacity: 0.5 }]}><Text>Board here</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={!canChooseStop('alighting')} accessibilityState={{ disabled: !canChooseStop('alighting') }} onPress={() => setDestination(activeStop)} style={[s.input, !canChooseStop('alighting') && { opacity: 0.5 }]}><Text>Alight here</Text></TouchableOpacity>
      </View>
      <Text style={s.muted}>Choose stops on the same route, with boarding before alighting. A stop marker does not verify a loading boundary.</Text>
    </View>}
    {(boardingStop || alightingStop) && <TouchableOpacity accessibilityRole="button" onPress={() => { setBoardingStop(null); setDestination(null); }}><Text style={s.muted}>Clear boarding and alighting stops</Text></TouchableOpacity>}
    <Text style={s.muted}>{errorMsg || locationDescription(fix, now)}</Text>
    <Text style={s.muted}>Foreground GPS only. The regional map center is not your location.</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => void enableLocation()} style={s.input}><Text>Enable location</Text></TouchableOpacity>
    {locationFresh && fix && <TouchableOpacity accessibilityRole="button" onPress={() => map.current?.centerOn(fix.latitude, fix.longitude)} style={s.input}><Text>Center on my location</Text></TouchableOpacity>}
  </View>;
  const journeyMapProps = { routes, terminals: routeStops, selectedRouteId, boardingStop, alightingStop, walkingRoutes, selectedTerminal: activeStop, onSelectTerminal: chooseDestination };

  // 1) DESTINATION SEARCH VIEW (Board 01 right)
  if (searchOpen) {
    return (
      <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={styles.sheetScreen}>
        <View style={styles.subHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to map"
            onPress={() => setSearchOpen(false)}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.subHeaderTitle}>Find a destination</Text>
        </View>

        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={20} color={Colors.subtleGray} />
          <TextInput
            accessibilityLabel="Search destination"
            value={query}
            autoFocus
            onChangeText={(value) => {
              searchVersion.current++;
              setQuery(value);
              setPlaces([]);
              setSearched(false);
              setSearching(false);
              setSearchError('');
            }}
            onSubmitEditing={searchPlaces}
            returnKeyType="search"
            enterKeyHint="search"
            placeholder="MRT Buendia, Circuit Makati, or street..."
            placeholderTextColor={Colors.subtleGray}
            style={styles.searchInputText}
          />
          {query.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                setQuery('');
                setPlaces([]);
                setSearched(false);
              }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.subtleGray} />
            </TouchableOpacity>
          )}
        </View>

        {query.trim().length >= 3 && (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={searching}
            onPress={searchPlaces}
            style={[s.button, { minHeight: 46 }]}
          >
            <Ionicons name="search" size={18} color={Colors.white} />
            <Text style={s.buttonText}>{searching ? 'Searching places…' : `Search "${query.trim()}"`}</Text>
          </TouchableOpacity>
        )}

        {!!searchError && <Text accessibilityRole="alert" style={s.body}>{searchError}</Text>}

        {/* Places section */}
        <View style={styles.listGroup}>
          <Text style={styles.groupHeading}>Places</Text>
          {places.length > 0 ? (
            places.map((value) => (
              <TouchableOpacity
                key={value.id}
                accessibilityRole="button"
                onPress={() => choosePlace(value)}
                style={styles.dividerRow}
              >
                <Ionicons name="location-outline" size={20} color={Colors.brandGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{value.name}</Text>
                  <Text style={styles.rowSubtitle}>{value.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
              </TouchableOpacity>
            ))
          ) : (
            results.slice(0, 2).map((stop) => (
              <TouchableOpacity
                key={`place-${stop.id}`}
                accessibilityRole="button"
                onPress={() => chooseDestination(stop)}
                style={styles.dividerRow}
              >
                <Ionicons name="location-outline" size={20} color={Colors.brandGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{stop.name}</Text>
                  <Text style={styles.rowSubtitle}>{routeName(stop.route_id)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
              </TouchableOpacity>
            ))
          )}
          {searched && !places.length && !searching && (
            <Text style={[s.muted, { paddingVertical: 8 }]}>No places found. Add a street or city name and search again.</Text>
          )}
        </View>

        {/* Route stops section */}
        <View style={styles.listGroup}>
          <Text style={styles.groupHeading}>Route stops</Text>
          {!routeStops.length && <Text style={s.muted}>No verified stop locations for this selection.</Text>}
          {(query ? results : routeStops).map((stop) => {
            const num = Number.isFinite(stop.sequence_order) ? String(stop.sequence_order) : '—';
            return (
              <TouchableOpacity
                key={stop.id}
                accessibilityRole="button"
                onPress={() => chooseDestination(stop)}
                style={styles.dividerRow}
              >
                <View style={styles.stopNumBox}>
                  <Text style={styles.stopNumText}>{num}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{stop.name}</Text>
                  <Text style={styles.rowSubtitle}>{routeName(stop.route_id)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
          <Text style={s.muted}>Place search: OpenStreetMap / Photon · Metro Manila</Text>
        </TouchableOpacity>
      </FormScrollView>
    );
  }

  // 2) WHERE TO BOARD VIEW (Board 02 left)
  if (boardingOpen) {
    const targetVehicle = currentSelected;
    const canBoardLive = targetVehicle && !targetVehicle.is_sample && nearby.some((v) => v.vehicle_id === targetVehicle.vehicle_id);
    const isProhibited = boarding.kind === 'prohibited';

    return (
      <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={styles.sheetScreen}>
        <View style={styles.subHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to map"
            onPress={() => setBoardingOpen(false)}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.subHeaderTitle}>Where to board</Text>
        </View>

        <View style={styles.mapFrameSmall}>
          <LeafletMap
            ref={map}
            destinationPlace={place}
            hideOccupancy
            {...journeyMapProps}
            vehicles={displayed}
            userLocation={locationFresh ? fix : null}
            selectedVehicle={targetVehicle}
            isOffline={!isConnected}
            onSelectVehicle={selectVehicle}
          />
          <View style={styles.loadingBayOverlay}>
            <Text style={styles.loadingBayOverlayText}>{boarding.kind === 'allowed' ? 'Loading bay' : 'Loading area unverified'}</Text>
          </View>
        </View>

        {journeyControls}
        <View style={[styles.boardingStatusRow, isProhibited && styles.boardingStatusDanger]}>
          <Ionicons
            name={isProhibited ? 'warning' : boarding.kind === 'allowed' ? 'checkmark-circle' : 'information-circle'}
            size={22}
            color={isProhibited ? Colors.primaryRed : Colors.brandGreen}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, isProhibited && { color: Colors.primaryRed }]}>
              {boarding.title}
            </Text>
            <Text style={styles.rowSubtitle}>
              {boarding.detail}
            </Text>
          </View>
        </View>

        <View style={styles.stopSummaryRow}>
          <View style={styles.stopBadgePill}>
            <Text style={styles.stopBadgeText}>{stopBadgeCode}</Text>
          </View>
          <Text style={[styles.rowTitle, { fontSize: 17 }]}>{boardingStop?.name || 'Boarding stop not selected'}</Text>
        </View>

        <View style={s.divider} />

        {targetVehicle && (
          <View style={styles.unitRowCard}>
            <View style={styles.unitIconCircle}>
              <Ionicons name="bus-outline" size={20} color={Colors.brandGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.unitCodeText}>{targetVehicle.body_number}</Text>
                <Text style={styles.rowSubtitle}>Plate {targetVehicle.plate_number}</Text>
              </View>
              <Text style={styles.rowSubtitle}>{routeName(targetVehicle.route_id)}</Text>
            </View>
            <View style={styles.seatBadge}>
              <Text style={styles.seatBadgeText}>{targetVehicle.status || 'Occupancy unavailable'}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canBoardLive}
          accessibilityState={{ disabled: !canBoardLive }}
          onPress={() => targetVehicle && canBoardLive && boardUnit(targetVehicle)}
          style={s.button}
        >
          <Text style={s.buttonText}>I boarded this unit</Text>
        </TouchableOpacity>

        {!canBoardLive && <Text style={s.muted}>Select a nearby unit with current GPS to confirm your ride.</Text>}

        <PassengerStopGuide
          openRequest={route?.params?.showStopGuide}
          boarding={boarding}
          zones={zones}
          landmarks={stops}
          onRefresh={refreshZones}
          loading={zonesLoading}
          loadError={zonesError}
        />
      </FormScrollView>
    );
  }

  // 3) YOUR RIDE LINKED VIEW (Board 02 middle)
  if (unit) {
    return (
      <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={{ flexGrow: 1, backgroundColor: Colors.paper }}>
        <View style={styles.rideHeaderBar}>
          <Text style={styles.subHeaderTitle}>Your ride</Text>
          <View style={styles.linkedPill}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.brandGreen} />
            <Text style={styles.linkedPillText}>Unit linked</Text>
          </View>
        </View>

        <View style={{ height: 250, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border }}>
          <LeafletMap
            ref={map}
            destinationPlace={place}
            hideOccupancy
            {...journeyMapProps}
            vehicles={displayed}
            userLocation={locationFresh ? fix : null}
            selectedVehicle={currentSelected}
            isOffline={!isConnected}
            onSelectVehicle={selectVehicle}
          />
        </View>

        {journeyControls}
        <View style={styles.bottomSheetSurface}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetHeading}>You're riding {unit.body_number}</Text>

          <View style={styles.kvList}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Plate</Text>
              <Text style={styles.kvValue}>{unit.plate_number || 'Unavailable'}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Route</Text>
              <Text style={styles.kvValue}>{routeName(vehicles.find(v => v.vehicle_id === unit.vehicle_id)?.route_id)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Direction</Text>
              <Text style={styles.kvValue}>{destination?.name || 'Unavailable'}</Text>
            </View>
          </View>

          <Text style={s.muted}>Your unit details are included with SOS.</Text>

          <View style={styles.actionRowsGroup}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => navigation.navigate('Fares')}
              style={styles.dividerRow}
            >
              <Ionicons name="ticket-outline" size={20} color={Colors.brandGreen} />
              <Text style={[styles.rowTitle, { flex: 1 }]}>Check fare</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => navigation.navigate('Safety')}
              style={styles.dividerRow}
            >
              <Ionicons name="shield-outline" size={20} color={Colors.primaryRed} />
              <Text style={[styles.rowTitle, { flex: 1 }]}>Safety & SOS</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              triggerHaptic('light');
              endRide();
              setSelected(null);
            }}
            style={styles.endRideBtn}
          >
            <Text style={styles.endRideText}>End ride</Text>
          </TouchableOpacity>
        </View>
      </FormScrollView>
    );
  }

  // 4) DEFAULT MAP COCKPIT VIEW (Board 01 middle)
  return (
    <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={{ flexGrow: 1, backgroundColor: Colors.paper }}>
      {/* Top Search & Mode Control */}
      <View style={styles.topControls}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Where are you going? Search destination"
          onPress={() => setSearchOpen(true)}
          style={styles.searchTrigger}
        >
          <Ionicons name="search-outline" size={20} color={Colors.subtleGray} />
          <Text
            numberOfLines={1}
            style={[
              styles.searchTriggerText,
              (place || destination) && { color: Colors.ink, fontWeight: '600' },
            ]}
          >
            {place?.name || destination?.name || 'Where are you going?'}
          </Text>
        </TouchableOpacity>

        <Text style={s.muted}>{vehicleError || (!displayed.length ? 'No current vehicle locations available.' : 'Select a unit on the map.')}</Text>
      </View>

      {/* Street Map */}
      <View style={styles.mapContainer}>
        <LeafletMap
          ref={map}
          destinationPlace={place}
          hideOccupancy
          {...journeyMapProps}
          vehicles={displayed}
          userLocation={locationFresh ? fix : null}
          selectedVehicle={currentSelected}
          isOffline={!isConnected}
          onSelectVehicle={selectVehicle}
        />
        <View style={styles.updatedPill}>
          <View style={styles.liveDot} />
          <Text style={styles.updatedPillText}>
            {!isConnected ? 'Offline' : currentSelected?.recorded_at ? `GPS measured ${new Date(currentSelected.recorded_at).toLocaleTimeString()}` : 'No unit selected'}
          </Text>
        </View>
      </View>

      {journeyControls}
      {/* Bottom Sheet Card */}
      <View style={styles.bottomSheetSurface}>
        <View style={styles.sheetHandle} />
        <Text style={styles.nearbyLabel}>Selected stop</Text>

        <View style={styles.stopHeroRow}>
          <View style={styles.stopBadgePill}>
            <Text style={styles.stopBadgeText}>{stopBadgeCode}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopHeroName}>{activeStop?.name || 'Choose a verified stop'}</Text>
            <Text style={styles.rowSubtitle}>Select a stop, then choose Board here or Alight here</Text>
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setSearchOpen(true)}
          style={styles.dividerRow}
        >
          <View style={styles.unitIconCircle}>
            <Ionicons name="bus-outline" size={19} color={Colors.brandGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{routeName(selectedRouteId || undefined)}</Text>
            <Text style={styles.rowSubtitle}>{alightingStop?.name || 'Alighting stop not selected'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setBoardingOpen(true)}
          style={[s.button, { marginTop: 4 }]}
        >
          <Text style={s.buttonText}>Where to board</Text>
        </TouchableOpacity>
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  topControls: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: Colors.paper,
  },
  searchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchTriggerText: {
    flex: 1,
    fontSize: 16,
    color: Colors.subtleGray,
  },
  segmentWrap: {
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  segmentBtnActive: {
    backgroundColor: Colors.paleGreen,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  segmentTextActive: {
    color: Colors.brandGreen,
    fontWeight: '700',
  },
  mapContainer: {
    height: 290,
    position: 'relative',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  updatedPill: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brandGreen,
  },
  updatedPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink,
  },
  bottomSheetSurface: {
    flex: 1,
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  nearbyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  stopHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stopBadgePill: {
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 2,
  },
  stopBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  stopHeroName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  unitIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  rowSubtitle: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  sheetScreen: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 14,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 4,
    marginLeft: -4,
  },
  subHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInputText: {
    flex: 1,
    fontSize: 16,
    color: Colors.ink,
    paddingVertical: 10,
  },
  listGroup: {
    marginTop: 4,
  },
  groupHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.subtleGray,
    marginBottom: 6,
  },
  stopNumBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  mapFrameSmall: {
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  loadingBayOverlay: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.brandGreen,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  loadingBayOverlayText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  boardingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.paleGreen,
  },
  boardingStatusDanger: {
    backgroundColor: Colors.dangerBg,
  },
  stopSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unitRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  unitCodeText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
  },
  seatBadge: {
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  seatBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandGreen,
  },

  rideHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  linkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  linkedPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  sheetHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink,
  },
  kvList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  kvLabel: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  kvValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  actionRowsGroup: {
    marginTop: 4,
  },
  endRideBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  endRideText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.subtleGray,
  },
});
