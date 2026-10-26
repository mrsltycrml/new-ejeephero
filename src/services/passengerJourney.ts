import type { VehicleData } from './offlineTransitService';
import type { PassengerFix } from './passengerSafety';

export type RideEvidence = { id: string; first: PassengerFix; last: PassengerFix; vehicleTime: number; count: number };
export function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const validPoint = (p: { latitude: number; longitude: number }) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
export function nearbyRideUnits(fix: PassengerFix | null, vehicles: VehicleData[], now: number) {
  if (!fix || !validPoint(fix) || fix.accuracy == null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 20 || now - fix.timestamp > 15_000 || fix.timestamp > now + 3000) return [];
  return vehicles.filter(v => !v.is_sample && validPoint(v) && v.body_number && v.plate_number && Number.isFinite(Date.parse(v.recorded_at || '')) && now - Date.parse(v.recorded_at!) <= 20_000 && Date.parse(v.recorded_at!) <= now + 3000)
    .map(vehicle => ({ vehicle, distance: meters(fix, vehicle) })).filter(v => v.distance <= 60).sort((a, b) => a.distance - b.distance);
}

// One nearby fix is never boarding evidence: require unique proximity,
// independent fresh telemetry and sustained travel together.
export function detectRide(previous: RideEvidence | null, fix: PassengerFix | null, vehicles: VehicleData[], now: number) {
  const nearby = nearbyRideUnits(fix, vehicles, now);
  if (!fix || nearby.length !== 1 || nearby[0].distance > 20 || !Number.isFinite(nearby[0].vehicle.speed) || nearby[0].vehicle.speed < 8) return { evidence: null, unit: null, nearby };
  const vehicle = nearby[0].vehicle;
  const vehicleTime = Date.parse(vehicle.recorded_at!);
  if (previous && previous.id === vehicle.vehicle_id && (fix.timestamp <= previous.last.timestamp || vehicleTime <= previous.vehicleTime)) return { evidence: previous, unit: null, nearby };
  const continuous = previous && previous.id === vehicle.vehicle_id && fix.timestamp - previous.last.timestamp <= 20_000;
  const evidence: RideEvidence = continuous
    ? { ...previous, last: fix, vehicleTime, count: previous.count + 1 }
    : { id: vehicle.vehicle_id, first: fix, last: fix, vehicleTime, count: 1 };
  const elapsed = fix.timestamp - evidence.first.timestamp;
  const travel = meters(evidence.first, fix);
  const inferred = evidence.count >= 4 && elapsed >= 30_000 && travel >= 100 && travel / (elapsed / 1000) >= 2;
  return { evidence, unit: inferred ? vehicle : null, nearby };
}
