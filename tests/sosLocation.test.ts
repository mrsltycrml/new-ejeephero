import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import i18next from 'i18next';
import english from '../src/locales/en.json' with { type: 'json' };
import * as quality from '../src/services/locationQuality.ts';
import * as safety from '../src/services/passengerSafety.ts';

const now = Date.UTC(2026, 10, 21);
const themeTokens = {
  Colors: {},
  color: new Proxy({}, { get: () => undefined }),
  elevation: new Proxy({}, { get: () => ({}) }),
  radius: new Proxy({}, { get: () => 8 }),
  type: new Proxy({}, { get: () => ({}) }),
  space: new Proxy({}, { get: () => 8 }),
  tapTarget: 48,
};

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
const position = { coords: { latitude: 14.6, longitude: 121, accuracy: 12 }, timestamp: now };
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/SOSButton.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const emergencyLocation = ts.transpileModule(readFileSync(new URL('../src/services/emergencyLocation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount(os: string, reading: typeof position | Error, permission: string, options: {
  contacts?: { phone_number: string; preset_message: string; localOnly?: boolean }[];
  call?: (body: any) => Promise<unknown>;
} = {}) {
  const calls: string[] = [], dispatches: any[] = [], slots: any[] = [];
  const messages: string[] = [];
  let cursor = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value: any) => { slots[i] = value; }];
    },
    useRef(initial: any) { return slots[cursor++] ??= { current: initial }; },
    useEffect() {},
  };
  const read = async (api: string) => {
    calls.push(api);
    if (reading instanceof Error) throw reading;
    return reading;
  };
  const modules: Record<string, any> = {
    'react-i18next': { useTranslation: () => ({ t: i18n.t }) },
    react: { default: react, ...react },
    'react-native': { Platform: { OS: os }, StyleSheet: { create: (s: any) => s },
      Linking: { openURL: async (url: string) => { messages.push(url); } } },
    'expo-location': { Accuracy: { Highest: 'highest' },
      requestForegroundPermissionsAsync: async () => { calls.push('native permission'); return { status: permission }; },
      getCurrentPositionAsync: ({ accuracy }: { accuracy: string }) => read('native ' + accuracy) },
    '../services/browserLocation': { getBrowserPosition: () => read('browser position') },
    '../services/locationQuality': quality, '../services/passengerSafety': safety,
    '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'user' }, getAccessToken: async () => 'token' }) },
    '../services/emergencyService': { loadEmergencyContacts: async (...args: unknown[]) => {
      assert.deepEqual(args, ['user']);
      return options.contacts ?? [{ phone_number: 'test', preset_message: '' }];
    },
      callEmergencyService: async (_token: string, body: any) => {
        dispatches.push(body);
        return options.call ? options.call(body) : { status: 'complete', accepted: 1, total: 1 };
      } },
    'expo-crypto': { randomUUID: () => 'test-request' }, '../constants/theme': themeTokens,
    './PassengerUI': { passengerStyles: {} }, './AppUI': { triggerHaptic() {} },
  };
  const locationExports = {};
  new Function('require', 'exports', emergencyLocation)(
    (name: string) => modules[name.startsWith('./') ? '../services/' + name.slice(2) : name], locationExports);
  modules['../services/emergencyLocation'] = locationExports;
  const exports: any = {};
  new Function('require', 'exports', outputText)((name: string) => modules[name] ?? {}, exports);
  const render = () => { cursor = 0; return exports.default({ activeVehicleBody: 'Unit 1' }); };
  const openMessages = async () => {
    const find = (node: any): any => {
      if (Array.isArray(node)) return node.map(find).find(Boolean);
      if (!node?.children) return undefined;
      return node.props?.onPress && JSON.stringify(node.children).includes('Open Messages') ? node.props.onPress : find(node.children);
    };
    const open = find(render().children);
    assert.ok(open, 'manual Messages action is present');
    open(); await setImmediate();
  };
  return { calls, dispatches, messages, render, openMessages, press: () => render().children[0].props.onPress() };
}

test('web SOS requests browser GPS on press and dispatches only validated coordinates after the countdown', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now });
  for (const reading of [
    new Error('User denied geolocation'), { ...position, coords: { ...position.coords, latitude: 91 } },
    { ...position, timestamp: NaN }, { ...position, timestamp: now - 61_000 }, { ...position, timestamp: now + 120_000 },
    position,
  ]) {
    const sos = mount('web', reading, 'denied');
    sos.render();
    assert.deepEqual(sos.calls, []);
    sos.press();
    assert.deepEqual(sos.calls, ['browser position']);
    await setImmediate();
    assert.equal(sos.dispatches.length, 0);
    t.mock.timers.tick(5_000);
    await setImmediate();
    if (reading === position) {
      assert.deepEqual(sos.dispatches.map(body => body.fix), [{ ...position.coords, timestamp: position.timestamp }]);
    } else {
      assert.equal(sos.dispatches.length, 0);
      assert.match(JSON.stringify(sos.render().children), /Your location is unavailable/);
    }
  }
});

test('native SOS requests Expo permission and highest accuracy before dispatch', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now });
  for (const status of ['granted', 'denied']) {
    const sos = mount('ios', position, status);
    sos.press(); await setImmediate();
    assert.deepEqual(sos.calls, status === 'granted' ? ['native permission', 'native highest'] : ['native permission']);
    t.mock.timers.tick(5_000);
    await setImmediate();
    assert.equal(sos.dispatches.length, status === 'granted' ? 1 : 0);
  }
});

test('SOS checks the same dispatch after a lost reply and reuses a confirmed result', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now });
  const sos = mount('web', position, 'granted', { call: async (body) => {
    if (body.action === 'dispatch') throw new Error('connection lost');
    return { status: 'complete', accepted: 1, total: 1 };
  } });
  sos.press(); await setImmediate();
  t.mock.timers.tick(5_000); await setImmediate();
  assert.deepEqual(sos.dispatches.map(({ action, requestId }) => [action, requestId]),
    [['dispatch', 'test-request'], ['dispatch:status', 'test-request']]);
  assert.match(JSON.stringify(sos.render().children), /SMS provider accepted the alert/);
  assert.doesNotMatch(JSON.stringify(sos.render().children), /Open Messages/);
});

test('a still-unknown SOS leaves a manual draft without prefilled cloud recipients', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now });
  const sos = mount('web', position, 'granted', { call: async () => ({ status: 'uncertain', accepted: 0, total: 1 }) });
  sos.press(); await setImmediate();
  t.mock.timers.tick(5_000); await setImmediate();
  await sos.openMessages();
  assert.match(sos.messages[0], /^sms:[?&]body=/);
});

test('a shared Messages draft with different contact presets uses a general alert', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now });
  const sos = mount('web', position, 'granted', { contacts: [
    { phone_number: 'first', preset_message: 'Message for first contact only', localOnly: true },
    { phone_number: 'second', preset_message: 'Message for second contact only', localOnly: true },
  ] });
  sos.press(); await setImmediate();
  t.mock.timers.tick(5_000); await setImmediate();
  assert.match(sos.messages[0], /^sms:first,second[?&]body=/);
  const message = decodeURIComponent(sos.messages[0]);
  assert.doesNotMatch(message, /contact only/);
  assert.match(message, /EMERGENCY/);
});

const emergencyEdge = ts.transpileModule(readFileSync(new URL('../supabase/functions/emergency-dispatch/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('the Edge dispatch sends each stored preset only to its contact and records the outcome for its owner', async () => {
  const sms: [string, string][] = [];
  const rows: Record<string, Record<string, unknown>> = {};
  const contacts = [{ phone_number: 'first', preset_message: 'First contact only' }, { phone_number: 'second', preset_message: 'Second contact only' }];
  const requestId = '00000000-0000-4000-8000-000000000001';
  let handler: (request: Request) => Promise<Response>;
  const db = {
    auth: { getUser: async (id: string) => ({ data: { user: { id } } }) },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      const id = String(args.p_request_id);
      if (rows[id]) return { data: 'duplicate' };
      rows[id] = { request_id: id, user_id: args.p_user_id, status: 'sending', accepted_count: 0, recipient_count: args.p_recipient_count };
      return { data: 'claimed' };
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      let updates: Record<string, unknown> | undefined;
      const matching = () => Object.values(rows).find(row => filters.every(([key, value]) => row[key] === value));
      const query = {
        select: () => query,
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        update(value: Record<string, unknown>) { updates = value; return query; },
        limit: async () => ({ data: contacts }),
        single: async () => ({ data: { status: 'approved' } }),
        maybeSingle: async () => ({ data: matching() ?? null }),
        then(resolve: (value: unknown) => void) {
          assert.equal(table, 'passenger_sos_dispatches');
          const row = matching();
          if (updates && row) Object.assign(row, updates);
          resolve({ error: null });
        },
      };
      return query;
    },
  };
  const deno = {
    serve: (run: typeof handler) => { handler = run; },
    env: { get: (name: string) => name.startsWith('CLERK') ? undefined : 'true' },
  };
  const send = async (_url: string, { body }: { body: URLSearchParams }) => {
    sms.push([body.get('To')!, body.get('Body')!]);
    return { ok: body.get('To') === 'first', status: body.get('To') === 'first' ? 201 : 400 };
  };
  new Function('require', 'exports', 'Deno', 'fetch', emergencyEdge)(
    (id: string) => id.includes('supabase-js') ? { createClient: () => db } : {}, {}, deno, send);
  const invoke = (userId: string, action: string) => handler(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer ' + userId },
    body: JSON.stringify({ action, requestId, fix: { latitude: 14.6, longitude: 121, timestamp: Date.now() } }),
  })).then(response => response.json());
  assert.deepEqual(await invoke('owner', 'dispatch'), { status: 'complete', accepted: 1, total: 2 });
  assert.deepEqual(sms.map(([recipient, body]) => [recipient, body.split('\n')[0]]),
    [['first', 'First contact only'], ['second', 'Second contact only']]);
  assert.deepEqual(await invoke('owner', 'dispatch:status'), { status: 'complete', accepted: 1, total: 2 });
  assert.deepEqual(await invoke('owner', 'dispatch'), { status: 'complete', accepted: 1, total: 2 });
  assert.deepEqual(await invoke('other', 'dispatch:status'), { status: 'unknown' });
  assert.equal(sms.length, 2);
});

test('fleet incident shares GPS only after confirmation and reuses its request ID after an unconfirmed reply', async () => {
  const reporter = ts.transpileModule(readFileSync(new URL('../src/components/FleetIncidentReporter.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const slots: any[] = [];
  const submitted: unknown[][] = [];
  let cursor = 0;
  let locationRequests = 0;
  const react = {
    createElement: (_type: unknown, props: unknown, ...children: unknown[]) => ({ props, children }),
    useState(initial: unknown) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], (value: unknown) => { slots[slot] = value; }];
    },
    useRef: (initial: unknown) => slots[cursor++] ??= { current: initial },
    useEffect() {},
  };
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { StyleSheet: { create: (s: any) => s, hairlineWidth: 1 } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../constants/theme': themeTokens,
    'react-i18next': { useTranslation: () => ({ t: (key: string) => key }) },
    './PassengerUI': { passengerStyles: {} },
    'expo-crypto': { randomUUID: () => 'incident-1' },
    '../services/emergencyLocation': { requestEmergencyFix: async () => ({ ...position.coords, timestamp: now + locationRequests++ }) },
    '../services/fleetIncidents': { reportFleetIncident: async (...args: unknown[]) => {
      submitted.push(args);
      if (submitted.length === 1) throw new Error('Network lost after submit');
      if (submitted.length === 2) return { status: 'locationRequired' };
      return { status: 'submitted', vehicleId: null };
    } },
  };
  const exports: { default?: (props: { vehicleId: string }) => any } = {};
  new Function('require', 'exports', reporter)((name: string) => modules[name] ?? {}, exports);
  const render = () => { cursor = 0; return exports.default!({ vehicleId: 'unit-12' }); };
  const find = (node: any, label: string): (() => void) | undefined => {
    if (Array.isArray(node)) return node.map(child => find(child, label)).find(Boolean);
    if (node?.props?.onPress && JSON.stringify(node.children).includes(label)) return node.props.onPress;
    return node?.children ? find(node.children, label) : undefined;
  };
  find(render(), 'passenger.incident.breakdown')!();
  assert.equal(locationRequests, 0);
  assert.equal(submitted.length, 0);
  find(render(), 'passenger.incident.send')!();
  await setImmediate();
  assert.match(JSON.stringify(render()), /submitUnconfirmed/);
  find(render(), 'passenger.incident.send')!();
  await setImmediate();
  assert.deepEqual(submitted, Array(2).fill(['incident-1', 'breakdown', { ...position.coords, timestamp: now }, 'unit-12']));
  assert.equal(locationRequests, 1, 'retry uses the GPS reading the passenger already shared');
  assert.match(JSON.stringify(render()), /locationExpired/);
  find(render(), 'passenger.incident.send')!();
  await setImmediate();
  assert.deepEqual(submitted[2], ['incident-1', 'breakdown', { ...position.coords, timestamp: now + 1 }, 'unit-12']);
  assert.match(JSON.stringify(render()), /submittedWithoutUnit/);
});
