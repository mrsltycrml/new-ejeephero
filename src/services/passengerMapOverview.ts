import type { RouteData, TerminalData } from './offlineTransitService';
import { activeRoute, verifiedRoute, verifiedStop } from './routeMap.ts';
import { meters } from './passengerJourney.ts';
import { ROUTE1_INBOUND_ID, ROUTE1_OUTBOUND_ID, route1Pins, route1Variants } from './route1FieldMap.ts';

export const route1DirectionColors = { outbound: '#08795B', inbound: '#C34150' };

/** Source overlays for the passenger map. Trip planning consumes the operational catalog separately. */
export function passengerMapOverview(routes: RouteData[], stops: TerminalData[], selectedRouteId?: string | null) {
  const outbound = routes.find(r => r.id === ROUTE1_OUTBOUND_ID && activeRoute(r));
  const inbound = routes.find(r => r.id === ROUTE1_INBOUND_ID && activeRoute(r));
  const selected = selectedRouteId === ROUTE1_INBOUND_ID ? inbound : outbound ?? inbound;
  if (!selected || (selectedRouteId && selectedRouteId !== selected.id)) return null;

  const variant = route1Variants.find(v => v.id === (selected.route1_variant ?? 'buendia_2022'));
  if (!variant) return null;
  const directions = (['outbound', 'inbound'] as const).filter(direction => {
    const route = direction === 'outbound' ? outbound : inbound;
    if (selectedRouteId) return route?.id === selectedRouteId;
    // The October map documents both directions before the supervisor chooses an alignment.
    return !!route || (!selected.route1_variant && !verifiedRoute(selected));
  });
  const referenceLines = directions.filter(direction => {
    const route = direction === 'outbound' ? outbound : inbound;
    return !route || !verifiedRoute(route);
  }).map(direction => ({
    id: 'reference-' + direction,
    name: direction === 'outbound' ? 'Map reference · toward City Hall' : 'Map reference · toward Makati',
    color_code: route1DirectionColors[direction],
    coordinates: variant[direction],
    isSelected: false,
    referenceDirection: direction,
  }));
  const locatedRoute1Stops = stops.filter(stop => (stop.route_id === ROUTE1_OUTBOUND_ID || stop.route_id === ROUTE1_INBOUND_ID) && verifiedStop(stop));
  const landmarks = route1Pins.filter(pin =>
    (!pin.variantId || pin.variantId === variant.id) && (!pin.direction || directions.includes(pin.direction))
    && !locatedRoute1Stops.some(stop => stop.id === pin.existingStopId || meters(stop, pin.point) < 5));
  return { variant, referenceLines, landmarks };
}

export type PassengerMapOverview = NonNullable<ReturnType<typeof passengerMapOverview>>;
