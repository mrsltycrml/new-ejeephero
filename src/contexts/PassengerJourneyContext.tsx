import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from './LocationContext';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';
import { offlineTransit, type TerminalData, type VehicleData, type TransitResult } from '../services/offlineTransitService';
import { detectRide, meters, nearbyRideUnits, type RideEvidence } from '../services/passengerJourney';
import type { PassengerPlace } from '../services/passengerPlaces';
import { selectJourneyRoute, selectJourneyStop, reconcileJourneySelection, type JourneySelection, type WalkingRouteGeometry } from '../services/routeMap';
import { locationQuality } from '../services/locationQuality';
import type { WalkingRoute } from '../services/walkingDirections';

export type PassengerUnit = { vehicle_id?: string; route_id: string; body_number: string; plate_number: string | null; source?: 'gps' | 'confirmed'; matchedAt?: number };
type JourneyState = {
  selectedRouteId: string | null; setSelectedRouteId: (id: string | null) => void;
  fleetRouteId: string | null;
  boardingStop: TerminalData | null; setBoardingStop: (stop: TerminalData | null) => void;
  alightingStop: TerminalData | null; setAlightingStop: (stop: TerminalData | null) => void;
  setRideStops: (boarding: TerminalData, alighting: TerminalData) => void;
  destinationPlace: PassengerPlace | null; setDestinationPlace: (place: PassengerPlace | null) => void;
  walkingRoutes: WalkingRouteGeometry[];
  transit: TransitResult;
  refreshTransit: () => Promise<TransitResult>;
  walk: { route: WalkingRoute; fromLabel: string; toLabel: string } | null;
  showWalk: (route: WalkingRoute, fromLabel: string, toLabel: string, expectedVersion?: number) => boolean;
  getJourneyVersion: () => number;
  unit: PassengerUnit | null; setUnit: (unit: PassengerUnit | null) => void;
  destination: TerminalData | null; setDestination: (stop: TerminalData | null) => void;
  place: PassengerPlace | null; setPlace: (place: PassengerPlace | null) => void;
  vehicles: VehicleData[]; vehicleError: string; nearby: VehicleData[]; endRide: () => void;
  vehicleRouteIds: ReadonlySet<string>;
};
const emptySelection: JourneySelection & { fleetRouteId?: string | null } = { selectedRouteId: null, boardingStop: null, alightingStop: null };
const emptyRouteIds: ReadonlySet<string> = new Set();
const emptyTransit: TransitResult = { routes: [], terminals: [], status: 'unavailable', error: 'Loading routes…', syncedAt: null, latencyMs: 0, isFromCache: false };
const unverifiedTransit = { ...emptyTransit, error: 'Current routes and stops could not be verified.' };
const catalogData = ({ routes, terminals }: TransitResult, routeId: string | null = null) => JSON.stringify(routeId
  ? [routes.find(route => route.id === routeId), terminals.filter(stop => stop.route_id === routeId)]
  : [routes, terminals]);
const Journey = createContext<JourneyState>({ ...emptySelection, fleetRouteId: null, setSelectedRouteId: () => {}, setBoardingStop: () => {}, setAlightingStop: () => {}, setRideStops: () => {}, destinationPlace: null, setDestinationPlace: () => {}, walkingRoutes: [], transit: emptyTransit, refreshTransit: async () => emptyTransit, walk: null, showWalk: () => false, getJourneyVersion: () => 0, unit: null, setUnit: () => {}, destination: null, setDestination: () => {}, place: null, setPlace: () => {}, vehicles: [], vehicleRouteIds: new Set(), vehicleError: '', nearby: [], endRide: () => {} });
export function PassengerJourneyProvider({ children }: { children: React.ReactNode }) {
  const { location, errorMsg, foreground } = useLocation();
  const { isConnected } = useNetwork();
  const { user } = useAuth();
  const [matchedUnit, updateUnit] = useState<PassengerUnit | null>(null);
  const [selection, setSelection] = useState(emptySelection);
  const [catalogPending, setCatalogPending] = useState(false);
  const activeSelection = catalogPending ? emptySelection : selection;
  const destination = activeSelection.alightingStop;
  const [place, updatePlace] = useState<PassengerPlace | null>(null);
  const [walkingRoutes, setWalkingRoutes] = useState<WalkingRouteGeometry[]>([]);
  const [transit, setTransit] = useState<TransitResult>(emptyTransit);
  const currentTransit = useRef(emptyTransit);
  const currentRoute = useRef(selection.selectedRouteId);
  currentRoute.current = selection.selectedRouteId;
  const observedVersion = useRef<string | null>(null);
  const confirmedVersion = useRef<string | null>(null);
  const isCurrentCatalog = useCallback(() => observedVersion.current === confirmedVersion.current, []);
  const [walk, setWalk] = useState<JourneyState['walk']>(null);
  const journeyVersion = useRef(0);
  const getJourneyVersion = useCallback(() => journeyVersion.current, []);
  const clearWalk = useCallback(() => { journeyVersion.current++; setWalk(null); setWalkingRoutes([]); }, []);
  const showWalk = useCallback((route: WalkingRoute, fromLabel: string, toLabel: string, expectedVersion?: number) => {
    if (!isCurrentCatalog() ||
        (expectedVersion !== undefined && expectedVersion !== journeyVersion.current)) return false;
    setWalk({ route, fromLabel, toLabel });
    setWalkingRoutes([{ id: `${fromLabel}:${toLabel}`, coordinates: route.coordinates, source: route.source_url, generatedAt: route.verified_at }]);
    return true;
  }, [isCurrentCatalog]);
  const setPlace = useCallback((value: PassengerPlace | null) => { updatePlace(value); clearWalk(); }, [clearWalk]);
  const setSelectedRouteId = useCallback((id: string | null) => {
    if (id && !isCurrentCatalog()) return;
    setSelection(state => {
      const next = selectJourneyRoute(state, id, currentTransit.current.routes);
      return { ...next, fleetRouteId: next.selectedRouteId };
    });
    clearWalk();
  }, [clearWalk, isCurrentCatalog]);
  const setBoardingStop = useCallback((stop: TerminalData | null) => {
    if (stop && !isCurrentCatalog()) return;
    setSelection(state => selectJourneyStop(state, stop, 'boarding', currentTransit.current.routes, currentTransit.current.terminals));
    clearWalk();
  }, [clearWalk, isCurrentCatalog]);
  const [fleet, setFleet] = useState<VehicleData[]>([]);
  const [inService, setInService] = useState<ReadonlySet<string> | null>(null);
  const vehicleRouteIds = inService ?? emptyRouteIds;
  const rideRouteIds = useMemo(() => transit.status === 'ready'
    ? new Set(transit.routes.filter(r => vehicleRouteIds.has(r.id)).map(r => r.id))
    : vehicleRouteIds, [transit, vehicleRouteIds]);
  const [now, setNow] = useState(Date.now());
  const vehicles = useMemo(() => fleet.filter(v => vehicleRouteIds.has(v.route_id) && !v.is_sample &&
    ['live', 'weak'].includes(locationQuality({ ...v, timestamp: Date.parse(v.recorded_at || '') }, now))), [fleet, vehicleRouteIds, now]);
  const unit = matchedUnit && rideRouteIds.has(matchedUnit.route_id) ? matchedUnit : null;
  const [vehicleError, setVehicleError] = useState('');
  const evidence = useRef<RideEvidence | null>(null);
  const lastMatch = useRef(0);
  const separated = useRef(0);
  const lastSeparationFix = useRef(0);
  const ignoredUntil = useRef(0);
  const setUnit = useCallback((value: PassengerUnit | null) => {
    if (value && !isCurrentCatalog()) return;
    evidence.current = null; separated.current = 0; lastMatch.current = Date.now();
    updateUnit(value && rideRouteIds.has(value.route_id) ? { ...value, source: value.source || 'confirmed', matchedAt: Date.now() } : null);
  }, [rideRouteIds, isCurrentCatalog]);
  const endRide = useCallback(() => { setUnit(null); setPlace(null); ignoredUntil.current = Date.now() + 60_000; setSelection(emptySelection); }, [setUnit, setPlace]);
  const setDestination = useCallback((stop: TerminalData | null) => {
    if (stop && !isCurrentCatalog()) return;
    evidence.current = null;
    ignoredUntil.current = 0;
    setSelection(state => selectJourneyStop(state, stop, 'alighting', currentTransit.current.routes, currentTransit.current.terminals));
    clearWalk();
  }, [clearWalk, isCurrentCatalog]);
  const setRideStops = useCallback((boarding: TerminalData, alighting: TerminalData) => {
    if (!isCurrentCatalog()) return;
    const { routes, terminals } = currentTransit.current;
    const next = reconcileJourneySelection({ selectedRouteId: boarding.route_id, boardingStop: boarding, alightingStop: alighting }, routes, terminals);
    if (!next.boardingStop || !next.alightingStop) return;
    evidence.current = null;
    ignoredUntil.current = 0;
    setSelection(state => ({ ...next, fleetRouteId: state.fleetRouteId === next.selectedRouteId ? state.fleetRouteId : null }));
    clearWalk();
  }, [clearWalk, isCurrentCatalog]);
  useEffect(() => { updateUnit(null); setSelection(emptySelection); setPlace(null); evidence.current = null; }, [user?.id]);
  useEffect(() => {
    if (!matchedUnit) return;
    if ((inService && !inService.has(matchedUnit.route_id)) ||
        (transit.status === 'ready' && !transit.routes.some(route => route.id === matchedUnit.route_id))) {
      updateUnit(null); evidence.current = null;
    }
  }, [matchedUnit, inService, transit]);
  const transitRequest = useRef(0);
  const loadTransit = useCallback(async (manual: boolean, verify: boolean) => {
    const request = ++transitRequest.current;
    const version = observedVersion.current;
    const data = await offlineTransit.getTransitData();
    if (request !== transitRequest.current || version !== observedVersion.current) return data;
    if (verify && version !== null && data.status === 'ready') {
      // Separate route and stop reads can overlap an operator edit.
      const confirmed = await offlineTransit.getPassengerFleetSnapshot().then(snapshot => snapshot.catalogVersion, () => null);
      if (request !== transitRequest.current || version !== observedVersion.current) return data;
      if (confirmed === version) confirmedVersion.current = confirmed;
      else {
        if (confirmed !== null) observedVersion.current = confirmed;
        confirmedVersion.current = null;
      }
    }
    if (!isCurrentCatalog()) {
      setCatalogPending(true);
      return unverifiedTransit;
    }
    setCatalogPending(false);
    const previous = currentTransit.current;
    const changed = catalogData(previous) !== catalogData(data);
    if (!manual && !changed && previous.status === data.status && previous.error === data.error) return previous;
    currentTransit.current = data;
    setTransit(data);
    setSelection(state => {
      const next = reconcileJourneySelection(state, data.routes, data.terminals);
      return { ...next, fleetRouteId: state.fleetRouteId === next.selectedRouteId ? state.fleetRouteId : null };
    });
    if (manual || (changed && catalogData(previous, currentRoute.current) !== catalogData(data, currentRoute.current))) clearWalk();
    return data;
  }, [clearWalk, isCurrentCatalog]);
  const refreshTransit = useCallback(() => loadTransit(true, foreground && isConnected), [loadTransit, foreground, isConnected]);
  useEffect(() => {
    if (!foreground) return;
    if (!isConnected || !user?.id) {
      void loadTransit(false, false);
      return () => { transitRequest.current++; };
    }
    let active = true, pending = false, first = true;
    let checking: string | null = null;
    const refresh = async () => {
      setNow(Date.now()); if (pending) return;
      pending = true;
      try {
        const { routeIds, catalogVersion, vehicles } = await offlineTransit.getPassengerFleetSnapshot();
        if (!active) return;
        setInService(routeIds);
        setNow(Date.now()); setFleet(vehicles); setVehicleError('');
        observedVersion.current = catalogVersion;
        if (!isCurrentCatalog()) setCatalogPending(true);
        if ((first || confirmedVersion.current !== catalogVersion) && checking !== catalogVersion) {
          first = false;
          checking = catalogVersion;
          void loadTransit(false, true).finally(() => { if (checking === catalogVersion) checking = null; });
        }
      }
      catch {
        if (!active) return;
        setFleet([]); setInService(null); setVehicleError('Vehicle locations unavailable.');
        if (first) { first = false; void loadTransit(false, false); }
      }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; transitRequest.current++; clearInterval(timer); setFleet([]); setInService(null); };
  }, [foreground, isConnected, user?.id, loadTransit, isCurrentCatalog]);
  const fix = useMemo(() => location && foreground && !errorMsg ? { ...location.coords, timestamp: location.timestamp } : null,
    [location, foreground, errorMsg]);
  const candidates = useMemo(() => nearbyRideUnits(fix, isConnected ? vehicles.filter(v => rideRouteIds.has(v.route_id) && (!selection.selectedRouteId || v.route_id === selection.selectedRouteId)) : [], now),
    [fix, vehicles, rideRouteIds, selection.selectedRouteId, isConnected, now]);
  const nearby = candidates.map(c => c.vehicle);
  useEffect(() => {
    if (unit) {
      const matching = candidates.find(c => c.vehicle.vehicle_id === unit.vehicle_id && c.distance <= 35);
      if (matching) { lastMatch.current = now; separated.current = 0; }
      else {
        const tracked = isConnected && vehicles.find(v => v.vehicle_id === unit.vehicle_id && locationQuality({ ...v, timestamp: Date.parse(v.recorded_at || '') }, now) === 'live' && now - Date.parse(v.recorded_at || '') <= 20_000);
        if (fix && now - fix.timestamp <= 15_000 && fix.accuracy != null && fix.accuracy <= 20 && tracked && meters(fix, tracked) > 80 && fix.timestamp !== lastSeparationFix.current) { separated.current++; lastSeparationFix.current = fix.timestamp; }
        if (now - lastMatch.current > 90_000 || separated.current >= 3) { setUnit(null); ignoredUntil.current = now + 30_000; }
      }
      return;
    }
    if (!destination || now < ignoredUntil.current) return;
    const result = detectRide(evidence.current, fix, candidates.map(c => c.vehicle), now);
    evidence.current = result.evidence;
    if (result.unit) setUnit({ vehicle_id: result.unit.vehicle_id, route_id: result.unit.route_id, body_number: result.unit.body_number, plate_number: result.unit.plate_number, source: 'gps' });
  }, [fix, candidates, vehicles, now, unit, destination, setUnit, isConnected]);
  return <Journey.Provider value={{ ...activeSelection, fleetRouteId: activeSelection.fleetRouteId ?? null, setSelectedRouteId, setBoardingStop, setAlightingStop: setDestination, setRideStops, destinationPlace: place, setDestinationPlace: setPlace, walkingRoutes: catalogPending ? [] : walkingRoutes, transit: catalogPending ? unverifiedTransit : transit, refreshTransit, walk: catalogPending ? null : walk, showWalk, getJourneyVersion, unit, setUnit, destination, setDestination, place, setPlace, vehicles, vehicleRouteIds, vehicleError, nearby, endRide }}>{children}</Journey.Provider>;
}
export const usePassengerJourney = () => useContext(Journey);
