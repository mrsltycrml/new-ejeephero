import { validPoint, validSource } from '../walking-directions/contract.ts';

export type PassengerUse = 'board' | 'alight' | 'both';
export type StopEvidence = {
  latitude?: unknown; longitude?: unknown; is_sample?: unknown; is_active?: unknown; deleted_at?: unknown;
  location_verified_at?: unknown; location_source_url?: unknown;
  passenger_use?: unknown; passenger_use_verified_at?: unknown; passenger_use_source_url?: unknown;
};

export function verifiedStop(stop: StopEvidence, now = Date.now()) {
  return !stop.is_sample && stop.is_active !== false && !stop.deleted_at
    && typeof stop.location_verified_at === 'string' && Date.parse(stop.location_verified_at) <= now
    && typeof stop.location_source_url === 'string' && /^https?:\/\/\S+$/.test(stop.location_source_url.trim()) && validPoint(stop);
}

export function confirmedPassengerUse(stop: StopEvidence, now = Date.now()): PassengerUse | null {
  const use = stop.passenger_use;
  if (use !== 'board' && use !== 'alight' && use !== 'both') return null;
  const at = stop.passenger_use_verified_at, source = stop.passenger_use_source_url;
  return verifiedStop(stop, now) && typeof at === 'string' && Date.parse(at) <= now
    && typeof source === 'string' && /^https:\/\/[^/\s?#\\]+[^\s\\]*$/.test(source) && validSource(source, at, now) ? use : null;
}

export function permitsPassengerUse(stop: StopEvidence | undefined | null, role: 'board' | 'alight', now = Date.now()) {
  const use = stop && confirmedPassengerUse(stop, now);
  return use === role || use === 'both';
}
