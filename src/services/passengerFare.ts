import { calculateConfiguredFare, type FarePassengerType, type FareRouteConfig } from './fareCalculator.ts';

export type RoadSegment = { route_id: string; from_stop_id: string; to_stop_id: string; distance_meters: number; source_url: string; verified_at: string };
export type WalkLink = { from_stop_id: string; to_stop_id: string; distance_meters: number; duration_seconds: number; source_url: string; verified_at: string; accessible: boolean };
export type FareMatrix = { route_id: string; source_url: string; verified_at: string; effective_from: string; effective_to: string | null; brackets: { up_to_km: number; regular: number; discounted: number }[] };
export type FareStop = { id: string; name: string; route_id: string; location_source_url?: string | null; location_verified_at?: string | null };
const verified = (item: { source_url: string; verified_at: string }) => Boolean(item.source_url && item.verified_at);

// Uses directed, verified road segments. Reverse travel needs its own road data.
export function verifiedRideDistance(from: string, to: string, routeId: string, segments: RoadSegment[]): number | null {
  if (from === to) return 0;
  const distances = new Map<string, number>([[from, 0]]);
  const visited = new Set<string>();
  const valid = segments.filter(s => s.route_id === routeId && verified(s) && Number.isFinite(s.distance_meters) && s.distance_meters > 0);
  while (true) {
    const next = [...distances.entries()].filter(([id]) => !visited.has(id)).sort((a, b) => a[1] - b[1])[0];
    if (!next) return null;
    const [id, distance] = next;
    if (id === to) return distance / 1000;
    visited.add(id);
    for (const segment of valid.filter(s => s.from_stop_id === id)) {
      const newDistance = distance + segment.distance_meters;
      if (newDistance < (distances.get(segment.to_stop_id) ?? Infinity)) distances.set(segment.to_stop_id, newDistance);
    }
  }
}

export function quotePassengerFare(distanceKm: number, type: FarePassengerType, route: FareRouteConfig, matrix?: FareMatrix | null, date = new Date().toISOString().slice(0, 10)) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 200) return null;
  if (matrix && verified(matrix) && matrix.effective_from <= date && (!matrix.effective_to || matrix.effective_to >= date)) {
    const row = [...matrix.brackets].sort((a, b) => a.up_to_km - b.up_to_km).find(b => b.up_to_km >= distanceKm);
    if (row) {
      const amount = type === 'regular' ? row.regular : row.discounted;
      if (Number.isFinite(amount) && amount >= 0) return { amount, basis: 'LTFRB fare matrix', source: matrix.source_url, official: true };
    }
  }
  return { amount: calculateConfiguredFare(distanceKm, route, type), basis: 'eSAKAY fare estimate', source: null, official: false };
}

export function findVerifiedSavings(input: { originId: string; destinationId: string; routeId: string; type: FarePassengerType; route: FareRouteConfig; stops: FareStop[]; segments: RoadSegment[]; walks: WalkLink[]; matrix?: FareMatrix | null; stepFreeOnly?: boolean; date?: string }) {
  const { originId, destinationId, routeId, route, type, segments, matrix } = input;
  const knownStops = input.stops.filter(s => s.route_id === routeId && s.location_source_url && s.location_verified_at);
  if (![originId, destinationId].every(id => knownStops.some(s => s.id === id))) return [];
  const currentDistance = verifiedRideDistance(originId, destinationId, routeId, segments);
  const current = currentDistance == null ? null : quotePassengerFare(currentDistance, type, route, matrix, input.date);
  if (!current) return [];
  return input.walks.filter(w => w.from_stop_id === originId && w.to_stop_id !== destinationId && verified(w)
    && w.distance_meters > 0 && w.distance_meters <= 500 && w.duration_seconds > 0 && w.duration_seconds <= 600 && (!input.stepFreeOnly || w.accessible))
    .flatMap(walk => {
      const stop = knownStops.find(s => s.id === walk.to_stop_id);
      const km = stop ? verifiedRideDistance(stop.id, destinationId, routeId, segments) : null;
      const next = km == null ? null : quotePassengerFare(km, type, route, matrix, input.date);
      if (!stop || !next || current.amount <= next.amount || current.official !== next.official) return [];
      return [{ stop, walk, fare: next.amount, savings: Math.round((current.amount - next.amount) * 100) / 100, minutes: Math.ceil(walk.duration_seconds / 60) }];
    }).sort((a, b) => b.savings - a.savings || a.walk.duration_seconds - b.walk.duration_seconds).slice(0, 3);
}
