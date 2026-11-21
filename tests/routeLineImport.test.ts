import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerifiedRouteLine } from '../src/services/routeLineImport.ts';
import { route1Pins, route1Variants } from '../src/services/route1FieldMap.ts';

test('route line import keeps GeoJSON longitude, latitude and travel order', () => {
  const geometry = { type: 'LineString', coordinates: [[121.02, 14.56], [121.024, 14.564]] };
  assert.deepEqual(parseVerifiedRouteLine(JSON.stringify({ type: 'Feature', geometry })), [
    { longitude: 121.02, latitude: 14.56 }, { longitude: 121.024, latitude: 14.564 },
  ]);
  for (const coordinates of [[[121, 14.56], [121, 14.56]], [[14.56, 121], [14.564, 121.02]], [['121', 14.56], [121.02, 14.564]], [null, [121.02, 14.564]]]) {
    assert.equal(parseVerifiedRouteLine(JSON.stringify({ ...geometry, coordinates })), null);
  }
});

test('Route 1 review keeps both dated directional traces continuous and the two Tivoli curbs distinct', () => {
  assert.equal(route1Variants.length, 2);
  for (const variant of route1Variants) {
    assert.notEqual(variant.source, variant.returnSource);
    for (const direction of ['outbound', 'inbound'] as const) {
      const points = variant[direction];
      assert.ok(points.length > 200);
      points.forEach(({ latitude, longitude }, i) => {
        assert.ok(latitude > 14.54 && latitude < 14.59 && longitude > 121.01 && longitude < 121.05);
        if (i) assert.ok(Math.hypot(latitude - points[i-1].latitude, longitude - points[i-1].longitude) < 0.002);
      });
    }
  }
  const tivoli = route1Pins.filter(pin => pin.id.startsWith('tivoli'));
  assert.deepEqual(tivoli.map(pin => pin.direction), ['outbound', 'inbound']);
  assert.notDeepEqual(tivoli[0].point, tivoli[1].point);
  assert.equal(route1Pins.find(pin => pin.id === 'bridge')?.kind, 'landmark');
});
