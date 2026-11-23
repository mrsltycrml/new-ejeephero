import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { passengerStopOptions } from '../src/services/routeMap.ts';

// Replace only storage/network boundaries; exercise the production services.
const cache = new Map<string, string>();
let tables: Record<string, any[]> = {};
let failed = false;
let cacheWriteFailed = false;
let cacheReadFailed = false;
let readOverride: ((table: string) => Promise<any>) | null = null;
let serverPageSize = 1000;
let writeOverride: (() => Promise<void>) | null = null;
let fleet: any[] = [];
let fleetSnapshot: unknown;
const rpcNames: string[] = [];
const published: any[] = [];
const routeProjections:string[] = [];
const storage = { getItem: async (key: string) => {
  if (cacheReadFailed) throw new Error('Storage unreadable');
  return cache.get(key) ?? null;
}, setItem: async (key: string, value: string) => {
  if (writeOverride) await writeOverride();
  if (cacheWriteFailed) throw new Error('Storage full');
  cache.set(key, value);
} };
const database = {
  rpc: async (name: string) => {
    rpcNames.push(name);
    return { data: failed ? null : name === 'get_passenger_fleet_snapshot' ? fleetSnapshot : fleet,
      error: failed ? { message: 'offline' } : null };
  },
  from(table: string) {
    let start = 0, end = Infinity, columns = '*';
    let maxRows = serverPageSize;
    let sortKey = '', ascending = true;
    const filters: Array<(row: any) => boolean> = [];
    const field = (row: any, key: string) => key.split('.').reduce((value, part) => value?.[part], row);
    const filter = (predicate: (row: any) => boolean) => { filters.push(predicate); return query; };
    function rows() {
      let result = tables[table] ?? [];
      result = result.filter(row => filters.every(predicate => predicate(row)));
      if (sortKey) result.sort((a, b) => (a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0) * (ascending ? 1 : -1));
      return result.slice(start, Math.min(end + 1, start + maxRows)).map(row =>
        columns.includes('*') ? row : Object.fromEntries(columns.split(',').map(key => [key, row[key]])));
    }
    const query: any = {
      select: (value = '*') => { columns = value; if (table === 'routes') routeProjections.push(value); return query; },
      eq: (key: string, value: any) => filter(row => field(row, key) === value),
      is: (key: string, value: null) => filter(row => (field(row, key) ?? null) === value),
      in: (key: string, values: any[]) => filter(row => values.includes(field(row, key))),
      gte: (key: string, value: string) => filter(row => field(row, key) >= value),
      gt: (key: string, value: string) => filter(row => field(row, key) > value),
      order: (key: string, options?: { ascending: boolean }) => { sortKey = key; ascending = options?.ascending ?? true; return query; },
      limit: (n: number) => { maxRows = Math.min(n, maxRows); return query; }, overrideTypes: () => query,
      insert: async (row: any) => { if (!failed) published.push(row); return { error: failed ? { message: 'offline' } : null }; },
      range: (a: number, b: number) => { start = a; end = b; return query; },
      then: (resolve: any, reject: any) => (readOverride ? readOverride(table) : Promise.resolve({
        data: failed ? null : rows(), count: (tables[table] ?? []).length,
        error: failed ? { message: 'offline' } : null,
      })).then(resolve, reject),
    };
    return query;
  },
};
Object.assign(globalThis, { __realDataStorage: storage, __realDataDatabase: database, __DEV__: true });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'data:text/javascript,export default globalThis.__realDataStorage', shortCircuit: true };
    if (specifier.endsWith('/lib/supabase')) return { url: 'data:text/javascript,export const supabase = globalThis.__realDataDatabase', shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { OfflineTransitService } = await import('../src/services/offlineTransitService.ts');
let offlineTransit: typeof import('../src/services/offlineTransitService.ts').offlineTransit;
const { loadActiveFleetUnits, loadRegistry } = await import('../src/services/fleetRegistryService.ts');
const { loadAdminOperations } = await import('../src/services/adminOperationsService.ts');
const { evaluateGeofence } = await import('../src/services/geofencingService.ts');
hooks.deregister();

const route = { id: 'real-route-99', name: 'Verified service', is_active: true, coordinates: [], base_fare: 0, per_km_rate: 0 };
const stop = { id: 'real-stop', route_id: route.id, name: 'Verified stop', latitude: 14.6, longitude: 121.1, sequence_order: 0, location_verified_at: '2026-11-01T00:00:00Z', location_source_url: 'https://example.test/survey' };
test.beforeEach(() => {
  // Isolate the service's memory without exposing a production reset API.
  offlineTransit = Reflect.construct(OfflineTransitService, []);
  cache.clear(); tables = {}; failed = false; cacheWriteFailed = false; cacheReadFailed = false;
  routeProjections.length=0;
  fleetSnapshot = null;
  rpcNames.length = 0;
  readOverride = null; writeOverride = null;
  serverPageSize = 1000;
});

test('empty fleet stays empty even in development; sample fleet rows are excluded', async () => {
  fleet = [];
  assert.deepEqual(await loadActiveFleetUnits(), []);
  fleet = [{ body_number: 'REAL', plate_number: 'TEST-1' }, { body_number: 'SAMPLE', plate_number: 'TEST-2', is_sample: true }];
  assert.deepEqual((await loadActiveFleetUnits()).map(row => row.body_number), ['REAL']);
  failed = true;
  await assert.rejects(loadActiveFleetUnits(), /offline/);
  await assert.rejects(loadRegistry('units', 'test-admin'), /offline/);
  failed = false;
});

test('sync keeps generic active routes and verified stops without inserting static seeds', async () => {
  tables = { routes: [route, { ...route, id: 'sample', is_sample: true }, { ...route, id: 'inactive', is_active: false }, { ...route, id: 'draft', is_published: false }], terminals: [stop, { ...stop, id: 'sample-stop', is_sample: true }, { ...stop, id: 'unverified', location_verified_at: null }, { ...stop, id: 'orphan', route_id: 'sample' }] };
  await offlineTransit.syncWithRemote();
  const result = await offlineTransit.getTransitData();
  assert.deepEqual(result.routes.map(row => row.id), ['real-route-99']);
  assert.deepEqual(result.terminals.map(row => row.id), ['real-stop']);
  assert.equal(result.routes[0].base_fare, 0);
});

test('failed reads retain real cache age; successful empty sync replaces it', async () => {
  tables = { routes: [route], terminals: [stop] };
  await offlineTransit.syncWithRemote();
  const before = await offlineTransit.getTransitData();
  failed = true;
  const unavailable = await offlineTransit.getTransitData();
  assert.equal(unavailable.status, 'cached');
  assert.equal(unavailable.syncedAt, before.syncedAt);
  assert.match(unavailable.error ?? '', /offline/);
  assert.deepEqual(unavailable.routes.map(row => row.id), ['real-route-99']);
  failed = false;
  tables = { routes: [], terminals: [] };
  await offlineTransit.syncWithRemote();
  const empty = await offlineTransit.getTransitData();
  assert.equal(empty.status, 'ready');
  assert.deepEqual(empty.routes, []);
  assert.deepEqual(empty.terminals, []);
});

test('old seeded cache cannot reappear after an unavailable read', async () => {
  cache.clear();
  cache.set('@ejeephero_routes_cache_v7', JSON.stringify([route]));
  cache.set('@ejeephero_terminals_cache_v7', JSON.stringify([stop]));
  failed = true;
  const result = await offlineTransit.getTransitData();
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.routes, []);
  assert.deepEqual(result.terminals, []);
  failed = false;
});

test('legacy disk snapshot retains verified points without granting either passenger role', async () => {
  failed = true;
  cache.set('@ejeephero_real_transit_v1', JSON.stringify({ routes: [route], terminals: [stop], syncedAt: new Date().toISOString() }));
  const result = await offlineTransit.getTransitData();
  assert.equal(result.status, 'cached');
  assert.deepEqual(result.terminals.map(s => s.id), [stop.id]);
  assert.deepEqual(passengerStopOptions(result.terminals, 'board', null), []);
  assert.deepEqual(passengerStopOptions(result.terminals, 'alight', null), []);
});

test('malformed cached rows return unavailable while preserving the source error', async () => {
  failed = true;
  for (const records of [{ routes: [null], terminals: [] }, { routes: [route], terminals: [null] }]) {
    cache.set('@ejeephero_real_transit_v1', JSON.stringify({ ...records, syncedAt: new Date(Date.now() - 60000).toISOString() }));
    const result = await offlineTransit.getTransitData();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.isFromCache, false);
    assert.equal(result.syncedAt, null);
    assert.equal(result.error, 'offline');
    assert.deepEqual(result.routes, []);
    assert.deepEqual(result.terminals, []);
  }
});

test('successful empty source reads stay empty when the cache cannot be written', async () => {
  tables = { routes: [route], terminals: [stop] };
  await offlineTransit.syncWithRemote();
  tables = { routes: [], terminals: [] };
  cacheWriteFailed = true;
  const result = await offlineTransit.getTransitData();
  assert.equal(result.status, 'ready');
  assert.equal(result.isFromCache, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.routes, []);
  assert.deepEqual(result.terminals, []);
  failed = true;
  for (const storageUnavailable of [false, true]) {
    cacheReadFailed = storageUnavailable;
    const offline = await offlineTransit.getTransitData();
    assert.equal(offline.status, 'cached');
    assert.equal(offline.isFromCache, true);
    assert.equal(offline.syncedAt, result.syncedAt);
    assert.match(offline.error ?? '', /offline/);
    assert.deepEqual(offline.routes, []);
    assert.deepEqual(offline.terminals, []);
  }
});

test('successful source changes survive cache write failures', async () => {
  tables = { routes: [route], terminals: [stop] };
  await offlineTransit.syncWithRemote();
  tables = { routes: [{ ...route, id: 'new-route' }], terminals: [] };
  cacheWriteFailed = true;
  assert.deepEqual((await offlineTransit.syncWithRemote()).routes.map(row => row.id), ['new-route']);
  const result = await offlineTransit.getTransitData();
  assert.equal(result.status, 'ready');
  assert.equal(result.isFromCache, false);
  assert.deepEqual(result.routes.map(row => row.id), ['new-route']);
});

test('an older overlapping source read cannot replace a newer successful empty snapshot', async () => {
  const pending: Record<string, (value: any) => void> = {};
  readOverride = table => new Promise(resolve => { pending[table] = resolve; });
  const older = offlineTransit.getTransitData();
  await setImmediate();
  readOverride = null;
  const newer = await offlineTransit.getTransitData();
  pending.routes({ data: [route], error: null });
  pending.terminals({ data: [stop], error: null });
  await older;
  failed = true;
  const offline = await offlineTransit.getTransitData();
  assert.deepEqual(offline.routes, []);
  assert.deepEqual(offline.terminals, []);
  assert.equal(offline.syncedAt, newer.syncedAt);
  assert.equal(offline.status, 'cached');
  assert.match(offline.error ?? '', /offline/);
  const stored = JSON.parse(cache.get('@ejeephero_real_transit_v1')!);
  assert.deepEqual(stored.routes, []);
});

test('overlapping cache persistence is serialized and the final disk snapshot is the newest success', async () => {
  const releases: Array<() => void> = [];
  let writes = 0;
  writeOverride = () => { writes++; return new Promise(resolve => releases.push(resolve)); };
  tables = { routes: [route], terminals: [stop] };
  const first = offlineTransit.getTransitData();
  await setImmediate();
  tables = {};
  const second = offlineTransit.getTransitData();
  await setImmediate();
  try {
    assert.equal(writes, 1, 'new persistence must wait for the in-flight write');
    failed = true;
    const offlineDuringWrite = await offlineTransit.getTransitData();
    assert.deepEqual(offlineDuringWrite.routes, [], 'newest success is available before disk finishes');
    assert.equal(offlineDuringWrite.status, 'cached');
    releases.shift()!();
    await setImmediate();
    assert.equal(writes, 2);
    releases.shift()!();
    const [, newest] = await Promise.all([first, second]);
    const stored = JSON.parse(cache.get('@ejeephero_real_transit_v1')!);
    assert.deepEqual(stored.routes, []);
    assert.deepEqual(stored.terminals, []);
    assert.equal(stored.syncedAt, newest.syncedAt);
    // A new service has to read the final disk envelope, not this instance's memory.
    const restarted = Reflect.construct(OfflineTransitService, []);
    assert.deepEqual((await restarted.getTransitData()).routes, []);
  } finally {
    writeOverride = null;
    releases.splice(0).forEach(release => release());
    await Promise.all([first, second]);
  }
});

test('passenger fleet uses one RPC, retains empty routes and preserves unknown measurements', async () => {
  const recorded_at = '2026-11-23T00:00:00Z';
  fleetSnapshot = {
    route_ids: [route.id, 'empty-route'], catalog_version: '9007199254740993',
    vehicles: [
      { id: 'weak', route_id: route.id, latitude: 14.6, longitude: 121, recorded_at, accuracy: null, speed: null },
      { id: 'live', route_id: route.id, latitude: 14.6, longitude: 121, recorded_at, accuracy: 7, speed: 18,
        heading: 90, passenger_count: 9, max_capacity: 10 },
    ],
  };
  const result = await offlineTransit.getPassengerFleetSnapshot();
  assert.deepEqual(rpcNames, ['get_passenger_fleet_snapshot']);
  assert.deepEqual([...result.routeIds], [route.id, 'empty-route']);
  assert.equal(result.catalogVersion, '9007199254740993');
  assert.deepEqual(result.vehicles.map(v => [v.id, v.speed, v.accuracy, v.passenger_count, v.status, v.recorded_at]),
    [['weak', null, null, null, null, recorded_at], ['live', 18, 7, 9, 'Sakto', recorded_at]]);
});

test('service polling selects only available status fields and observes changes to optional publication flags',async()=>{
  tables.routes=[{id:'legacy',is_archived:false,is_coming_soon:false}];
  assert.deepEqual([...await offlineTransit.getInServiceRouteIds()],['legacy']);
  await offlineTransit.getInServiceRouteIds();
  assert.deepEqual(routeProjections,['*','id,is_archived,is_coming_soon']);

  const newer=Reflect.construct(OfflineTransitService,[]);
  tables.routes=[{id:'current',is_published:true,status:'active',coordinates:[]}];
  assert.deepEqual([...await newer.getInServiceRouteIds()],['current']);
  tables.routes[0].is_published=false;
  assert.deepEqual([...await newer.getInServiceRouteIds()],[]);
  assert.equal(routeProjections.at(-1),'id,is_published,status');
});

test('publication rejects unusable fixes, preserves measured evidence and reports database failure', async () => {
  const fix = { latitude: 14.6, longitude: 121, timestamp: Date.now(), speed: null, heading: null, accuracy: 6 };
  published.length = 0;
  await assert.rejects(offlineTransit.publishPosition('v', { ...fix, accuracy: null }), /weak/);
  assert.equal(published.length, 0);
  await offlineTransit.publishPosition('v', fix);
  assert.equal(published[0].captured_at, new Date(fix.timestamp).toISOString());
  assert.equal(published[0].accuracy, 6);
  assert.equal(published[0].speed, null);
  failed = true;
  await assert.rejects(offlineTransit.publishPosition('v', fix), /offline/);
  assert.equal(published.length, 1);
});

test('sample operations and registry rows are excluded before counts and summaries', async () => {
  tables = Object.fromEntries(['vehicles', 'profiles', 'routes', 'speed_events', 'trip_violations', 'fleet_registry_units'].map(table => [table, [{ id: 'real' }, { id: 'sample', is_sample: true }]]));
  tables.profiles.forEach(profile => { profile.role = 'driver'; });
  const operations = await loadAdminOperations();
  for (const rows of [operations.shifts, operations.drivers, operations.routes, operations.speedEvents, operations.tripViolations]) assert.equal(rows?.length, 1);
  assert.deepEqual((await loadRegistry('units', 'test-admin')).rows.map(row => row.id), ['real']);
});

test('sync reads all pages, including generic routes after the first 500', async () => {
  serverPageSize = 200;
  tables = { routes: Array.from({ length: 501 }, (_, index) => ({ ...route, id: 'route-' + index })), terminals: [{ ...stop, route_id: 'route-500' }] };
  const result = await offlineTransit.getTransitData();
  assert.equal(result.routes.length, 501);
  assert.equal(result.terminals[0].route_id, 'route-500');
  assert.equal((await offlineTransit.getInServiceRouteIds()).size, 501);
});

test('missing loading areas do not manufacture a legal zone', () => {
  assert.equal(evaluateGeofence(14.6, 121.1, []).isInsideLegalZone, false);
  assert.equal(evaluateGeofence(14.6, 121.1, []).nearestZone, null);
  assert.equal(evaluateGeofence(14.6, 121.1, [{ ...stop, geofence_radius_meters: 50, location_verified_at: null }]).isInsideLegalZone, false);
});

test('failed live vehicle reads reject instead of reporting an empty success', async () => {
  failed = true;
  await assert.rejects(offlineTransit.getPassengerFleetSnapshot(), /offline/);
  failed = false;
  fleetSnapshot = { route_ids: [], vehicles: [] };
  await assert.rejects(offlineTransit.getPassengerFleetSnapshot(), /Could not read the passenger fleet/);
  fleetSnapshot = { route_ids: [], catalog_version: '1', vehicles: [] };
  assert.deepEqual(await offlineTransit.getPassengerFleetSnapshot(), { routeIds: new Set(), catalogVersion: '1', vehicles: [] });
});
