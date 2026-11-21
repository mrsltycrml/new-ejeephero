import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { browserLocationWatch, getBrowserPosition } from '../src/services/browserLocation.ts';

test('an explicit GPS tap works without a permissions query and owns the actual browser watch', async () => {
  const callbacks: Array<{ success: PositionCallback; error: PositionErrorCallback }> = [];
  const cleared: number[] = [];
  const position = { timestamp: Date.now(), coords: Object.create({ latitude: 14, longitude: 121, accuracy: 9,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null }) } as GeolocationPosition;
  const readings: Array<{ coords: { accuracy: number } }> = [], messages: string[] = [];
  const expected = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
  const nav = mock.getter(globalThis, 'navigator', () => ({
    geolocation: {
      watchPosition(success: PositionCallback, error: PositionErrorCallback, options: PositionOptions) {
        assert.deepEqual(options, expected);
        return callbacks.push({ success, error }) - 1;
      },
      clearWatch(id: number) { cleared.push(id); },
      getCurrentPosition(success: PositionCallback, _error: PositionErrorCallback, options: PositionOptions) {
        assert.deepEqual(options, expected); success(position);
      },
    },
  } as unknown as Navigator));
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  try {
    const requested = { current: false };
    const watch = browserLocationWatch(pos => readings.push(pos), msg => messages.push(msg), requested);
    await watch.resume();
    assert.match(messages.at(-1)!, /Enable location/);
    watch.start();
    callbacks[0].error({ code: 3 } as GeolocationPositionError);
    assert.match(messages.at(-1)!, /timed out/);
    callbacks[0].error({ code: 2 } as GeolocationPositionError);
    assert.match(messages.at(-1)!, /could not determine/);
    callbacks[0].success(position);
    assert.equal(readings.length, 1);
    assert.equal({ ...readings[0].coords }.accuracy, 9);
    watch.start();
    callbacks[0].success(position);
    assert.equal(readings.length, 1);
    callbacks[1].error({ code: 1 } as GeolocationPositionError);
    assert.match(messages.at(-1)!, /blocked for this website/);
    assert.deepEqual(cleared, [0, 1]);
    await watch.resume();
    assert.equal(requested.current, false);
    assert.equal(callbacks.length, 2);
    watch.start();
    watch.stop();
    assert.deepEqual(cleared, [0, 1, 2]);
    assert.equal(await getBrowserPosition(), position);
  } finally {
    nav.mock.restore();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('a delayed permission check cannot override a manual request or restart a stopped watch', async () => {
  let answer!: (status: { state: PermissionState }) => void;
  const messages: string[] = [];
  let started = 0;
  const nav = mock.getter(globalThis, 'navigator', () => ({
    permissions: { query: () => new Promise(resolve => { answer = resolve; }) },
    geolocation: { watchPosition: () => ++started, clearWatch() {} },
  } as unknown as Navigator));
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  try {
    const watch = browserLocationWatch(() => {}, message => messages.push(message), {current:false});
    const pending = watch.resume();
    watch.start();
    answer({ state: 'prompt' });
    await pending;
    assert.equal(started, 1);
    assert.deepEqual(messages, ['Getting a fresh GPS reading…']);
    const resuming = watch.resume();
    watch.stop();
    answer({ state: 'granted' });
    await resuming;
    assert.equal(started, 1);
  } finally {
    nav.mock.restore();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('an explicit request survives suspension before a first fix and clears on denial or a new session',async()=>{
  let permission: PermissionState | undefined;
  let count=0, lastError: PositionErrorCallback;
  const nav=mock.getter(globalThis,'navigator',()=>({
    permissions:permission && {query:async()=>({state:permission})},
    geolocation:{watchPosition(_:PositionCallback,onError:PositionErrorCallback){lastError=onError;return ++count;},clearWatch(){}},
  } as unknown as Navigator));
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{isSecureContext:true}});
  const requested={current:false};
  const watch=()=>browserLocationWatch(()=>{},()=>{},requested);
  try {
    const initial=watch(); await initial.resume(); assert.equal(count,0);
    initial.start(); lastError!({code:3} as GeolocationPositionError); initial.stop();
    const resumed=watch(); await resumed.resume(); assert.equal(count,2);
    resumed.stop(); permission='prompt'; const prompted=watch();await prompted.resume();assert.equal(count,3);
    lastError!({code:1} as GeolocationPositionError);assert.equal(requested.current,false);
    await watch().resume();assert.equal(count,3);
    prompted.start();prompted.stop();permission='denied';await watch().resume();assert.equal(requested.current,false);
    permission=undefined;const newSession=browserLocationWatch(()=>{},()=>{},{current:false});
    await newSession.resume();assert.equal(count,4);
  } finally {
    nav.mock.restore();
    if(originalWindow) Object.defineProperty(globalThis,'window',originalWindow);
    else Reflect.deleteProperty(globalThis,'window');
  }
});
