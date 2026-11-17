import test from 'node:test';
import assert from 'node:assert/strict';
import { stopLandmarks } from '../src/services/stopLandmarks.ts';
import type { TerminalData } from '../src/services/offlineTransitService';

const stop: TerminalData = { id: 's', route_id: 'r', name: 'Test fixture', latitude: 14.5, longitude: 121, sequence_order: 1,
  location_source_url: 'https://operator.example/location', location_verified_at: '2026-01-01', landmark_desc: 'A real recorded description',
  landmark_photo: 'https://operator.example/photo.jpg', boarding_side: 'Recorded boarding side' };
test('stop details need their own source and verification; location evidence alone is insufficient', () => {
  assert.equal(stopLandmarks(stop), null);
  assert.equal(stopLandmarks({ ...stop, stop_details_source_url: 'https://operator.example/details', stop_details_verified_at: 'bad' }), null);
  assert.equal(stopLandmarks({ ...stop, stop_details_source_url: 'https://operator.example/details', stop_details_verified_at: '2099-01-01' }), null);
});
test('sourced stop details preserve unknown fields and never invent a photo attribution', () => {
  const sourced = { ...stop, stop_details_source_url: 'https://operator.example/details', stop_details_verified_at: '2026-01-01' };
  const details = stopLandmarks(sourced)!;
  assert.equal(details.boardingSide, stop.boarding_side);
  assert.equal(details.direction, null);
  assert.equal(details.photo, null);
  assert.equal(stopLandmarks({ ...sourced, landmark_photo_source_url: 'https://operator.example/photos' })?.photo, stop.landmark_photo);
  assert.equal(stopLandmarks({ ...sourced, is_sample: true }), null);
});
