import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRide, nearbyRideUnits, type RideEvidence } from '../src/services/passengerJourney.ts';
import { buildEmergencyMessage } from '../src/services/passengerSafety.ts';
const start = Date.parse('2026-10-27T00:00:00Z');
const fix = (step: number) => ({ latitude: 14.56 + step * 0.0004, longitude: 121.03, accuracy: 5, timestamp: start + step * 10000 });
const vehicle = (step: number, extra = {}) => ({ id: 'v1', vehicle_id: 'v1', body_number: 'Body 1', plate_number: 'ABC-123', route_id: 'r1', ...fix(step), speed: 16, heading: 0, recorded_at: new Date(start + step * 10000).toISOString(), passenger_count: 5, max_capacity: 22, is_full: false, status: 'Maluwag' as const, ...extra });

test('boarding inference requires four independent co-moving fixes over 30 seconds', () => {
  let evidence: RideEvidence | null = null;
  for (let step = 0; step < 4; step++) {
    const result = detectRide(evidence, fix(step), [vehicle(step)], fix(step).timestamp);
    assert.equal(result.unit?.vehicle_id ?? null, step === 3 ? 'v1' : null);
    evidence = result.evidence;
  }
});
test('stationary proximity, duplicate fixes and multiple nearby vehicles never establish boarding', () => {
  let evidence: RideEvidence | null = null;
  for (let step = 0; step < 8; step++) {
    const p = { ...fix(0), timestamp: start + step * 10000 };
    const result = detectRide(evidence, p, [vehicle(step, { latitude: p.latitude })], p.timestamp);
    assert.equal(result.unit, null); evidence = result.evidence;
  }
  const first = detectRide(null, fix(0), [vehicle(0)], start);
  assert.equal(detectRide(first.evidence, fix(0), [vehicle(0)], start + 1000).evidence?.count, 1);
  assert.equal(detectRide(first.evidence, fix(1), [vehicle(1), vehicle(1, { id: 'v2', vehicle_id: 'v2' })], start + 10000).evidence, null);
});
test('sample, stale, inaccurate and missing telemetry cannot auto-assign an SOS unit', () => {
  assert.deepEqual(nearbyRideUnits(fix(0), [vehicle(0, { is_sample: true })], start), []);
  assert.deepEqual(nearbyRideUnits(fix(0), [vehicle(0, { recorded_at: undefined })], start), []);
  assert.deepEqual(nearbyRideUnits(fix(3), [vehicle(0)], start + 30000), []);
  assert.deepEqual(nearbyRideUnits({ ...fix(0), accuracy: 65 }, [vehicle(0)], start), []);
  assert.deepEqual(nearbyRideUnits(fix(0), [vehicle(0)], start + 16000), []);
  assert.equal(detectRide(null, fix(0), [vehicle(0, { speed: 0 })], start).unit, null);
});
test('telemetry gap or changing vehicle resets boarding evidence', () => {
  const first = detectRide(null, fix(0), [vehicle(0)], start);
  const gap = detectRide(first.evidence, fix(4), [vehicle(4)], start + 40000);
  assert.equal(gap.evidence?.count, 1);
  assert.equal(gap.unit, null);
  const change = detectRide(first.evidence, fix(1), [vehicle(1, { vehicle_id: 'other' })], start + 10000);
  assert.equal(change.evidence?.count, 1);
});
test('sample ride emergency body is explicitly test data with automatically filled identifiers', () => {
  const message = buildEmergencyMessage({ fix: fix(0), body: 'Unit 01', plate: 'TEST-1001', isSample: true });
  assert.match(message, /TEST RIDE/);
  assert.match(message, /Body number: Unit 01/);
  assert.match(message, /Plate number: TEST-1001/);
});
