import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

// Drive the real source refresh and map props, replacing only hooks/UI and I/O.
const states: any[] = [];
let index = 0, effects: Array<() => any> = [];
const react = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  useState(initial: any) { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
  useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), useEffect: (fn: any) => effects.push(fn),
};
const route = { params: { trackUnitKey: 'TEST', trackRequestId: 1 } };
const unit = { id: 'v', driver_id: 'driver', body_number: 'Unit', plate_number: 'TEST', route_id: 'route', is_active: true, created_at: new Date().toISOString() };
const measured = { vehicle_id: 'v', latitude: 14.6, longitude: 121, accuracy: 5, speed: 0, heading: null, timestamp: new Date().toISOString(), captured_at: new Date().toISOString() };
let positions: any[] = [measured];
const channel = { on() { return this; }, subscribe() { return this; } };
const database = { channel: () => channel, removeChannel() {}, from(table: string) {
  const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query, gte: () => query, lt: () => query, range: () => query, in: () => query,
    then: (resolve: any) => resolve({ data: table === 'vehicles' ? [unit] : table === 'vehicle_positions' ? positions : [], error: null }) };
  return query;
} };
Object.assign(globalThis, { __monitorReact: react, __monitorDb: database, __monitorRoute: route });
const fixtures: Record<string, string> = {
  react: 'const r=globalThis.__monitorReact; export default r; export const {useState,useEffect,useMemo,useCallback}=r;',
  'react-native': 'export const View="View",Text="Text",TextInput="Input",TouchableOpacity="Button",ScrollView="Scroll",RefreshControl="Refresh",Alert={alert(){}}; export const StyleSheet={create:s=>s};',
  '@expo/vector-icons': 'export const Ionicons="Icon";',
  '@react-navigation/native': 'export const useRoute=()=>globalThis.__monitorRoute;',
  '/lib/supabase': 'export const supabase=globalThis.__monitorDb;',
  '/services/offlineTransitService': 'export const offlineTransit={getTransitData:async()=>({routes:[],terminals:[],status:"ready"})};',
  '/components/LeafletMap': 'export default "Map";',
  '/components/SupervisorRouteManager': 'export default "RouteManager";',
  '/components/AppUI': 'export const BottomSheetModal="Sheet",ScreenSkeleton="Skeleton",triggerHaptic=()=>{};',
  '/passenger/DirectoryScreen': 'export default "Directory";',
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const key = Object.keys(fixtures).find(key => specifier === key || specifier.endsWith(key));
    if (key) return { url: 'data:text/javascript,' + encodeURIComponent(fixtures[key]), shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/SupervisorDashboardScreen.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { default: SupervisorDashboardScreen } = await import('../src/screens/admin/SupervisorDashboardScreen.tsx');
hooks.deregister();
const render = () => { index = 0; effects = []; return SupervisorDashboardScreen(); };
const find = (node: any, type: string, label?: string): any => node?.type === type && (!label || node.props.accessibilityLabel === label)
  ? node : (node?.props?.children || []).flat(Infinity).map((child: any) => find(child, type, label)).find(Boolean);
const identity = (props: any) => props.vehicleSelectionKey === undefined ? props.selectedVehicle?.id ?? null : props.vehicleSelectionKey;
const textOf = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(textOf).join('');
const liveKpi = (node: any): any => {
  const children = node?.props?.children || [];
  return textOf(children[0]) === 'Live units' ? children[1].props.children[0] : children.flat(Infinity).map(liveKpi).find(value => value !== undefined);
};

test('supervisor retains explicit unit identity through source telemetry dropout and recovery', async () => {
  render(); const cleanup = effects.map(effect => effect());
  try {
    await setImmediate();
    let tree = render();
    const initial = find(tree, 'Map').props;
    assert.equal(initial.selectedVehicle.id, 'v');
    assert.notEqual(identity(initial), null);
    positions = [];
    await find(tree, 'Scroll').props.refreshControl.props.onRefresh();
    tree = render();
    const missing = find(tree, 'Map').props;
    assert.equal(missing.selectedVehicle, null);
    assert.equal(missing.vehicles.length, 0);
    assert.equal(identity(missing), identity(initial), 'source dropout is not deselection');
    assert.equal(missing.vehicleFocusRequestId, initial.vehicleFocusRequestId);
    positions = [{ ...measured, latitude: 14.61 }];
    await find(tree, 'Scroll').props.refreshControl.props.onRefresh();
    tree = render();
    const recovered = find(tree, 'Map').props;
    assert.equal(recovered.selectedVehicle.latitude, 14.61);
    assert.equal(identity(recovered), identity(initial));
    assert.equal(recovered.vehicleFocusRequestId, initial.vehicleFocusRequestId);
  } finally { cleanup.forEach(fn => { if (typeof fn === 'function') fn(); }); }
});

test('actual supervisor Live units KPI excludes weak and unknown accuracy', async () => {
  states.length = 0;
  positions = [{ ...measured, timestamp: new Date().toISOString(), captured_at: new Date().toISOString(), accuracy: null }];
  render(); const cleanup = effects.map(effect => effect());
  try {
    await setImmediate();
    let tree = render();
    assert.equal(find(tree, 'Map').props.vehicles.length, 1, 'weak evidence may still have a map marker');
    assert.equal(liveKpi(tree), 0);
    positions[0].accuracy = 60;
    await find(tree, 'Scroll').props.refreshControl.props.onRefresh();
    assert.equal(liveKpi(render()), 0);
    positions[0].accuracy = 5;
    await find(render(), 'Scroll').props.refreshControl.props.onRefresh();
    assert.equal(liveKpi(render()), 1);
  } finally { cleanup.forEach(fn => { if (typeof fn === 'function') fn(); }); }
});

test('Fleet opens Route 1 review in one tap and returns to the monitor', async () => {
  states.length = 0;
  render(); const cleanup = effects.map(effect => effect());
  try {
    await setImmediate();
    find(render(),'Button','Review Route 1 map and stops').props.onPress();
    const manager = find(render(),'RouteManager');
    assert.equal(manager.props.openRoute1,true);
    manager.props.onBack();
    assert.ok(find(render(),'Map'));
  } finally { cleanup.forEach(fn => { if (typeof fn === 'function') fn(); }); }
});

test('actual supervisor Live units KPI expires by wall clock without a completed refresh', async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now });
  states.length = 0;
  positions = [{ ...measured, timestamp: new Date(now).toISOString(), captured_at: new Date(now).toISOString() }];
  render(); const cleanup = effects.map(effect => effect());
  try {
    await setImmediate();
    assert.equal(liveKpi(render()), 1);
    // Interval refresh promises cannot finish until this synchronous clock assertion yields.
    t.mock.timers.tick(31000);
    const tree = render();
    assert.equal(find(tree, 'Map').props.vehicles.length, 1);
    assert.equal(liveKpi(tree), 0);
    await setImmediate();
  } finally { cleanup.forEach(fn => { if (typeof fn === 'function') fn(); }); t.mock.timers.reset(); }
});
