import test from 'node:test';
import assert from 'node:assert/strict';
import { passengerPlanRide, suggestPassengerTrip } from '../src/services/passengerTrip.ts';
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
