import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Keyboard, Linking, Platform, Vibration, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap, { type LeafletMapRef } from '../../components/LeafletMap';
import PassengerStopGuide from '../../components/PassengerStopGuide';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import WalkingDirectionsPanel from '../../components/WalkingDirectionsPanel';
import { FormScrollView, triggerHaptic } from '../../components/AppUI';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { type TerminalData, type VehicleData } from '../../services/offlineTransitService';
import { loadLoadingZones, loadPassengerFareData } from '../../services/passengerDataService';
import { quotePassengerFare, validFareMatrix, verifiedRideDistance } from '../../services/passengerFare';
import { DESTINATION_RADIUS_METERS, STOP_SEARCH_METERS, atPassengerDestination, passengerPlanRide } from '../../services/passengerTrip';
import { distanceMeters, evaluateBoardingLocation, type LoadingZone } from '../../services/passengerSafety';
import { getWalkingDirections, type WalkingRoute } from '../../services/walkingDirections';
import { searchPassengerPlaces } from '../../services/placeSearchService';
import { type PassengerPlace } from '../../services/passengerPlaces';
import { locationDescription, locationQuality, vehicleTelemetryReadout } from '../../services/locationQuality';
import { rideLeg, selectJourneyStop, confirmedPassengerUse, permitsPassengerUse, passengerStopOptions, passengerUseLabel } from '../../services/routeMap';
import { Colors } from '../../constants/theme';
import { manilaDateKey } from '../../utils/reportingPeriod';

export default function PassengerHomeScreen({ route, navigation }: any) {
  const { fix, quality, errorMsg, foreground, enableLocation } = useLocation();
  const { isConnected } = useNetwork();
  const { user, getAccessToken } = useAuth();
  const { unit, setUnit, destination, setDestination, place, setPlace, vehicles, vehicleError, nearby, endRide, selectedRouteId, setSelectedRouteId, boardingStop, setBoardingStop, alightingStop, setRideStops, walkingRoutes, transit, refreshTransit, walk, showWalk, getJourneyVersion } = usePassengerJourney();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const map = useRef<LeafletMapRef>(null);
  const destinationInput = useRef<React.ElementRef<typeof TextInput>>(null);
  const wide = useWindowDimensions().width >= 860;
  const pendingPlace = useRef<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const stops = transit.terminals;
  const routes = transit.routes;
  const [inspectedStop, setInspectedStop] = useState<TerminalData | null>(null);
  const [query, setQuery] = useState(place?.name || destination?.name || '');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!searchOpen) setQuery(place?.name || destination?.name || '');
  }, [searchOpen, place?.name, destination?.name]);
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
  const zoneRequest = useRef(0);
  const [walkingBusy, setWalkingBusy] = useState(false);
  const [walkingError, setWalkingError] = useState('');
  const [destinationWalks, setDestinationWalks] = useState<Record<string, WalkingRoute>>({});
  const walkingRequest = useRef(0);
  useEffect(() => {
    walkingRequest.current++;
    setWalkingBusy(false); setWalkingError(''); setDestinationWalks({});
    return () => { walkingRequest.current++; };
  }, [user?.id, selectedRouteId, boardingStop?.id, alightingStop?.id, place?.id, transit.syncedAt]);
  useEffect(() => () => { searchVersion.current++; }, [user?.id]);

  useEffect(() => {
    if (route?.params?.showStopGuide) {
      setBoardingOpen(true);
      setSearchOpen(false);
    }
  }, [route?.params?.showStopGuide]);

  const refreshZones = async () => {
    const request = ++zoneRequest.current;
    setZonesLoading(true);
    setZonesError(false);
    try {
      const [data] = await Promise.all([loadLoadingZones(), refreshTransit()]);
      if (request === zoneRequest.current) setZones(data);
    } catch {
      if (request === zoneRequest.current) setZonesError(true);
    } finally {
      if (request === zoneRequest.current) setZonesLoading(false);
    }
  };

  const lastWarning = useRef<string | null>(null);
  useEffect(() => {
    const request = ++zoneRequest.current;
    let active = true;
    setZonesLoading(true);
    loadLoadingZones()
      .then((data) => {
        if (active && request === zoneRequest.current) {
          setZones(data);
          setZonesError(false);
        }
      })
      .catch(() => {
        if (active && request === zoneRequest.current) setZonesError(true);
      })
      .finally(() => {
        if (active && request === zoneRequest.current) setZonesLoading(false);
      });
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      active = false;
      zoneRequest.current++;
      clearInterval(timer);
    };
  }, [isConnected]);

  const routeStops = useMemo(() => stops.filter(t => (!selectedRouteId || t.route_id === selectedRouteId) && confirmedPassengerUse(t))
    .sort((a, b) => a.sequence_order - b.sequence_order), [stops, selectedRouteId]);
  const boardingOptions = passengerStopOptions(routeStops, 'board', alightingStop);
  const alightingOptions = passengerStopOptions(routeStops, 'alight', boardingStop);
  const boarding = evaluateBoardingLocation(foreground && !errorMsg ? fix : null, zonesError ? [] : zones, now, routeStops);
  const warningKey = boarding.kind === 'prohibited' ? boarding.zone!.id : null;
  useEffect(() => {
    if (warningKey && lastWarning.current !== warningKey) {
      if (Platform.OS !== 'web') Vibration.vibrate([0, 150, 100, 150]);
    }
    lastWarning.current = warningKey;
  }, [warningKey]);

  const activeStop = routeStops.find(stop => stop.id === inspectedStop?.id) ?? null;
  const stopBadgeCode = boardingStop && permitsPassengerUse(boardingStop, 'board') ? 'BOARDING CONFIRMED' : 'NO BOARDING STOP';
  const routeName = (id?: string) => routes.find(item => item.id === id)?.name || 'Route unavailable';

  const results = routeStops.filter(t => permitsPassengerUse(t, 'alight') && t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const allModeVehicles = isConnected ? vehicles.filter(vehicle => !vehicle.is_sample && ['live', 'weak'].includes(locationQuality({ ...vehicle, timestamp: Date.parse(vehicle.recorded_at || '') }, now))) : [];
  const displayed = selectedRouteId
    ? allModeVehicles.filter((v) => v.route_id === selectedRouteId)
    : allModeVehicles;
  const currentSelected = selected
    ? displayed.find((v) => v.vehicle_id === selected.vehicle_id) || null
    : null;
  const tracked = unit || selected;
  const trackedPosition = tracked ? allModeVehicles.find(vehicle => vehicle.vehicle_id === tracked.vehicle_id) || null : null;
  const telemetry = vehicleTelemetryReadout(trackedPosition, now);
  const trackingCard = tracked && <View style={[s.section, { marginHorizontal: 16, marginTop: 12 }]}>
    <Text style={s.sectionTitle}>{tracked.body_number || tracked.plate_number || 'Selected e-jeep'}</Text>
    <Text style={s.label}>{telemetry.speed == null ? 'Speed unavailable' : `${Math.round(telemetry.speed)} km/h`}</Text>
    <Text style={s.muted}>{telemetry.gps}</Text>
  </View>;
  const locationFresh = foreground && !errorMsg && quality === 'live';
  const origin = locationFresh ? fix : null;
  const atDestination = !!place && atPassengerDestination(origin, place);
  const trip = useMemo(() => place && transit.status === 'ready'
    ? passengerPlanRide(origin, place, routes, stops, { selectedRouteId, boardingStop, alightingStop }) : null,
  [origin, place, routes, stops, selectedRouteId, boardingStop, alightingStop, transit.status]);
  useEffect(() => {
    if (!place || pendingPlace.current !== place.id || !trip || unit || !origin || locationQuality(origin) !== 'live') return;
    pendingPlace.current = null;
    setRideStops(trip.boarding, trip.alighting);
  }, [trip, origin, place, unit, setRideStops]);
  const hasTrip = Boolean(trip);
  const [tripFare, setTripFare] = useState<{ catalog: typeof transit; owner: string | undefined; data: Awaited<ReturnType<typeof loadPassengerFareData>> | null } | null>(null);
  useEffect(() => {
    if (!hasTrip) return;
    let cancelled = false;
    const owner = user?.id;
    void loadPassengerFareData().then(
      data => { if (!cancelled) setTripFare({ catalog: transit, owner, data }); },
      () => { if (!cancelled) setTripFare({ catalog: transit, owner, data: null }); },
    );
    return () => { cancelled = true; };
  }, [hasTrip, transit, user?.id]);
  const fareRead = tripFare && tripFare.catalog === transit && tripFare.owner === user?.id ? tripFare : null;
  const fareDate = manilaDateKey(new Date(now));
  const rideKm = trip && fareRead?.data ? verifiedRideDistance(trip.boarding.id, trip.alighting.id, trip.route.id, fareRead.data.segments, stops) : null;
  const matrix = trip && fareRead?.data?.matrices.find(value => validFareMatrix(value, trip.route.id, fareDate));
  const fareQuote = trip && rideKm != null ? quotePassengerFare(rideKm, 'regular', trip.route, matrix, fareDate) : null;
  const tripApplied = trip && trip.boarding.id === boardingStop?.id && trip.alighting.id === alightingStop?.id;

  const chooseDestination = (stop: TerminalData) => {
    walkingRequest.current++; setWalkingBusy(false); setWalkingError('');
    triggerHaptic('light');
    setInspectedStop(stop);
    setManualOpen(true);
    setSearchOpen(false);
    setSelected(null);
  };

  const searchPlaces = async () => {
    if (query.trim().length < 3 || searching) return;
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
    searchVersion.current++;
    destinationInput.current?.blur();
    Keyboard.dismiss();
    pendingPlace.current = value.id;
    triggerHaptic('light');
    setPlace(value);
    setSelectedRouteId(null);
    setDestination(null);
    setQuery(value.name);
    setInspectedStop(null);
    setManualOpen(false);
    setSearching(false);
    setSearched(false);
    setSearchError('');
    setPlaces([]);
    setSearchOpen(false);
    setSelected(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const chooseStopAsDestination = (stop: TerminalData) => {
    if (!permitsPassengerUse(stop, 'alight')) return;
    choosePlace({ id: `stop:${stop.id}`, name: stop.name, address: '', latitude: stop.latitude, longitude: stop.longitude });
    setInspectedStop(stop);
  };

  const selectVehicle = (vehicle: VehicleData) => {
    triggerHaptic('light');
    setSelected(vehicle);
  };

  const canBoardUnit = (vehicle: VehicleData) => boardingStop?.route_id === vehicle.route_id && permitsPassengerUse(boardingStop, 'board')
    && boarding.kind !== 'prohibited' && !vehicle.is_sample && nearby.some(item => item.vehicle_id === vehicle.vehicle_id);
  const boardUnit = (vehicle: VehicleData) => {
    if (!canBoardUnit(vehicle)) return;
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
  const destinationCandidates = place && !atDestination && transit.status === 'ready' ? routeStops.filter(stop => selectJourneyStop(selection, stop, 'alighting', routes, stops) !== selection)
    .map(stop => ({ stop, distance: distanceMeters(stop, place) })).filter(item => item.distance <= STOP_SEARCH_METERS)
    .sort((a, b) => a.distance - b.distance).slice(0, 3) : [];
  const requestWalk = async (stop: TerminalData, toPlace = false) => {
    if (!permitsPassengerUse(stop, toPlace ? 'alight' : 'board')) return;
    const request = ++walkingRequest.current;
    const journeyVersion = getJourneyVersion();
    setWalkingError('');
    const origin = toPlace ? stop : fix;
    const target = toPlace ? place : stop;
    if (!origin || !target || (!toPlace && (!locationFresh || locationQuality(fix) !== 'live'))) {
      setWalkingError('A fresh, accurate location is needed to walk from your position. Enable location and try again.');
      return;
    }
    if (!isConnected) { setWalkingError('Walking directions are unavailable offline. Reconnect and try again.'); return; }
    setWalkingBusy(true);
    try {
      const token = await getAccessToken();
      if (request !== walkingRequest.current || journeyVersion !== getJourneyVersion()) return;
      if (!toPlace && locationQuality(fix) !== 'live') { setWalkingError('Your location is no longer current. Try again after GPS updates.'); return; }
      const result = await getWalkingDirections(origin, target, token);
      if (request !== walkingRequest.current || journeyVersion !== getJourneyVersion()) return;
      if (result.status !== 'available') { setWalkingError(result.reason); return; }
      if (toPlace) setDestinationWalks(current => ({ ...current, [stop.id]: result.route }));
      showWalk(result.route, toPlace ? stop.name : 'Your location when requested', toPlace ? place!.name : stop.name, journeyVersion);
    } catch { if (request === walkingRequest.current) setWalkingError('Walking directions unavailable. Please try again.'); }
    finally { if (request === walkingRequest.current) setWalkingBusy(false); }
  };
  const transitNotice = transit.status === 'ready'
    ? (routes.length ? `Routes read ${transit.syncedAt ? new Date(transit.syncedAt).toLocaleString() : 'at an unknown time'}.` : 'No published active routes.')
    : transit.syncedAt ? `Cached routes from ${new Date(transit.syncedAt).toLocaleString()}; refresh unavailable.` : transit.error || 'Route data unavailable.';
  const hasPath = selectedRoute ? selectedRoute.coordinates.length > 1 : routes.some(item => item.coordinates.length > 1);
  const walkingFeedback = <>
    {walkingBusy && <Text accessibilityRole="alert" style={s.muted}>Finding a walking path…</Text>}
    {!!walkingError && <Text accessibilityRole="alert" style={s.muted}>{walkingError}</Text>}
    {walk && <WalkingDirectionsPanel {...walk} />}
  </>;
  const rideStatus = transit.status !== 'ready' || !routeStops.length || !hasPath
    ? 'Verified stops and route paths are unavailable for this trip.'
    : boardingStop || alightingStop ? 'Choose stops on the same verified route with a later alighting stop closer to your destination.'
    : !origin ? 'A current, accurate location is needed to find your boarding stop.'
    : 'No verified direct ride toward your destination has stops within 2 km of both ends.';
  const result = place && !unit && (atDestination ? <View style={styles.result}>
    <Text accessibilityRole="header" style={styles.resultHeading}>Already near your destination</Text>
    <Text accessibilityLiveRegion="polite" style={s.muted}>Your GPS location is within {DESTINATION_RADIUS_METERS} m of {place.name}.</Text>
  </View> : <View style={styles.result}>
    <Text accessibilityRole="header" style={styles.resultHeading}>{trip ? 'Suggested ride' : 'No confirmed ride'}</Text>
    <Text accessibilityLiveRegion="polite" style={s.muted}>{trip?.route.name || rideStatus}</Text>
    {(trip || destinationCandidates.length > 0) && <View style={styles.itinerary}>
      {trip && <View style={styles.itineraryRow}>
        <Ionicons name="radio-button-on" size={19} color={Colors.brandGreen} />
        <View style={styles.itineraryText}>
          <Text style={s.muted}>Board at</Text><Text style={styles.rowTitle}>{trip.boarding.name}</Text>
          {trip.boardingProximity != null && <Text style={s.muted}>{Math.round(trip.boardingProximity)} m from you in a straight line</Text>}
        </View>
      </View>}
      <View style={styles.itineraryRow}>
        <Ionicons name="location-outline" size={20} color={Colors.ink} />
        <View style={styles.itineraryText}>
          <Text style={s.muted}>{trip ? 'Alight at' : 'Possible alighting stop'}</Text>
          <Text style={styles.rowTitle}>{trip?.alighting.name || destinationCandidates[0]?.stop.name || 'Unavailable'}</Text>
          {!trip && destinationCandidates.length > 0 && <Text style={s.muted}>Near your destination. A connecting ride is unconfirmed.</Text>}
          {trip && <Text style={s.muted}>{Math.round(trip.alightingProximity)} m from your destination in a straight line</Text>}
        </View>
      </View>
    </View>}
    {trip && <View style={styles.fareLine}><Text style={s.label}>Regular fare</Text>
      <Text style={s.label}>{fareQuote ? `₱${fareQuote.amount.toFixed(2)}` : !fareRead ? 'Checking…' : 'Unavailable'}</Text>
    </View>}
    {trip && (tripApplied ? <>
      <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} style={s.button} onPress={() => void requestWalk(trip.boarding)}>
        <Ionicons name="walk-outline" size={19} color={Colors.white} /><Text style={s.buttonText}>Walk to boarding stop</Text>
      </TouchableOpacity>
      {walkingFeedback}
      <TouchableOpacity accessibilityRole="button" style={styles.actionRow} onPress={() => navigation.navigate('Fares', { showSelectedStops: Date.now() })}>
        <Text style={s.label}>Fare and discounts</Text><Ionicons name="chevron-forward" size={18} color={Colors.ink} />
      </TouchableOpacity>
    </> : <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => {
      if (locationQuality(fix) === 'live') setRideStops(trip.boarding, trip.alighting);
    }}><Text style={s.buttonText}>Use these stops</Text></TouchableOpacity>)}
  </View>);
  const locationAction = locationFresh ? 'Center' : fix ? 'Retry GPS' : 'Enable location';
  const locationDetail = errorMsg || (quality === 'weak'
    ? `${locationDescription(fix, now)}. For boarding guidance, enable Precise Location and wait for accuracy within 30 m.`
    : locationDescription(fix, now));
  const locationControl = <TouchableOpacity accessibilityRole="button"
    accessibilityLabel={locationFresh ? 'Center on my location' : locationAction}
    accessibilityHint={locationDetail}
    onPress={() => locationFresh && fix ? map.current?.centerOn(fix.latitude, fix.longitude) : void enableLocation()}
    style={styles.locationRow}>
    <Ionicons name="locate-outline" size={21} color={Colors.action} />
    <View style={styles.itineraryText}><Text style={s.label}>Your location</Text>
      <Text style={s.muted}>{locationDetail}</Text></View>
    <Text style={styles.locationAction}>{locationAction}</Text>
  </TouchableOpacity>;
  const journeyControls = <View style={styles.details}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: manualOpen }} style={styles.actionRow}
      onPress={() => setManualOpen(open => !open)}>
      <Text style={s.label}>Choose stops manually</Text>
      <Ionicons name={manualOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.ink} />
    </TouchableOpacity>
    {manualOpen && <View style={styles.manual}>
      <Text style={s.muted}>{transitNotice}</Text>
      <PassengerSelect label="Route" value={selectedRouteId || ''} options={[{ value: '', label: 'All published routes' }, ...routes.map(r => ({ value: r.id, label: r.name }))]}
        onSelect={id => { pendingPlace.current = null; setSelectedRouteId(id || null); setInspectedStop(null); setSelected(null); }} />
      {!hasPath && <Text style={s.muted}>Route path unavailable.</Text>}
      {!routeStops.length && <Text style={s.muted}>Verified stop locations unavailable.</Text>}
      <PassengerSelect label="Boarding stop" value={boardingStop?.id || ''} disabled={!boardingOptions.length}
        options={boardingOptions.map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => setBoardingStop(boardingOptions.find(stop => stop.id === id) || null)} />
      <PassengerSelect label="Alighting stop" value={alightingStop?.id || ''} disabled={!alightingOptions.length}
        options={alightingOptions.map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => setDestination(alightingOptions.find(stop => stop.id === id) || null)} />
      <Text style={s.muted}>Destination place: {place?.name || 'Not selected'}</Text>
      {boardingStop && alightingStop && !rideLeg(selectedRoute, boardingStop, alightingStop).length && <Text style={s.muted}>Ride leg unavailable: verified geometry must connect these stops in route order.</Text>}
      {!!selectedRoute?.coordinates.length && <Text style={s.muted}>Arrows follow published geometry order. Green highlights the selected ride leg.</Text>}
      {!!activeStop && <View style={{ gap: 8 }}>
        <Text style={s.label}>{activeStop.name} · {routeName(activeStop.route_id)} · {passengerUseLabel(activeStop)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity accessibilityRole="button" disabled={!canChooseStop('boarding')} accessibilityState={{ disabled: !canChooseStop('boarding') }} onPress={() => setBoardingStop(activeStop)} style={[s.input, !canChooseStop('boarding') && { opacity: 0.5 }]}><Text>Board here</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={!canChooseStop('alighting')} accessibilityState={{ disabled: !canChooseStop('alighting') }} onPress={() => setDestination(activeStop)} style={[s.input, !canChooseStop('alighting') && { opacity: 0.5 }]}><Text>Alight here</Text></TouchableOpacity>
        </View>
        <Text style={s.muted}>Choose stops on the same route, with boarding before alighting. A stop marker does not verify a loading boundary.</Text>
    </View>}
    {(boardingStop || alightingStop) && <TouchableOpacity accessibilityRole="button" onPress={() => { setBoardingStop(null); setDestination(null); }}><Text style={s.muted}>Clear boarding and alighting stops</Text></TouchableOpacity>}
    </View>}
    {place && !trip && destinationCandidates.length > 0 && <View style={s.section}>
      <Text style={s.sectionTitle}>Stops near {place.name}</Text>
      <Text style={s.muted}>Nearby distances are straight-line proximity. Check a walking path before choosing where to alight.</Text>
      {destinationCandidates.map(({ stop, distance }) => <View key={stop.id} style={{ gap: 8 }}>
        <Text style={s.label}>{stop.name}</Text>
        <Text style={s.muted}>{Math.round(distance)} m in a straight line · {destinationWalks[stop.id] ? 'Walking path available' : 'Walking availability unconfirmed'}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} onPress={() => void requestWalk(stop, true)} style={[s.button, s.secondary]}>
          <Text style={s.label}>Check walk to destination</Text>
        </TouchableOpacity>
        {destinationWalks[stop.id] && <TouchableOpacity accessibilityRole="button" onPress={() => {
          setDestination(stop); showWalk(destinationWalks[stop.id], stop.name, place.name); setInspectedStop(stop);
        }} style={s.button}><Text style={s.buttonText}>Use this alighting stop</Text></TouchableOpacity>}
      </View>)}
    </View>}
    {alightingStop && place && !atDestination && <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} onPress={() => void requestWalk(alightingStop, true)} style={[s.button, s.secondary]}><Text style={s.label}>Walk from alighting stop to destination</Text></TouchableOpacity>}
    {(!tripApplied || unit) && walkingFeedback}
    <PassengerStopGuide boarding={boarding} landmarks={routeStops} selectedStop={activeStop} onSelectStop={chooseDestination}
      onWalk={stop => void requestWalk(stop)} walkingBusy={walkingBusy} onRefresh={refreshZones} loading={zonesLoading}
      loadError={zonesError || transit.status !== 'ready'} openRequest={route?.params?.showStopGuide} />
  </View>;
  const journeyMapProps = { preferMapcn: true, routes, terminals: routeStops, selectedRouteId, boardingStop, alightingStop, walkingRoutes, selectedTerminal: activeStop, onSelectTerminal: chooseDestination, vehicleSelectionKey: selected?.id ?? null };

  const tripPlanner = <View style={styles.planner}>
    <View style={styles.plannerHeading}>
      <Text accessibilityRole="header" style={styles.plannerTitle}>Plan your ride</Text>
      <Ionicons name="navigate" size={31} color={Colors.midnight} accessible={false} />
    </View>
    <View style={styles.plannerBody}>
    {locationControl}
    <Text style={s.label}>Destination</Text>
    <View style={[styles.searchInputWrap, searchOpen && styles.searchInputActive]}>
      <Ionicons name="search-outline" size={21} color={Colors.action} />
      <TextInput
        ref={destinationInput}
        accessibilityLabel="Search destination"
        value={query}
        selectTextOnFocus
        onFocus={() => setSearchOpen(true)}
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
        placeholder="Where are you going?"
        placeholderTextColor={Colors.subtleGray}
        style={styles.searchInputText}
      />
    </View>

    {searchOpen && <>
      {query.length > 0 && query.trim().length < 3 && <Text style={s.muted}>Enter at least 3 characters to search places.</Text>}
      <View style={styles.searchActions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Search"
          disabled={searching || query.trim().length < 3}
          accessibilityState={{ disabled: searching || query.trim().length < 3, busy: searching }}
          onPress={searchPlaces}
          style={[s.button, { flex: 1 }, (query.trim().length < 3 || searching) && { opacity: 0.55 }]}
        >
          <Ionicons name="search" size={18} color={Colors.white} />
          <Text style={s.buttonText}>{searching ? 'Searching…' : 'Search'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} onPress={() => {
          searchVersion.current++;
          destinationInput.current?.blur(); Keyboard.dismiss();
          setQuery(place?.name || destination?.name || ''); setPlaces([]); setSearchError('');
          setSearched(false); setSearching(false); setSearchOpen(false);
        }}><Text style={s.label}>Cancel</Text></TouchableOpacity>
      </View>

      {!!searchError && <Text accessibilityRole="alert" style={s.body}>{searchError}</Text>}

      {searched && <View style={styles.listGroup}>
        <Text accessibilityRole="header" style={styles.groupHeading}>Matching places</Text>
        {places.length > 0 && (
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
        )}
        {searched && !places.length && !searching && (
          <Text style={[s.muted, { paddingVertical: 8 }]}>No places found. Add a street or city name and search again.</Text>
        )}
      </View>}

      {results.length > 0 && <View style={styles.listGroup}>
        <Text style={styles.groupHeading}>Route stops</Text>
        {results.map((stop) => {
          const num = Number.isFinite(stop.sequence_order) ? String(stop.sequence_order) : '—';
          return (
            <TouchableOpacity
              key={stop.id}
              accessibilityRole="button"
              onPress={() => chooseStopAsDestination(stop)}
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
      </View>}

      <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
        <Text style={s.muted}>Metro Manila place search · OpenStreetMap / Photon</Text>
      </TouchableOpacity>
    </>}
    {!searchOpen && (result || <Text style={s.muted}>Find your boarding stop, alighting stop and fare.</Text>)}
    </View>
  </View>;

  // 2) WHERE TO BOARD VIEW (Board 02 left)
  if (boardingOpen) {
    const targetVehicle = currentSelected;
    const canBoardLive = targetVehicle && canBoardUnit(targetVehicle);
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

        {trackingCard}
        {locationControl}
        {result}
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

        {!canBoardLive && <Text style={s.muted}>Choose a confirmed boarding stop and a nearby unit on its route. Follow the loading signs.</Text>}

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

        {trackingCard}
        {locationControl}
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

  return (
    <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={styles.home}>
      <View style={[styles.layout, wide && styles.wideLayout]}>
        <View style={wide && styles.plannerColumn}>{tripPlanner}</View>
        <View style={[styles.mapColumn, wide && styles.wideMapColumn]}>
          <View style={[styles.mapContainer, wide && styles.wideMap]}>
            <LeafletMap ref={map} destinationPlace={place} hideOccupancy {...journeyMapProps}
              vehicles={displayed} userLocation={locationFresh ? fix : null}
              selectedVehicle={currentSelected} isOffline={!isConnected} onSelectVehicle={selectVehicle} />
          </View>
          <View style={styles.mapCaption}>
            <Ionicons name="bus-outline" size={18} color={Colors.subtleGray} />
            <Text style={[s.muted, { flex: 1 }]}>{vehicleError || (!displayed.length ? 'No current vehicle locations available.' : 'Tap an e-jeep to see its speed and GPS reading.')}</Text>
          </View>
          {trackingCard}
        </View>
      </View>
      <View style={styles.tools}>
        <TouchableOpacity accessibilityRole="button" style={styles.actionRow} onPress={() => setBoardingOpen(true)}>
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.action} />
          <Text style={[s.label, { flex: 1 }]}>Where to board safely</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.ink} />
        </TouchableOpacity>
        {journeyControls}
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  home: { flexGrow: 1, backgroundColor: Colors.canvas, paddingBottom: 28 },
  layout: { width: '100%', maxWidth: 1200, alignSelf: 'center', backgroundColor: Colors.paper },
  wideLayout: { width: '96%', flexDirection: 'row', alignItems: 'stretch', marginTop: 16, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' },
  plannerColumn: { width: '40%', maxWidth: 442 },
  planner: { backgroundColor: Colors.paper },
  plannerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: Colors.signal, paddingHorizontal: 22, paddingVertical: 17 },
  plannerBody: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20, gap: 10 },
  plannerTitle: { flexShrink: 1, fontSize: 33, fontWeight: '800', letterSpacing: -1, color: Colors.midnight },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 10, borderBottomWidth: 1, borderColor: Colors.border },
  locationAction: { fontSize: 14, fontWeight: '700', color: Colors.action },
  searchActions: { flexDirection: 'row', gap: 10 },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  result: { gap: 8, marginTop: 4, borderTopWidth: 1, borderColor: Colors.border, paddingTop: 14 },
  resultHeading: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: Colors.midnight },
  itinerary: { gap: 12, paddingVertical: 4 },
  itineraryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itineraryText: { flex: 1, gap: 2 },
  fareLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.actionTint, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  mapColumn: { backgroundColor: Colors.paper },
  wideMapColumn: { flex: 1, minWidth: 0, borderLeftWidth: 1, borderColor: Colors.border },
  wideMap: { minHeight: 360, flex: 1 },
  mapCaption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tools: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
  details: { gap: 8 },
  manual: { gap: 10, paddingBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, borderBottomWidth: 1, borderColor: Colors.border },
  mapContainer: {
    height: 290,
    position: 'relative',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
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
    borderRadius: 9,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInputText: {
    flex: 1,
    fontSize: 16,
    color: Colors.ink,
    paddingVertical: 10,
  },
  searchInputActive: { borderColor: Colors.action, backgroundColor: Colors.actionTint },
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
