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
const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: english } } });
const position = { coords: { latitude: 14.6, longitude: 121, accuracy: 12 }, timestamp: now };
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/components/SOSButton.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function mount(os: string, reading: typeof position | Error, permission: string) {
  const calls: string[] = [], dispatches: any[] = [], slots: any[] = [];
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
    'react-native': { Platform: { OS: os }, StyleSheet: { create: (s: any) => s } },
    'expo-location': { Accuracy: { Highest: 'highest' },
      requestForegroundPermissionsAsync: async () => { calls.push('native permission'); return { status: permission }; },
      getCurrentPositionAsync: ({ accuracy }: { accuracy: string }) => read('native ' + accuracy) },
    '../services/browserLocation': { getBrowserPosition: () => read('browser position') },
    '../services/locationQuality': quality, '../services/passengerSafety': safety,
    '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'user' }, getAccessToken: async () => 'token' }) },
    '../services/emergencyService': { loadEmergencyContacts: async (...args: unknown[]) => {
      assert.deepEqual(args, ['user']);
      return [{ phone_number: 'test' }];
    },
      callEmergencyService: async (_token: string, body: any) => { dispatches.push(body); return { accepted: 1, total: 1 }; } },
    'expo-crypto': { randomUUID: () => 'test-request' }, '../constants/theme': { Colors: {} },
    './PassengerUI': { passengerStyles: {} }, './AppUI': { triggerHaptic() {} },
  };
  const exports: any = {};
  new Function('require', 'exports', outputText)((name: string) => modules[name] ?? {}, exports);
  const render = () => { cursor = 0; return exports.default({ activeVehicleBody: 'Unit 1' }); };
  return { calls, dispatches, render, press: () => render().children[0].props.onPress() };
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
