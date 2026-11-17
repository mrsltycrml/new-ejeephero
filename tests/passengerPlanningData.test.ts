import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let catalogReads = 0, failTable = '', malformed = false;
const catalog = { routes: [{ id: 'shared' }], terminals: [], status: 'ready', syncedAt: '2026-11-18', isFromCache: false };
const reads: { table: string; from: number; to: number }[] = [];
const database = { from(table: string) {
  let from = 0, to = 999;
  const q: any = { select: () => q, order: () => q, range: (a: number, b: number) => { from = a; to = b; return q; },
    then: (resolve: any) => { reads.push({ table, from, to }); const data = table === 'passenger_route_segments' ? Array.from({ length: 1001 }, (_, i) => ({ id: String(i) })).slice(from, to + 1) : [];
      return Promise.resolve({ data: malformed ? null : data, error: table === failTable ? { message: 'unavailable' } : null }).then(resolve); } };
  return q;
} };
Object.assign(globalThis, { __planningDb: database, __planningCatalog: () => { catalogReads++; return catalog; } });
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('/lib/supabase')) return { url: 'data:text/javascript,export const supabase=globalThis.__planningDb;', shortCircuit: true };
  if (specifier === './offlineTransitService') return { url: 'data:text/javascript,export const offlineTransit={getTransitData:async()=>globalThis.__planningCatalog()};', shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { loadPassengerPlanningData } = await import('../src/services/passengerDataService.ts');
hook.deregister();

test('planning uses the shared catalog and reads all source pages', async () => {
  reads.length = 0;
  const result = await loadPassengerPlanningData(catalog as any);
  assert.equal(result.routes, catalog.routes);
  assert.equal(catalogReads, 0);
  assert.equal(result.segments.length, 1001);
});
test('source errors or malformed responses cannot masquerade as empty planning evidence', async () => {
  failTable = 'passenger_walk_links';
  await assert.rejects(loadPassengerPlanningData(catalog as any));
  failTable = ''; malformed = true;
  try { await assert.rejects(loadPassengerPlanningData(catalog as any)); } finally { malformed = false; }
});
