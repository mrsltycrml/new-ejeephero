import type { RouteData, TerminalData } from './offlineTransitService';
import { meters } from './passengerJourney.ts';
import { validPoint, type Point } from './locationQuality.ts';

/** Actual routing-provider geometry, never a straight-line estimate. */
export type WalkingRouteGeometry = { id: string; coordinates: Point[]; source: string; generatedAt: string };
export type JourneySelection = { selectedRouteId: string | null; boardingStop: TerminalData | null; alightingStop: TerminalData | null };
const verifiedEvidence = (date: string | null | undefined, source: string | null | undefined) => Number.isFinite(Date.parse(date || '')) && Date.parse(date || '') <= Date.now() && /^https?:\/\/\S+$/.test(source?.trim() || '');
export const verifiedStop = (stop: TerminalData) => !stop.is_sample && stop.is_active !== false && !stop.deleted_at && verifiedEvidence(stop.location_verified_at, stop.location_source_url) && validPoint(stop);
export const activeRoute = (route: RouteData) => !route.is_sample && !route.is_archived && route.is_active !== false && route.is_published !== false && !route.deleted_at && !route.is_coming_soon && (!route.status || ['active', 'published'].includes(route.status));
export const verifiedRoute = (route: RouteData) => activeRoute(route) && verifiedEvidence(route.geometry_verified_at, route.geometry_source_url) && Array.isArray(route.coordinates) && route.coordinates.length > 1 && route.coordinates.every(validPoint);

export function selectJourneyRoute(state: JourneySelection, id: string | null, routes: RouteData[]): JourneySelection {
  const selectedRouteId = routes.some(r => r.id === id && activeRoute(r)) ? id : null;
  return { selectedRouteId, boardingStop: state.boardingStop?.route_id === selectedRouteId ? state.boardingStop : null, alightingStop: state.alightingStop?.route_id === selectedRouteId ? state.alightingStop : null };
}

export function selectJourneyStop(state: JourneySelection, value: TerminalData | null, role: 'boarding' | 'alighting', routes: RouteData[], stops: TerminalData[]): JourneySelection {
  const key = role === 'boarding' ? 'boardingStop' : 'alightingStop';
  if (!value) return { ...state, [key]: null };
  const stop = stops.find(s => s.id === value.id && verifiedStop(s));
  if (!stop || !Number.isFinite(stop.sequence_order) || !routes.some(r => r.id === stop.route_id && activeRoute(r)) || (state.selectedRouteId && state.selectedRouteId !== stop.route_id)) return state;
  const other = role === 'boarding' ? state.alightingStop : state.boardingStop;
  if (other && (other.id === stop.id || !Number.isFinite(stop.sequence_order) || !Number.isFinite(other.sequence_order) || (role === 'boarding' ? stop.sequence_order >= other.sequence_order : stop.sequence_order <= other.sequence_order))) return state;
  return { ...state, selectedRouteId: stop.route_id, [key]: stop };
}

export function reconcileJourneySelection(state: JourneySelection, routes: RouteData[], stops: TerminalData[]): JourneySelection {
  const route = selectJourneyRoute(state, state.selectedRouteId, routes);
  const empty = { ...route, boardingStop: null, alightingStop: null };
  const boarding = selectJourneyStop(empty, route.boardingStop, 'boarding', routes, stops);
  return selectJourneyStop(boarding, route.alightingStop, 'alighting', routes, stops);
}

function projectStop(coordinates: Point[], stop: Point) {
  let distanceAlong = 0;
  const candidates = coordinates.slice(1).map((b, index) => {
    const a = coordinates[index], scale = Math.cos(stop.latitude * Math.PI / 180);
    const dx = (b.longitude - a.longitude) * scale, dy = b.latitude - a.latitude;
    const fraction = Math.max(0, Math.min(1, ((stop.longitude - a.longitude) * scale * dx + (stop.latitude - a.latitude) * dy) / (dx * dx + dy * dy || 1)));
    const point = { latitude: a.latitude + (b.latitude - a.latitude) * fraction, longitude: a.longitude + (b.longitude - a.longitude) * fraction };
    const length = meters(a, b);
    const result = { point, index, distance: meters(point, stop), along: distanceAlong + length * fraction };
    distanceAlong += length;
    return result;
  }).sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  if (!best || best.distance > 30 || candidates.some(c => c.distance <= best.distance + 1 && Math.abs(c.along - best.along) > 30)) return null;
  return best;
}

export function rideLeg(route: RouteData | undefined, boarding: TerminalData | null | undefined, alighting: TerminalData | null | undefined): Point[] {
  if (!route || !verifiedRoute(route) || !boarding || !alighting || !verifiedStop(boarding) || !verifiedStop(alighting) || boarding.route_id !== route.id || alighting.route_id !== route.id || !(boarding.sequence_order < alighting.sequence_order)) return [];
  const from = projectStop(route.coordinates, boarding), to = projectStop(route.coordinates, alighting);
  if (!from || !to || from.along >= to.along) return [];
  return [from.point, ...route.coordinates.slice(from.index + 1, to.index + 1), to.point].filter((p, i, points) => i === 0 || meters(p, points[i - 1]) > 0.01);
}

export function buildJourneyMap(input: { routes: RouteData[]; terminals: TerminalData[]; selectedRouteId?: string | null; boardingStop?: TerminalData | null; alightingStop?: TerminalData | null; destinationPlace?: (Point & { name: string }) | null; walkingRoutes?: WalkingRouteGeometry[] }) {
  const routes = input.routes.filter(verifiedRoute);
  const terminals = input.terminals.filter(t => verifiedStop(t) && input.routes.some(r => r.id === t.route_id && activeRoute(r)));
  const route = routes.find(r => r.id === input.selectedRouteId);
  const boarding = terminals.find(t => t.id === input.boardingStop?.id && t.route_id === input.selectedRouteId);
  const alighting = terminals.find(t => t.id === input.alightingStop?.id && t.route_id === input.selectedRouteId);
  const destinationPlace = input.destinationPlace && validPoint(input.destinationPlace) ? input.destinationPlace : null;
  const walkingRoutes = (input.walkingRoutes || []).filter(w => w.source?.trim() && Number.isFinite(Date.parse(w.generatedAt)) && Array.isArray(w.coordinates) && w.coordinates.length > 1 && w.coordinates.every(validPoint));
  const fitPoints = [...(input.selectedRouteId ? route?.coordinates || [] : routes.flatMap(r => r.coordinates)), ...[boarding, alighting, destinationPlace].filter((p): p is NonNullable<typeof p> => Boolean(p)), ...walkingRoutes.flatMap(w => w.coordinates)].map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  const cameraKey = JSON.stringify([input.selectedRouteId, boarding?.id, alighting?.id, fitPoints]);
  return { routes, terminals, destinationPlace, walkingRoutes, rideCoordinates: rideLeg(route, boarding, alighting), fitPoints, cameraKey };
}
