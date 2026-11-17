import { distanceMeters } from './passengerSafety.ts';

export type Point = { latitude: number; longitude: number };
/** Speed is km/h here and in storage; only fromDeviceLocation accepts m/s. */
export type MeasuredFix = Point & { timestamp: number; accuracy: number | null; speed: number | null; heading: number | null };
export type LocationQuality = 'unavailable' | 'invalid' | 'future' | 'stale' | 'weak' | 'live';
export const LIVE_FIX_MS = 30_000;
export const validPoint = (point: Point | null | undefined): boolean => Boolean(point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
export const nullableMeasurement = (value: number | null | undefined, max = Infinity): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

export function locationQuality(fix: (Point & { timestamp: number; accuracy?: number | null }) | null, now = Date.now()): LocationQuality {
  if (!fix) return 'unavailable';
  if (!validPoint(fix) || !Number.isFinite(fix.timestamp)) return 'invalid';
  if (fix.timestamp > now + 5000) return 'future';
  if (now - fix.timestamp > LIVE_FIX_MS) return 'stale';
  if (nullableMeasurement(fix.accuracy, 30) == null) return 'weak';
  return 'live';
}

export function fromDeviceLocation(location: { timestamp: number; coords: Point & { accuracy: number | null; speed: number | null; heading: number | null } }): MeasuredFix {
  const { coords, timestamp } = location;
  const speed = nullableMeasurement(coords.speed, 130 / 3.6);
  return { latitude: coords.latitude, longitude: coords.longitude, timestamp, accuracy: nullableMeasurement(coords.accuracy), speed: speed == null ? null : speed * 3.6, heading: nullableMeasurement(coords.heading, 359.999999) };
}

export function acceptFix(previous: MeasuredFix | null, next: MeasuredFix, now = Date.now()): boolean {
  if (!['live', 'weak'].includes(locationQuality(next, now))) return false;
  if (!previous) return true;
  const elapsed = next.timestamp - previous.timestamp;
  if (elapsed <= 0) return false;
  // A long observation gap starts a new trail; it cannot establish an impossible jump.
  if (elapsed > 120_000 || previous.accuracy == null || next.accuracy == null) return true;
  return distanceMeters(previous, next) <= 130 / 3.6 * elapsed / 1000 + previous.accuracy + next.accuracy;
}

export function positionPayload(vehicleId: string, fix: MeasuredFix, now = Date.now()) {
  const quality = locationQuality(fix, now);
  if (quality !== 'live') throw new Error(`GPS ${quality}; waiting for a fresh, accurate fix.`);
  const captured = new Date(fix.timestamp).toISOString();
  return { vehicle_id: vehicleId, latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy,
    speed: nullableMeasurement(fix.speed, 130), heading: nullableMeasurement(fix.heading, 359.999999), timestamp: captured, captured_at: captured };
}

export function telemetryFix(row: Point & { captured_at?: string | null; accuracy?: number | null; speed?: number | null; heading?: number | null }): MeasuredFix {
  return { latitude: row.latitude, longitude: row.longitude, timestamp: Date.parse(row.captured_at || ''), accuracy: nullableMeasurement(row.accuracy), speed: nullableMeasurement(row.speed, 130), heading: nullableMeasurement(row.heading, 359.999999) };
}

export function locationDescription(fix: MeasuredFix | null, now = Date.now()): string {
  const quality = locationQuality(fix, now);
  if (!fix || quality === 'invalid' || quality === 'future') return `GPS ${quality}`;
  return `GPS ${quality} · measured ${Math.max(0, Math.floor((now - fix.timestamp) / 1000))}s ago · ${fix.accuracy == null ? 'accuracy unknown' : `±${Math.round(fix.accuracy)} m`}`;
}
