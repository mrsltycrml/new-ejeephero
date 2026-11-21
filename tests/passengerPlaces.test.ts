import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestRouteStop, parsePlaces } from '../src/services/passengerPlaces.ts';

const place = { id: 'p', name: 'Destination', address: 'Makati', latitude: 14.56, longitude: 121.03 };
const stop = { id: 's', name: 'Stop', route_id: 'r', sequence_order: 1, latitude: 14.561, longitude: 121.03 };
test('place search accepts mapped places and rejects invalid or out-of-area coordinates', () => {
  const feature = { properties: { name: 'Mall', city: 'Makati', osm_type: 'W', osm_id: 1 }, geometry: { coordinates: [121.03, 14.56] } };
  assert.equal(parsePlaces({ features: [feature] })[0].name, 'Mall');
  assert.deepEqual(parsePlaces({ features: [{ ...feature, geometry: { coordinates: [0, 0] } }, { ...feature, geometry: { coordinates: ['121', '14'] } }] }), []);
});
test('nearest destination stop needs current alighting permission', () => {
  assert.equal(nearestRouteStop(place, [stop]), null);
  const exit = { ...stop, location_source_url: 'https://example.test/stop', location_verified_at: '2026-01-01',
    passenger_use: 'alight' as const, passenger_use_source_url: 'https://example.test/use', passenger_use_verified_at: '2026-01-01' };
  assert.equal(nearestRouteStop(place, [exit])?.stop.id, 's');
  assert.equal(nearestRouteStop(place, [{ ...exit, latitude: 15 }]), null);
  assert.equal(nearestRouteStop(place, [{ ...exit, latitude: NaN }]), null);
  assert.equal(nearestRouteStop(place, [exit, { ...exit, id: 'closer', latitude: 14.5601, passenger_use: 'board' }])?.stop.id, 's');
});
