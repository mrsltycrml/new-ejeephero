import { validDateKey, validSource } from '../walking-directions/contract.ts';
import { permitsPassengerUse, verifiedStop, type StopEvidence } from './passengerStopUse.ts';
import { manilaDateKey } from './manilaDate.ts';

export type FarePassengerType = 'regular' | 'student' | 'senior' | 'pwd';
type FareStopEvidence = StopEvidence & { id: string; route_id: string; sequence_order: number };
export type RoadSegment = { route_id: string; from_stop_id: string; to_stop_id: string; distance_meters: number; source_url: string; verified_at: string; is_sample?: boolean };
export type FareMatrix = { route_id: string; currency?: string | null; source_url: string; verified_at: string; effective_from: string; effective_to: string | null; brackets: { up_to_km: number; regular: number; discounted: number }[]; is_sample?: boolean };
export type FareQuote = { amount: number; regular: number; discount: number; basis: 'Sourced matrix'; source: string; verified_at: string; effective_from: string; effective_to: string | null; currency: 'PHP' };

// Refuse ambiguous branches: a fare must refer to one evidenced directed journey.
export function ridePath<Stop extends FareStopEvidence>(from: string, to: string, routeId: string, segments: RoadSegment[], stops: Stop[], now = Date.now()) {
  const known = new Map(stops.filter(s => s.route_id === routeId).map(s => [s.id, s]));
  if (!permitsPassengerUse(known.get(from), 'board', now) || !permitsPassengerUse(known.get(to), 'alight', now)) return null;
  if (!from || !to || from === to || segments.length > 5000) return null;
  const valid = segments.filter(s => s && !s.is_sample && s.route_id === routeId && s.from_stop_id !== s.to_stop_id && validSource(s.source_url, s.verified_at, now) && Number.isFinite(s.distance_meters) && s.distance_meters > 0 && s.distance_meters <= 200000);
  const paths: { ids: string[]; distances: number[] }[] = [];
  const pending = [{ ids: [from], distances: [] as number[] }];
  let examined = 0;
  while (pending.length) {
    if (++examined > 5000) return null;
    const path = pending.pop()!;
    const id = path.ids[path.ids.length - 1];
    if (id === to) { paths.push(path); if (paths.length > 1) return null; continue; }
    for (const s of valid.filter(s => s.from_stop_id === id)) {
      if (!path.ids.includes(s.to_stop_id)) pending.push({ ids: [...path.ids, s.to_stop_id], distances: [...path.distances, s.distance_meters] });
    }
  }
  const path = paths[0];
  if (!path) return null;
  const ordered: Stop[] = [];
  for (const id of path.ids) {
    const stop = known.get(id);
    if (!stop || !verifiedStop(stop, now) || !validSource(stop.location_source_url, stop.location_verified_at, now) || !Number.isFinite(stop.sequence_order)
      || (ordered.length && ordered[ordered.length - 1].sequence_order >= stop.sequence_order)) return null;
    ordered.push(stop);
  }
  return { stops: ordered, distances: path.distances };
}
export function verifiedRideDistance(from: string, to: string, routeId: string, segments: RoadSegment[], stops: FareStopEvidence[], now = Date.now()): number | null {
  const path = ridePath(from, to, routeId, segments, stops, now);
  return path ? path.distances.reduce((a, b) => a + b, 0) / 1000 : null;
}
export function validFareMatrix(matrix: FareMatrix | null | undefined, routeId: string, date = manilaDateKey(new Date()), now = Date.now()): matrix is FareMatrix {
  if (!matrix || matrix.is_sample || matrix.route_id !== routeId || matrix.currency !== 'PHP' || !validDateKey(date) || !validSource(matrix.source_url, matrix.verified_at, now)
    || !validDateKey(matrix.effective_from) || (matrix.effective_to !== null && !validDateKey(matrix.effective_to))
    || matrix.effective_from > date || (matrix.effective_to !== null && (matrix.effective_to < matrix.effective_from || matrix.effective_to < date))
    || !Array.isArray(matrix.brackets) || !matrix.brackets.length || matrix.brackets.length > 500) return false;
  let km = 0, regular = 0, discounted = 0;
  for (const row of matrix.brackets) {
    if (!row || !Number.isFinite(row.up_to_km) || row.up_to_km <= km || row.up_to_km > 200
      || !Number.isFinite(row.regular) || !Number.isSafeInteger(Math.round(row.regular * 100)) || row.regular <= 0 || row.regular < regular
      || !Number.isFinite(row.discounted) || row.discounted < 0 || row.discounted > row.regular || row.discounted < discounted) return false;
    km = row.up_to_km; regular = row.regular; discounted = row.discounted;
  }
  return true;
}
export function quotePassengerFare(distanceKm: number, type: FarePassengerType, route: { id: string }, matrix?: FareMatrix | null, date = manilaDateKey(new Date()), now = Date.now()): FareQuote | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 200 || !['regular', 'student', 'senior', 'pwd'].includes(type) || !validFareMatrix(matrix, route.id, date, now)) return null;
  const row = matrix.brackets.find(b => b.up_to_km >= distanceKm);
  if (!row) return null;
  const amount = type === 'regular' ? row.regular : row.discounted;
  return { amount, regular: row.regular, discount: Math.round((row.regular - amount) * 100) / 100, basis: 'Sourced matrix', source: matrix.source_url,
    verified_at: matrix.verified_at, effective_from: matrix.effective_from, effective_to: matrix.effective_to, currency: 'PHP' };
}
