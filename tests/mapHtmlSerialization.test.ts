import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native') return { url: 'data:text/javascript,export const View="div"; export const Text="span"; export const Pressable=({children})=>children; export const Platform={OS:"web"}; export const StyleSheet={create:s=>s}', shortCircuit: true };
    if (specifier === 'react-i18next') return { url: 'data:text/javascript,export const useTranslation=()=>({t:(key,fallback)=>fallback})', shortCircuit: true };
    if (specifier === 'react-native-webview') return { url: 'data:text/javascript,export const WebView=p=>"WebView scroll="+p.scrollEnabled+" nested="+p.nestedScrollEnabled', shortCircuit: true };
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,', shortCircuit: true };
    if (specifier === './MapcnPassengerMap') return { url: 'data:text/javascript,' + encodeURIComponent('export default ({data}) => "Mapcn: " + data.destinationPlace?.name;'), shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/LeafletMap.tsx') || url.endsWith('/MapcnPassengerMap.web.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { default: LeafletMap } = await import('../src/components/LeafletMap.tsx');
const { default: MapcnPassengerMap } = await import('../src/components/MapcnPassengerMap.web.tsx');
const { Platform } = await import('react-native');
hooks.deregister();

test('the web map renders before translations are available', () => {
  const markup = renderToStaticMarkup(React.createElement(MapcnPassengerMap, { data: {} } as any));
  assert.match(markup, /aria-label="eJeepHero street map"/);
  assert.match(markup, /Loading street map…/);
});

test('native previews let the parent scroll and the native field editor starts interactive', () => {
  const props = { routes: [], terminals: [], vehicles: [] };
  Object.assign(Platform, { OS: 'ios' });
  try {
    const preview = renderToStaticMarkup(React.createElement(LeafletMap, props));
    assert.match(preview, /WebView scroll=false nested=false/);
    assert.match(preview, />Move map</);
    const fieldReview = { line: { id: 'r', name: 'Route', coordinates: [], color_code: '#19745e', isSelected: true },
      pins: [], fitPoints: [], cameraKey: 'field', onSelect() {} };
    const editor = renderToStaticMarkup(React.createElement(LeafletMap, { ...props, fieldReview }));
    assert.match(editor, /WebView scroll=true nested=true/);
    assert.doesNotMatch(editor, />Move map</);
  } finally {
    Object.assign(Platform, { OS: 'web' });
  }
});

test('the passenger web map defaults to mapcn and keeps Leaflet available offline', () => {
  const props = { preferMapcn: true, routes: [], terminals: [], vehicles: [], destinationPlace: { name: 'City Hall', latitude: 14.58, longitude: 121.04 } };
  const online = renderToStaticMarkup(React.createElement(LeafletMap, props));
  assert.match(online, /Mapcn: City Hall/);
  assert.match(online, />Move map</);
  const offline = renderToStaticMarkup(React.createElement(LeafletMap, { ...props, isOffline: true }));
  assert.match(offline, /title="eJeepHero street map"/);
});

test('serialized map executes safely, frames journeys, preserves camera on telemetry and dispatches stop clicks', () => {
  const a = { latitude: 14.6, longitude: 121 }, b = { latitude: 14.61, longitude: 121.01 };
  const name = '</script><script>globalThis.injected=true</script>';
  const verifiedAt = new Date(Date.now() - 60000).toISOString();
  const route = { id: 'arbitrary', name, coordinates: [a, b], geometry_verified_at: verifiedAt, geometry_source_url: 'https://example.test/route' };
  const stop = { ...a, id: 'stop', name, route_id: route.id, sequence_order: 1, location_verified_at: verifiedAt, location_source_url: 'https://example.test/stop',
    passenger_use: 'board', passenger_use_source_url: 'https://example.test/permissions', passenger_use_verified_at: verifiedAt };
  const markup = renderToStaticMarkup(React.createElement(LeafletMap, { routes: [route], terminals: [stop], vehicles: [], selectedRouteId: route.id, selectedVehicle: { id: 'pending' }, vehicleSelectionKey: 'selected-unit', vehicleFocusRequestId: 'first-request' } as any));
  const html = markup.match(/srcDoc="([^"]*)"/i)![1].replace(/&(quot|amp|lt|gt|#x27);/g, (_, key) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#x27': "'" }[key]!));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const fits: any[] = [], flights: any[] = [], markers: any[] = [], messages: any[] = [], lines: any[] = [];
  let options: any;
  const layer = () => ({ addTo() { return this; }, clearLayers() {}, bindTooltip(value: any) { this.label = value; return this; }, bindPopup() { return this; }, on(event: string, fn: () => void) { this[event] = fn; return this; } } as any);
  const handler = { enable() {}, disable() {} };
  let stops = 0;
  const map = { dragging: handler, touchZoom: handler, scrollWheelZoom: handler, doubleClickZoom: handler, boxZoom: handler, stop() { stops++; }, setView() { return this; }, on() { return this; }, getZoom: () => 14, fitBounds(points: any) { fits.push(points); }, flyTo(...args: any[]) { flights.push(args); } };
  const mapEl = { style: {} as { touchAction?: string } };
  const context: any = { document: { querySelector: () => ({ setAttribute() {} }), getElementById: () => mapEl, createElement: () => ({ textContent: '' }) }, L: {
    control: { zoom: layer },
    map: (_: string, value: any) => { options = value; return map; }, TileLayer: { extend: () => {} }, tileLayer: layer, layerGroup: layer,
    polyline: (points: any, settings: any) => { const value = { ...layer(), points, settings }; lines.push(value); return value; },
    marker: (point: any, settings: any) => { const value = { ...layer(), point, settings }; markers.push(value); return value; }, divIcon: (value: any) => value,
  } };
  context.window = { parent: { postMessage: (message: string) => messages.push(JSON.parse(message)) }, addEventListener() {} };
  runInNewContext(script, context);
  assert.equal(context.injected, undefined);
  assert.equal(options.maxBounds, undefined);
  assert.equal(context.window.canMoveMap, false);
  assert.equal(fits.length, 1);
  assert.equal(context.window.vehicleFocusKey, JSON.stringify(['selected-unit', 'first-request']));
  assert.equal(flights.length, 0);
  assert.equal(lines[0].settings.color, '#ffffff');
  assert.equal(lines[0].settings.weight, 13);
  assert.equal(lines[1].settings.color, '#0A7A58');
  assert.equal(lines[1].settings.weight, 9);
  assert.equal(lines[1].label.textContent, name);
  const marker = markers.find(m => m.settings.icon.className === 'custom-terminal-icon');
  marker.click();
  assert.deepEqual(messages, [{ type: 'MAP_READY' }, { type: 'SELECT_TERMINAL', id: 'stop' }]);
  const nativeMessages: string[] = [];
  context.window.ReactNativeWebView = { postMessage: (message: string) => nativeMessages.push(message) };
  marker.click();
  assert.deepEqual(nativeMessages.map(message => JSON.parse(message)), [{ type: 'SELECT_TERMINAL', id: 'stop' }]);
  delete context.window.ReactNativeWebView;
  const cameraKey = context.window.journeyCameraKey;
  const vehicle = { id: 'v', latitude: 14.7, longitude: 121.2, isSelected: true, body_number: name };
  const data = { canMove: true, cameraKey, fitPoints: [a, b], routes: [], terminals: [], rideCoordinates: [], walkingRoutes: [], vehicles: [vehicle], selectedVehicleId: 'v' };
  context.window.renderMapData(data);
  assert.equal(context.window.canMoveMap, true);
  assert.equal(mapEl.style.touchAction, 'none');
  assert.equal(fits.length, 1);
  assert.equal(flights.length, 1);
  assert.deepEqual(Array.from(flights[0][0]), [14.7, 121.2]);
  assert.ok(markers.at(-1).settings.icon.html.includes('&lt;/script&gt;'));
  context.window.renderMapData({ ...data, vehicles: [{ ...vehicle, latitude: 14.8 }] });
  assert.equal(flights.length, 1, 'position refresh keeps the camera where the user panned');
  context.window.renderMapData({ ...data, selectedVehicleId: 'other', vehicles: [{ ...vehicle, id: 'other', latitude: 14.9 }] });
  assert.equal(flights.length, 2, 'selecting a different unit centers once');
  context.window.renderMapData({ ...data, vehicleFocusRequestId: 1 });
  assert.equal(flights.length, 3);
  context.window.renderMapData({ ...data, vehicleFocusRequestId: 2 });
  assert.equal(flights.length, 4, 'repeat Track unit request centers the same unit again');
  context.window.renderMapData({ ...data, vehicleFocusRequestId: 2, vehicles: [{ ...vehicle, latitude: 14.8 }] });
  assert.equal(flights.length, 4);
  context.window.renderMapData({ ...data, vehicleFocusRequestId: 3, vehicles: [] });
  assert.equal(flights.length, 4, 'missing/stale telemetry cannot supply a target');
  context.window.renderMapData({ ...data, vehicleFocusRequestId: 3 });
  assert.equal(flights.length, 5, 'a pending explicit request waits for eligible telemetry');
  const tracked = { ...data, vehicleSelectionKey: 'TEST', vehicleFocusRequestId: 4 };
  context.window.renderMapData(tracked);
  const consumedFlights = flights.length;
  context.window.renderMapData({ ...tracked, selectedVehicleId: null, vehicles: [] });
  context.window.renderMapData({ ...tracked, vehicles: [{ ...vehicle, latitude: 14.9 }] });
  assert.equal(flights.length, consumedFlights, 'recovery after a consumed request is not another selection');
  context.window.renderMapData({ ...tracked, vehicleFocusRequestId: 5 });
  assert.equal(flights.length, consumedFlights + 1, 'explicit repeat Track still recenters after recovery');
  context.window.renderMapData({ ...tracked, selectedVehicleId: null, vehicles: [], vehicleFocusRequestId: 6 });
  assert.equal(flights.length, consumedFlights + 1);
  context.window.renderMapData({ ...tracked, vehicleFocusRequestId: 6 });
  assert.equal(flights.length, consumedFlights + 2, 'a new request issued during dropout focuses once on recovery');
  context.window.renderMapData({ ...tracked, vehicleSelectionKey: null, selectedVehicleId: null, vehicles: [], vehicleFocusRequestId: 6 });
  context.window.renderMapData({ ...tracked, vehicleFocusRequestId: 6 });
  assert.equal(flights.length, consumedFlights + 3, 'explicit deselection and reselection still focuses');
  context.window.renderMapData({ ...data, canMove: false, cameraKey: 'new-journey', fitPoints: [b], vehicles: [] });
  assert.equal(context.window.canMoveMap, false);
  assert.equal(mapEl.style.touchAction, 'pan-y');
  assert.equal(fits.length, 2);
  assert.equal(stops, 1, 'locking stops the momentum of the previous drag');
});

test('defaultMovable starts with the map unlocked and still offers Lock map', () => {
  const props = { preferMapcn: true, routes: [], terminals: [], vehicles: [], defaultMovable: true };
  const markup = renderToStaticMarkup(React.createElement(LeafletMap, props));
  assert.match(markup, />Lock map</);
  assert.doesNotMatch(markup, />Move map</);
});

test('the map-first home layout does not put a full-screen FormScrollView over the map', () => {
  const src = readFileSync(new URL('../src/screens/passenger/HomeScreen.tsx', import.meta.url), 'utf8');
  const start = src.lastIndexOf('const wideMap');
  const block = src.slice(start, src.indexOf('const styles', start));
  assert.match(block, /<PeekSheet/);
  assert.doesNotMatch(block, /FormScrollView/);
  assert.match(block, /defaultMovable/);
  assert.match(block, /pointerEvents="box-none"/);
  assert.match(block, /compact/);
  assert.match(block, /styles\.mapFill/);
});
