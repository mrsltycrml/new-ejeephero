import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerifiedRouteLine } from '../src/services/routeLineImport.ts';

test('route line import keeps GeoJSON longitude, latitude and travel order', () => {
  const geometry = { type: 'LineString', coordinates: [[121.02, 14.56], [121.024, 14.564]] };
  assert.deepEqual(parseVerifiedRouteLine(JSON.stringify({ type: 'Feature', geometry })), [
    { longitude: 121.02, latitude: 14.56 }, { longitude: 121.024, latitude: 14.564 },
  ]);
  for (const coordinates of [[[121, 14.56], [121, 14.56]], [[14.56, 121], [14.564, 121.02]], [['121', 14.56], [121.02, 14.564]], [null, [121.02, 14.564]]]) {
    assert.equal(parseVerifiedRouteLine(JSON.stringify({ ...geometry, coordinates })), null);
  }
});
