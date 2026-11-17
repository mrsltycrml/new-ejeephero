import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Replace only storage/network boundaries; exercise the production services.
const cache = new Map<string, string>();
let tables: Record<string, any[]> = {};
let failed = false;
let fleet: any[] = [];
const storage = { getItem: async (key: string) => cache.get(key) ?? null, setItem: async (key: string, value: string) => { cache.set(key, value); } };
const database = {
  rpc: async () => ({ data: failed ? null : fleet, error: failed ? { message: 'offline' } : null }),
  from(table: string) {
    let start = 0, end = Infinity;
    const query: any = {
      select: () => query, eq: () => query, in: () => query, gte: () => query, order: () => query, limit: () => query,
      range: (a: number, b: number) => { start = a; end = b; return query; },
      then: (resolve: any, reject: any) => Promise.resolve({ data: failed ? null : (tables[table] ?? []).slice(start, end + 1), error: failed ? { message: 'offline' } : null }).then(resolve, reject),
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
const { offlineTransit } = await import('../src/services/offlineTransitService.ts');
const { loadActiveFleetUnits, loadRegistry } = await import('../src/services/fleetRegistryService.ts');
const { loadAdminOperations } = await import('../src/services/adminOperationsService.ts');
const { evaluateGeofence } = await import('../src/services/geofencingService.ts');
hooks.deregister();

const route = { id: 'real-route-99', name: 'Verified service', is_active: true, coordinates: [], base_fare: 0, per_km_rate: 0 };
const stop = { id: 'real-stop', route_id: route.id, name: 'Verified stop', latitude: 14.6, longitude: 121.1, sequence_order: 0, location_verified_at: '2026-11-01T00:00:00Z', location_source_url: 'https://example.test/survey' };
test.beforeEach(() => { failed = false; });

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

test('live fleet excludes sample database vehicles and preserves missing telemetry as unknown', async () => {
  tables = { vehicles: [{ id: 'real', is_active: true, body_number: 'REAL', plate_number: 'TEST-1' }, { id: 'sample', is_sample: true, is_active: true }], vehicle_positions: ['real', 'sample'].map(vehicle_id => ({ vehicle_id, latitude: 14.6, longitude: 121.1, speed: null, heading: null, timestamp: new Date().toISOString() })) };
  const result = await offlineTransit.getVehicles();
  assert.deepEqual(result.map(row => row.vehicle_id), ['real']);
  assert.equal(result[0].speed, null);
  assert.equal(result[0].passenger_count, null);
  assert.equal(result[0].status, null);
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
