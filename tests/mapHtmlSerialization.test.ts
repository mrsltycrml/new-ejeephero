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
    if (specifier === 'react-native') return { url: 'data:text/javascript,export const View="div"; export const Platform={OS:"web"}; export const StyleSheet={create:s=>s}', shortCircuit: true };
    if (specifier === 'react-native-webview') return { url: 'data:text/javascript,export const WebView="div"', shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/LeafletMap.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { default: LeafletMap } = await import('../src/components/LeafletMap.tsx');
hooks.deregister();

test('serialized map executes safely, frames journeys, preserves camera on telemetry and dispatches stop clicks', () => {
  const a = { latitude: 14.6, longitude: 121 }, b = { latitude: 14.61, longitude: 121.01 };
  const name = '</script><script>globalThis.injected=true</script>';
  const route = { id: 'arbitrary', name, coordinates: [a, b], geometry_verified_at: '2026-11-18', geometry_source_url: 'https://example.test/route' };
  const stop = { ...a, id: 'stop', name, route_id: route.id, sequence_order: 1, location_verified_at: '2026-11-18', location_source_url: 'https://example.test/stop' };
  const markup = renderToStaticMarkup(React.createElement(LeafletMap, { routes: [route], terminals: [stop], vehicles: [], selectedRouteId: route.id, selectedVehicle: { id: 'pending' }, vehicleFocusRequestId: 'first-request' } as any));
  const html = markup.match(/srcDoc="([^"]*)"/i)![1].replace(/&(quot|amp|lt|gt|#x27);/g, (_, key) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#x27': "'" }[key]!));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const fits: any[] = [], flights: any[] = [], markers: any[] = [], messages: any[] = [], lines: any[] = [];
  let options: any;
  const layer = () => ({ addTo() { return this; }, clearLayers() {}, bindTooltip(value: any) { this.label = value; return this; }, bindPopup() { return this; }, on(event: string, fn: () => void) { this[event] = fn; return this; } } as any);
  const map = { setView() { return this; }, getZoom: () => 14, fitBounds(points: any) { fits.push(points); }, flyTo(...args: any[]) { flights.push(args); } };
  const context: any = { document: { getElementById: () => ({ style: {} }), createElement: () => ({ textContent: '' }) }, L: {
    map: (_: string, value: any) => { options = value; return map; }, TileLayer: { extend: () => {} }, tileLayer: layer, layerGroup: layer,
    polyline: (points: any, settings: any) => { const value = { ...layer(), points, settings }; lines.push(value); return value; },
    marker: (point: any, settings: any) => { const value = { ...layer(), point, settings }; markers.push(value); return value; }, divIcon: (value: any) => value,
  } };
  context.window = { parent: { postMessage: (message: string) => messages.push(JSON.parse(message)) }, addEventListener() {} };
  runInNewContext(script, context);
  assert.equal(context.injected, undefined);
  assert.equal(options.maxBounds, undefined);
  assert.equal(fits.length, 1);
  assert.equal(context.window.vehicleFocusKey, JSON.stringify(['pending', 'first-request']));
  assert.equal(flights.length, 0);
  assert.equal(lines[0].settings.weight, 7);
  assert.equal(lines[0].label.textContent, name);
  const marker = markers.find(m => m.settings.icon.className === 'custom-terminal-icon');
  marker.click();
  assert.deepEqual(messages, [{ type: 'SELECT_TERMINAL', id: 'stop' }]);
  const cameraKey = context.window.journeyCameraKey;
  const vehicle = { id: 'v', latitude: 14.7, longitude: 121.2, isSelected: true, body_number: name };
  const data = { cameraKey, fitPoints: [a, b], routes: [], terminals: [], rideCoordinates: [], walkingRoutes: [], vehicles: [vehicle], selectedVehicleId: 'v' };
  context.window.renderMapData(data);
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
  context.window.renderMapData({ cameraKey: 'new-journey', fitPoints: [b], routes: [], terminals: [], rideCoordinates: [], walkingRoutes: [], vehicles: [] });
  assert.equal(fits.length, 2);
});
