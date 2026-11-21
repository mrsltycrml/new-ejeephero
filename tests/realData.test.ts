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
let writeOverride: (() => Promise<void>) | null = null;
let fleet: any[] = [];
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
  rpc: async () => ({ data: failed ? null : fleet, error: failed ? { message: 'offline' } : null }),
  from(table: string) {
    let start = 0, end = Infinity, columns = '*';
    const query: any = {
      select: (value = '*') => { columns = value; if (table === 'routes') routeProjections.push(value); return query; },
      eq: () => query, in: () => query, gte: () => query, order: () => query, limit: () => query, overrideTypes: () => query,
      insert: async (row: any) => { if (!failed) published.push(row); return { error: failed ? { message: 'offline' } : null }; },
      range: (a: number, b: number) => { start = a; end = b; return query; },
      then: (resolve: any, reject: any) => (readOverride ? readOverride(table) : Promise.resolve({
        data: failed ? null : (tables[table] ?? []).slice(start, end + 1).map(row =>
          columns === '*' ? row : Object.fromEntries(columns.split(',').map(key => [key, row[key]]))),
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
  readOverride = null; writeOverride = null;
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

test('live fleet excludes sample database vehicles and preserves missing telemetry as unknown', async () => {
  tables = { routes:[route], vehicles: [{ id: 'real', route_id:route.id, is_active: true, body_number: 'REAL', plate_number: 'TEST-1' }, { id: 'sample', route_id:route.id, is_sample: true, is_active: true }], vehicle_positions: ['real', 'sample'].map(vehicle_id => ({ vehicle_id, latitude: 14.6, longitude: 121.1, speed: null, heading: null, timestamp: new Date().toISOString(), captured_at: new Date().toISOString() })) };
  const result = await offlineTransit.getVehicles();
  assert.deepEqual(result.map(row => row.vehicle_id), ['real']);
  assert.equal(result[0].speed, null);
  assert.equal(result[0].passenger_count, null);
  assert.equal(result[0].status, null);
  assert.equal(result[0].accuracy, null);
  assert.equal(result[0].recorded_at, tables.vehicle_positions[0].captured_at);
});

test('vehicle loader retains capture accuracy and km/h but drops stale and legacy positions', async () => {
  const captured_at = new Date(Date.now() - 5000).toISOString();
  tables = { routes:[route], vehicles: [{ id: 'v', route_id:route.id, is_active: true }], vehicle_positions: [{ vehicle_id: 'v', latitude: 14.6, longitude: 121, speed: 18, heading: 90, accuracy: 7, timestamp: new Date().toISOString(), captured_at }] };
  const [vehicle] = await offlineTransit.getVehicles();
  assert.equal(vehicle.speed, 18);
  assert.equal(vehicle.accuracy, 7);
  assert.equal(vehicle.recorded_at, captured_at);
  tables.vehicle_positions[0].captured_at = new Date(Date.now() - 60000).toISOString();
  assert.deepEqual(await offlineTransit.getVehicles(), []);
  delete tables.vehicle_positions[0].captured_at;
  assert.deepEqual(await offlineTransit.getVehicles(), []);
});

test('the live fleet omits upcoming, archived and missing routes even with fresh vehicle positions',async()=>{
  const stamp=new Date().toISOString();
  const ids=['regular','upcoming','archived','missing'];
  tables={
    routes:ids.slice(0,3).map(id=>({...route,id,is_coming_soon:id==='upcoming',is_archived:id==='archived'})),
    vehicles:ids.map(id=>({id,route_id:id,is_active:true})),
    vehicle_positions:ids.map(vehicle_id=>({vehicle_id,latitude:14.6,longitude:121,accuracy:8,timestamp:stamp,captured_at:stamp})),
  };
  assert.deepEqual((await offlineTransit.getVehicles()).map(v=>v.id),['regular']);
  tables.routes[0].is_coming_soon=true;
  assert.deepEqual(await offlineTransit.getVehicles(),[]);
  assert.deepEqual(routeProjections,['*','id,is_archived,is_coming_soon,is_active']);
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
  const operations = await loadAdminOperations();
  for (const rows of [operations.shifts, operations.drivers, operations.routes, operations.speedEvents, operations.tripViolations]) assert.equal(rows?.length, 1);
  assert.deepEqual((await loadRegistry('units', 'test-admin')).rows.map(row => row.id), ['real']);
});

test('sync reads all pages, including generic routes after the first 500', async () => {
  tables = { routes: Array.from({ length: 501 }, (_, index) => ({ ...route, id: 'route-' + index })), terminals: [{ ...stop, route_id: 'route-500' }] };
  const result = await offlineTransit.getTransitData();
  assert.equal(result.routes.length, 501);
  assert.equal(result.terminals[0].route_id, 'route-500');
});

test('missing loading areas do not manufacture a legal zone', () => {
  assert.equal(evaluateGeofence(14.6, 121.1, []).isInsideLegalZone, false);
  assert.equal(evaluateGeofence(14.6, 121.1, []).nearestZone, null);
  assert.equal(evaluateGeofence(14.6, 121.1, [{ ...stop, geofence_radius_meters: 50, location_verified_at: null }]).isInsideLegalZone, false);
});

test('failed live vehicle reads reject instead of reporting an empty success', async () => {
  failed = true;
  await assert.rejects(offlineTransit.getVehicles(), /offline/);
});
