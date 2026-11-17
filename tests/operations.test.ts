import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSafetyScore,
  pickLatestFreshPositions,
  summarizeDrivers,
  summarizeUnits,
  type DriverRecord,
  type FleetShift,
} from '../src/utils/operationsSummary.ts';

test('calculateSafetyScore deducts speeding points and 10 per confirmed cut without going negative', () => {
  assert.equal(calculateSafetyScore(0, 0), 100);
  assert.equal(calculateSafetyScore(8, 2), 72);
  assert.equal(calculateSafetyScore(120, 5), 0);
});

test('summarizeUnits merges shifts by plate/body key and separates active vs today states', () => {
  const now = new Date('2026-11-17T08:00:00Z'); // 16:00 PHT
  const shifts: FleetShift[] = [
    {
      id: 's1',
      driver_id: 'd1',
      route_id: 'r1',
      body_number: 'Unit 01',
      plate_number: 'ABC-123',
      passenger_count: 5,
      max_capacity: 22,
      is_active: true,
      created_at: '2026-11-17T06:00:00Z',
      ended_at: null,
    },
    {
      id: 's2',
      driver_id: 'd2',
      route_id: 'r1',
      body_number: 'Unit 02',
      plate_number: 'XYZ-999',
      passenger_count: 0,
      max_capacity: 22,
      is_active: false,
      created_at: '2026-11-17T01:00:00Z',
      ended_at: '2026-11-17T04:00:00Z',
    },
    {
      id: 's3',
      driver_id: 'd2',
      route_id: 'r1',
      body_number: 'Unit 02',
      plate_number: 'XYZ-999',
      passenger_count: 0,
      max_capacity: 22,
      is_active: false,
      created_at: '2026-11-16T01:00:00Z',
      ended_at: '2026-11-16T05:00:00Z',
    },
  ];

  const units = summarizeUnits(shifts, now);
  assert.equal(units.length, 2);
  assert.equal(units[0].state, 'on_trip');
  assert.equal(units[1].state, 'traveled_today');
  assert.equal(units[1].tripsToday, 1);
  assert.equal(units[1].totalTrips, 2);
});

test('summarizeDrivers sorts active shifts first then alphabetically', () => {
  const now = new Date('2026-11-17T08:00:00Z');
  const drivers: DriverRecord[] = [
    { id: 'd1', email: 'z@example.com', full_name: 'Zed', status: 'approved' },
    { id: 'd2', email: 'a@example.com', full_name: 'Ana', status: 'approved' },
  ];
  const shifts: FleetShift[] = [
    {
      id: 's1',
      driver_id: 'd1',
      route_id: 'r1',
      body_number: 'Unit 01',
      plate_number: 'ABC-123',
      passenger_count: 0,
      max_capacity: 22,
      is_active: true,
      created_at: '2026-11-17T07:00:00Z',
      ended_at: null,
    },
  ];
  const summary = summarizeDrivers(drivers, shifts, now);
  assert.deepEqual(
    summary.map((s) => s.profile.id),
    ['d1', 'd2']
  );
  assert.equal(summary[0].tripsToday, 1);
  assert.equal(summary[1].totalTrips, 0);
});

test('pickLatestFreshPositions drops stale >120s rows and keeps newest per vehicle', () => {
  const now = Date.parse('2026-11-17T08:05:00Z');
  const latest = pickLatestFreshPositions(
    [
      { vehicle_id: 'v1', latitude: 14.56, longitude: 121.03, speed: 15, heading: 0, timestamp: '2026-11-17T08:04:00Z' },
      { vehicle_id: 'v1', latitude: 14.57, longitude: 121.03, speed: 18, heading: 90, timestamp: '2026-11-17T08:04:45Z' },
      { vehicle_id: 'v2', latitude: 14.55, longitude: 121.02, speed: 10, heading: 0, timestamp: '2026-11-17T08:01:00Z' },
    ],
    now
  );
  assert.equal(latest.size, 1);
  assert.equal(latest.get('v1')?.speed, 18);
  assert.equal(latest.has('v2'), false);
});
