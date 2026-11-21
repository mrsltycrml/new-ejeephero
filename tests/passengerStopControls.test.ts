import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import i18next from 'i18next';
import english from '../src/locales/en.json' with { type: 'json' };
import filipino from '../src/locales/fil.json' with { type: 'json' };
import { passengerSections } from '../src/locales/passengerSections.ts';
import * as routeMap from '../src/services/routeMap.ts';
import * as passengerMapOverview from '../src/services/passengerMapOverview.ts';
import * as quality from '../src/services/locationQuality.ts';
import * as safety from '../src/services/passengerSafety.ts';
import * as fare from '../src/services/passengerFare.ts';
import * as landmarks from '../src/services/stopLandmarks.ts';
import { manilaDateKey } from '../src/utils/reportingPeriod.ts';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: english } } });

const route = { id: 'r', name: 'Eastbound', coordinates: [] };
const stops = ['board', null, 'alight', 'both'].map((passenger_use, i) => ({
  id: String(i), name: 'Gate ' + i, route_id: route.id, sequence_order: i, latitude: 14.5, longitude: 121 + i / 1000,
  location_verified_at: '2024-01-01', location_source_url: 'https://operator.example/pins',
  passenger_use, passenger_use_verified_at: '2024-01-01', passenger_use_source_url: 'https://operator.example/service',
}));
const journey = { transit: { routes: [route], terminals: stops, status: 'cached' }, selectedRouteId: 'r', boardingStop: null,
  alightingStop: null, vehicles: [], nearby: [], walkingRoutes: [], getJourneyVersion: () => 0 };

function screen(file: string, props: Record<string, any> = {}, journeyState: Record<string, any> = journey,
  options: { modules?: Record<string, any>; runEffects?: boolean; exportName?: string } = {}) {
  const slots: any[] = [];
  let cursor = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useMemo: (f: any) => f(), useRef: (current: any) => ({ current }),
    useEffect(effect: () => unknown, deps: unknown[]) {
      if (!options.runEffects) return;
      const i = cursor++;
      if (!slots[i] || deps.some((dep, j) => dep !== slots[i][j])) {
        slots[i] = deps;
        effect();
      }
    },
  };
  const modules: Record<string, any> = {
    'react-i18next': { useTranslation: () => ({ t: i18n.t, i18n }) },
    react: { ...react, default: react }, 'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button',
      TextInput: 'Input', ScrollView: 'ScrollView', Platform: { OS: 'web' }, StyleSheet: { create: (s: any) => s }, useWindowDimensions: () => ({ width: 400 }) },
    PassengerUI: { PassengerSelect: 'Select', passengerStyles: {} }, AppUI: { FormScrollView: 'Scroll', triggerHaptic() {} },
    PassengerJourneyContext: { usePassengerJourney: () => journeyState }, NetworkContext: { useNetwork: () => ({ isConnected: true }) },
    AuthContext: { useAuth: () => ({}) }, LocationContext: { useLocation: () => ({ fix: null, now: Date.now() }) },
    LeafletMap: { default: 'Map' }, theme: { Colors: {} }, passengerFare: fare, passengerSafety: safety,
    routeMap, passengerMapOverview, locationQuality: quality, stopLandmarks: landmarks, reportingPeriod: { manilaDateKey },
    esakayOperations: { LANDMARK_REFERENCE: { date: '', stops: [] } },
    transitStyles: { transitStyles: {} }, ...options.modules,
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
  return () => { cursor = 0; return [...walk(exports[options.exportName || 'default'](props))]; };
}

test('home map inspection, manual controls and fare selectors enforce the current stop role', () => {
  const home = screen('../src/screens/passenger/HomeScreen.tsx');
  const map = home().find(node => node.type === 'Map');
  assert.deepEqual(map.props.terminals.map((s: any) => s.id), ['0','1','2','3']);
  const button = (tree: any[], label: string) => tree.find(n => n.type === 'Button' && n.children.some((child: any) => child?.children?.includes(label)));
  map.props.onSelectTerminal(stops[1]);
  const unconfirmed = home();
  assert.ok(unconfirmed.some(n => n.type === 'Text' && n.children.includes('Passenger use unconfirmed')));
  assert.equal(button(unconfirmed, 'Board here'), undefined);
  assert.equal(button(unconfirmed, 'Alight here'), undefined);
  map.props.onSelectTerminal(stops[2]);
  const manual = home();
  assert.equal(button(manual, 'Board here').props.disabled, true);
  assert.equal(button(manual, 'Alight here').props.disabled, false);
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

test('the home map keeps other routes visible after choosing a boarding stop until the passenger filters the fleet', () => {
  const vehicles = ['r', 's'].map(id => ({ id, vehicle_id: id, route_id: id }));
  const state = { ...journey, boardingStop: stops[0], vehicles, fleetRouteId: null as string | null };
  const home = screen('../src/screens/passenger/HomeScreen.tsx', {}, state);
  const pins = () => home().find(node => node.type === 'Map').props.vehicles;
  assert.deepEqual(pins(), vehicles);
  state.fleetRouteId = 'r';
  assert.deepEqual(pins(), [vehicles[0]]);
  state.fleetRouteId = null;
  assert.deepEqual(pins(), vehicles);
});

function selectControl(props: Record<string, any>) {
  return screen('../src/components/PassengerUI.tsx', props, journey, { exportName: 'PassengerSelect' });
}

test('the open selector applies the first option tap while the keyboard is up', () => {
  const selected: string[] = [];
  const render = selectControl({ label: 'Boarding stop', value: '', options: [{ value: 'x', label: 'North gate' }], onSelect: (id: string) => selected.push(id) });
  render().find(n => n.props.accessibilityLabel === 'Boarding stop').props.onPress();
  const open = render();
  assert.equal(open.find(n => n.type === 'ScrollView').props.keyboardShouldPersistTaps, 'always');
  open.find(n => n.props.accessibilityLabel === 'North gate').props.onPress();
  assert.deepEqual(selected, ['x']);
  assert.ok(!render().some(n => n.type === 'ScrollView'));
});

const screenText = (tree: any[]) => tree.filter(n => n.type === 'Text').flatMap(n => n.children).join(' ');
const buttonWithText = (tree: any[], text: string) => tree.find(n => n.type === 'Button' &&
  n.children.some((c: any) => c?.children?.includes(text) || c?.children?.some((d: any) => d?.children?.includes(text))));
const selector = (tree: any[], label: string) => tree.find(n => n.type === 'Select' && n.props.label === label).props;
test('More opens Directory or trusted contacts on the first tap in both languages', async () => {
  for (const [lang, base] of [['en', english], ['fil', filipino]] as const) {
    const language = i18next.createInstance();
    await language.init({ lng: lang, resources: { [lang]: { translation: { ...base, passenger: { ...base.passenger, ...passengerSections[lang] } } } } });
    const modules = { 'react-i18next': { useTranslation: () => ({ t: language.t, i18n: language }) } };
    const actions: any[] = [];
    const navigation = { navigate: (...args: any[]) => actions.push(args) };
    const more = screen('../src/screens/passenger/MoreScreen.tsx', { navigation }, journey, { modules })();
    buttonWithText(more, base.passenger.nav.directory).props.onPress();
    buttonWithText(more, passengerSections[lang].more.contacts).props.onPress();
    assert.deepEqual(actions, [['PassengerDirectory'], ['Safety', {section:'contacts'}]]);
    const second = { ...route, id: 'west', name:'Westbound' };
    const state = { ...journey, transit: { ...journey.transit, routes: [route, second], status:'ready' } };
    const directory = screen('../src/screens/passenger/DirectoryScreen.tsx', {}, state, { modules });
    assert.match(screenText(directory()), /Gate 1/);
    assert.ok(screenText(directory()).includes(passengerSections[lang].directory.unknown));
    buttonWithText(directory(), second.name).props.onPress();
    assert.ok(screenText(directory()).includes(passengerSections[lang].directory.none));
    assert.doesNotMatch(screenText(directory()), /Gate 1/);
  }
});
function tapDirectOption(tree: any[], label: string, option: string) {
  const options = selectControl(selector(tree, label))();
  const choice = options.find(n => n.type === 'Button' && n.props.accessibilityLabel === option);
  assert.ok(choice && !choice.props.disabled, option + ' must be directly selectable');
  choice.props.onPress();
}

test('the sole published route shows actionable gaps before and after entering a distance', async () => {
  const none = async () => [];
  const state = { ...journey, selectedRouteId: null, transit: { routes: [route], terminals: [], status: 'ready' } };
  const render = screen('../src/screens/passenger/FareScreen.tsx', {}, state, { runEffects: true, modules: {
    passengerDataService: { loadPassengerFareMatrices: none, loadPassengerWalkLinks: none, loadPassengerRideSegments: none },
  } });
  render(); await Promise.resolve();
  const tree = render();
  assert.equal(selector(tree, 'Route').value, route.id);
  assert.match(screenText(tree), /current fare table/);
  assert.match(screenText(tree), /No walking paths/);
  assert.match(screenText(selectControl(selector(tree, 'Boarding stop'))()), /where boarding is allowed/);
  assert.match(screenText(selectControl(selector(tree, 'Alighting stop'))()), /where passengers may get off/);
  buttonWithText(tree, 'Enter distance').props.onPress();
  render().find(n => n.type === 'Input').props.onChangeText('4');
  assert.doesNotMatch(screenText(render()), /₱/);
  buttonWithText(render(), 'Walk & Save').props.onPress();
  buttonWithText(render(), 'Use selected stops').props.onPress();
  assert.ok(selector(render(), 'Boarding stop'));
});

test('the Fares tab quotes selected stops, changes category directly, and applies a cheaper walk to the map', async () => {
  const evidence = { source_url: 'https://example.test/survey', verified_at: '2024-01-01' };
  const gates = stops.slice(0, 3).map(s => ({ ...s, passenger_use: 'both' }));
  const [origin, later, exit] = gates;
  const walk = { ...evidence, from_stop_id: origin.id, to_stop_id: later.id, distance_meters: 108, duration_seconds: 100,
    coordinates: [origin, later], steps: [{ instruction: 'Walk to the gate', distance_meters: 108, duration_seconds: 100, fromIndex: 0, toIndex: 1 }] };
  const path = gates.slice(1).map((s, i) => ({ ...evidence, route_id: route.id, from_stop_id: gates[i].id, to_stop_id: s.id, distance_meters: 3000 }));
  const table = { ...evidence, route_id: route.id, currency: 'PHP', effective_from: '2024-01-01', effective_to: null,
    brackets: [{ up_to_km: 4, regular: 15, discounted: 12 }, { up_to_km: 8, regular: 20, discounted: 16 }] };
  let map = '', appliedWalk: any;
  const state: any = { ...journey, selectedRouteId: null, transit: { routes: [route], terminals: gates, status: 'ready' },
    setBoardingStop: (s: any) => Object.assign(state, routeMap.selectJourneyStop(state, s, 'boarding', [route] as any, gates as any)),
    setAlightingStop: (s: any) => Object.assign(state, routeMap.selectJourneyStop(state, s, 'alighting', [route] as any, gates as any)),
    showWalk: (w: any) => { appliedWalk = w; return true; } };
  const render = screen('../src/screens/passenger/FareScreen.tsx', { navigation: { navigate: (tab: string) => { map = tab; } } }, state,
    { runEffects: true, modules: { passengerDataService: { loadPassengerFareMatrices: async () => [table],
      loadPassengerRideSegments: async () => path, loadPassengerWalkLinks: async () => [walk] } } });
  render(); await Promise.resolve();
  tapDirectOption(render(), 'Boarding stop', origin.name);
  tapDirectOption(render(), 'Alighting stop', exit.name);
  assert.match(screenText(render()), /₱20\.00/);
  tapDirectOption(render(), 'Passenger category', 'Student');
  assert.match(screenText(render()), /₱16\.00/);
  buttonWithText(render(), 'Walk & Save').props.onPress();
  assert.match(screenText(render()), /Save\s+₱4\.00/);
  buttonWithText(render(), 'Use stop & view walking directions').props.onPress();
  assert.equal(state.boardingStop.id, later.id);
  assert.equal(state.alightingStop.id, exit.id);
  assert.equal(appliedWalk.steps[0].instruction, 'Walk to the gate');
  assert.equal(map, 'Map');
  tapDirectOption(render(), 'Boarding stop', 'Clear boarding stop');
  assert.equal(state.boardingStop, null);
  buttonWithText(render(), 'Enter distance').props.onPress();
  render().find(n => n.type === 'Input').props.onChangeText('3.5');
  assert.match(screenText(render()), /₱12\.00/);
  render().find(n => n.type === 'Input').props.onChangeText('0x4');
  assert.doesNotMatch(screenText(render()), /₱/);
});
