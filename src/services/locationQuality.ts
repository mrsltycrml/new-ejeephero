import { distanceMeters } from './passengerSafety.ts';
import type { TFunction } from 'i18next';

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

/** Only the driver display may use a GPS distance/time estimate. Published speed is the device measurement. */
export function driverSpeed(previous: MeasuredFix | null, current: MeasuredFix | null, now = Date.now()) {
  if (!current || locationQuality(current, now) !== 'live') return null;
  const measured = nullableMeasurement(current.speed, 130);
  if (measured != null) return { kph: measured, estimated: false };
  if (!previous || locationQuality(previous, now) !== 'live') return null;
  const elapsed = current.timestamp - previous.timestamp;
  if (elapsed < 2000 || elapsed > LIVE_FIX_MS) return null;
  const distance = distanceMeters(previous, current);
  if (distance <= previous.accuracy! + current.accuracy!) return null;
  const kph = nullableMeasurement(distance * 3600 / elapsed, 130);
  return kph == null ? null : { kph, estimated: true };
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

export function locationDescription(fix: MeasuredFix | null, now = Date.now(), t?: TFunction): string {
  const quality = locationQuality(fix, now);
  const label = t ? t('passenger.gps.' + quality) : quality;
  if (!fix || quality === 'invalid' || quality === 'future') return `GPS ${label}`;
  const seconds = Math.max(0, Math.floor((now - fix.timestamp) / 1000));
  const accuracy = fix.accuracy == null ? (t?.('passenger.gps.unknown') ?? 'accuracy unknown') : `±${Math.round(fix.accuracy)} m`;
  return t ? t('passenger.gps.measurement', { quality: label, seconds, accuracy }) : `GPS ${quality} · measured ${seconds}s ago · ${accuracy}`;
}

export function vehicleTelemetryReadout(position: (Point & { recorded_at?: string; speed: number | null; accuracy?: number | null }) | null, now = Date.now(), t?: TFunction) {
  const fix = position && telemetryFix({ ...position, captured_at: position.recorded_at });
  const quality = locationQuality(fix, now);
  if (quality !== 'live' && quality !== 'weak') return { gps: t?.('passenger.gps.noVehicle') ?? 'Current vehicle GPS unavailable', speed: null };
  return { gps: locationDescription(fix, now, t), speed: quality === 'live' ? fix?.speed ?? null : null };
}
