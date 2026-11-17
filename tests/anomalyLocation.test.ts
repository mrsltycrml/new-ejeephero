import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let reading: any, listener: any;
const events: any[] = [];
const sensor = { isAvailableAsync: async () => true, setUpdateInterval() {}, addListener(fn: any) { listener = fn; return { remove() { listener = null; } }; } };
const database = { from(table: string) {
  const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: reading }),
    insert: async (value: any) => { assert.equal(table, 'anomalies'); events.push(value); return { error: null }; } };
  return query;
} };
Object.assign(globalThis, { __anomalySensor: sensor, __anomalyDatabase: database });
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'react-native') return { url: 'data:text/javascript,export const Platform={OS:"ios"}', shortCircuit: true };
  if (specifier === 'expo-sensors') return { url: 'data:text/javascript,export const Accelerometer=globalThis.__anomalySensor', shortCircuit: true };
  if (specifier.endsWith('/lib/supabase')) return { url: 'data:text/javascript,export const supabase=globalThis.__anomalyDatabase', shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
  return next(specifier, context);
} });
const { startAnomalyDetection, stopAnomalyDetection } = await import('../src/services/anomalyDetector.ts');
hooks.deregister();

test('crash events survive missing GPS while stale, unknown-accuracy and legacy coordinates are withheld', async () => {
  const clock = Date.now;
  let now = clock();
  Date.now = () => now;
  try {
    await startAnomalyDetection('v');
    for (const kind of ['fresh', 'stale', 'legacy', 'weak', 'missing']) {
      now += 16000;
      reading = kind === 'missing' ? null : { latitude: 14.6, longitude: 121, timestamp: new Date(now).toISOString(), captured_at: kind === 'legacy' ? null : new Date(now - (kind === 'stale' ? 60000 : 0)).toISOString(), accuracy: kind === 'weak' ? null : 5 };
      await listener({ x: 3, y: 0, z: 0 });
      const event = events.at(-1);
      assert.equal(event.vehicle_id, 'v');
      assert.match(event.type, /Potential Crash/);
      assert.equal(event.latitude, kind === 'fresh' ? 14.6 : null);
      assert.equal(event.longitude, kind === 'fresh' ? 121 : null);
    }
    assert.equal(events.length, 5);
  } finally { Date.now = clock; stopAnomalyDetection(); }
});
