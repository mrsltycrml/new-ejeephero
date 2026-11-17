import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { acceptFix, positionPayload } from '../src/services/locationQuality.ts';

// Render the real screen handler; replace only hooks, UI, device and I/O boundaries.
let states: any[] = [], refs: any[] = [], index = 0, refIndex = 0, effects: Array<() => any> = [];
const react = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  useState(initial: any) { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
  useRef(initial: any) { const slot = refIndex++; return refs[slot] ??= { current: initial }; },
  useCallback: (fn: any) => fn,
  useEffect: (fn: any) => effects.push(fn),
};
const accepted = { latitude: 14.6, longitude: 121, accuracy: 5, speed: 0, heading: null, timestamp: Date.now() - 1000 };
const rejectedDeviceReading = { timestamp: accepted.timestamp + 1000, coords: { ...accepted, latitude: 15 } };
let locationState: any;
let inserted = 0;
const published: any[] = [];
const database = { from() { const query: any = {
  select: () => query, eq: () => query, order: () => query, limit: () => query,
  maybeSingle: async () => ({ data: null, error: null }),
  insert: () => { inserted++; return query; },
  single: async () => ({ data: { id: 'shift', created_at: new Date().toISOString(), max_capacity: 22 }, error: null }),
  then: (resolve: any) => resolve({ data: [], error: null }),
}; return query; } };
const service = { getTransitData: async () => ({ routes: [{ id: 'route', name: 'Route' }], terminals: [], status: 'ready' }),
  publishPosition: async (id: string, fix: any) => published.push(positionPayload(id, fix)) };
Object.assign(globalThis, { __shiftReact: react, __shiftDb: database, __shiftTransit: service, __shiftLocation: () => locationState,
  __shiftDevice: { Accuracy: { High: 1 }, getForegroundPermissionsAsync: async () => ({ status: 'granted' }), hasServicesEnabledAsync: async () => true, getCurrentPositionAsync: async () => rejectedDeviceReading } });
const fixtures: Record<string, string> = {
  react: 'const r=globalThis.__shiftReact; export default r; export const {useState,useEffect,useRef,useCallback}=r;',
  'react-native': 'export const ActivityIndicator="Spinner",View="View",Text="Text",TouchableOpacity="Button",ScrollView="Scroll"; export const StyleSheet={create:s=>s};',
  'expo-location': 'export const {Accuracy,getForegroundPermissionsAsync,hasServicesEnabledAsync,getCurrentPositionAsync}=globalThis.__shiftDevice;',
  '@expo/vector-icons': 'export const Ionicons="Icon";',
  '/lib/supabase': 'export const supabase=globalThis.__shiftDb;',
  '/contexts/AuthContext': 'export const useAuth=()=>({user:{id:"driver"}});',
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
const render = () => { index = 0; refIndex = 0; effects = []; return DashboardScreen(); };
const textOf = (node: any): string => typeof node === 'string' ? node : (node?.props?.children || []).flat(Infinity).map(textOf).join('');
const findStart = (node: any): any => node?.type === 'Button' && textOf(node) === 'Start shift' ? node : (node?.props?.children || []).flat(Infinity).map(findStart).find(Boolean);

test('actual shift startup publishes the shared accepted fix, never an independently returned jump', async () => {
  assert.equal(acceptFix(accepted, { ...accepted, latitude: 15, timestamp: accepted.timestamp + 1000 }, accepted.timestamp + 1000), false);
  for (const sample of [accepted, null, { ...accepted, timestamp: Date.now() - 60000 }, { ...accepted, accuracy: null }]) {
    states = []; refs = []; inserted = 0; published.length = 0;
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
