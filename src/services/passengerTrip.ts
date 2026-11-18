import type { RouteData, TerminalData } from './offlineTransitService';
import { validPoint, type Point } from './locationQuality.ts';
import { meters } from './passengerJourney.ts';
import { rideLeg, verifiedRoute, verifiedStop, type JourneySelection } from './routeMap.ts';

export const STOP_SEARCH_METERS = 2000;

export function passengerPlanRide(origin: Point | null, destination: Point, routes: RouteData[], stops: TerminalData[], selection: JourneySelection) {
  if (!selection.boardingStop && !selection.alightingStop) {
    return origin ? suggestPassengerTrip(origin, destination, routes, stops, selection.selectedRouteId) : null;
  }
  // Keep the chosen pair as the rider walks or loses GPS. Refreshes can withdraw a stop.
  const route = routes.find(item => item.id === selection.selectedRouteId);
  const boarding = stops.find(item => item.id === selection.boardingStop?.id);
  const alighting = stops.find(item => item.id === selection.alightingStop?.id);
  if (!route || !boarding || !alighting || rideLeg(route, boarding, alighting).length < 2) return null;
  return { route, boarding, alighting, boardingProximity: origin ? meters(origin, boarding) : null, alightingProximity: meters(destination, alighting) };
}

export function suggestPassengerTrip(
  origin: Point, destination: Point, routes: RouteData[], stops: TerminalData[], selectedRouteId?: string | null,
) {
  if (!validPoint(origin) || !validPoint(destination)) return null;
  const availableRoutes = new Map(routes
    .filter(route => (!selectedRouteId || route.id === selectedRouteId) && verifiedRoute(route))
    .map(route => [route.id, route]));
  const eligible = stops.filter(stop => availableRoutes.has(stop.route_id) && Number.isFinite(stop.sequence_order) && verifiedStop(stop));
  const nearby = (point: Point) => eligible.map(stop => ({ stop, distance: meters(point, stop) }))
    .filter(item => item.distance <= STOP_SEARCH_METERS)
    .sort((a, b) => a.distance - b.distance || a.stop.id.localeCompare(b.stop.id));
  const exits = nearby(destination);
  for (const board of nearby(origin)) {
    const route = availableRoutes.get(board.stop.route_id)!;
    const exit = exits.find(({ stop }) => stop.route_id === route.id && rideLeg(route, board.stop, stop).length > 1);
    if (exit) return { route, boarding: board.stop, alighting: exit.stop, boardingProximity: board.distance, alightingProximity: exit.distance };
  }
  return null;
}
