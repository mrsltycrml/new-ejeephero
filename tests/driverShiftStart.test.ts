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
const platform = { OS: 'android' };
let permission = 'granted', servicesEnabled = true;
const deviceCalls: string[] = [];
let inserted = 0;
const ended: any[] = [];
let rollbackError = false;
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
    : Promise.resolve({ data: [], error: null }).then(result => {
        if (row?.is_active === false) {
          ended.push(id);
          if (rollbackError) return resolve({error:{message:'Response lost'}});
        }
        return resolve(result);
      }, reject),
}; return query; } };
let readServiceIds = async (): Promise<Set<string>> => new Set(['route']);
const service = { getTransitData: async () => ({ routes: [{ id: 'route', name: 'Route' }], terminals: [], status: 'ready' }),
  getInServiceRouteIds: () => readServiceIds(),
  publishPosition: async (id: string, fix: any) => published.push(positionPayload(id, fix)) };
Object.assign(globalThis, { __shiftReact: react, __shiftDb: database, __shiftTransit: service, __shiftLocation: () => locationState,
  __shiftUser: () => ({ user: { id: driverId } }),
  __shiftPlatform: platform,
  __shiftDevice: { Accuracy: { High: 1 },
    getForegroundPermissionsAsync: async () => { deviceCalls.push('permission'); return { status: permission }; },
    hasServicesEnabledAsync: async () => { deviceCalls.push('services'); return servicesEnabled; },
    getCurrentPositionAsync: async () => { deviceCalls.push('position'); return rejectedDeviceReading; },
  } });
const fixtures: Record<string, string> = {
  react: 'const r=globalThis.__shiftReact; export default r; export const {useState,useEffect,useRef,useCallback}=r;',
  'react-native': 'export const Platform=globalThis.__shiftPlatform,ActivityIndicator="Spinner",View="View",Text="Text",TouchableOpacity="Button",ScrollView="Scroll"; export const StyleSheet={create:s=>s};',
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
const reset = () => {
  readServiceIds = async () => new Set(['route']);
  ended.length = 0;
  rollbackError = false;
  states = []; refs = []; effectSlots = []; callbackSlots = []; countWrites.length = 0; restoredShift = null; driverId = 'driver';
  platform.OS = 'android'; permission = 'granted'; servicesEnabled = true; deviceCalls.length = 0; inserted = 0; published.length = 0;
};
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

test('web shift enable and start follow the shared foreground fix even when Expo denies permission', async () => {
  reset(); platform.OS = 'web'; permission = 'denied'; servicesEnabled = false;
  const now = Date.now();
  const fix = { ...accepted, timestamp: now };
  let requests = 0;
  locationState = { fix: null, now, foreground: true, errorMsg: null, enableLocation: async () => { requests++; } };
  render(); flushEffects();
  try {
    await setImmediate();
    const initial = render();
    assert.equal(findStart(initial).props.disabled, true);
    findNode(initial, node => node?.type === 'Button' && textOf(node) === 'Enable location').props.onPress();
    await setImmediate();
    assert.equal(requests, 1);
    for (const state of [
      { fix: null }, { fix: { ...fix, accuracy: 31 } }, { fix: { ...fix, timestamp: now - 31_000 } },
      { fix: { ...fix, latitude: 91 } }, { fix: { ...fix, timestamp: now + 10_000 } },
      { foreground: false }, { errorMsg: 'GPS reading rejected' },
    ]) {
      locationState = { ...locationState, fix, foreground: true, errorMsg: null, ...state };
      const start = findStart(render());
      assert.equal(start.props.disabled, true);
      await start.props.onPress();
      assert.equal(inserted, 0);
      assert.equal(published.length, 0);
    }
    locationState = { ...locationState, fix, errorMsg: null };
    const ready = render();
    assert.match(textOf(ready), /Location enabled/);
    assert.equal(findStart(ready).props.disabled, false);
    const pending = findStart(ready).props.onPress();
    locationState = { ...locationState, foreground: false };
    render();
    await pending;
    assert.equal(inserted, 0, 'the app went into the background during the assignment check');
    assert.equal(published.length, 0);
    locationState = { ...locationState, foreground: true };
    await findStart(render()).props.onPress();
    assert.equal(inserted, 1);
    assert.deepEqual(published, [positionPayload('shift', fix)]);
    assert.deepEqual(deviceCalls, []);
  } finally { cleanupEffects(); }
});

test('restored web shift waits for accepted provider evidence and publishes without Expo', async () => {
  reset(); platform.OS = 'web'; permission = 'denied'; servicesEnabled = false;
  restore('restored', 2);
  const fix = { ...accepted, timestamp: Date.now() };
  locationState = { fix, now: fix.timestamp, foreground: true, errorMsg: 'GPS reading rejected' };
  render(); flushEffects();
  try {
    await setImmediate(); render(); flushEffects(); await setImmediate();
    assert.match(textOf(render()), /On duty/);
    assert.equal(published.length, 0);
    locationState = { ...locationState, errorMsg: null };
    render(); flushEffects(); await setImmediate();
    assert.deepEqual(published, [positionPayload('restored', fix)]);
    assert.deepEqual(deviceCalls, []);
  } finally { cleanupEffects(); }
});

test('native shift still requires Expo permission and enabled device services with a live fix', async () => {
  for (const status of ['denied', 'granted']) {
    reset(); permission = status; servicesEnabled = false;
    locationState = { fix: { ...accepted, timestamp: Date.now() }, now: Date.now(), foreground: true, errorMsg: null };
    render(); flushEffects();
    try {
      await setImmediate();
      const start = findStart(render());
      assert.equal(start.props.disabled, status === 'denied');
      await start.props.onPress();
      assert.ok(deviceCalls.includes('permission'));
      assert.equal(deviceCalls.includes('services'), status === 'granted');
      assert.equal(inserted, 0);
      assert.equal(published.length, 0);
    } finally { cleanupEffects(); }
  }
});

test('create rechecks service before insert and before the first fix, rolling back a removed route', async () => {
  for (const removedAfterInsert of [false, true]) {
    reset(); platform.OS = 'web';
    locationState = { fix:{...accepted,timestamp:Date.now()}, now:Date.now(), foreground:true, errorMsg:null };
    render(); flushEffects();
    try {
      await setImmediate();
      const button=findStart(render());
      assert.equal(button.props.disabled,false);
      let checks=0;
      readServiceIds=async () => new Set(removedAfterInsert && ++checks===1 ? ['route'] : []);
      await button.props.onPress();
      assert.equal(inserted,removedAfterInsert ? 1 : 0);
      assert.deepEqual(ended,removedAfterInsert ? ['shift'] : []);
      assert.equal(published.length,0);
    } finally { cleanupEffects(); }
  }
});

test('an excluded restored shift never publishes; End shift remains usable', async () => {
  reset(); platform.OS='web'; restore('existing-shift',3); restoredShift.route_id='route2';
  locationState={fix:{...accepted,timestamp:Date.now()},now:Date.now(),foreground:true,errorMsg:null};
  render(); flushEffects();
  try {
    await setImmediate(); render(); flushEffects(); await setImmediate(); render(); flushEffects(); await setImmediate();
    assert.equal(published.length,0);
    const tree=render();
    assert.match(textOf(tree),/out of service/);
    const end=findNode(tree,n=>n?.type==='Button' && textOf(n)==='End shift');
    assert.ok(!end.props.disabled);
    end.props.onPress();
    const sheet=findNode(render(),n=>n?.type==='Sheet' && n.props.visible);
    const confirm=findNode(sheet,n=>n?.type==='Button' && n.props.disabled===false && textOf(n)==='End shift');
    assert.ok(confirm);
    await confirm.props.onPress();
    assert.deepEqual(ended,['existing-shift']);
  } finally { cleanupEffects(); }
});

test('an unconfirmed rollback keeps End shift available without sharing the uncertain shift',async()=>{
  reset();platform.OS='web';rollbackError=true;
  locationState={fix:{...accepted,timestamp:Date.now()},now:Date.now(),foreground:true,errorMsg:null};
  render();flushEffects();
  try {
    await setImmediate();
    const start=findStart(render());
    let checks=0;
    readServiceIds=async()=>new Set(++checks===2 ? [] : ['route']);
    await start.props.onPress();
    render();flushEffects();await setImmediate();render();flushEffects();await setImmediate();
    assert.equal(published.length,0);assert.match(textOf(render()),/Use End shift to retry/);
    rollbackError=false;
    findNode(render(),n=>n?.type==='Button' && textOf(n)==='End shift').props.onPress();
    const sheet=findNode(render(),n=>n?.type==='Sheet' && n.props.visible);
    await findNode(sheet,n=>n?.type==='Button' && n.props.disabled===false && textOf(n)==='End shift').props.onPress();
    assert.deepEqual(ended,['shift','shift']);
  } finally { cleanupEffects(); }
});

test('on-duty status refresh, foreground resume and weak or stale GPS do not share an ineligible fix',async t=>{
  reset(); platform.OS='web'; restore('on-duty',3);
  const now=Date.now();
  t.mock.timers.enable({apis:['setInterval','Date'],now});
  let allowed=true, retries=0;
  readServiceIds=async()=>new Set(allowed?['route']:[]);
  locationState={fix:{...accepted,timestamp:now},now,foreground:true,errorMsg:null,enableLocation:async()=>{retries++;}};
  async function settle() { for(let i=0;i<3;i++){render();flushEffects();await setImmediate();} }
  try {
    await settle();
    assert.equal(published.length,1);
    allowed=false;
    t.mock.timers.tick(15000);await setImmediate();await settle();
    assert.match(textOf(render()),/out of service/);
    locationState={...locationState,fix:{...accepted,timestamp:Date.now()},now:Date.now()};await settle();
    assert.equal(published.length,1);
    allowed=true;t.mock.timers.tick(15000);await setImmediate();await settle();
    assert.equal(published.length,2);
    locationState={...locationState,foreground:false};await settle();
    allowed=false;locationState={...locationState,foreground:true,fix:{...accepted,timestamp:Date.now()},now:Date.now()};await settle();
    assert.equal(published.length,2);assert.match(textOf(render()),/out of service/);
    for (const fix of [{...accepted,accuracy:80,timestamp:Date.now()},{...accepted,timestamp:Date.now()-31000}]) {
      locationState={...locationState,fix};await settle();
      const retry=findNode(render(),n=>n?.type==='Button' && textOf(n)==='Enable location / retry');
      await retry.props.onPress();
    }
    assert.equal(retries,2);
  } finally { cleanupEffects();t.mock.timers.reset(); }
});
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
