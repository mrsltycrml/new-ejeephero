import type { FarePassengerType } from './fareCalculator.ts';
import { manilaDateKey } from '../utils/reportingPeriod.ts';
import { parseWalkingRoute, validDateKey, validSource, type WalkingRoute, type WalkingStep, type Point } from './walkingDirections.ts';

export type RoadSegment = { route_id: string; from_stop_id: string; to_stop_id: string; distance_meters: number; source_url: string; verified_at: string };
export type WalkLink = { from_stop_id: string; to_stop_id: string; distance_meters: number; duration_seconds: number; source_url: string; verified_at: string; accessible: boolean | null; coordinates?: Point[] | null; steps?: WalkingStep[] | null; accessibility_source_url?: string | null; accessibility_verified_at?: string | null };
export type FareMatrix = { route_id: string; currency?: string | null; source_url: string; verified_at: string; effective_from: string; effective_to: string | null; brackets: { up_to_km: number; regular: number; discounted: number }[] };
export type FareStop = Point & { id: string; name: string; route_id: string; sequence_order: number; location_source_url?: string | null; location_verified_at?: string | null; is_sample?: boolean; is_active?: boolean; deleted_at?: string | null };
export type FareQuote = { amount: number; regular: number; discount: number; basis: 'Sourced matrix'; source: string; verified_at: string; effective_from: string; effective_to: string | null; currency: 'PHP' };

// Refuse ambiguous branches: a fare must refer to one evidenced directed journey.
function ridePath(from: string, to: string, routeId: string, segments: RoadSegment[]) {
  if (!from || !to || from === to || segments.length > 5000) return null;
  const valid = segments.filter(s => s && s.route_id === routeId && s.from_stop_id !== s.to_stop_id && validSource(s.source_url, s.verified_at) && Number.isFinite(s.distance_meters) && s.distance_meters > 0 && s.distance_meters <= 200000);
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
  return paths[0] || null;
}
export function verifiedRideDistance(from: string, to: string, routeId: string, segments: RoadSegment[]): number | null {
  const path = ridePath(from, to, routeId, segments);
  return path ? path.distances.reduce((a, b) => a + b, 0) / 1000 : null;
}
export function validFareMatrix(matrix: FareMatrix | null | undefined, routeId: string, date = manilaDateKey(new Date())): matrix is FareMatrix {
  if (!matrix || matrix.route_id !== routeId || matrix.currency !== 'PHP' || !validDateKey(date) || !validSource(matrix.source_url, matrix.verified_at)
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
export function quotePassengerFare(distanceKm: number, type: FarePassengerType, route: { id: string }, matrix?: FareMatrix | null, date = manilaDateKey(new Date())): FareQuote | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 200 || !['regular', 'student', 'senior', 'pwd'].includes(type) || !validFareMatrix(matrix, route.id, date)) return null;
  const row = matrix.brackets.find(b => b.up_to_km >= distanceKm);
  if (!row) return null;
  const amount = type === 'regular' ? row.regular : row.discounted;
  return { amount, regular: row.regular, discount: Math.round((row.regular - amount) * 100) / 100, basis: 'Sourced matrix', source: matrix.source_url,
    verified_at: matrix.verified_at, effective_from: matrix.effective_from, effective_to: matrix.effective_to, currency: 'PHP' };
}
export type SavingSuggestion = { stop: FareStop; walk: WalkingRoute; currentFare: number; fare: number; savings: number; minutes: number };
export type SavingsResult = { status: 'available' | 'no-saving' | 'unavailable'; suggestions: SavingSuggestion[]; reason: string };
export function findVerifiedSavings(input: { originId: string; destinationId: string; routeId: string; type: FarePassengerType; route?: { id: string }; stops: FareStop[]; segments: RoadSegment[]; walks: WalkLink[]; matrix?: FareMatrix | null; stepFreeOnly?: boolean; maxWalkMeters?: number; date?: string }): SavingsResult {
  const unavailable = (reason: string): SavingsResult => ({ status: 'unavailable', suggestions: [], reason });
  const { originId, destinationId, routeId, type, matrix } = input;
  const maxWalk = input.maxWalkMeters ?? 500;
  if (!Number.isFinite(maxWalk) || maxWalk <= 0 || maxWalk > 2000 || (input.route && input.route.id !== routeId)) return unavailable('Choose a walking limit up to 2 km.');
  const known = input.stops.filter(s => s.route_id === routeId && !s.is_sample && s.is_active !== false && !s.deleted_at && Number.isFinite(s.sequence_order) && validSource(s.location_source_url, s.location_verified_at));
  const path = ridePath(originId, destinationId, routeId, input.segments);
  if (!path || path.ids.some((id, i) => !known.some(s => s.id === id) || (i > 0 && known.find(s => s.id === id)!.sequence_order <= known.find(s => s.id === path.ids[i - 1])!.sequence_order))) return unavailable('A confirmed ride connection between these stops is needed.');
  const km = path.distances.reduce((sum, n) => sum + n, 0) / 1000;
  const baseline = quotePassengerFare(km, type, { id: routeId }, matrix, input.date);
  if (!baseline) return unavailable('A current fare source for this trip is needed.');
  const suggestions: SavingSuggestion[] = [];
  let compared = 0, incomplete = false;
  for (let i = 1; i < path.ids.length - 1; i++) {
    const stop = known.find(s => s.id === path.ids[i])!;
    const origin = known.find(s => s.id === originId)!;
    const links = input.walks.filter(w => w.from_stop_id === originId && w.to_stop_id === stop.id);
    let evaluated = false;
    for (const link of links) {
      const accessible = link.accessible === true && validSource(link.accessibility_source_url, link.accessibility_verified_at) ? true : link.accessible === false && validSource(link.accessibility_source_url, link.accessibility_verified_at) ? false : null;
      const walk = parseWalkingRoute({ ...link, accessible }, origin, stop);
      if (!walk || (input.stepFreeOnly && accessible !== true)) continue;
      // A complete route outside the chosen limit is excluded, not an invented short walk.
      if (walk.distance_meters > maxWalk) { evaluated = true; continue; }
      const fare = quotePassengerFare(path.distances.slice(i).reduce((sum, n) => sum + n, 0) / 1000, type, { id: routeId }, matrix, input.date);
      if (!fare) continue;
      evaluated = true; compared++;
      if (fare.amount < baseline.amount) suggestions.push({ stop, walk, currentFare: baseline.amount, fare: fare.amount, savings: Math.round((baseline.amount - fare.amount) * 100) / 100, minutes: Math.ceil(walk.duration_seconds / 60) });
    }
    if (!evaluated) incomplete = true;
  }
  if (suggestions.length) return { status: 'available', suggestions: suggestions.sort((a, b) => b.savings - a.savings || a.walk.duration_seconds - b.walk.duration_seconds).slice(0, 3), reason: 'Compared from your selected boarding stop, not your GPS location.' };
  if (!compared || incomplete) return unavailable('Complete walking paths within your preference are not available for comparison.');
  return { status: 'no-saving', suggestions: [], reason: 'No lower fare on the sourced walking paths within your preference.' };
}
