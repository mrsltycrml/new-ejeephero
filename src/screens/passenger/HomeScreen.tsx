import { useTranslation } from 'react-i18next';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform, Vibration, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap, { type LeafletMapRef } from '../../components/LeafletMap';
import PassengerStopGuide from '../../components/PassengerStopGuide';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import WalkingDirectionsPanel from '../../components/WalkingDirectionsPanel';
import { triggerHaptic } from '../../components/AppUI';
import PeekSheet from '../../components/ui/PeekSheet';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { type TerminalData, type VehicleData } from '../../services/offlineTransitService';
import { loadLoadingZones, loadPassengerFareData } from '../../services/passengerDataService';
import { quotePassengerFare, validFareMatrix, verifiedRideDistance } from '../../services/passengerFare';
import { DESTINATION_RADIUS_METERS, STOP_SEARCH_METERS, atPassengerDestination, passengerPlanRide } from '../../services/passengerTrip';
import { distanceMeters, evaluateBoardingLocation, outsideLoadingZone, trackNoLoadingWait, type LoadingZone, type NoLoadingWait } from '../../services/passengerSafety';
import { getWalkingDirections, type WalkingRoute } from '../../services/walkingDirections';
import PassengerDestinationSearch from '../../components/PassengerDestinationSearch';
import { type PassengerPlace } from '../../services/passengerPlaces';
import { locationDescription, locationQuality, vehicleTelemetryReadout } from '../../services/locationQuality';
import { rideLeg, selectJourneyStop, confirmedPassengerUse, permitsPassengerUse, passengerStopOptions, passengerUseLabel } from '../../services/routeMap';
import { color, elevation, radius, sheetSnap, tapTarget } from '../../constants/theme';
import { manilaDateKey } from '../../utils/reportingPeriod';
import { passengerMapOverview } from '../../services/passengerMapOverview';

export default function PassengerHomeScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const { fix, quality, errorMsg, foreground, now: locationNow, enableLocation } = useLocation();
  const { isConnected } = useNetwork();
  const { user, getAccessToken } = useAuth();
  const { unit, setUnit, destination, setDestination, place, setPlace, vehicles, vehicleRouteIds, vehicleError, nearby, endRide, selectedRouteId, fleetRouteId, setSelectedRouteId, boardingStop, setBoardingStop, alightingStop, setRideStops, walkingRoutes, transit, refreshTransit, walk, showWalk, getJourneyVersion } = usePassengerJourney();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const map = useRef<LeafletMapRef>(null);
  const { width } = useWindowDimensions();
  const [sheetInset, setSheetInset] = useState<number>(sheetSnap.peek);
  const pendingPlace = useRef<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const stops = transit.terminals;
  const routes = transit.routes;
  const [inspectedStop, setInspectedStop] = useState<TerminalData | null>(null);
  const [landmarkId, setLandmarkId] = useState<string | null>(null);
  const [pinListOpen, setPinListOpen] = useState(false);
  const locatedStops = useMemo(() => stops.filter(t => !selectedRouteId || t.route_id === selectedRouteId), [stops, selectedRouteId]);
  const overview = useMemo(() => passengerMapOverview(routes, locatedStops, selectedRouteId), [routes, locatedStops, selectedRouteId]);
  const landmark = overview?.landmarks.find(p => p.id === landmarkId);
  const searchScope = useMemo(() => ({ routes, stops, selectedRouteId }), [routes, stops, selectedRouteId]);
  const [boardingOpen, setBoardingOpen] = useState(false);
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

  useEffect(() => {
    if (route?.params?.showStopGuide) {
      setBoardingOpen(true);
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
  const boarding = evaluateBoardingLocation(foreground && !errorMsg ? fix : null, zonesError ? [] : zones, locationNow, routeStops, t);
  const focusedFix = focused && foreground && !errorMsg ? fix : null;
  const restrictedZone = boarding.kind === 'prohibited' ? boarding.zone ?? null : null;
  const waiting = useRef<NoLoadingWait | null>(null);
  const [warningZoneId, setWarningZoneId] = useState<string | null>(null);
  const notifiedZones = useRef(new Map<string, LoadingZone>());
  useEffect(() => {
    waiting.current = trackNoLoadingWait(waiting.current, restrictedZone, unit ? null : focusedFix, locationNow);
    for (const [id, zone] of notifiedZones.current) {
      if (outsideLoadingZone(zone, focusedFix, locationNow)) notifiedZones.current.delete(id);
    }
    setWarningZoneId(waiting.current?.waiting ? waiting.current.zoneId : null);
    if (!waiting.current?.waiting || !restrictedZone || notifiedZones.current.has(restrictedZone.id)) return;
    notifiedZones.current.set(restrictedZone.id, restrictedZone);
    if (Platform.OS !== 'web') Vibration.vibrate([0, 150, 100, 150]);
  }, [restrictedZone, focusedFix, locationNow, unit]);
  const waitingWarning = !!(focusedFix && !unit && restrictedZone && warningZoneId === restrictedZone.id);

  const activeStop = routeStops.find(stop => stop.id === inspectedStop?.id) ?? null;
  const stopBadgeCode = boardingStop && permitsPassengerUse(boardingStop, 'board') ? t('passenger.home.boardingConfirmed') : t('passenger.home.noBoarding');
  const routeName = (id?: string) => routes.find(item => item.id === id)?.name || t('passenger.home.routeUnavailable');

  const allModeVehicles = isConnected ? vehicles : [];
  const displayed = fleetRouteId
    ? allModeVehicles.filter((v) => v.route_id === fleetRouteId)
    : allModeVehicles;
  const currentSelected = selected
    ? displayed.find((v) => v.vehicle_id === selected.vehicle_id) || null
    : null;
  const tracked = unit || (selected && vehicleRouteIds.has(selected.route_id) ? selected : null);
  const trackedPosition = tracked ? allModeVehicles.find(vehicle => vehicle.vehicle_id === tracked.vehicle_id) || null : null;
  const telemetry = vehicleTelemetryReadout(trackedPosition, now, t);
  const trackingCard = tracked && <View style={[s.section, { marginHorizontal: 16, marginTop: 12 }]}>
    <Text style={s.sectionTitle}>{tracked.body_number || tracked.plate_number || t('passenger.home.selectedVehicle')}</Text>
    <Text style={s.label}>{telemetry.speed == null ? t('passenger.home.speedUnavailable') : `${Math.round(telemetry.speed)} km/h`}</Text>
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
    setLandmarkId(null);
    setManualOpen(true);
    setSelected(null);
  };

  const choosePlace = (value: PassengerPlace) => {
    pendingPlace.current = value.id;
    triggerHaptic('light');
    setPlace(value);
    setBoardingStop(null);
    setDestination(null);
    setInspectedStop(null);
    setLandmarkId(null);
    setManualOpen(false);
    setSelected(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const selectVehicle = (vehicle: VehicleData) => {
    triggerHaptic('light');
    setLandmarkId(null);
    setInspectedStop(null);
    setSelected(vehicle);
  };

  const canBoardUnit = (vehicle: VehicleData) => boardingStop?.route_id === vehicle.route_id && permitsPassengerUse(boardingStop, 'board')
    && boarding.kind !== 'prohibited' && !vehicle.is_sample && nearby.some(item => item.vehicle_id === vehicle.vehicle_id);
  const boardUnit = (vehicle: VehicleData) => {
    if (!canBoardUnit(vehicle)) return;
    triggerHaptic('success');
    setUnit({
      vehicle_id: vehicle.vehicle_id,
      route_id: vehicle.route_id,
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
      setWalkingError(t('passenger.home.locationNeeded'));
      return;
    }
    if (!isConnected) { setWalkingError(t('passenger.home.offlineWalk')); return; }
    setWalkingBusy(true);
    try {
      const token = await getAccessToken();
      if (request !== walkingRequest.current || journeyVersion !== getJourneyVersion()) return;
      if (!toPlace && locationQuality(fix) !== 'live') { setWalkingError(t('passenger.home.locationExpired')); return; }
      const result = await getWalkingDirections(origin, target, token);
      if (request !== walkingRequest.current || journeyVersion !== getJourneyVersion()) return;
      if (result.status !== 'available') { setWalkingError(t('passenger.home.statuses.' + result.reason, result.reason)); return; }
      if (toPlace) setDestinationWalks(current => ({ ...current, [stop.id]: result.route }));
      showWalk(result.route, toPlace ? stop.name : t('passenger.home.requestedLocation'), toPlace ? place!.name : stop.name, journeyVersion);
    } catch { if (request === walkingRequest.current) setWalkingError(t('passenger.home.walkUnavailable')); }
    finally { if (request === walkingRequest.current) setWalkingBusy(false); }
  };
  const hasPath = selectedRoute ? selectedRoute.coordinates.length > 1 : routes.some(item => item.coordinates.length > 1);
  const walkingFeedback = <>
    {walkingBusy && <Text accessibilityRole="alert" style={s.muted}>{t('passenger.home.findingWalk')}</Text>}
    {!!walkingError && <Text accessibilityRole="alert" style={s.muted}>{walkingError}</Text>}
    {walk && <WalkingDirectionsPanel {...walk} />}
  </>;
  const rideStatus = transit.status !== 'ready' || !routeStops.length || !hasPath
    ? t('passenger.home.unconfirmedTrip')
    : boardingStop || alightingStop ? t('passenger.home.laterStop')
    : !origin ? t('passenger.home.enableForBoarding')
    : t('passenger.home.noDirectRide');
  const result = place && !unit && (atDestination ? <View style={styles.result}>
    <Text accessibilityRole="header" style={styles.resultHeading}>{t('passenger.home.alreadyNearby')}</Text>
    <Text accessibilityLiveRegion="polite" style={s.muted}>{t('passenger.home.nearbyDistance', { distance: DESTINATION_RADIUS_METERS, place: place.name })}</Text>
  </View> : <View style={styles.result}>
    <Text accessibilityRole="header" style={styles.resultHeading}>{trip ? t('passenger.home.suggestedRide') : t('passenger.home.unconfirmedRide')}</Text>
    <Text accessibilityLiveRegion="polite" style={s.muted}>{trip?.route.name || rideStatus}</Text>
    {(trip || destinationCandidates.length > 0) && <View style={styles.itinerary}>
      {trip && <View style={styles.itineraryRow}>
        <Ionicons name="radio-button-on" size={19} color={color.success} />
        <View style={styles.itineraryText}>
          <Text style={s.muted}>{t('passenger.home.boardAt')}</Text><Text style={styles.rowTitle}>{trip.boarding.name}</Text>
          {trip.boardingProximity != null && <Text style={s.muted}>{t('passenger.home.boardingDistance', { distance: Math.round(trip.boardingProximity) })}</Text>}
        </View>
      </View>}
      <View style={styles.itineraryRow}>
        <Ionicons name="location-outline" size={20} color={color.ink} />
        <View style={styles.itineraryText}>
          <Text style={s.muted}>{trip ? t('passenger.home.alightAt') : t('passenger.home.possibleAlight')}</Text>
          <Text style={styles.rowTitle}>{trip?.alighting.name || destinationCandidates[0]?.stop.name || t('passenger.home.unavailable')}</Text>
          {!trip && destinationCandidates.length > 0 && <Text style={s.muted}>{t('passenger.home.connectionUnconfirmed')}</Text>}
          {trip && <Text style={s.muted}>{t('passenger.home.alightingDistance', { distance: Math.round(trip.alightingProximity) })}</Text>}
        </View>
      </View>
    </View>}
    {trip && <View style={styles.fareLine}><Text style={s.label}>{t('passenger.home.regularFare')}</Text>
      <Text style={s.label}>{fareQuote ? `₱${fareQuote.amount.toFixed(2)}` : !fareRead ? t('passenger.home.checking') : t('passenger.home.unavailable')}</Text>
    </View>}
    {trip && (tripApplied ? <>
      <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} style={s.button} onPress={() => void requestWalk(trip.boarding)}>
        <Ionicons name="walk-outline" size={19} color={color.onDark} /><Text style={s.buttonText}>{t('passenger.home.walkToBoard')}</Text>
      </TouchableOpacity>
      {walkingFeedback}
      <TouchableOpacity accessibilityRole="button" style={styles.actionRow} onPress={() => navigation.navigate('Fares', { showSelectedStops: Date.now() })}>
        <Text style={s.label}>{t('passenger.home.fareDiscounts')}</Text><Ionicons name="chevron-forward" size={18} color={color.ink} />
      </TouchableOpacity>
    </> : <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => {
      if (locationQuality(fix) === 'live') setRideStops(trip.boarding, trip.alighting);
    }}><Text style={s.buttonText}>{t('passenger.home.useStops')}</Text></TouchableOpacity>)}
  </View>);
  const locationAction = locationFresh ? t('passenger.home.center') : fix ? t('passenger.home.retryGps') : t('passenger.home.enableLocation');
  const locationDetail = errorMsg ? t('passenger.home.statuses.' + errorMsg, errorMsg) : quality === 'weak'
    ? t('passenger.home.preciseLocation', { status: locationDescription(fix, now, t) })
    : locationDescription(fix, now, t);
  const locationControl = <TouchableOpacity accessibilityRole="button"
    accessibilityLabel={locationFresh ? t('passenger.map.centerOnLocation') : locationAction}
    accessibilityHint={locationDetail}
    onPress={() => locationFresh && fix ? map.current?.centerOn(fix.latitude, fix.longitude) : void enableLocation()}
    style={styles.locationRow}>
    <Ionicons name="locate-outline" size={21} color={color.action} />
    <View style={styles.itineraryText}><Text style={s.label}>{t('passenger.home.yourLocation')}</Text>
      <Text style={s.muted}>{locationDetail}</Text></View>
    <Text style={styles.locationAction}>{locationAction}</Text>
  </TouchableOpacity>;
  const journeyControls = <View style={styles.details}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: manualOpen }} style={styles.actionRow}
      onPress={() => setManualOpen(open => !open)}>
      <Text style={s.label}>{t('passenger.home.chooseStops')}</Text>
      <Ionicons name={manualOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.ink} />
    </TouchableOpacity>
    {manualOpen && <View style={styles.manual}>
      <PassengerSelect label={t('passenger.home.route')} value={selectedRouteId || ''} options={[{ value: '', label: t('passenger.home.allRoutes') }, ...routes.map(r => ({ value: r.id, label: r.name }))]}
        onSelect={id => { pendingPlace.current = null; setSelectedRouteId(id || null); setInspectedStop(null); setSelected(null); }} />
      {!routeStops.length && <View style={styles.pinDetail}>
        <Text style={s.body}>{transit.status === 'ready' ? t('passenger.home.noPublishedStops') : t('passenger.home.noStopList')}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={zonesLoading} onPress={refreshZones} style={styles.textButton}>
          <Text style={styles.mapLink}>{zonesLoading ? t('passenger.home.checking') : t('passenger.home.checkStops')}</Text>
        </TouchableOpacity>
      </View>}
      <PassengerSelect label={t('passenger.home.boardStop')} value={boardingStop?.id || ''} disabled={!boardingOptions.length}
        options={boardingOptions.map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => setBoardingStop(boardingOptions.find(stop => stop.id === id) || null)} />
      <PassengerSelect label={t('passenger.home.dropStop')} value={alightingStop?.id || ''} disabled={!alightingOptions.length}
        options={alightingOptions.map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => setDestination(alightingOptions.find(stop => stop.id === id) || null)} />
      {boardingStop && alightingStop && !rideLeg(selectedRoute, boardingStop, alightingStop).length && <Text style={s.muted}>{t('passenger.home.noPath')}</Text>}
      {!!activeStop && <View style={{ gap: 8 }}>
        <Text style={s.label}>{activeStop.name} · {routeName(activeStop.route_id)} · {t('passenger.map.labels.' + passengerUseLabel(activeStop))}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity accessibilityRole="button" disabled={!canChooseStop('boarding')} accessibilityState={{ disabled: !canChooseStop('boarding') }} onPress={() => setBoardingStop(activeStop)} style={[s.input, !canChooseStop('boarding') && { opacity: 0.5 }]}><Text>{t('passenger.home.boardHere')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={!canChooseStop('alighting')} accessibilityState={{ disabled: !canChooseStop('alighting') }} onPress={() => setDestination(activeStop)} style={[s.input, !canChooseStop('alighting') && { opacity: 0.5 }]}><Text>{t('passenger.home.alightHere')}</Text></TouchableOpacity>
        </View>
    </View>}
    {(boardingStop || alightingStop) && <TouchableOpacity accessibilityRole="button" onPress={() => { setBoardingStop(null); setDestination(null); }}><Text style={s.muted}>{t('passenger.home.clearStops')}</Text></TouchableOpacity>}
    </View>}
    {place && !trip && destinationCandidates.length > 0 && <View style={s.section}>
      <Text style={s.sectionTitle}>{t('passenger.home.nearStops', { place: place.name })}</Text>
      <Text style={s.muted}>{t('passenger.home.straightLineNote')}</Text>
      {destinationCandidates.map(({ stop, distance }) => <View key={stop.id} style={{ gap: 8 }}>
        <Text style={s.label}>{stop.name}</Text>
        <Text style={s.muted}>{t('passenger.home.straightLine', { distance: Math.round(distance), use: t(destinationWalks[stop.id] ? 'passenger.home.walkAvailable' : 'passenger.home.walkUnknown') })}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} onPress={() => void requestWalk(stop, true)} style={[s.button, s.secondary]}>
          <Text style={s.label}>{t('passenger.home.checkWalk')}</Text>
        </TouchableOpacity>
        {destinationWalks[stop.id] && <TouchableOpacity accessibilityRole="button" onPress={() => {
          setDestination(stop); showWalk(destinationWalks[stop.id], stop.name, place.name); setInspectedStop(stop);
        }} style={s.button}><Text style={s.buttonText}>{t('passenger.home.useAlight')}</Text></TouchableOpacity>}
      </View>)}
    </View>}
    {alightingStop && place && !atDestination && <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} onPress={() => void requestWalk(alightingStop, true)} style={[s.button, s.secondary]}><Text style={s.label}>{t('passenger.home.walkToDestination')}</Text></TouchableOpacity>}
    {(!tripApplied || unit) && walkingFeedback}
    {(boardingOpen || !!activeStop) && <PassengerStopGuide boarding={boarding} landmarks={routeStops} selectedStop={activeStop} onSelectStop={chooseDestination}
      onWalk={stop => void requestWalk(stop)} walkingBusy={walkingBusy} onRefresh={refreshZones} loading={zonesLoading}
      loadError={zonesError || transit.status !== 'ready'} openRequest={route?.params?.showStopGuide ?? (boardingOpen ? 1 : undefined)} />}
  </View>;
  const journeyMapProps = { preferMapcn: true, routes, terminals: locatedStops, selectedRouteId, boardingStop, alightingStop, walkingRoutes,
    passengerOverview: overview, selectedTerminal: inspectedStop, onSelectTerminal: chooseDestination, vehicleSelectionKey: selected?.id ?? null,
    onSelectLandmark: (pin: { id: string }) => { setLandmarkId(pin.id); setInspectedStop(null); setSelected(null); } };
  const referenceLines = overview?.referenceLines ?? [];
  const publishedLines = routes.filter(r => (!selectedRouteId || r.id === selectedRouteId) && r.coordinates.length > 1);
  const locatedStop = locatedStops.find(t => t.id === inspectedStop?.id);
  const inspectedPin = landmark?.point ?? locatedStop;
  const pinCount = locatedStops.length + (overview?.landmarks.length ?? 0);
  const mapKey = <View style={styles.mapKey}>
    <View style={styles.mapKeyHeading}>
      <Text style={s.label}>{referenceLines.length ? t('passenger.home.referenceMap') : t('passenger.home.routeMap')}</Text>
      {(referenceLines.length > 0 || publishedLines.length > 0) && <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() =>
        map.current?.fitPoints?.([...referenceLines, ...publishedLines].flatMap(line => line.coordinates))}>
        <Text style={styles.mapLink}>{t('passenger.home.fullRoute')}</Text>
      </TouchableOpacity>}
    </View>
    {overview && referenceLines.length > 0 && <>
      <View style={styles.mapDirections}>{referenceLines.map(line =>
        <TouchableOpacity key={line.id} accessibilityRole="link" style={styles.mapDirection}
          onPress={() => void Linking.openURL(line.referenceDirection === 'outbound' ? overview.variant.source : overview.variant.returnSource)}>
          <View style={[styles.mapStroke, { backgroundColor: line.color_code }]} />
          <Text style={styles.mapKeyText}>{line.referenceDirection === 'outbound' ? t('passenger.home.toCityHall') : t('passenger.home.toMakati')}</Text>
        </TouchableOpacity>)}</View>
      {pinListOpen && <Text style={s.muted}>{t('passenger.home.mapCredit', { source: overview.variant.label })}</Text>}
    </>}
    {pinCount > 0 && <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: pinListOpen }}
      style={styles.mapKeyHeading} onPress={() => setPinListOpen(!pinListOpen)}>
      <Text style={styles.mapLink}>{t('passenger.home.stopCount', { total: pinCount })}</Text>
      <Ionicons name={pinListOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.action} />
    </TouchableOpacity>}
    {pinListOpen && <View>{[
      ...locatedStops.map(stop => ({ id: stop.id, name: stop.name, point: stop, select: () => chooseDestination(stop) })),
      ...(overview?.landmarks ?? []).map(pin => ({ id: pin.id, name: pin.name, point: pin.point, select: () => journeyMapProps.onSelectLandmark(pin) })),
    ].map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={item.name} style={styles.actionRow} onPress={() => {
      item.select(); setPinListOpen(false); map.current?.centerOn(item.point.latitude, item.point.longitude, 17);
    }}>
      <Text style={s.label}>{item.name}</Text><Ionicons name="location-outline" size={18} color={color.action} />
    </TouchableOpacity>)}</View>}
    {inspectedPin && <View style={styles.pinDetail}>
      <Text style={s.label}>{landmark?.name ?? locatedStop?.name}</Text>
      <Text style={s.muted}>{landmark ? t('passenger.home.landmarkOnly') : locatedStop ? t('passenger.map.labels.' + passengerUseLabel(locatedStop)) : ''}</Text>
      <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(
        `https://earth.google.com/web/@${inspectedPin.latitude},${inspectedPin.longitude},0a,600d,35y,0h,0t,0r`)}>
        <Text style={styles.mapLink}>{t('passenger.home.earthPin')}</Text>
      </TouchableOpacity>
    </View>}
  </View>;

  const wideMap = width >= 860;
  const mapControlProps = {
    defaultMovable: true as const,
    moveButtonStyle: wideMap ? styles.mapMoveButtonWide : styles.mapMoveButton,
    mapControlsCorner: (wideMap ? 'bottom-left' : 'top-right') as 'bottom-left' | 'top-right',
    mapControlsOffsetTop: wideMap ? 0 : 88,
    bottomInset: wideMap ? 0 : sheetInset,
  };

  // 2) WHERE TO BOARD VIEW (Board 02 left)
  if (boardingOpen) {
    const targetVehicle = currentSelected;
    const canBoardLive = targetVehicle && canBoardUnit(targetVehicle);
    const isProhibited = boarding.kind === 'prohibited';

    return (
      <View style={styles.homeFill}>
        <View style={styles.mapFill}>
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
            {...mapControlProps}
          />
        </View>
        <View pointerEvents="box-none" style={styles.topOverlay}>
          <View style={[styles.subHeader, styles.floatingBar]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('passenger.home.back')}
              onPress={() => setBoardingOpen(false)}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={24} color={color.ink} />
            </TouchableOpacity>
            <Text style={styles.subHeaderTitle}>{t('passenger.home.whereToBoard')}</Text>
          </View>
        </View>
        <View pointerEvents="none" style={[styles.loadingBayOverlay, styles.loadingBayFloat]}>
          <Text style={styles.loadingBayOverlayText}>{boarding.kind === 'allowed' ? t('passenger.home.loadingBay') : t('passenger.home.unverifiedLoading')}</Text>
        </View>
        <PeekSheet
          peekHeight={210}
          wide={wideMap}
          onSnapChange={(_snap, height) => setSheetInset(height)}
          expandAccessibilityLabel={t('passenger.home.whereToBoard')}
          collapseAccessibilityLabel={t('passenger.home.back')}
          peek={
            <>
              <View style={[styles.boardingStatusRow, isProhibited && styles.boardingStatusDanger]}>
                <Ionicons
                  name={isProhibited ? 'warning' : boarding.kind === 'allowed' ? 'checkmark-circle' : 'information-circle'}
                  size={22}
                  color={isProhibited ? color.ember : color.success}
                />
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole={waitingWarning ? 'alert' : undefined} style={[styles.rowTitle, isProhibited && { color: color.ember }]}>
                    {boarding.title}
                  </Text>
                  <Text style={styles.rowSubtitle}>{boarding.detail}</Text>
                </View>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!canBoardLive}
                accessibilityState={{ disabled: !canBoardLive }}
                onPress={() => targetVehicle && canBoardLive && boardUnit(targetVehicle)}
                style={s.button}
              >
                <Text style={s.buttonText}>{t('passenger.home.boarded')}</Text>
              </TouchableOpacity>
            </>
          }
        >
          <View style={styles.stopSummaryRow}>
            <View style={styles.stopBadgePill}>
              <Text style={styles.stopBadgeText}>{stopBadgeCode}</Text>
            </View>
            <Text style={[styles.rowTitle, { fontSize: 17 }]}>{boardingStop?.name || t('passenger.home.noStopSelected')}</Text>
          </View>
          {targetVehicle && (
            <View style={styles.unitRowCard}>
              <View style={styles.unitIconCircle}>
                <Ionicons name="bus-outline" size={20} color={color.success} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.unitCodeText}>{targetVehicle.body_number}</Text>
                  <Text style={styles.rowSubtitle}>{t('passenger.home.plateValue', { plate: targetVehicle.plate_number })}</Text>
                </View>
                <Text style={styles.rowSubtitle}>{routeName(targetVehicle.route_id)}</Text>
              </View>
              <View style={styles.seatBadge}>
                <Text style={styles.seatBadgeText}>{targetVehicle.status || t('passenger.home.occupancyUnavailable')}</Text>
              </View>
            </View>
          )}
          {!canBoardLive && <Text style={s.muted}>{t('passenger.home.boardingHelp')}</Text>}
          {mapKey}
          {trackingCard}
          {locationControl}
          {result}
          {journeyControls}
        </PeekSheet>
      </View>
    );
  }

  // 3) YOUR RIDE LINKED VIEW (Board 02 middle)
  if (unit) {
    return (
      <View style={styles.homeFill}>
        <View style={styles.mapFill}>
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
            {...mapControlProps}
          />
        </View>
        <PeekSheet
          peekHeight={200}
          wide={wideMap}
          onSnapChange={(_snap, height) => setSheetInset(height)}
          expandAccessibilityLabel={t('passenger.home.yourRide')}
          collapseAccessibilityLabel={t('passenger.home.yourRide')}
          peek={
            <>
              <View style={styles.rideHeaderBar}>
                <Text style={styles.sheetHeading}>{t('passenger.home.riding', { unit: unit.body_number })}</Text>
                <View style={styles.linkedPill}>
                  <Ionicons name="checkmark-circle" size={16} color={color.success} />
                  <Text style={styles.linkedPillText}>{t('passenger.home.linked')}</Text>
                </View>
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
                <Text style={styles.endRideText}>{t('passenger.home.endRide')}</Text>
              </TouchableOpacity>
            </>
          }
        >
          <Text style={styles.subHeaderTitle}>{t('passenger.home.yourRide')}</Text>
          <View style={styles.kvList}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('passenger.home.plate')}</Text>
              <Text style={styles.kvValue}>{unit.plate_number || t('passenger.home.unavailable')}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('passenger.home.route')}</Text>
              <Text style={styles.kvValue}>{routeName(vehicles.find(v => v.vehicle_id === unit.vehicle_id)?.route_id)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('passenger.home.direction')}</Text>
              <Text style={styles.kvValue}>{destination?.name || t('passenger.home.unavailable')}</Text>
            </View>
          </View>
          <Text style={s.muted}>{t('passenger.home.sosUnit')}</Text>
          <View style={styles.actionRowsGroup}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => navigation.navigate('Fares')}
              style={styles.dividerRow}
            >
              <Ionicons name="ticket-outline" size={20} color={color.success} />
              <Text style={[styles.rowTitle, { flex: 1 }]}>{t('passenger.home.checkFare')}</Text>
              <Ionicons name="chevron-forward" size={18} color={color.inkMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => navigation.navigate('Safety')}
              style={styles.dividerRow}
            >
              <Ionicons name="shield-outline" size={20} color={color.ember} />
              <Text style={[styles.rowTitle, { flex: 1 }]}>{t('passenger.home.safetySos')}</Text>
              <Ionicons name="chevron-forward" size={18} color={color.inkMuted} />
            </TouchableOpacity>
          </View>
          {mapKey}
          {trackingCard}
          {locationControl}
          {journeyControls}
        </PeekSheet>
      </View>
    );
  }

  return (
    <View style={styles.homeFill}>
      <View style={styles.mapFill}>
        <LeafletMap ref={map} destinationPlace={place} hideOccupancy {...journeyMapProps}
          vehicles={displayed} userLocation={locationFresh ? fix : null}
          selectedVehicle={currentSelected} isOffline={!isConnected} onSelectVehicle={selectVehicle}
          {...mapControlProps} />
      </View>
      <View pointerEvents="box-none" style={[styles.searchOverlay, wideMap && styles.searchOverlayWide]}>
        <PassengerDestinationSearch compact key={user?.id} scope={searchScope} selectedName={place?.name || destination?.name || ''} online={isConnected} onSelect={choosePlace} />
      </View>
      {!!waitingWarning && (
        <View pointerEvents="box-none" style={[styles.warningBanner, wideMap && styles.warningBannerWide]}>
          <View style={[styles.boardingStatusRow, styles.boardingStatusDanger, styles.warningCard]}>
            <Ionicons aria-hidden name="warning" size={22} color={color.ember} />
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="alert" style={[styles.rowTitle, { color: color.ember }]}>{boarding.title}</Text>
              <Text style={styles.rowSubtitle}>{boarding.detail}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => setBoardingOpen(true)}>
                <Text style={styles.mapLink}>{t('passenger.home.safeBoarding')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <PeekSheet
        peekHeight={168}
        wide={wideMap}
        onSnapChange={(_snap, height) => setSheetInset(height)}
        expandAccessibilityLabel={t('passenger.home.safeBoarding')}
        collapseAccessibilityLabel={t('passenger.home.safeBoarding')}
        peek={
          <>
            {locationControl}
            <TouchableOpacity accessibilityRole="button" style={styles.peekAction} onPress={() => setBoardingOpen(true)}>
              <Text style={styles.peekActionText}>{t('passenger.home.safeBoarding')}</Text>
            </TouchableOpacity>
          </>
        }
      >
        <View style={styles.rideDetails}>{result}</View>
        {mapKey}
        <View style={styles.mapCaption}>
          <Ionicons name="bus-outline" size={18} color={color.inkMuted} />
          <Text style={[s.muted, { flex: 1 }]}>{vehicleError ? t('passenger.home.statuses.' + vehicleError, vehicleError)
            : t(displayed.length ? 'passenger.home.tapForSpeed' : 'passenger.home.noLiveUnits')}</Text>
          {displayed.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => map.current?.fitPoints?.(displayed)}>
            <Text style={styles.mapLink}>{t('passenger.home.showUnit', { total: displayed.length, unit: displayed.length === 1 ? 'e-jeep' : 'e-jeeps' })}</Text>
          </TouchableOpacity>}
        </View>
        {trackingCard}
        {journeyControls}
        <TouchableOpacity accessibilityRole="button" style={styles.actionRow} onPress={() => setBoardingOpen(true)}>
          <Ionicons name="shield-checkmark-outline" size={20} color={color.action} />
          <Text style={[s.label, { flex: 1 }]}>{t('passenger.home.safeBoarding')}</Text>
          <Ionicons name="chevron-forward" size={18} color={color.ink} />
        </TouchableOpacity>
      </PeekSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  textButton: { minHeight: tapTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  mapKey: { paddingHorizontal: 16, paddingVertical: 10, gap: 6, backgroundColor: 'transparent' },
  mapKeyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  mapDirections: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  mapDirection: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 28 },
  mapStroke: { width: 22, height: 5, borderRadius: 3 },
  mapKeyText: { color: color.ink, fontSize: 13, fontWeight: '600' },
  mapLink: { color: color.action, fontSize: 14, fontWeight: '700', paddingVertical: 5 },
  pinDetail: { paddingTop: 8, gap: 4, borderTopWidth: 1, borderColor: color.border },
  home: { flexGrow: 1, backgroundColor: color.canvas, paddingBottom: 28 },
  homeFill: { flex: 1, backgroundColor: color.canvas },
  mapFill: { ...StyleSheet.absoluteFill },
  searchOverlay: { position: 'absolute', top: 12, left: 12, right: 12, zIndex: 3 },
  searchOverlayWide: { right: 'auto', width: 420, maxWidth: '42%' },
  topOverlay: { position: 'absolute', top: 12, left: 12, right: 12, zIndex: 3 },
  floatingBar: {
    backgroundColor: color.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 48,
  },
  loadingBayFloat: { top: 'auto', bottom: 228, left: 12, right: 'auto' },
  warningBanner: { position: 'absolute', left: 12, right: 12, bottom: 176, zIndex: 3 },
  warningBannerWide: { left: 'auto', right: 16, width: 420, maxWidth: '42%' },
  warningCard: { margin: 0, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: color.dangerBg },
  mapMoveButton: { top: 88, left: 12, right: 'auto' },
  mapMoveButtonWide: { top: 12, left: 'auto', right: 12 },
  peekAction: { minHeight: 48, borderRadius: 14, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  peekActionText: { color: color.onDark, fontSize: 16, fontWeight: '700' },
  statusSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '50%', zIndex: 2,
    backgroundColor: color.paper, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderWidth: 1, borderColor: color.border, ...elevation.sheet,
  },
  statusSheetWide: {
    left: 'auto', right: 16, bottom: 16, width: 420, maxWidth: '42%', maxHeight: '72%',
    borderRadius: radius.lg,
  },
  statusSheetContent: { paddingBottom: 20, gap: 0 },
  layout: { width: '100%', maxWidth: 960, alignSelf: 'center', backgroundColor: color.paper },
  rideDetails: { paddingHorizontal: 16, paddingBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.border },
  locationAction: { fontSize: 14, fontWeight: '700', color: color.action },
  result: { gap: 8, marginTop: 4, borderTopWidth: 1, borderColor: color.border, paddingTop: 14 },
  resultHeading: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: color.ink },
  itinerary: { gap: 12, paddingVertical: 4 },
  itineraryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itineraryText: { flex: 1, gap: 2 },
  fareLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.actionTint, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  mapColumn: { backgroundColor: color.paper },
  mapCaption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tools: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
  details: { gap: 8 },
  manual: { gap: 10, paddingBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, borderBottomWidth: 1, borderColor: color.border },
  mapContainer: {
    height: 290,
    position: 'relative',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  bottomSheetSurface: {
    flex: 1,
    backgroundColor: color.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: 1,
    borderColor: color.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  stopBadgePill: {
    backgroundColor: color.successBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 2,
  },
  stopBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: color.success,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  unitIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  rowSubtitle: {
    fontSize: 13,
    color: color.inkMuted,
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
    color: color.ink,
  },
  mapFrameSmall: {
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
    position: 'relative',
  },
  loadingBayOverlay: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: color.successBg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  loadingBayOverlayText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.success,
  },
  boardingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: color.successBg,
  },
  boardingStatusDanger: {
    backgroundColor: color.dangerBg,
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
    color: color.ink,
  },
  seatBadge: {
    backgroundColor: color.successBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  seatBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.success,
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
    backgroundColor: color.successBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  linkedPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.success,
  },
  sheetHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: color.ink,
  },
  kvList: {
    borderTopWidth: 1,
    borderColor: color.border,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  kvLabel: {
    fontSize: 14,
    color: color.inkMuted,
  },
  kvValue: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
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
    color: color.inkMuted,
  },
});
