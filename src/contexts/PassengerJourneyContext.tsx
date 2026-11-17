import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from './LocationContext';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';
import { offlineTransit, type TerminalData, type VehicleData, type TransitResult } from '../services/offlineTransitService';
import { detectRide, meters, nearbyRideUnits, type RideEvidence } from '../services/passengerJourney';
import type { PassengerPlace } from '../services/passengerPlaces';
import { selectJourneyRoute, selectJourneyStop, reconcileJourneySelection, type JourneySelection, type WalkingRouteGeometry } from '../services/routeMap';
import { locationQuality } from '../services/locationQuality';

export type PassengerUnit = { vehicle_id?: string; body_number: string; plate_number: string | null; source?: 'gps' | 'confirmed'; matchedAt?: number };
type JourneyState = {
  selectedRouteId: string | null; setSelectedRouteId: (id: string | null) => void;
  boardingStop: TerminalData | null; setBoardingStop: (stop: TerminalData | null) => void;
  alightingStop: TerminalData | null; setAlightingStop: (stop: TerminalData | null) => void;
  destinationPlace: PassengerPlace | null; setDestinationPlace: (place: PassengerPlace | null) => void;
  walkingRoutes: WalkingRouteGeometry[]; setWalkingRoutes: (routes: WalkingRouteGeometry[]) => void;
  transit: TransitResult;
  unit: PassengerUnit | null; setUnit: (unit: PassengerUnit | null) => void;
  destination: TerminalData | null; setDestination: (stop: TerminalData | null) => void;
  place: PassengerPlace | null; setPlace: (place: PassengerPlace | null) => void;
  vehicles: VehicleData[]; vehicleError: string; nearby: VehicleData[]; signal: string; endRide: () => void;
};
const emptySelection: JourneySelection = { selectedRouteId: null, boardingStop: null, alightingStop: null };
const emptyTransit: TransitResult = { routes: [], terminals: [], status: 'unavailable', error: 'Loading routes…', syncedAt: null, latencyMs: 0, isFromCache: false };
const Journey = createContext<JourneyState>({ ...emptySelection, setSelectedRouteId: () => {}, setBoardingStop: () => {}, setAlightingStop: () => {}, destinationPlace: null, setDestinationPlace: () => {}, walkingRoutes: [], setWalkingRoutes: () => {}, transit: emptyTransit, unit: null, setUnit: () => {}, destination: null, setDestination: () => {}, place: null, setPlace: () => {}, vehicles: [], vehicleError: '', nearby: [], signal: '', endRide: () => {} });
export function PassengerJourneyProvider({ children }: { children: React.ReactNode }) {
  const { location, errorMsg, foreground } = useLocation();
  const { isConnected } = useNetwork();
  const { user } = useAuth();
  const [unit, updateUnit] = useState<PassengerUnit | null>(null);
  const [selection, setSelection] = useState<JourneySelection>(emptySelection);
  const destination = selection.alightingStop;
  const [place, updatePlace] = useState<PassengerPlace | null>(null);
  const [walkingRoutes, setWalkingRoutes] = useState<WalkingRouteGeometry[]>([]);
  const [transit, setTransit] = useState<TransitResult>(emptyTransit);
  const setPlace = useCallback((value: PassengerPlace | null) => { updatePlace(value); setWalkingRoutes([]); }, []);
  const setSelectedRouteId = useCallback((id: string | null) => { setSelection(state => selectJourneyRoute(state, id, transit.routes)); setWalkingRoutes([]); }, [transit.routes]);
  const setBoardingStop = useCallback((stop: TerminalData | null) => { setSelection(state => selectJourneyStop(state, stop, 'boarding', transit.routes, transit.terminals)); setWalkingRoutes([]); }, [transit]);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [vehicleError, setVehicleError] = useState('');
  const [nearby, setNearby] = useState<VehicleData[]>([]);
  const [signal, setSignal] = useState('Choose your destination to find a unit.');
  const [now, setNow] = useState(Date.now());
  const evidence = useRef<RideEvidence | null>(null);
  const lastMatch = useRef(0);
  const separated = useRef(0);
  const lastSeparationFix = useRef(0);
  const ignoredUntil = useRef(0);
  const setUnit = useCallback((value: PassengerUnit | null) => {
    evidence.current = null; separated.current = 0; lastMatch.current = Date.now();
    updateUnit(value ? { ...value, source: value.source || 'confirmed', matchedAt: Date.now() } : null);
  }, []);
  const endRide = useCallback(() => { setUnit(null); setPlace(null); ignoredUntil.current = Date.now() + 60_000; setSelection(emptySelection); setSignal('Ride ended. Choose your next destination.'); }, [setUnit, setPlace]);
  const setDestination = useCallback((stop: TerminalData | null) => { evidence.current = null; ignoredUntil.current = 0; setSelection(state => selectJourneyStop(state, stop, 'alighting', transit.routes, transit.terminals)); setWalkingRoutes([]); }, [transit]);
  useEffect(() => { updateUnit(null); setSelection(emptySelection); setPlace(null); evidence.current = null; setNearby([]); }, [user?.id]);
  useEffect(() => {
    let active = true;
    void offlineTransit.getTransitData().then(data => {
      if (!active) return;
      setTransit(data);
      setSelection(state => reconcileJourneySelection(state, data.routes, data.terminals));
      setWalkingRoutes([]);
    });
    return () => { active = false; };
  }, [isConnected, user?.id]);
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async () => {
      setNow(Date.now()); if (pending) return;
      pending = true;
      try { const data = await offlineTransit.getVehicles(); if (active) { setVehicles(data); setVehicleError(''); } }
      catch { if (active) { setVehicles([]); setVehicleError('Vehicle locations unavailable.'); } }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    const fix = location && foreground && !errorMsg ? { ...location.coords, timestamp: location.timestamp } : null;
    const candidates = nearbyRideUnits(fix, isConnected ? vehicles.filter(v => !selection.selectedRouteId || v.route_id === selection.selectedRouteId) : [], now);
    setNearby(candidates.map(c => c.vehicle));
    if (unit) {
      const matching = candidates.find(c => c.vehicle.vehicle_id === unit.vehicle_id && c.distance <= 35);
      if (matching) { lastMatch.current = now; separated.current = 0; setSignal(unit.source === 'gps' ? 'Unit matched from your shared GPS movement.' : 'Unit confirmed. GPS is monitoring this ride.'); }
      else {
        const tracked = isConnected && vehicles.find(v => v.vehicle_id === unit.vehicle_id && locationQuality({ ...v, timestamp: Date.parse(v.recorded_at || '') }, now) === 'live' && now - Date.parse(v.recorded_at || '') <= 20_000);
        if (fix && now - fix.timestamp <= 15_000 && fix.accuracy != null && fix.accuracy <= 20 && tracked && meters(fix, tracked) > 80 && fix.timestamp !== lastSeparationFix.current) { separated.current++; lastSeparationFix.current = fix.timestamp; }
        setSignal('Checking your ride connection…');
        if (now - lastMatch.current > 90_000 || separated.current >= 3) { setUnit(null); ignoredUntil.current = now + 30_000; setSignal('Ride connection lost. Unit details cleared until a fresh match.'); }
      }
      return;
    }
    if (!destination || now < ignoredUntil.current) return;
    const result = detectRide(evidence.current, fix, candidates.map(c => c.vehicle), now);
    evidence.current = result.evidence;
    if (result.unit) setUnit({ vehicle_id: result.unit.vehicle_id, body_number: result.unit.body_number, plate_number: result.unit.plate_number, source: 'gps' });
    setSignal(result.unit ? 'Unit detected. Emergency details are ready.' : result.nearby.length > 1 ? 'Several units are nearby. Tap the one you boarded to confirm.' : !fix || now - fix.timestamp > 15_000 ? 'Waiting for a fresh GPS location.' : result.evidence ? 'Checking which unit is moving with you…' : 'Your unit will be matched when you travel together.');
  }, [location, vehicles, now, unit, destination, setUnit, foreground, errorMsg, isConnected, selection.selectedRouteId]);
  return <Journey.Provider value={{ ...selection, setSelectedRouteId, setBoardingStop, setAlightingStop: setDestination, destinationPlace: place, setDestinationPlace: setPlace, walkingRoutes, setWalkingRoutes, transit, unit, setUnit, destination, setDestination, place, setPlace, vehicles, vehicleError, nearby, signal, endRide }}>{children}</Journey.Provider>;
}
export const usePassengerJourney = () => useContext(Journey);
