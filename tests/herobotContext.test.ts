import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitChatContext } from '../supabase/functions/herobot-chat/context.ts';
const boarding = { passenger_use: 'board', passenger_use_verified_at: '2026-01-01', passenger_use_source_url: 'https://operator.example/use' };

test('chat context never turns fare defaults or active shifts into current operational facts', () => {
  const context = buildTransitChatContext([{ id: 'r', name: 'Real route', base_fare: 15, operating_hours: 'Unconfirmed hours' }], [
    { route_id: 'r', name: 'Unverified bay', is_well_lit: true, cctv_monitored: true },
  ]);
  assert.match(context, /Real route/);
  assert.match(context, /Fare amounts.*unavailable/);
  assert.match(context, /Live vehicle positions.*unavailable/);
  assert.doesNotMatch(context, /15|Unconfirmed hours|Unverified bay|Safe Night Stop/);
});

test('chat context excludes samples and unpublished routes and requires sourced stop evidence', () => {
  const context = buildTransitChatContext([
    { id: 'r', name: 'Published route' }, { id: 's', name: 'Seed route', is_sample: true },
    { id: 'a', name: 'Archived route', is_archived: true }, { id: 'c', name: 'Future route', is_coming_soon: true },
  ], [
    { ...boarding, route_id: 'r', name: 'Sourced stop', latitude: 14.5, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01', sequence_order: 1 },
    { route_id: 'r', name: 'Unconfirmed use', latitude: 14.5, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' },
    { route_id: 'r', name: 'Seed stop', is_sample: true, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' },
    { route_id: 'r', name: 'Invalid stop', latitude: 100, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' },
  ]);
  assert.match(context, /Sourced stop/);
  assert.match(context, /https:\/\/operator.example\/stop/);
  assert.match(context, /"passengerUse":"board"/);
  assert.doesNotMatch(context, /Seed|Archived|Future|Invalid stop|Unconfirmed use/);
});

test('failed and empty chat reference reads remain distinct and both forbid invented facts', () => {
  assert.match(buildTransitChatContext(null, null), /Directory unavailable/);
  assert.match(buildTransitChatContext([], []), /No published active routes/);
  for (const context of [buildTransitChatContext(null, null), buildTransitChatContext([], [])]) {
    assert.match(context, /Never invent/);
    assert.match(context, /Do not use earlier chat answers/);
  }
});

test('chat reference excludes future verification while retaining past sourced stops', () => {
  const stop = { ...boarding, route_id: 'r', name: 'Past stop', latitude: 14.5, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' };
  for (const future of ['2099-01-01', new Date(Date.now() + 60000).toISOString()]) {
    const context = buildTransitChatContext([{ id: 'r', name: 'Published route' }], [stop, { ...stop, name: 'Future stop', location_verified_at: future }]);
    assert.match(context, /Past stop/);
    assert.doesNotMatch(context, /Future stop/);
    assert.match(context, /Never invent/);
  }
});

const quoteTime = Date.parse('2026-11-23T01:00:00Z');
const source = { source_url: 'https://operator.example/approved', verified_at: '2026-11-01' };
const liveRoute = {
  id: 'r', name: 'Published route', geometry_source_url: source.source_url, geometry_verified_at: source.verified_at,
  coordinates: [{ latitude: 14.5, longitude: 121 }, { latitude: 14.51, longitude: 121 }],
};
const boardAndExit = [
  { ...boarding, id: 'a', route_id: 'r', name: 'Board here', latitude: 14.505, longitude: 121, location_source_url: source.source_url, location_verified_at: source.verified_at, sequence_order: 1 },
  { ...boarding, id: 'b', route_id: 'r', name: 'Exit here', latitude: 14.51, longitude: 121, location_source_url: source.source_url, location_verified_at: source.verified_at, sequence_order: 2, passenger_use: 'alight' },
];
const fare = { ...source, route_id: 'r', currency: 'PHP', effective_from: '2026-11-02', effective_to: null,
  brackets: [{ up_to_km: 4, regular: 18, discounted: 14.5 }] };
const ride = { ...source, route_id: 'r', from_stop_id: 'a', to_stop_id: 'b', distance_meters: 550 };
const movingVehicle = { route_id: 'r', latitude: 14.501, longitude: 121, accuracy: 8, speed: 18, heading: 0,
  recorded_at: new Date(quoteTime - 5000).toISOString() };
const directory = (context: string) => JSON.parse(context.slice(context.indexOf('\n[') + 1))[0];

test('chat includes sourced passenger quotes only from a current matrix and verified ride', () => {
  const reference = directory(buildTransitChatContext([liveRoute], boardAndExit, { fareMatrices: [fare], rideSegments: [ride], now: quoteTime }));
  assert.deepEqual(reference.stopFares, [{ from: 'Board here', to: 'Exit here', regular: 18, studentSeniorPwd: 14.5 }]);
  assert.equal(reference.fares.source, source.source_url);
  const expired = directory(buildTransitChatContext([liveRoute], boardAndExit, {
    fareMatrices: [{ ...fare, effective_to: '2026-11-21' }], rideSegments: [ride], now: quoteTime,
  }));
  assert.equal(expired.fares, null);
  assert.deepEqual(expired.stopFares, []);
  const noDistance = directory(buildTransitChatContext([liveRoute], boardAndExit, {
    fareMatrices: [fare], rideSegments: [{ ...ride, verified_at: '2099-01-01' }], now: quoteTime,
  }));
  assert.deepEqual(noDistance.stopFares, []);
  const repeatedName = { ...boardAndExit[0], id: 'repeat', name: ' board here ', sequence_order: 3 };
  const ambiguous = directory(buildTransitChatContext([liveRoute], [...boardAndExit, repeatedName], {
    fareMatrices: [fare], rideSegments: [ride], now: quoteTime,
  }));
  assert.deepEqual(ambiguous.stopFares, []);
});

test('chat estimates arrival only for a fresh moving unit headed toward a verified boarding stop', () => {
  const context = (vehicles: typeof movingVehicle[], route = liveRoute) => directory(buildTransitChatContext(
    [route], boardAndExit, { vehicles, now: quoteTime },
  )).stops;
  assert.deepEqual(context([movingVehicle])[0].estimatedArrival, {
    minutes: 2, fromGpsAt: movingVehicle.recorded_at,
  });
  assert.equal(context([movingVehicle])[1].estimatedArrival, null);
  for (const invalid of [
    { ...movingVehicle, recorded_at: new Date(quoteTime - 31000).toISOString() },
    { ...movingVehicle, heading: 180 },
    { ...movingVehicle, latitude: 14.507 },
    { ...movingVehicle, accuracy: 45 },
    { ...movingVehicle, longitude: 121.01 },
    { ...movingVehicle, speed: 0 },
    { ...movingVehicle, recorded_at: new Date(quoteTime - 25000).toISOString(), latitude: 14.5045 },
  ]) assert.equal(context([invalid])[0].estimatedArrival, null);
  assert.equal(context([movingVehicle], { ...liveRoute, geometry_verified_at: '2099-01-01' })[0].estimatedArrival, null);
});
