import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptFix, fromDeviceLocation, locationQuality, positionPayload, telemetryFix, vehicleTelemetryReadout } from '../src/services/locationQuality.ts';
import { pickLatestFreshPositions } from '../src/utils/operationsSummary.ts';

const now = Date.parse('2026-11-18T08:00:00Z');
const fix = { latitude: 14.6, longitude: 121, accuracy: 5, timestamp: now, speed: 0, heading: null };
test('the vehicle readout shows measured zero and withholds speed from weak or expired GPS', () => {
  const position = { ...fix, recorded_at: new Date(now - 2000).toISOString() };
  assert.deepEqual(vehicleTelemetryReadout(position, now), { gps: 'GPS live · measured 2s ago · ±5 m', speed: 0 });
  assert.equal(vehicleTelemetryReadout({ ...position, speed: null }, now).speed, null);
  assert.equal(vehicleTelemetryReadout({ ...position, speed: 16, accuracy: 60 }, now).speed, null);
  assert.deepEqual(vehicleTelemetryReadout({ ...position, speed: 16 }, now + 30000), { gps: 'Current vehicle GPS unavailable', speed: null });
});
test('quality distinguishes invalid, future, stale, weak and stationary fixes as wallclock advances', () => {
  assert.equal(locationQuality(null, now), 'unavailable');
  for (const extra of [{ latitude: 91 }, { longitude: NaN }, { timestamp: NaN }]) assert.equal(locationQuality({ ...fix, ...extra }, now), 'invalid');
  assert.equal(locationQuality({ ...fix, timestamp: now + 5001 }, now), 'future');
  assert.equal(locationQuality(fix, now + 30001), 'stale');
  for (const accuracy of [null, -1, NaN, 31]) assert.equal(locationQuality({ ...fix, accuracy }, now), 'weak');
  assert.equal(locationQuality(fix, now), 'live');
});
test('device units convert once and captured time, zero and unknown values survive publication', () => {
  const measured = fromDeviceLocation({ timestamp: now, coords: { ...fix, speed: 5, heading: -1 } });
  const row = positionPayload('v', measured, now);
  assert.equal(row.speed, 18);
  assert.equal(row.heading, null);
  assert.equal(row.accuracy, 5);
  assert.equal(row.captured_at, '2026-11-18T08:00:00.000Z');
  assert.equal(row.timestamp, row.captured_at);
  assert.deepEqual(telemetryFix(row), measured);
  const unknown = fromDeviceLocation({ timestamp: now, coords: { ...fix, speed: null, accuracy: null, heading: null } });
  assert.equal(unknown.speed, null);
  assert.equal(unknown.accuracy, null);
  assert.throws(() => positionPayload('v', unknown, now), /weak/);
  assert.equal(positionPayload('v', fix, now).speed, 0);
  assert.throws(() => positionPayload('v', fix, now + 31000), /stale/);
});
test('transition rejects duplicates and impossible jumps but recovers after a long observation gap', () => {
  const jump = { ...fix, latitude: 15, timestamp: now + 1000 };
  assert.equal(locationQuality(jump, now + 1000), 'live');
  assert.equal(acceptFix(fix, jump, now + 1000), false);
  assert.equal(acceptFix(fix, fix, now), false);
  assert.equal(acceptFix({ ...fix, timestamp: now - 5000 }, { ...fix, latitude: 15 }, now), false);
  assert.equal(acceptFix({ ...fix, timestamp: now - 300000 }, { ...fix, latitude: 15 }, now), true);
  assert.equal(acceptFix({ ...fix, timestamp: now - 5000 }, fix, now), true);
  assert.equal(acceptFix(null, { ...fix, accuracy: null }, now), true);
});
test('latest telemetry never promotes cached receipt time or legacy timestamps to fresh measurement', () => {
  const row = { vehicle_id: 'v', ...fix, timestamp: new Date(now).toISOString(), captured_at: new Date(now - 40000).toISOString() };
  assert.equal(pickLatestFreshPositions([row], now).size, 0);
  assert.equal(pickLatestFreshPositions([{ ...row, captured_at: undefined }], now).size, 0);
  assert.equal(pickLatestFreshPositions([{ ...row, captured_at: new Date(now + 6000).toISOString() }], now).size, 0);
  const good = { ...row, captured_at: new Date(now - 1000).toISOString() };
  assert.equal(pickLatestFreshPositions([good], now).get('v'), good);
  assert.equal(telemetryFix({ ...good, accuracy: undefined }).accuracy, null);
});
