import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWalkingRoute, parseOrsRoute } from '../src/services/walkingDirections.ts';
const a = { latitude: 14.56, longitude: 121.03 }, b = { latitude: 14.56, longitude: 121.031 };
const now = Date.parse('2026-11-18T04:00:00Z');
const route = { id: 'walk', source: 'Survey', source_url: 'https://example.test/path', verified_at: '2026-11-01T00:00:00Z', coordinates: [a, b], distance_meters: 108, duration_seconds: 120, steps: [{ instruction: 'Follow the marked path', distance_meters: 108, duration_seconds: 120, fromIndex: 0, toIndex: 1 }], accessible: null };
test('walking evidence requires complete geometry and contiguous measured instructions', () => {
  assert.ok(parseWalkingRoute(route, a, b, now));
  for (const patch of [{ coordinates: [] }, { steps: [] }, { source_url: 'javascript:alert(1)' }, { verified_at: '2099-01-01' }, { distance_meters: NaN }, { steps: [{ ...route.steps[0], distance_meters: 10 }] }, { coordinates: [b, a] }, { steps: [{ ...route.steps[0], instruction: '<b>Go</b>' }] }]) assert.equal(parseWalkingRoute({ ...route, ...patch }, a, b, now), null);
});
test('ORS GeoJSON preserves provider geometry, metric totals and text steps without accessibility claims', () => {
  const data = { type: 'FeatureCollection', metadata: { timestamp: now }, features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] }, properties: { summary: { distance: 108, duration: 120 }, segments: [{ distance: 108, duration: 120, steps: [{ instruction: 'Continue ahead', distance: 108, duration: 120, way_points: [0, 1] }, { instruction: 'Arrive', distance: 0, duration: 0, way_points: [1, 1] }] }] } }] };
  const result = parseOrsRoute(data, a, b, now)!;
  assert.deepEqual(result.coordinates, [a, b]);
  assert.equal(result.steps[0].instruction, 'Continue ahead');
  assert.equal(result.accessible, null);
  assert.equal(result.verified_at, '2026-11-18T04:00:00.000Z');
  assert.equal(parseOrsRoute({ ...data, metadata: {} }, a, b, now), null);
  assert.equal(parseOrsRoute({ ...data, features: [] }, a, b, now), null);
  data.features[0].properties.segments[0].steps[0].way_points = [1, 1];
  assert.equal(parseOrsRoute(data, a, b, now), null);
});

test('walking client rejects missing sessions and invalid coordinates before any request', async () => {
  const { getWalkingDirections } = await import('../src/services/walkingDirections.ts');
  assert.equal((await getWalkingDirections(a, b, null)).status, 'unavailable');
  assert.equal((await getWalkingDirections({ ...a, latitude: NaN }, b, 'token')).status, 'unavailable');
});

// This three-sided detour is about 997 m; its endpoints are only about 108 m apart.
const curved = [a, { latitude: 14.564, longitude: 121.03 }, { latitude: 14.564, longitude: 121.031 }, b];
function storedRoute(coordinates: typeof curved, distance: number) {
  return { ...route, coordinates, distance_meters: distance, duration_seconds: 900,
    steps: [{ instruction: 'Follow the path around the block', distance_meters: distance, duration_seconds: 900 }] };
}
function orsRoute(coordinates: typeof curved, distance: number) {
  return { type: 'FeatureCollection', metadata: { timestamp: now }, features: [{
    type: 'Feature', geometry: { type: 'LineString', coordinates: coordinates.map(p => [p.longitude, p.latitude]) },
    properties: { summary: { distance, duration: 900 }, segments: [{ distance, duration: 900,
      steps: [{ instruction: 'Follow the path around the block', distance, duration: 900, way_points: [0, coordinates.length - 1] }] }] },
  }] };
}
test('stored walking geometry must agree with sourced distance in both directions', () => {
  const valid = parseWalkingRoute(storedRoute(curved, 1000), a, b, now);
  assert.deepEqual(valid?.coordinates, curved);
  assert.equal(valid?.distance_meters, 1000);
  assert.equal(parseWalkingRoute(storedRoute([a, b], 1000), a, b, now), null, 'a short chord cannot stand in for a missing detour');
  assert.equal(parseWalkingRoute(storedRoute(curved, 900), a, b, now), null, 'geometry also cannot materially exceed the sourced distance');
});
test('ORS walking geometry must agree with sourced distance in both directions', () => {
  const valid = parseOrsRoute(orsRoute(curved, 1000), a, b, now);
  assert.deepEqual(valid?.coordinates, curved);
  assert.equal(valid?.distance_meters, 1000);
  assert.equal(parseOrsRoute(orsRoute([a, b], 1000), a, b, now), null, 'matching step totals cannot validate incomplete geometry');
  assert.equal(parseOrsRoute(orsRoute(curved, 900), a, b, now), null, 'geometry also cannot materially exceed the sourced distance');
});
