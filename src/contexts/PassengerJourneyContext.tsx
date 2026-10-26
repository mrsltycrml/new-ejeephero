import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from './LocationContext';
import { useAuth } from './AuthContext';
import { offlineTransit, type TerminalData, type VehicleData } from '../services/offlineTransitService';
import { detectRide, meters, nearbyRideUnits, type RideEvidence } from '../services/passengerJourney';
import type { PassengerPlace } from '../services/passengerPlaces';

export type PassengerUnit = { vehicle_id?: string; body_number: string; plate_number: string | null; source?: 'gps' | 'confirmed' | 'sample'; matchedAt?: number };
type JourneyState = {
  unit: PassengerUnit | null; setUnit: (unit: PassengerUnit | null) => void;
  destination: TerminalData | null; setDestination: (stop: TerminalData | null) => void;
  place: PassengerPlace | null; setPlace: (place: PassengerPlace | null) => void;
  vehicles: VehicleData[]; nearby: VehicleData[]; signal: string; endRide: () => void;
};
const Journey = createContext<JourneyState>({ unit: null, setUnit: () => {}, destination: null, setDestination: () => {}, place: null, setPlace: () => {}, vehicles: [], nearby: [], signal: '', endRide: () => {} });
export function PassengerJourneyProvider({ children }: { children: React.ReactNode }) {
  const { location } = useLocation();
  const { user } = useAuth();
  const [unit, updateUnit] = useState<PassengerUnit | null>(null);
  const [destination, updateDestination] = useState<TerminalData | null>(null);
  const [place, setPlace] = useState<PassengerPlace | null>(null);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
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
  const endRide = useCallback(() => { setUnit(null); setPlace(null); ignoredUntil.current = Date.now() + 60_000; updateDestination(null); setSignal('Ride ended. Choose your next destination.'); }, [setUnit]);
  const setDestination = useCallback((stop: TerminalData | null) => { evidence.current = null; ignoredUntil.current = 0; updateDestination(stop); }, []);
  useEffect(() => { updateUnit(null); updateDestination(null); setPlace(null); evidence.current = null; setNearby([]); }, [user?.id]);
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async () => {
      setNow(Date.now()); if (pending) return;
      pending = true;
      try { const data = await offlineTransit.getVehicles(); if (active) setVehicles(data); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    const fix = location ? { ...location.coords, timestamp: location.timestamp } : null;
    const candidates = nearbyRideUnits(fix, vehicles, now);
    setNearby(candidates.map(c => c.vehicle));
    if (unit?.source === 'sample') { setSignal('Sample ride — unit details filled automatically.'); return; }
    if (unit) {
      const matching = candidates.find(c => c.vehicle.vehicle_id === unit.vehicle_id && c.distance <= 35);
      if (matching) { lastMatch.current = now; separated.current = 0; setSignal(unit.source === 'gps' ? 'Unit matched from your shared GPS movement.' : 'Unit confirmed. GPS is monitoring this ride.'); }
      else {
        const tracked = vehicles.find(v => v.vehicle_id === unit.vehicle_id && now - Date.parse(v.recorded_at || '') <= 20_000);
        if (fix && now - fix.timestamp <= 15_000 && fix.accuracy != null && fix.accuracy <= 20 && tracked && meters(fix, tracked) > 80 && fix.timestamp !== lastSeparationFix.current) { separated.current++; lastSeparationFix.current = fix.timestamp; }
        setSignal('Checking your ride connection…');
        if (now - lastMatch.current > 90_000 || separated.current >= 3) { setUnit(null); ignoredUntil.current = now + 30_000; setSignal('Ride connection lost. Unit details cleared until a fresh match.'); }
      }
      return;
    }
    if (!destination || now < ignoredUntil.current) return;
    const result = detectRide(evidence.current, fix, vehicles, now);
    evidence.current = result.evidence;
    if (result.unit) setUnit({ vehicle_id: result.unit.vehicle_id, body_number: result.unit.body_number, plate_number: result.unit.plate_number, source: 'gps' });
    setSignal(result.unit ? 'Unit detected. Emergency details are ready.' : result.nearby.length > 1 ? 'Several units are nearby. Tap the one you boarded to confirm.' : !fix || now - fix.timestamp > 15_000 ? 'Waiting for a fresh GPS location.' : result.evidence ? 'Checking which unit is moving with you…' : 'Your unit will be matched when you travel together.');
  }, [location, vehicles, now, unit, destination, setUnit]);
  return <Journey.Provider value={{ unit, setUnit, destination, setDestination, place, setPlace, vehicles, nearby, signal, endRide }}>{children}</Journey.Provider>;
}
export const usePassengerJourney = () => useContext(Journey);
