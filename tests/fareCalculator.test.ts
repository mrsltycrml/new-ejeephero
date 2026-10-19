import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateConfiguredFare, findWalkAndSaveSuggestion, routeDistanceKm } from '../src/services/fareCalculator.ts';

test('configured base fare covers the included distance', () => {
  assert.equal(calculateConfiguredFare(3, { base_fare: 17, per_km_rate: 2.4, base_distance_km: 4 }, 'regular'), 17);
});

test('fare adds the route rate only beyond the included distance', () => {
  assert.equal(calculateConfiguredFare(6, { base_fare: 17, per_km_rate: 2.4, base_distance_km: 4 }, 'regular'), 21.75);
});

test('discounted passenger fares apply the 20% discount and round to the nearest quarter peso', () => {
  const route = { base_fare: 17, per_km_rate: 2.4, base_distance_km: 4 };
  assert.equal(calculateConfiguredFare(6, route, 'student'), 17.5);
  assert.equal(calculateConfiguredFare(6, route, 'senior'), 17.5);
  assert.equal(calculateConfiguredFare(6, route, 'pwd'), 17.5);
});

test('route distance sums consecutive stop segments', () => {
  const distance = routeDistanceKm([
    { id: 'a', name: 'A', latitude: 0, longitude: 0, sequence_order: 0 },
    { id: 'b', name: 'B', latitude: 0, longitude: 0.01, sequence_order: 1 },
    { id: 'c', name: 'C', latitude: 0, longitude: 0.02, sequence_order: 2 },
  ]);
  assert.ok(distance > 2.2 && distance < 2.24);
});

test('walk-and-save recommends a nearby later stop only when it lowers the estimate', () => {
  const stops = [
    { id: 'a', name: 'Origin Bay', latitude: 0, longitude: 0, sequence_order: 0 },
    { id: 'b', name: 'Next Bay', latitude: 0, longitude: 0.001, sequence_order: 1 },
    { id: 'c', name: 'Destination', latitude: 0, longitude: 0.01, sequence_order: 2 },
  ];
  const suggestion = findWalkAndSaveSuggestion({
    origin: { latitude: 0, longitude: 0 },
    destination: stops[2],
    stops,
    route: { base_fare: 0, per_km_rate: 10, base_distance_km: 0 },
    passengerType: 'regular',
  });
  assert.equal(suggestion?.stop.id, 'b');
  assert.equal(suggestion?.walkingTimeMinutes, 2);
  assert.ok((suggestion?.savings ?? 0) > 1);
});

test('walk-and-save stays silent when no cheaper stop is within walking range', () => {
  const stops = [
    { id: 'a', name: 'Origin Bay', latitude: 0, longitude: 0, sequence_order: 0 },
    { id: 'b', name: 'Destination', latitude: 0, longitude: 0.01, sequence_order: 1 },
  ];
  const suggestion = findWalkAndSaveSuggestion({
    origin: { latitude: 0, longitude: 0 },
    destination: stops[1],
    stops,
    route: { base_fare: 17, per_km_rate: 2.4, base_distance_km: 4 },
    passengerType: 'regular',
  });
  assert.equal(suggestion, null);
});
