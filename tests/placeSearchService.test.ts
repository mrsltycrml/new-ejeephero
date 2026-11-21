import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { searchLocalPassengerPlaces, searchPassengerPlaces } from '../src/services/placeSearchService.ts';
import { ROUTE1_OUTBOUND_ID, ROUTE1_INBOUND_ID } from '../src/services/route1FieldMap.ts';
import type { RouteData, TerminalData } from '../src/services/offlineTransitService.ts';

const point = (latitude: number, longitude: number) => ({ latitude, longitude });
const a = point(14.55, 121), b = point(14.55, 121.04), c = point(14.59, 121.04);
const route: RouteData = { id: 'r', name: 'Market Line', description: '', operating_hours: '', color_code: '#000000',
  base_fare: 0, per_km_rate: 0, coordinates: [a, a, b, c], geometry_verified_at: '2024-01-01', geometry_source_url: 'https://example.org/survey' };
const scope = { routes: [route], stops: [] };
const stop = (name: string, route_id = route.id): TerminalData => ({ id: name, name, route_id, sequence_order: 1, ...a,
  location_verified_at: '2024-01-01', location_source_url: 'https://example.org/pin' });
const feature = (name: string, p: typeof a, id: number) => ({ properties: { name, osm_id: id, osm_type: 'N' },
  geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] } });
const response = (...features: ReturnType<typeof feature>[]) => Response.json({ features });

let now = Date.UTC(2026, 10, 20);
function clock(t: TestContext) {
  now += 86400000;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
}

test('local typeahead finds verified stops and landmark descriptions, scoped to an active route', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected geocoding request'));
  const routes = [route, { ...route, id: 'other' }, { ...route, id: 'hidden', is_published: false },
    { ...route, id: 'a2000000-0000-0000-0000-000000000002', name: 'Route 2', is_coming_soon: true }, { ...route, id: 'future', is_coming_soon: true }];
  const stops = routes.map(r => stop('Gate ' + r.id, r.id));
  stops.push({ ...stop('Gate unsurveyed'), location_verified_at: null });
  Object.assign(stops[0], { landmark_desc: 'Beside Café Mila', stop_details_source_url: 'https://example.org/detail', stop_details_verified_at: '2024-01-01' });
  const selected = { routes, stops, selectedRouteId: 'r' };
  assert.deepEqual(searchLocalPassengerPlaces('gate', { routes, stops }).map(p => p.name), ['Gate r', 'Gate other']);
  assert.deepEqual(searchLocalPassengerPlaces('cafe', selected).map(p => p.name), ['Gate r']);
  assert.deepEqual((await searchPassengerPlaces('ga', selected)).map(p => p.name), ['Gate r']);
  for (const id of ['hidden', 'future', 'missing', routes[3].id]) {
    assert.deepEqual(await searchPassengerPlaces('Gate', { routes, stops, selectedRouteId: id }), []);
  }
  assert.deepEqual(await searchPassengerPlaces('Gate', { routes: [{ ...route, geometry_verified_at: null }], stops }), searchLocalPassengerPlaces('Gate', selected));
  assert.equal(fetch.mock.callCount(), 0);
});

test('a missing scope fails closed and an activated route becomes searchable regardless of its ID or name', async (t) => {
  clock(t);
  const fetch = t.mock.method(globalThis, 'fetch', () => response(feature('Bakery', b, 1)));
  // @ts-expect-error Exercise an untyped caller omitting the required scope.
  assert.deepEqual(await searchPassengerPlaces('bakery'), []);
  assert.equal(fetch.mock.callCount(), 0);
  const activated = { ...route, name: 'Route 2', id: 'a2000000-0000-0000-0000-000000000002', is_coming_soon: false, is_active: true, is_published: true };
  assert.deepEqual((await searchPassengerPlaces('bakery', { routes: [activated], stops: [], selectedRouteId: activated.id })).map(p => p.id), ['N-1']);
  const unrelated = { ...route, id: 'district-two', name: 'Route 2 Extension' };
  assert.deepEqual(searchLocalPassengerPlaces('Gate', { routes: [unrelated], stops: [stop('Gate', unrelated.id)] }).map(p => p.name), ['Gate']);
});

test('dated reference streets and pins follow the selected variant and direction, and approved geometry supersedes a reference', async (t) => {
  clock(t);
  const outbound = { ...route, id: ROUTE1_OUTBOUND_ID, coordinates: [], geometry_verified_at: null };
  const dated = { routes: [outbound], stops: [], selectedRouteId: outbound.id };
  const jupiter = searchLocalPassengerPlaces('jup mak', dated)[0];
  assert.equal(jupiter.id, 'landmark:jupiter');
  assert.match(jupiter.address, /October 2022/);
  assert.deepEqual(searchLocalPassengerPlaces('One Ayala', dated), []);
  const publishedVariant = { ...outbound, route1_variant: 'one_ayala_2026' };
  const routes = [publishedVariant, { ...publishedVariant, id: ROUTE1_INBOUND_ID }];
  for (const [selectedRouteId, id] of [[outbound.id, 'tivoli-city-hall'], [ROUTE1_INBOUND_ID, 'tivoli-return']]) {
    assert.deepEqual(searchLocalPassengerPlaces('tivoli', { routes, stops: [], selectedRouteId }).map(p => p.id), ['landmark:' + id]);
  }
  t.mock.method(globalThis, 'fetch', () => response(feature('Bakery', jupiter, 1)));
  assert.deepEqual((await searchPassengerPlaces('bakery', dated)).map(p => p.name), ['Bakery']);
  t.mock.timers.tick(1200);
  const approved = { ...route, id: outbound.id, coordinates: [a, point(14.55, 121.001)] };
  assert.deepEqual(await searchPassengerPlaces('bakery', { ...dated, routes: [approved] }), []);
});

test('Photon candidates must be within 500 m of a scoped segment or endpoint', async (t) => {
  clock(t);
  const deg = 180 / (Math.PI * 6371000);
  const other = { ...route, id: 'other', coordinates: [point(14.58, 121), point(14.58, 121.01)] };
  const otherPlace = feature('Shop on other route', point(14.58, 121.005), 1);
  const fetch = t.mock.method(globalThis, 'fetch', () => response(otherPlace,
    feature('Shop in bbox corner', point(14.57, 121.015), 2),
    feature('Shop 499 m from middle', point(a.latitude + 499 * deg, 121.02), 3),
    feature('Shop 501 m from middle', point(a.latitude + 501 * deg, 121.02), 4),
    feature('Shop at endpoint', point(a.latitude - 499 * deg, a.longitude), 5),
    feature('Shop past endpoint', point(a.latitude - 499 * deg, a.longitude - 0.004), 6)));
  const selected = { routes: [route, other], stops: [], selectedRouteId: route.id };
  assert.deepEqual((await searchPassengerPlaces('Shop', selected)).map(p => p.id), ['N-3', 'N-5']);
  const params = new URL(String(fetch.mock.calls[0].arguments[0])).searchParams;
  const [west, south, east, north] = params.get('bbox')!.split(',').map(Number);
  assert.ok(west < a.longitude && south < a.latitude - 499 * deg && east > c.longitude && north > c.latitude);
  t.mock.timers.tick(1200);
  assert.deepEqual((await searchPassengerPlaces('Shop', { ...selected, selectedRouteId: null })).map(p => p.id), ['N-1', 'N-3', 'N-5']);
});

test('merged matches rank exact names first and deduplicate by identity or nearby normalized name', async (t) => {
  clock(t);
  const selected = { ...scope, stops: [stop('Gate West'), stop('Gaté'), stop('North Gate')] };
  t.mock.method(globalThis, 'fetch', () => response(feature('GATE', a, 1), feature('Gate', b, 2),
    feature('Gate', b, 2), feature('North Gate Market', c, 3)));
  assert.deepEqual((await searchPassengerPlaces('gate', selected)).map(p => p.id),
    ['stop:Gaté', 'N-2', 'stop:Gate West', 'stop:North Gate', 'N-3']);
});

test('cancellation stops queued work and aborts the provider, even if its response arrives late', async (t) => {
  clock(t);
  const selected = { ...scope, stops: [stop('Gate')] };
  const aborted = { name: 'AbortError' };
  let finish!: (value: Response) => void;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
  const first = new AbortController(), queued = new AbortController();
  const pending = searchPassengerPlaces('Gate', selected, first.signal);
  const waiting = searchPassengerPlaces('Gate West', selected, queued.signal);
  queued.abort();
  await assert.rejects(waiting, aborted);
  first.abort();
  assert.equal(fetch.mock.calls[0].arguments[1]?.signal?.aborted, true);
  finish(response());
  await assert.rejects(pending, aborted);
  await assert.rejects(searchPassengerPlaces('G', selected, first.signal), aborted);
  t.mock.timers.tick(1200);
  assert.equal(fetch.mock.callCount(), 1);
});

test('a provider outage retains local results and surfaces failure when there are none', async (t) => {
  clock(t);
  t.mock.method(globalThis, 'fetch', () => new Response(null, { status: 503 }));
  const matches = await searchPassengerPlaces('Gate', { ...scope, stops: [stop('Gate')] });
  assert.deepEqual(matches.map(p => p.id), ['stop:Gate']);
  const waiting = searchPassengerPlaces('unknown', scope);
  t.mock.timers.tick(1200);
  await assert.rejects(waiting, /unavailable/);
});
