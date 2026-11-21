import test from 'node:test';
import assert from 'node:assert/strict';
import { stopChanges, stopForm } from '../src/services/supervisorCatalogForm.ts';

const initial = { ...stopForm(1), name: 'Test stop', latitude: '14.5', longitude: '121',
  location_source_url: 'https://example.test/survey', boarding_side: 'East entrance',
  stop_details_source_url: 'https://example.test/entrance' };

test('formatting a coordinate leaves the pin and concurrent stop details untouched', () => {
  assert.deepEqual(stopChanges({ ...initial, latitude: '14.5000', name: 'Renamed stop' }, initial, false, 1, false), { name: 'Renamed stop' });
  assert.deepEqual(stopChanges({ ...initial, location_source_url: 'https://example.test/new' }, initial, false, 1, true),
    { location_source_url: 'https://example.test/new' });
});

test('stop sources must be absolute HTTPS URLs in the form submitted to the database', () => {
  assert.throws(() => stopChanges({ ...initial, location_source_url: 'https:example.test/survey' }, initial, false, 1, true), /HTTPS/);
  assert.throws(() => stopChanges({ ...initial, latitude: ' ' }, initial, false, 1, true), /latitude/);
});
