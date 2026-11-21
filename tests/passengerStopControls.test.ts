import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as routeMap from '../src/services/routeMap.ts';
import * as quality from '../src/services/locationQuality.ts';
import * as safety from '../src/services/passengerSafety.ts';
import * as fare from '../src/services/passengerFare.ts';
import * as landmarks from '../src/services/stopLandmarks.ts';
import { manilaDateKey } from '../src/utils/reportingPeriod.ts';

const route = { id: 'r', name: 'Eastbound', coordinates: [] };
const stops = ['board', null, 'alight', 'both'].map((passenger_use, i) => ({
  id: String(i), name: 'Gate ' + i, route_id: route.id, sequence_order: i, latitude: 14.5, longitude: 121 + i / 1000,
  location_verified_at: '2024-01-01', location_source_url: 'https://operator.example/pins',
  passenger_use, passenger_use_verified_at: '2024-01-01', passenger_use_source_url: 'https://operator.example/service',
}));
const journey = { transit: { routes: [route], terminals: stops, status: 'cached' }, selectedRouteId: 'r', boardingStop: null,
  alightingStop: null, vehicles: [], nearby: [], walkingRoutes: [], getJourneyVersion: () => 0 };

function screen(file: string, props: Record<string, any> = {}) {
  const slots: any[] = [];
  let cursor = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useMemo: (f: any) => f(), useRef: (current: any) => ({ current }), useEffect() {},
  };
  const modules: Record<string, any> = {
    react: { ...react, default: react }, 'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button',
      TextInput: 'Input', Platform: { OS: 'web' }, StyleSheet: { create: (s: any) => s }, useWindowDimensions: () => ({ width: 400 }) },
    PassengerUI: { PassengerSelect: 'Select', passengerStyles: {} }, AppUI: { FormScrollView: 'Scroll', triggerHaptic() {} },
    PassengerJourneyContext: { usePassengerJourney: () => journey }, NetworkContext: { useNetwork: () => ({ isConnected: true }) },
    AuthContext: { useAuth: () => ({}) }, LocationContext: { useLocation: () => ({ fix: null, now: Date.now() }) },
    LeafletMap: { default: 'Map' }, theme: { Colors: {} }, passengerFare: fare, passengerSafety: safety,
    routeMap, locationQuality: quality, stopLandmarks: landmarks, reportingPeriod: { manilaDateKey },
    esakayOperations: { LANDMARK_REFERENCE: { date: '', stops: [] } },
  };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports: any = {};
  new Function('require', 'exports', code)((key: string) => modules[key] || modules[key.split('/').pop()!] || {}, exports);
  function* walk(node: any): Generator<any> {
    if (!node || typeof node !== 'object') return;
    yield node;
    for (const child of node.children) yield* walk(child);
  }
  return () => { cursor = 0; return [...walk(exports.default(props))]; };
}

test('home map inspection, manual controls and fare selectors enforce the current stop role', () => {
  const home = screen('../src/screens/passenger/HomeScreen.tsx');
  const map = home().find(node => node.type === 'Map');
  assert.deepEqual(map.props.terminals.map((s: any) => s.id), ['0','2','3']);
  map.props.onSelectTerminal(stops[2]);
  const manual = home();
  const button = (label: string) => manual.find(n => n.type === 'Button' && n.children.some((child: any) => child?.children?.includes(label)));
  assert.equal(button('Board here').props.disabled, true);
  assert.equal(button('Alight here').props.disabled, false);
  for (const tree of [manual, screen('../src/screens/passenger/FareScreen.tsx')()]) {
    const ids = (label: string) => tree.find(n => n.type === 'Select' && n.props.label === label).props.options.map((o: any) => o.value);
    assert.deepEqual(ids('Boarding stop'), ['0','3']);
    assert.deepEqual(ids('Alighting stop'), ['2','3']);
  }
});

test('the passenger guide offers a walk to boarding stops only', () => {
  for (const stop of stops) {
    const render = screen('../src/components/PassengerStopGuide.tsx', { landmarks: stops, selectedStop: stop, boarding: { kind: 'unavailable' } });
    render().find(n => n.props.accessibilityLabel === 'Stop landmarks').props.onPress();
    const tree = render();
    const choices = tree.find(n => n.type === 'Select').props.options;
    assert.deepEqual(choices.map((o: any) => o.value), ['0','2','3']);
    const canWalk = tree.some(n => n.type === 'Text' && n.children.includes('Walk to this stop'));
    assert.equal(canWalk, stop.passenger_use === 'board' || stop.passenger_use === 'both');
  }
});
