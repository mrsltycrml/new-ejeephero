import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { acceptFix, positionPayload } from '../src/services/locationQuality.ts';

// Render the real screen handler; replace only hooks, UI, device and I/O boundaries.
let states: any[] = [], refs: any[] = [], index = 0, refIndex = 0, effects: Array<() => any> = [];
let effectSlots: any[] = [], callbackSlots: any[] = [], effectIndex = 0, callbackIndex = 0;
const sameDeps = (a: any[] | undefined, b: any[]) => a?.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const react = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  useState(initial: any) { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
  useRef(initial: any) { const slot = refIndex++; return refs[slot] ??= { current: initial }; },
  useCallback(fn: any, deps: any[]) { const slot = callbackIndex++; if (!sameDeps(callbackSlots[slot]?.deps, deps)) callbackSlots[slot] = { fn, deps }; return callbackSlots[slot].fn; },
  useEffect(fn: any, deps: any[]) {
    const slot = effectIndex++;
    if (!sameDeps(effectSlots[slot]?.deps, deps)) effects.push(() => {
      effectSlots[slot]?.cleanup?.();
      const cleanup = fn(); effectSlots[slot] = { deps, cleanup }; return cleanup;
    });
  },
};
const accepted = { latitude: 14.6, longitude: 121, accuracy: 5, speed: 0, heading: null, timestamp: Date.now() - 1000 };
const rejectedDeviceReading = { timestamp: accepted.timestamp + 1000, coords: { ...accepted, latitude: 15 } };
let locationState: any;
let inserted = 0;
const published: any[] = [];
let restoredShift: any = null, driverId = 'driver';
const countWrites: Array<{ id: string; count: number; resolve: (value: any) => void; reject: (error: Error) => void }> = [];
const database = { from() { let row: any, id: string; const query: any = {
  select: () => query, eq: (key: string, value: string) => { if (key === 'id') id = value; return query; }, order: () => query, limit: () => query,
  maybeSingle: async () => ({ data: restoredShift, error: null }),
  update: (value: any) => { row = value; return query; },
  insert: () => { inserted++; return query; },
  single: async () => ({ data: { id: 'shift', created_at: new Date().toISOString(), max_capacity: 22 }, error: null }),
  then: (resolve: any, reject: any) => row && row.is_active === undefined
    ? new Promise((done, fail) => countWrites.push({ id, count: row.passenger_count, resolve: done, reject: fail })).then(resolve, reject)
    : Promise.resolve({ data: [], error: null }).then(resolve, reject),
}; return query; } };
const service = { getTransitData: async () => ({ routes: [{ id: 'route', name: 'Route' }], terminals: [], status: 'ready' }),
  publishPosition: async (id: string, fix: any) => published.push(positionPayload(id, fix)) };
Object.assign(globalThis, { __shiftReact: react, __shiftDb: database, __shiftTransit: service, __shiftLocation: () => locationState,
  __shiftUser: () => ({ user: { id: driverId } }),
  __shiftDevice: { Accuracy: { High: 1 }, getForegroundPermissionsAsync: async () => ({ status: 'granted' }), hasServicesEnabledAsync: async () => true, getCurrentPositionAsync: async () => rejectedDeviceReading } });
const fixtures: Record<string, string> = {
  react: 'const r=globalThis.__shiftReact; export default r; export const {useState,useEffect,useRef,useCallback}=r;',
  'react-native': 'export const ActivityIndicator="Spinner",View="View",Text="Text",TouchableOpacity="Button",ScrollView="Scroll"; export const StyleSheet={create:s=>s};',
  'expo-location': 'export const {Accuracy,getForegroundPermissionsAsync,hasServicesEnabledAsync,getCurrentPositionAsync}=globalThis.__shiftDevice;',
  '@expo/vector-icons': 'export const Ionicons="Icon";',
  '/lib/supabase': 'export const supabase=globalThis.__shiftDb;',
  '/contexts/AuthContext': 'export const useAuth=globalThis.__shiftUser;',
  '/contexts/NetworkContext': 'export const useNetwork=()=>({isConnected:true});',
  '/contexts/LocationContext': 'export const useLocation=globalThis.__shiftLocation;',
  '/services/offlineTransitService': 'export const offlineTransit=globalThis.__shiftTransit;',
  '/services/fleetRegistryService': 'export const loadActiveFleetUnits=async()=>[{body_number:"Unit",plate_number:"TEST"}];',
  '/services/anomalyDetector': 'export const startAnomalyDetection=()=>{},stopAnomalyDetection=()=>{};',
  '/components/LeafletMap': 'export default "Map";',
  '/components/AppUI': 'export const BottomSheetModal="Sheet",triggerHaptic=()=>{};',
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const key = Object.keys(fixtures).find(key => specifier === key || specifier.endsWith(key));
    if (key) return { url: 'data:text/javascript,' + encodeURIComponent(fixtures[key]), shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/driver/DashboardScreen.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { default: DashboardScreen } = await import('../src/screens/driver/DashboardScreen.tsx');
hooks.deregister();
const render = () => { index = 0; refIndex = 0; effectIndex = 0; callbackIndex = 0; effects = []; return DashboardScreen(); };
const flushEffects = () => effects.splice(0).forEach(effect => effect());
const cleanupEffects = () => effectSlots.forEach(effect => effect.cleanup?.());
const reset = () => { states = []; refs = []; effectSlots = []; callbackSlots = []; countWrites.length = 0; restoredShift = null; driverId = 'driver'; };
const textOf = (node: any): string => typeof node === 'string' ? node : (node?.props?.children || []).flat(Infinity).map(textOf).join('');
const findStart = (node: any): any => node?.type === 'Button' && textOf(node) === 'Start shift' ? node : (node?.props?.children || []).flat(Infinity).map(findStart).find(Boolean);

test('actual shift startup publishes the shared accepted fix, never an independently returned jump', async () => {
  assert.equal(acceptFix(accepted, { ...accepted, latitude: 15, timestamp: accepted.timestamp + 1000 }, accepted.timestamp + 1000), false);
  for (const sample of [accepted, null, { ...accepted, timestamp: Date.now() - 60000 }, { ...accepted, accuracy: null }]) {
    reset(); inserted = 0; published.length = 0;
    locationState = { fix: sample, now: Date.now(), foreground: true, errorMsg: null, enableLocation: async () => {} };
    render(); const cleanup = effects.map(effect => effect());
    try {
      await setImmediate();
      const button = findStart(render());
      assert.equal(button.props.disabled, false);
      await button.props.onPress();
      assert.equal(inserted, sample === accepted ? 1 : 0);
      assert.equal(published.length, sample === accepted ? 1 : 0);
      if (sample === accepted) {
        assert.equal(published[0].latitude, 14.6);
        assert.equal(published[0].captured_at, new Date(accepted.timestamp).toISOString());
        assert.equal(published[0].speed, 0);
      }
    } finally { cleanup.forEach(fn => { if (typeof fn === 'function') fn(); }); }
  }
});

const findNode = (node: any, match: (node: any) => boolean): any => match(node) ? node : (node?.props?.children || []).flat(Infinity).map((child: any) => findNode(child, match)).find(Boolean);
const countButton = (tree: any, direction = 'Increase') => findNode(tree, node => node?.props?.accessibilityLabel === `${direction} passenger count`);
const countValue = (tree: any) => findNode(tree, node => node?.type === 'View' && node.props.children.some((child: any) => child?.props?.accessibilityLabel === 'Increase passenger count')).props.children[1].props.children[0];
const restore = (id: string, count: number) => { restoredShift = { id, passenger_count: count, max_capacity: 22, route_id: 'route', body_number: 'Unit', plate_number: 'TEST' }; };
async function mountCount() {
  reset(); restore('shift-a', 3);
  locationState = { fix: null, now: Date.now(), foreground: true, errorMsg: null, enableLocation: async () => {} };
  render(); flushEffects(); await setImmediate(); render(); flushEffects(); await setImmediate();
  return render();
}

test('actual passenger count handler blocks same-frame taps and disables controls until persistence', async () => {
  let tree = await mountCount();
  const pending: Promise<any>[] = [];
  try {
    const plus = countButton(tree);
    pending.push(plus.props.onPress(), plus.props.onPress());
    await setImmediate();
    assert.deepEqual(countWrites.map(write => write.count), [4]);
    tree = render();
    assert.equal(countValue(tree), 3, 'only persisted counts are displayed');
    for (const direction of ['Increase', 'Decrease']) {
      assert.equal(countButton(tree, direction).props.disabled, true);
      assert.equal(countButton(tree, direction).props.accessibilityState.disabled, true);
    }
    countWrites.shift()!.resolve({ error: null });
    await Promise.all(pending);
    tree = render();
    assert.equal(countValue(tree), 4);
    assert.equal(countButton(tree).props.disabled, false);
    pending.push(countButton(tree).props.onPress());
    await setImmediate();
    assert.equal(countWrites[0].count, 5);
    countWrites.shift()!.resolve({ error: null });
    await Promise.all(pending);
    assert.equal(countValue(render()), 5);
  } finally { countWrites.splice(0).forEach(write => write.resolve({ error: null })); await Promise.allSettled(pending); cleanupEffects(); }
});

test('actual passenger count handler retains count and unlocks retry on returned or thrown errors', async () => {
  for (const reject of [false, true]) {
    const tree = await mountCount();
    try {
      const pending = countButton(tree).props.onPress();
      await setImmediate();
      const write = countWrites.shift()!;
      if (reject) write.reject(new Error('offline')); else write.resolve({ error: { message: 'offline' } });
      await pending;
      const failed = render();
      assert.equal(countValue(failed), 3);
      assert.match(textOf(failed), /Passenger count could not be saved/);
      assert.equal(countButton(failed).props.disabled, false);
      const retry = countButton(failed).props.onPress();
      await setImmediate();
      countWrites.shift()!.resolve({ error: null });
      await retry;
      assert.equal(countValue(render()), 4);
      assert.doesNotMatch(textOf(render()), /Passenger count could not be saved/);
    } finally { cleanupEffects(); }
  }
});

test('passenger count responses from an old shift cannot change the newly restored vehicle', async () => {
  for (const error of [null, { message: 'offline' }]) {
    const tree = await mountCount();
    try {
      const pending = countButton(tree).props.onPress();
      await setImmediate();
      assert.equal(countWrites[0].id, 'shift-a');
      driverId = 'other-driver'; restore('shift-b', 8);
      render(); flushEffects(); await setImmediate(); render(); flushEffects();
      assert.equal(countValue(render()), 8);
      countWrites.shift()!.resolve({ error });
      await pending;
      assert.equal(countValue(render()), 8);
      assert.doesNotMatch(textOf(render()), /Passenger count could not be saved/);
      assert.equal(countButton(render()).props.disabled, false);
    } finally { countWrites.splice(0).forEach(write => write.resolve({ error: null })); cleanupEffects(); }
  }
});
