import { parseWalkingRoute, validSource, type WalkingRoute, type WalkingStep, type Point } from './walkingDirections.ts';
import { permitsPassengerUse } from './routeMap.ts';
import type { TerminalData } from './offlineTransitService';
import { quotePassengerFare, ridePath, type FarePassengerType, type FareMatrix, type RoadSegment } from '../../supabase/functions/_shared/passengerFare.ts';

export { quotePassengerFare, validFareMatrix, verifiedRideDistance } from '../../supabase/functions/_shared/passengerFare.ts';
export type { FareMatrix, RoadSegment, FareQuote } from '../../supabase/functions/_shared/passengerFare.ts';
export type WalkLink = { from_stop_id: string; to_stop_id: string; distance_meters: number; duration_seconds: number; source_url: string; verified_at: string; accessible: boolean | null; coordinates?: Point[] | null; steps?: WalkingStep[] | null; accessibility_source_url?: string | null; accessibility_verified_at?: string | null };
export type FareStop = TerminalData;

export type SavingSuggestion = { stop: FareStop; walk: WalkingRoute; currentFare: number; fare: number; savings: number; minutes: number };
export type SavingsResult = { status: 'available' | 'no-saving' | 'unavailable'; suggestions: SavingSuggestion[]; reason: string };
export function findVerifiedSavings(input: { originId: string; destinationId: string; routeId: string; type: FarePassengerType; route?: { id: string }; stops: FareStop[]; segments: RoadSegment[]; walks: WalkLink[]; matrix?: FareMatrix | null; stepFreeOnly?: boolean; maxWalkMeters?: number; date?: string }): SavingsResult {
  const unavailable = (reason: string): SavingsResult => ({ status: 'unavailable', suggestions: [], reason });
  const { originId, destinationId, routeId, type, matrix } = input;
  const maxWalk = input.maxWalkMeters ?? 500;
  if (!Number.isFinite(maxWalk) || maxWalk <= 0 || maxWalk > 2000 || (input.route && input.route.id !== routeId)) return unavailable('Choose a walking limit up to 2 km.');
  const path = ridePath(originId, destinationId, routeId, input.segments, input.stops);
  if (!path) return unavailable('Ask the operator to confirm the ride distances between these stops.');
  const km = path.distances.reduce((sum, n) => sum + n, 0) / 1000;
  const baseline = quotePassengerFare(km, type, { id: routeId }, matrix, input.date);
  if (!baseline) return unavailable('Ask the operator for a current fare table covering this ride.');
  const suggestions: SavingSuggestion[] = [];
  let compared = 0, incomplete = false;
  let hasLaterStop = false, hasWalk = false, matchesAccess = false;
  const origin = path.stops[0];
  for (let i = 1; i < path.stops.length - 1; i++) {
    const stop = path.stops[i];
    if (!permitsPassengerUse(stop, 'board')) continue;
    hasLaterStop = true;
    const links = input.walks.filter(w => w.from_stop_id === originId && w.to_stop_id === stop.id);
    let evaluated = false;
    let best: SavingSuggestion | undefined;
    for (const link of links) {
      const accessible = link.accessible === true && validSource(link.accessibility_source_url, link.accessibility_verified_at) ? true : link.accessible === false && validSource(link.accessibility_source_url, link.accessibility_verified_at) ? false : null;
      const walk = parseWalkingRoute({ ...link, accessible }, origin, stop);
      if (!walk) continue;
      hasWalk = true;
      if (input.stepFreeOnly && accessible !== true) continue;
      matchesAccess = true;
      // A complete route outside the chosen limit is excluded, not an invented short walk.
      if (walk.distance_meters > maxWalk) { evaluated = true; continue; }
      const fare = quotePassengerFare(path.distances.slice(i).reduce((sum, n) => sum + n, 0) / 1000, type, { id: routeId }, matrix, input.date);
      if (!fare) continue;
      evaluated = true; compared++;
      if (fare.amount < baseline.amount && (!best || walk.duration_seconds < best.walk.duration_seconds)) {
        best = { stop, walk, currentFare: baseline.amount, fare: fare.amount, savings: Math.round((baseline.amount - fare.amount) * 100) / 100, minutes: Math.ceil(walk.duration_seconds / 60) };
      }
    }
    if (!evaluated) incomplete = true;
    if (best) suggestions.push(best);
  }
  if (suggestions.length) return { status: 'available', suggestions: suggestions.sort((a, b) => b.savings - a.savings || a.walk.duration_seconds - b.walk.duration_seconds).slice(0, 3), reason: 'Walk from your boarding stop and keep the same drop-off.' };
  if (!hasLaterStop) return unavailable('There is no confirmed place to board between these stops. Choose another stop pair.');
  if (!hasWalk) return unavailable('Ask the operator for walking directions from your boarding stop to a later stop.');
  if (!matchesAccess) return unavailable('Check with the operator for a confirmed step-free path.');
  if (!compared && !incomplete) return unavailable('The confirmed walks exceed your limit. Choose a longer limit to compare them.');
  if (incomplete) return unavailable('Some later stops still need verified walking directions. Check with the operator.');
  return { status: 'no-saving', suggestions: [], reason: 'No lower fare on the sourced walking paths within your preference.' };
}
