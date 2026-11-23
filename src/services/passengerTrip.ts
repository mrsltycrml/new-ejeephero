import type { RouteData, TerminalData } from './offlineTransitService';
import { locationQuality, validPoint, type MeasuredFix, type Point } from './locationQuality.ts';
import { meters } from './passengerJourney.ts';
import { rideLeg, verifiedRoute, permitsPassengerUse, passengerStopOptions, type JourneySelection } from './routeMap.ts';
import { verifiedRideDistance, type RoadSegment } from './passengerFare.ts';

export const STOP_SEARCH_METERS = 2000;
export const DESTINATION_RADIUS_METERS = 30;

export function nearbyFareBoardingStop(fix: MeasuredFix | null, now: number, drop: TerminalData, stops: TerminalData[], segments: RoadSegment[]) {
  if (!fix || locationQuality(fix, now) !== 'live' || !permitsPassengerUse(drop, 'alight')) return null;
  return passengerStopOptions(stops, 'board', drop)
    .map(stop => ({ stop, distance: meters(fix, stop) }))
    .filter(item => item.distance <= STOP_SEARCH_METERS)
    .sort((a, b) => a.distance - b.distance || a.stop.id.localeCompare(b.stop.id))
    .find(({ stop }) => verifiedRideDistance(stop.id, drop.id, drop.route_id, segments, stops) != null) ?? null;
}

export function atPassengerDestination(origin: Point | null, destination: Point) {
  return !!origin && validPoint(origin) && validPoint(destination) && meters(origin, destination) <= DESTINATION_RADIUS_METERS;
}

export function passengerPlanRide(origin: Point | null, destination: Point, routes: RouteData[], stops: TerminalData[], selection: JourneySelection) {
  if (!selection.boardingStop && !selection.alightingStop) {
    return origin ? suggestPassengerTrip(origin, destination, routes, stops, selection.selectedRouteId) : null;
  }
  if (!validPoint(destination) || (origin && !validPoint(origin)) || atPassengerDestination(origin, destination)) return null;
  // Keep the chosen pair as the rider walks or loses GPS. Refreshes can withdraw a stop.
  const route = routes.find(item => item.id === selection.selectedRouteId);
  const boarding = stops.find(item => item.id === selection.boardingStop?.id);
  const alighting = stops.find(item => item.id === selection.alightingStop?.id);
  if (!route || !boarding || !alighting || rideLeg(route, boarding, alighting).length < 2) return null;
  const alightingProximity = meters(destination, alighting);
  if (alightingProximity >= meters(destination, boarding) || (origin && alightingProximity >= meters(destination, origin))) return null;
  return { route, boarding, alighting, boardingProximity: origin ? meters(origin, boarding) : null, alightingProximity };
}

export function suggestPassengerTrip(
  origin: Point, destination: Point, routes: RouteData[], stops: TerminalData[], selectedRouteId?: string | null,
) {
  if (!validPoint(origin) || !validPoint(destination)) return null;
  const directDistance = meters(origin, destination);
  if (directDistance <= DESTINATION_RADIUS_METERS) return null;
  const availableRoutes = new Map(routes
    .filter(route => (!selectedRouteId || route.id === selectedRouteId) && verifiedRoute(route))
    .map(route => [route.id, route]));
  const eligible = stops.filter(stop => availableRoutes.has(stop.route_id) && Number.isFinite(stop.sequence_order));
  const nearby = (point: Point, role: 'board' | 'alight') => eligible.filter(stop => permitsPassengerUse(stop, role)).map(stop => ({ stop, distance: meters(point, stop) }))
    .filter(item => item.distance <= STOP_SEARCH_METERS)
    .sort((a, b) => a.distance - b.distance || a.stop.id.localeCompare(b.stop.id));
  const exits = nearby(destination, 'alight').filter(exit => exit.distance < directDistance);
  for (const board of nearby(origin, 'board')) {
    const route = availableRoutes.get(board.stop.route_id)!;
    const boardToDestination = meters(board.stop, destination);
    const exit = exits.find(({ stop, distance }) => stop.route_id === route.id && distance < boardToDestination && rideLeg(route, board.stop, stop).length > 1);
    if (exit) return { route, boarding: board.stop, alighting: exit.stop, boardingProximity: board.distance, alightingProximity: exit.distance };
  }
  return null;
}
