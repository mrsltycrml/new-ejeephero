import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJourneyMap, rideLeg, selectJourneyStop, selectJourneyRoute, reconcileJourneySelection, permitsPassengerUse, passengerStopOptions } from '../src/services/routeMap.ts';
import { scriptJson } from '../src/utils/scriptJson.ts';

const a = { latitude: 14.6, longitude: 121 };
const b = { latitude: 14.6, longitude: 121.01 };
const c = { latitude: 14.61, longitude: 121.01 };
const route: any = { id: 'r-any', name: '</script><b>Route</b>', coordinates: [a, b, c], geometry_verified_at: '2026-11-01', geometry_source_url: 'https://example.test/survey' };
const stop = (id: string, point: typeof a, order: number, route_id = route.id): any => ({ id, ...point, route_id, sequence_order: order, name: id, location_verified_at: '2026-11-01', location_source_url: 'https://example.test/stops',
  passenger_use: 'both', passenger_use_verified_at: '2026-11-01', passenger_use_source_url: 'https://example.test/operations' });
const origin = stop('a', a, 1), end = stop('c', c, 3);
test('passenger roles need both verified location and explicit current operating evidence', () => {
  for (const [use, board, alight] of [['board', true, false], ['alight', false, true], ['both', true, true], [null, false, false], ['unknown', false, false]]) {
    assert.equal(permitsPassengerUse({ ...origin, passenger_use: use }, 'board'), board);
    assert.equal(permitsPassengerUse({ ...origin, passenger_use: use }, 'alight'), alight);
  }
  for (const change of [{ passenger_use_verified_at: null }, { passenger_use_verified_at: '2099-01-01' },
    { passenger_use_verified_at: '2026-02-31' }, { passenger_use_source_url: 'http://example.test' },
    { passenger_use_source_url: 'https:example.test' }, { location_verified_at: null }, { is_sample: true },
    { is_active: false }, { deleted_at: '2026-11-01' }, { longitude: 181 }]) {
    assert.equal(permitsPassengerUse({ ...origin, ...change }, 'board'), false);
  }
});
test('manual options, selection and map use current role and direction on each route', () => {
  const board = { ...origin, passenger_use: 'board' }, exit = { ...end, passenger_use: 'alight' };
  const legacy = { ...stop('intermediate', b, 2), passenger_use: undefined };
  const stops = [board, legacy, exit];
  assert.deepEqual(passengerStopOptions(stops, 'board', exit), [board]);
  assert.deepEqual(passengerStopOptions(stops, 'alight', board), [exit]);
  const empty = { selectedRouteId: route.id, boardingStop: null, alightingStop: null };
  assert.equal(selectJourneyStop(empty, origin, 'alighting', [route], stops), empty);
  assert.equal(selectJourneyStop(empty, end, 'boarding', [route], stops), empty);
  const input = { ...empty, routes: [route], terminals: stops, boardingStop: exit, alightingStop: board };
  const map = buildJourneyMap(input);
  assert.deepEqual(map.terminals, [board, exit]);
  assert.equal(map.boarding, undefined); assert.equal(map.alighting, undefined);
  assert.deepEqual(map.rideCoordinates, []);
  assert.deepEqual(buildJourneyMap({ ...input, fleetMode: true }).terminals, stops);
});
test('ride highlight follows verified bends and rejects reverse, wrong-route, off-route or unverified stops', () => {
  assert.deepEqual(rideLeg(route, origin, end), [a, b, c]);
  assert.deepEqual(rideLeg(route, end, origin), []);
  assert.deepEqual(rideLeg(route, origin, { ...end, route_id: 'other' }), []);
  assert.deepEqual(rideLeg(route, origin, { ...end, latitude: 15 }), []);
  assert.deepEqual(rideLeg({ ...route, geometry_verified_at: null }, origin, end), []);
  assert.deepEqual(rideLeg(route, origin, { ...end, location_source_url: null }), []);
  assert.deepEqual(rideLeg({ ...route, geometry_verified_at: 'not-a-date' }, origin, end), []);
  assert.deepEqual(rideLeg(route, origin, { ...end, location_verified_at: 'not-a-date' }), []);
});
test('stop choices keep boarding separate from alighting and route changes clear incompatible stops', () => {
  const empty = { selectedRouteId: null, boardingStop: null, alightingStop: null };
  const alighting = selectJourneyStop(empty, end, 'alighting', [route], [origin, end]);
  assert.equal(alighting.boardingStop, null);
  assert.equal(alighting.alightingStop?.id, 'c');
  const both = selectJourneyStop(alighting, origin, 'boarding', [route], [origin, end]);
  assert.equal(both.boardingStop?.id, 'a');
  assert.equal(both.alightingStop?.id, 'c');
  assert.deepEqual(selectJourneyStop(both, end, 'boarding', [route], [origin, end]), both);
  assert.deepEqual(selectJourneyRoute(both, 'other', [route, { ...route, id: 'other' }]), { selectedRouteId: 'other', boardingStop: null, alightingStop: null });
  assert.equal(selectJourneyStop(empty, { ...end, id: 'forged' }, 'boarding', [route], [end]).boardingStop, null);
  assert.equal(selectJourneyStop(empty, { ...end, sequence_order: NaN }, 'boarding', [route], [{ ...end, sequence_order: NaN }]).boardingStop, null);
});
test('camera describes selected journey only and never fabricates route or walking geometry', () => {
  const input = { routes: [route], terminals: [origin, end], selectedRouteId: route.id, boardingStop: origin, alightingStop: end, destinationPlace: { name: 'Place', latitude: 14.62, longitude: 121.02 } };
  const first = buildJourneyMap(input);
  assert.ok(first.fitPoints.some(p => p.latitude === 14.62));
  assert.deepEqual(first.rideCoordinates, [a, b, c]);
  assert.deepEqual(first.walkingRoutes, []);
  assert.equal(buildJourneyMap({ ...input, vehicles: [{ latitude: 80, longitude: 10 }] } as any).cameraKey, first.cameraKey);
  assert.deepEqual(buildJourneyMap({ ...input, routes: [{ ...route, geometry_verified_at: null }] }).routes, []);
  const walking = { id: 'walk', coordinates: [c, { latitude: 14.62, longitude: 121.02 }], source: 'router', generatedAt: '2026-11-18T08:00:00Z' };
  assert.equal(buildJourneyMap({ ...input, walkingRoutes: [walking] }).walkingRoutes.length, 1);
  assert.deepEqual(buildJourneyMap({ ...input, walkingRoutes: [{ ...walking, source: '' }] }).walkingRoutes, []);
  assert.ok(!scriptJson(first).includes('<'));
});

test('partial ride legs project onto source geometry and ambiguous loops remain unavailable', () => {
  const start = stop('middle', { latitude: 14.60001, longitude: 121.005 }, 2);
  const leg = rideLeg(route, start, end);
  assert.equal(leg[0].latitude, 14.6);
  assert.equal(leg[0].longitude, 121.005);
  assert.deepEqual(leg.slice(1), [b, c]);
  assert.deepEqual(rideLeg({ ...route, coordinates: [a, b, c, a] }, origin, end), []);
});

test('source refresh removes deleted or reordered selections, and malformed geometry stays unavailable', () => {
  const selection = { selectedRouteId: route.id, boardingStop: origin, alightingStop: end };
  const reversed = reconcileJourneySelection(selection, [route], [origin, { ...end, sequence_order: 0 }]);
  assert.equal(reversed.boardingStop?.id, 'a');
  assert.equal(reversed.alightingStop, null);
  assert.deepEqual(reconcileJourneySelection(selection, [], []), { selectedRouteId: null, boardingStop: null, alightingStop: null });
  for (const coordinates of [[a, null], 'bad geometry', [a, { latitude: 91, longitude: 0 }]]) {
    assert.deepEqual(buildJourneyMap({ routes: [{ ...route, coordinates }], terminals: [] }).routes, []);
  }
});

test('an archived route cannot retain selected stops or map geometry even if other flags remain active', () => {
  const archived = { ...route, is_archived: true, is_active: true, is_published: true };
  const selection = { selectedRouteId: route.id, boardingStop: origin, alightingStop: end };
  assert.deepEqual(reconcileJourneySelection(selection, [archived], [origin, end]), { selectedRouteId: null, boardingStop: null, alightingStop: null });
  const map = buildJourneyMap({ ...selection, routes: [archived], terminals: [origin, end] });
  assert.deepEqual(map.routes, []); assert.deepEqual(map.terminals, []); assert.deepEqual(map.rideCoordinates, []);
});

test('future verification cannot supply route geometry, map stops or selectable stops', () => {
  for (const future of ['2099-01-01', new Date(Date.now() + 60000).toISOString()]) {
    const futureRoute = { ...route, geometry_verified_at: future };
    const futureStop = { ...end, location_verified_at: future };
    const selection = { selectedRouteId: route.id, boardingStop: origin, alightingStop: null };
    assert.deepEqual(buildJourneyMap({ routes: [futureRoute], terminals: [] }).routes, []);
    assert.deepEqual(buildJourneyMap({ routes: [route], terminals: [futureStop] }).terminals, []);
    assert.deepEqual(rideLeg(futureRoute, origin, end), []);
    assert.deepEqual(rideLeg(route, origin, futureStop), []);
    assert.deepEqual(selectJourneyStop(selection, futureStop, 'alighting', [route], [origin, futureStop]), selection);
    assert.equal(reconcileJourneySelection({ ...selection, alightingStop: futureStop }, [route], [origin, futureStop]).alightingStop, null);
  }
});
