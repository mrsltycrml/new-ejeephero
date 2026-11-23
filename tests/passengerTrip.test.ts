import test from 'node:test';
import assert from 'node:assert/strict';
import { atPassengerDestination, nearbyFareBoardingStop, passengerPlanRide, suggestPassengerTrip } from '../src/services/passengerTrip.ts';
import type { RouteData, TerminalData } from '../src/services/offlineTransitService.ts';

const point = (longitude: number) => ({ latitude: 14.6, longitude });
const verifiedAt = '2024-01-01T00:00:00Z';
const source = 'https://example.test/operator-survey';
const route = (id: string, coordinates = [point(121), point(121.015), point(121.025)]): RouteData => ({
  id, name: id, description: '', color_code: '', operating_hours: '', base_fare: 0, per_km_rate: 0,
  coordinates, geometry_source_url: source, geometry_verified_at: verifiedAt,
});
const stop = (id: string, routeId: string, longitude: number, sequence_order: number): TerminalData => ({
  ...point(longitude), id, route_id: routeId, name: id, sequence_order,
  location_source_url: source, location_verified_at: verifiedAt,
  passenger_use: 'both', passenger_use_source_url: source, passenger_use_verified_at: verifiedAt,
});

test('fare offers the nearest verified boarding stop with a sourced ride to the selected drop-off', () => {
  const exit = stop('exit', 'r', 121.015, 4);
  const invalid = { ...stop('no boarding', 'r', 121, 0), passenger_use: 'alight' as const };
  const noRide = stop('no ride', 'r', 121.001, 1);
  const board = stop('board', 'r', 121.003, 2);
  const outside = stop('too far', 'r', 121.04, 3);
  const stops = [invalid, noRide, board, outside, exit];
  const segments = [invalid, board, outside].map(candidate => ({
    from_stop_id: candidate.id, to_stop_id: exit.id, route_id: 'r', distance_meters: 1800, source_url: source, verified_at: verifiedAt,
  }));
  const now = Date.now();
  const gps = { ...point(121), accuracy: 5, timestamp: now, speed: null, heading: null };
  const suggest = (fix = gps, selectedStops = stops) => nearbyFareBoardingStop(fix, now, exit, selectedStops, segments);
  assert.equal(suggest()?.stop.id, 'board');
  assert.ok((suggest()?.distance ?? 0) > 250);
  assert.equal(suggest({ ...gps, timestamp: now - 31_000 }), null);
  assert.equal(suggest({ ...gps, accuracy: 100 }), null);
  assert.equal(suggest(gps, stops.filter(s => s !== board)), null);
});

test('automatic trips skip nearer wrong-role stops and manual trips reject a stale permission', () => {
  const r = route('outbound');
  const stops = [
    { ...stop('wrong board', r.id, 121, 0), passenger_use: 'alight' as const },
    { ...stop('board', r.id, 121.002, 1), passenger_use: 'board' as const },
    { ...stop('exit', r.id, 121.023, 2), passenger_use: 'alight' as const },
    { ...stop('wrong exit', r.id, 121.025, 3), passenger_use: 'board' as const },
  ];
  const trip = suggestPassengerTrip(point(121), point(121.025), [r], stops)!;
  assert.deepEqual([trip.boarding.id, trip.alighting.id], ['board', 'exit']);
  const selected = { selectedRouteId: r.id, boardingStop: trip.boarding, alightingStop: trip.alighting };
  const revoked = stops.map(s => s.id === 'exit' ? { ...s, passenger_use: null } : s);
  assert.equal(passengerPlanRide(null, point(121.025), [r], revoked, selected), null);
  assert.equal(suggestPassengerTrip(point(121.025), point(121), [r], stops), null);
});

test('suggests the nearest compatible boarding stop and a downstream alighting stop on its route', () => {
  const routes = [route('toward'), route('wrong-direction', [point(121.025), point(121)]), route('unverified')];
  const stops = [
    stop('at-origin-wrong-way', 'wrong-direction', 121.0001, 2), stop('at-destination-wrong-way', 'wrong-direction', 121.025, 1),
    stop('board', 'toward', 121.002, 1), stop('later-board', 'toward', 121.007, 2),
    stop('earlier-exit', 'toward', 121.02, 3), stop('closest-exit', 'toward', 121.025, 4),
    { ...stop('sample', 'toward', 121, 0), is_sample: true },
    { ...stop('unknown', 'toward', 121.0005, 0), location_verified_at: null },
  ];
  const result = suggestPassengerTrip(point(121), point(121.0251), routes, stops);
  assert.equal(result?.boarding.id, 'board');
  assert.equal(result?.alighting.id, 'closest-exit');
  assert.ok(result && result.boardingProximity > result.alightingProximity);
  assert.equal(suggestPassengerTrip(point(121), point(121.0251), routes, stops, 'wrong-direction'), null);
});

test('does not recommend disconnected routes, mismatched directions, or very distant stops', () => {
  const stops = [stop('board', 'a', 121.002, 1), stop('exit', 'a', 121.025, 2)];
  assert.equal(suggestPassengerTrip(point(121), point(121.025), [route('a', [point(121.025), point(121)])], stops), null);
  assert.equal(suggestPassengerTrip(point(121), point(121.025), [route('a')], [stops[0], { ...stops[1], route_id: 'b' }]), null);
  assert.equal(suggestPassengerTrip(point(120.95), point(121.025), [route('a')], stops), null);
  assert.equal(suggestPassengerTrip(point(121), point(121.08), [route('a')], stops), null);
});

test('a selected place gets a ride when GPS arrives and keeps those stops as the rider moves', () => {
  const routes = [route('a')], stops = [stop('first', 'a', 121, 1), stop('next', 'a', 121.012, 2), stop('last', 'a', 121.025, 3)];
  const destination = point(121.025);
  const empty = { selectedRouteId: null, boardingStop: null, alightingStop: null };
  assert.equal(passengerPlanRide(null, destination, routes, stops, empty), null);
  assert.equal(passengerPlanRide(point(121), destination, routes, stops, empty)?.boarding.id, 'first');
  const chosen = { selectedRouteId: 'a', boardingStop: stops[0], alightingStop: stops[2] };
  assert.equal(passengerPlanRide(point(121.012), destination, routes, stops, chosen)?.boarding.id, 'first');
  assert.equal(passengerPlanRide(null, destination, routes, stops, chosen)?.boardingProximity, null);
  assert.equal(passengerPlanRide(null, destination, routes, stops.slice(1), chosen), null);
  assert.equal(passengerPlanRide(point(121), destination, routes, stops, { ...chosen, alightingStop: null }), null);
});

test('a one-way ride must end closer than both the boarding stop and the passenger', () => {
  const routes = [route('one-way')];
  const [a, b, c] = [121, 121.005, 121.01].map((lng, i) => stop(String(i), 'one-way', lng, i));
  const stops = [a, b, c];
  const selected = { selectedRouteId: 'one-way', boardingStop: b, alightingStop: c };
  assert.equal(suggestPassengerTrip(b, a, routes, stops), null);
  assert.equal(suggestPassengerTrip(point(121.014), a, routes, [b, c]), null);
  assert.equal(passengerPlanRide(null, a, routes, stops, selected), null);
  // Walking past the passenger to board can produce a forward ride that ends back where they started.
  assert.equal(suggestPassengerTrip(b, c, routes, [a, b]), null);
  assert.equal(passengerPlanRide(b, c, routes, stops, { ...selected, boardingStop: a, alightingStop: b }), null);
  assert.equal(suggestPassengerTrip(b, c, routes, stops)?.alighting.id, c.id);
});

test('a passenger at or within GPS proximity of the destination gets no new or retained ride', () => {
  const routes = [route('a')], stops = [stop('board', 'a', 121, 1), stop('exit', 'a', 121.005, 2)];
  const chosen = { selectedRouteId: 'a', boardingStop: stops[0], alightingStop: stops[1] };
  for (const origin of [stops[1], point(121.0048)]) {
    assert.equal(atPassengerDestination(origin, stops[1]), true);
    assert.equal(suggestPassengerTrip(origin, stops[1], routes, stops), null);
    assert.equal(passengerPlanRide(origin, stops[1], routes, stops, chosen), null);
  }
  assert.equal(atPassengerDestination(null, stops[1]), false);
  assert.equal(atPassengerDestination(point(121.0046), stops[1]), false);
  assert.equal(passengerPlanRide(null, stops[1], routes, stops, chosen)?.boarding.id, 'board');
});
