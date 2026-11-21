import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as forms from '../src/services/supervisorCatalogForm.ts';
import { verifiedStop } from '../src/services/routeMap.ts';
import { realRows } from '../src/utils/realData.ts';

// Drive the manager's real controls and form serializers; substitute native views and I/O.
const source = readFileSync(new URL('../src/components/SupervisorRouteManager.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} });
type Row = Record<string, any>;
type Catalog = { routes: Row[]; terminals: Row[] };
type Reply = { data?: string | null; error?: { code: string; message: string } };

async function mount(rows: Catalog, rpc: (name: string, args: Row) => Promise<Reply>) {
  const slots: any[] = [];
  let cursor = 0, onMount: () => void, changes = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children: children.flat(Infinity) }),
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial: any) { return slots[cursor++] ??= { current: initial }; },
    useCallback: (fn: any) => fn,
    useEffect(fn: () => void) { onMount = fn; },
  };
  const modules: Record<string, any> = {
    react: { default: react, ...react },
    'react-native': { ScrollView: 'Scroll', Switch: 'Switch', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View' },
    '../lib/supabase': { supabase: { rpc, from(table: keyof Catalog) {
      return { select() { return this; }, order() { return this; },
        range(start: number, end: number) { return { data: structuredClone(rows[table].slice(start, end + 1)) }; } };
    } } },
    '../utils/realData': { realRows }, '../services/supervisorCatalogForm': forms, '../services/routeMap': { verifiedStop },
    './PassengerUI': { PassengerSelect: 'Select', passengerStyles: {} }, './RouteLineEditor': { default: 'LineEditor' },
  };
  const component: any = {};
  new Function('require', 'exports', outputText)((name: string) => modules[name], component);
  function render() {
    cursor = 0;
    return component.default({ onChanged: async () => { changes++; }, onBack() {} });
  }
  function* walk(node: any): Generator<any> {
    if (node == null || node === false) return;
    yield node;
    for (const child of node.children ?? []) yield* walk(child);
  }
  const nodes = () => [...walk(render())];
  function control(type: string, label: string) {
    const matches = nodes().filter(n => n.type === type && (n.props?.accessibilityLabel === label ||
      n.props?.label === label || n.children.some((child: any) => child?.type === 'Text' && child.children.join('') === label)));
    assert.equal(matches.length, 1, `Expected one ${type} labelled "${label}"`);
    return matches[0].props;
  }
  render(); onMount!(); await setImmediate();
  return { nodes, control, changes: () => changes,
    tap(label: string) { const button = control('Button', label); assert.ok(!button.disabled, label); button.onPress(); },
    fill(label: string, value: string) { const input = control('Input', label); assert.ok(input.editable); input.onChangeText(value); },
    toggle(label: string, value: boolean) { const toggle = control('Switch', label); assert.ok(!toggle.disabled); toggle.onValueChange(value); },
  };
}

test('route and stop forms create, patch and retire the selected records through the named RPCs', async () => {
  const existing = '00000000-0000-4000-8000-000000000001';
  const route = '00000000-0000-4000-8000-000000000002', stop = '00000000-0000-4000-8000-000000000003';
  const rows: Catalog = { routes: [{ id: existing, name: 'A different route' }], terminals: [] };
  const calls: Array<[string, Row]> = [];
  let reply: () => Reply;
  const ui = await mount(rows, async (name, args) => { calls.push([name, args]); return reply(); });
  const selected = () => ui.control('Select', 'Route').value;
  async function save(button: string, name: string, args: Row, committed: () => Reply) {
    const before = calls.length;
    reply = committed;
    ui.tap(button);
    await setImmediate();
    assert.deepEqual(calls.slice(before), [[name, args]]);
    assert.equal(ui.changes(), calls.length, 'refresh the dashboard once per successful mutation');
  }

  ui.tap('Add route');
  ui.fill('Route name and direction', '  Z eastbound  ');
  const routeData = { name: 'Z eastbound', description: '', operating_hours: '', color_code: '#1F4E79', is_coming_soon: true };
  await save('Save route', 'supervisor_save_route', { p_route_id: null, p_data: routeData }, () => {
    rows.routes.push({ id: route, ...routeData }); return { data: route };
  });
  assert.equal(selected(), route, 'use the returned UUID even when another route sorts first');
  ui.tap('Edit route');
  ui.tap('Save route');
  assert.equal(calls.length, 1, 'empty patches stay local');
  ui.toggle('Coming soon', false);
  await save('Save route', 'supervisor_save_route', { p_route_id: route, p_data: { is_coming_soon: false } }, () => {
    rows.routes[1].is_coming_soon = false; return { data: route };
  });

  ui.tap('Add stop');
  ui.fill('Stop name', 'Market');
  ui.fill('Curbside latitude', '14.5'); ui.fill('Curbside longitude', '121.0');
  ui.fill('Location source (HTTPS)', 'https://example.invalid/pin');
  ui.fill('Landmark description (optional)', 'Clock tower');
  ui.fill('Boarding side (optional)', 'North');
  ui.fill('Travel direction (optional)', 'Eastbound');
  ui.fill('Entrance instructions (optional)', 'Use the gate');
  ui.fill('Boarding details source (HTTPS)', 'https://example.invalid/curb');
  ui.tap('Save stop');
  assert.equal(calls.length, 2);
  assert.ok(ui.nodes().some(n => n.props?.accessibilityRole === 'alert'), 'source confirmation is required');
  ui.toggle('Verified against the source', true);
  const stopData = { name: 'Market', sequence_order: 1, latitude: 14.5, longitude: 121,
    location_source_url: 'https://example.invalid/pin', landmark_desc: 'Clock tower', boarding_side: 'North',
    stop_details_source_url: 'https://example.invalid/curb', travel_direction: 'Eastbound', entrance_instructions: 'Use the gate' };
  await save('Save stop', 'supervisor_save_stop', { p_route_id: route, p_stop_id: null, p_data: stopData }, () => {
    rows.terminals.push({ id: stop, route_id: route, location_verified_at: '2025-01-01', ...stopData }); return { data: stop };
  });
  assert.equal(selected(), route, 'a returned stop UUID must not become the selected route');
  ui.tap('Edit stop');
  assert.equal(ui.control('Input', 'Landmark description (optional)').value, 'Clock tower');
  ui.fill('Stop name', 'Market gate');
  await save('Save stop', 'supervisor_save_stop', { p_route_id: route, p_stop_id: stop, p_data: { name: 'Market gate' } }, () => {
    rows.terminals[0].name = 'Market gate'; return { data: stop };
  });
  ui.tap('Edit stop');
  ui.fill('Boarding side (optional)', '');
  ui.toggle('Verified against the source', true);
  await save('Save stop', 'supervisor_save_stop', { p_route_id: route, p_stop_id: stop,
    p_data: { boarding_side: null, stop_details_source_url: stopData.stop_details_source_url } }, () => {
    rows.terminals[0].boarding_side = null; return { data: stop };
  });
  ui.tap('Retire stop'); ui.tap('Cancel');
  assert.equal(calls.length, 5);
  ui.tap('Retire stop');
  await save('Confirm retire stop', 'supervisor_retire_stop', { p_stop_id: stop }, () => {
    rows.terminals[0].is_active = false; return { data: null };
  });
  assert.ok(ui.nodes().includes('No current stops on this route.'));
  ui.tap('Retire route');
  await save('Confirm retire route', 'supervisor_retire_route', { p_route_id: route }, () => {
    rows.routes[1].is_archived = true; return { data: null };
  });
  assert.equal(selected(), existing);
  assert.deepEqual(ui.control('Select', 'Route').options.map((o: Row) => o.value), [existing]);
});

test('same-frame Save taps send one RPC and a rejected patch keeps the draft for correction', async () => {
  const rows: Catalog = { routes: [{ id: 'existing', name: 'Market', color_code: '#112233' }], terminals: [] };
  const calls: Row[] = [];
  let finish: (value: Reply) => void;
  const ui = await mount(rows, async (name, args) => {
    assert.equal(name, 'supervisor_save_route');
    calls.push(args);
    return new Promise<Reply>(resolve => { finish = resolve; });
  });
  ui.tap('Edit route'); ui.fill('Route name and direction', 'Depot');
  const press = ui.control('Button', 'Save route').onPress;
  press(); press();
  assert.equal(calls.length, 1);
  finish!({ error: { code: '22023', message: 'Invalid route field.' } }); await setImmediate();
  assert.ok(ui.nodes().includes('Invalid route field.'));
  assert.equal(ui.control('Input', 'Route name and direction').value, 'Depot');
  assert.equal(ui.changes(), 0);
  ui.fill('Route name and direction', 'Depot eastbound'); ui.tap('Save route');
  assert.deepEqual(calls[1], { p_route_id: 'existing', p_data: { name: 'Depot eastbound' } });
  rows.routes[0].name = 'Depot eastbound';
  finish!({ data: 'existing' }); await setImmediate();
  assert.equal(ui.changes(), 1);
});
