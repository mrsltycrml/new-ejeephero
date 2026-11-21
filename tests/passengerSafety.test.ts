import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoardingLocation, buildEmergencyMessage, normalizeEmergencyPhone, type LoadingZone } from '../src/services/passengerSafety.ts';
import { findVerifiedSavings, quotePassengerFare, verifiedRideDistance, type RoadSegment, type FareMatrix } from '../src/services/passengerFare.ts';
const now = Date.parse('2026-10-27T04:00:00Z');
const fix = { latitude: 14.56, longitude: 121.03, accuracy: 5, timestamp: now };
const zone: LoadingZone = { id: 'z', name: 'Verified zone', kind: 'no_loading', latitude: fix.latitude, longitude: fix.longitude, radius_meters: 40, source_url: 'https://example.test/official-zone', verified_at: '2026-10-27' };
const stops = ['a', 'b', 'c'].map((id, i) => ({ id, name: id, route_id: 'r', latitude: 14.56, longitude: 121.03 + i * .001, sequence_order: i,
  location_source_url: 'https://example.test/stop', location_verified_at: '2026-10-27',
  passenger_use: 'both' as const, passenger_use_source_url: 'https://example.test/use', passenger_use_verified_at: '2026-10-27' }));

test('loading warning needs a verified zone and a fresh precise GPS fix', () => {
  assert.equal(evaluateBoardingLocation(fix, [zone], now).kind, 'prohibited');
  assert.equal(evaluateBoardingLocation(fix, [{ ...zone, verified_at: '' }], now).kind, 'unavailable');
  assert.equal(evaluateBoardingLocation({ ...fix, timestamp: now - 61000 }, [zone], now).kind, 'unavailable');
  assert.equal(evaluateBoardingLocation({ ...fix, accuracy: 50 }, [zone], now).kind, 'uncertain');
  assert.equal(evaluateBoardingLocation({ ...fix, accuracy: null }, [zone], now).kind, 'uncertain');
});
test('GPS uncertainty overlapping a boundary does not declare the zone safe or prohibited', () => {
  assert.equal(evaluateBoardingLocation({ ...fix, longitude: fix.longitude + 0.00035, accuracy: 20 }, [zone], now).kind, 'uncertain');
  assert.equal(evaluateBoardingLocation({ ...fix, longitude: fix.longitude + 0.002 }, [{ ...zone, kind: 'loading' }], now, stops).kind, 'outside');
});
test('designated-bay status requires valid source metadata and never overrides a no-loading zone', () => {
  const allowed: LoadingZone = { ...zone, kind: 'loading' };
  assert.equal(evaluateBoardingLocation(fix, [allowed], now, stops).kind, 'allowed');
  assert.equal(evaluateBoardingLocation(fix, [allowed], now).kind, 'uncertain');
  assert.equal(evaluateBoardingLocation(fix, [allowed], now, [{ ...stops[0], passenger_use: 'alight' }]).kind, 'uncertain');
  assert.equal(evaluateBoardingLocation(fix, [allowed, { ...zone, id: 'restricted' }], now, stops).kind, 'prohibited');
  for (const bad of [{ ...allowed, verified_at: 'invalid' }, { ...allowed, source_url: 'javascript:alert(1)' }, { ...allowed, latitude: 100 }, { ...allowed, radius_meters: 1000 }]) {
    assert.equal(evaluateBoardingLocation(fix, [bad], now).kind, 'unavailable');
  }
});
test('emergency message contains the selected body, plate and timestamped current location', () => {
  const message = buildEmergencyMessage({ fix, body: 'UNIT-12', plate: 'ABC-1234' });
  assert.match(message, /Body number: UNIT-12/); assert.match(message, /Plate number: ABC-1234/);
  assert.match(message, /q=14.56,121.03/); assert.match(message, /2026-10-27T04:00:00.000Z/);
  assert.equal(normalizeEmergencyPhone('0917 123 4567'), '+639171234567');
  assert.equal(normalizeEmergencyPhone('123'), null);
});
const segments: RoadSegment[] = [{ route_id: 'r', from_stop_id: 'a', to_stop_id: 'b', distance_meters: 3000, source_url: 'https://example.test/road', verified_at: '2026-10-27' }, { route_id: 'r', from_stop_id: 'b', to_stop_id: 'c', distance_meters: 4000, source_url: 'https://example.test/road', verified_at: '2026-10-27' }];
const route = { id: 'r' };
test('route distance requires connected verified segments in the correct direction', () => {
  assert.equal(verifiedRideDistance('a', 'c', 'r', segments, stops), 7);
  assert.equal(verifiedRideDistance('c', 'a', 'r', segments, stops), null);
  assert.equal(verifiedRideDistance('a', 'c', 'r', segments.slice(1), stops), null);
  assert.equal(verifiedRideDistance('a', 'c', 'other-route', segments, stops), null);
});
test('source-backed fare table applies all concession categories and expiry', () => {
  const matrix: FareMatrix = { route_id: 'r', currency: 'PHP', source_url: 'https://example.test/matrix', verified_at: '2026-10-27', effective_from: '2026-10-01', effective_to: '2026-10-31', brackets: [{ up_to_km: 4, regular: 15, discounted: 12 }, { up_to_km: 5, regular: 17.25, discounted: 13.75 }] };
  for (const type of ['student', 'senior', 'pwd'] as const) assert.equal(quotePassengerFare(4.5, type, route, matrix, '2026-10-27')?.amount, 13.75);
  assert.equal(quotePassengerFare(4.5, 'regular', route, matrix, '2026-10-27')?.basis, 'Sourced matrix');
  assert.equal(quotePassengerFare(4.5, 'regular', route, matrix, '2026-11-01'), null);
  assert.equal(quotePassengerFare(NaN, 'regular', route), null);
});
test('walking savings use sourced walking time and road distance, and respect accessibility', () => {
  const args = { originId: 'a', destinationId: 'c', routeId: 'r', type: 'regular' as const, route, segments, stops,
    date: '2026-10-27', matrix: { route_id: 'r', currency: 'PHP', source_url: 'https://example.test/matrix', verified_at: '2026-10-27', effective_from: '2026-10-01', effective_to: null, brackets: [{ up_to_km: 4, regular: 15, discounted: 12 }, { up_to_km: 8, regular: 18, discounted: 14 }] },
    walks: [{ from_stop_id: 'a', to_stop_id: 'b', distance_meters: 108, duration_seconds: 120, source_url: 'https://example.test/footpath', verified_at: '2026-10-27', accessible: false,
      coordinates: stops.slice(0, 2), steps: [{ instruction: 'Follow the marked path', distance_meters: 108, duration_seconds: 120 }] }] };
  const suggestion = findVerifiedSavings(args).suggestions[0];
  assert.equal(suggestion.minutes, 2); assert.equal(suggestion.savings, 3);
  assert.equal(findVerifiedSavings({ ...args, stepFreeOnly: true }).status, 'unavailable');
  assert.equal(findVerifiedSavings({ ...args, walks: [{ ...args.walks[0], verified_at: '' }] }).status, 'unavailable');
  assert.equal(findVerifiedSavings({ ...args, segments: [] }).status, 'unavailable');
});
