import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { quotePassengerFare, verifiedRideDistance } from '../src/services/passengerFare.ts';

let failTable = '', malformed = false;
const source = { source_url: 'https://example.test/operator', verified_at: '2024-01-01T00:00:00Z' };
const matrix = { ...source, route_id: 'r', currency: 'PHP', effective_from: '2024-01-01', effective_to: null,
  brackets: [{ up_to_km: 4, regular: 15, discounted: 12 }] };
const rows: Record<string, object[]> = {
  passenger_route_segments: Array.from({ length: 1001 }, (_, i) => ({
    ...source, route_id: 'r', from_stop_id: String(i), to_stop_id: String(i + 1), distance_meters: 100,
  })),
  passenger_fare_matrices: [{ ...matrix, is_sample: true }, matrix],
  passenger_walk_links: [],
};
const database = { from(table: string) {
  let from = 0, to = 999;
  const q: any = { select: () => q, order: () => q, range: (a: number, b: number) => { from = a; to = b; return q; },
    then: (resolve: any) => { const data = rows[table].slice(from, to + 1);
      return Promise.resolve({ data: malformed ? null : data, error: table === failTable ? { message: 'unavailable' } : null }).then(resolve); } };
  return q;
} };
Object.assign(globalThis, { __planningDb: database });
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('/lib/supabase')) return { url: 'data:text/javascript,export const supabase=globalThis.__planningDb;', shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { loadPassengerFareData, loadPassengerFareMatrices, loadPassengerRideSegments, loadPassengerWalkLinks } = await import('../src/services/passengerDataService.ts');
hook.deregister();

test('a walking outage preserves the sourced fare, discount and paginated ride distance', async (t) => {
  failTable = 'passenger_walk_links';
  t.after(() => { failTable = ''; });
  const [{ segments, matrices }] = await Promise.all([loadPassengerFareData(), assert.rejects(loadPassengerWalkLinks())]);
  assert.deepEqual(matrices, [matrix]);
  assert.equal(segments.length, 1001);
  const stops = [998,999,1000,1001].map(i => ({ id: String(i), name: String(i), route_id: 'r', sequence_order: i, latitude: 14.5, longitude: 121,
    location_verified_at: source.verified_at, location_source_url: source.source_url, passenger_use: 'both' as const,
    passenger_use_source_url: source.source_url, passenger_use_verified_at: source.verified_at }));
  const distance = verifiedRideDistance('998', '1001', 'r', segments, stops);
  assert.equal(distance, 0.3);
  const fare = quotePassengerFare(distance!, 'student', { id: 'r' }, matrices[0], '2026-01-01');
  assert.equal(fare?.amount, 12);
  assert.equal(fare?.discount, 3);
});

test('a segment outage leaves entered-distance fares available and an empty walking catalog distinct from failure', async (t) => {
  failTable = 'passenger_route_segments';
  t.after(() => { failTable = ''; });
  await assert.rejects(loadPassengerRideSegments());
  const [fare] = await loadPassengerFareMatrices();
  assert.equal(quotePassengerFare(2, 'regular', { id: 'r' }, fare, '2026-01-01')?.amount, 15);
  assert.deepEqual(await loadPassengerWalkLinks(), []);
});

test('malformed responses cannot masquerade as empty planning evidence', async (t) => {
  malformed = true;
  t.after(() => { malformed = false; });
  await assert.rejects(loadPassengerFareMatrices());
  await assert.rejects(loadPassengerRideSegments());
  await assert.rejects(loadPassengerWalkLinks());
});
