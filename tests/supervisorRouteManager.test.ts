import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as forms from '../src/services/supervisorCatalogForm.ts';
import * as routeMap from '../src/services/routeMap.ts';
import * as fieldMap from '../src/services/route1FieldMap.ts';
import { meters } from '../src/services/passengerJourney.ts';
import { realRows } from '../src/utils/realData.ts';
import { validPoint } from '../src/services/locationQuality.ts';

// Drive the manager's real controls and form serializers; substitute native views and I/O.
function compile(file: string) {
  const source = readFileSync(new URL('../src/components/'+file+'.tsx', import.meta.url), 'utf8');
  return ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
}
const outputText=compile('SupervisorRouteManager'), panelText=compile('Route1ReviewPanel'), mapText=compile('Route1ReviewMap');
const { ROUTE1_OUTBOUND_ID: outbound, ROUTE1_INBOUND_ID: inbound, route1Variants: variants, route1Pins: pins } = fieldMap;
const terminal = pins.find(pin => pin.id === 'buendia')!;
const curb = terminal.point;
const operator='https://operator.example/field-check';
type Row = Record<string, any>;
type Catalog = { routes: Row[]; terminals: Row[] };
type Reply = { data?: string | null; error?: { code: string; message: string } };

async function mount(rows: Catalog, rpc: (name: string, args: Row) => Promise<Reply>, openRoute1: boolean | 'add' = false) {
  const managerSlots: any[] = [];
  let panelSlots: any[] = [],slots=managerSlots;
  const draftIds: string[] = [];
  const sourceLinks: string[] = [];
  let cursor = 0, onMount: () => void, changes = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children: children.flat(Infinity) }),
    useState(initial: any) {
      const owner = slots;
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [owner[index], (value: any) => { owner[index] = typeof value === 'function' ? value(owner[index]) : value; }];
    },
    useRef(initial: any) { return slots[cursor++] ??= { current: initial }; },
    useMemo: (compute: () => any) => compute(),
    useCallback: (fn: any) => fn,
    useEffect(fn: () => void) { onMount = fn; },
  };
  const modules: Record<string, any> = {
    react: { default: react, ...react },
    'expo-crypto': { randomUUID() { const id = randomUUID(); draftIds.push(id); return id; } },
    'react-native': { ScrollView: 'Scroll', Switch: 'Switch', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View',
      Pressable:'Pressable', StyleSheet:{create:(styles:any)=>styles}, Linking:{openURL:(url:string)=>sourceLinks.push(url)} },
    '../lib/supabase': { supabase: { rpc, from(table: keyof Catalog) {
      return { select() { return this; }, order() { return this; },
        range(start: number, end: number) { return { data: structuredClone(rows[table].slice(start, end + 1)) }; } };
    } } },
    '../utils/realData': { realRows }, '../services/supervisorCatalogForm': forms, '../services/routeMap': routeMap, '../services/passengerJourney': {meters},
    '../services/locationQuality': {validPoint}, '../services/route1FieldMap': fieldMap,
    './Route1ReviewMap': {default:'ReviewMap'}, './LeafletMap': {default:'LeafletMap'},
    './PassengerUI': { PassengerSelect: 'Select', passengerStyles: {} }, './RouteLineEditor': { default: 'LineEditor' },
  };
  const component: any = {};
  const panel: any = {};
  const mapRenderer: any = {};
  new Function('require','exports',mapText)((name:string)=>modules[name],mapRenderer);
  new Function('require','exports',panelText)((name:string)=>modules[name],panel);
  modules['./Route1ReviewPanel']=panel;
  new Function('require', 'exports', outputText)((name: string) => modules[name], component);
  function render() {
    slots=managerSlots;cursor = 0;
    const root=component.default({ initialPage:openRoute1 === 'add' ? 'add' : openRoute1 ? 'route1' : 'list',onChanged: async () => { changes++; }, onBack() {} });
    if(root.type===panel.default){slots=panelSlots;cursor=0;return panel.default(root.props);}
    panelSlots=[];return root;
  }
  function* walk(node: any): Generator<any> {
    if (node == null || node === false) return;
    yield node;
    if (node.type==='ReviewMap') yield* walk(mapRenderer.default(node.props));
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
  return { nodes, control, draftIds, sourceLinks, changes: () => changes,
    map() { const m=nodes().find(n=>n.type==='ReviewMap');assert.ok(m);return m.props; },
    select(label:string,value:string) { const p=control('Select',label);assert.ok(!p.disabled && p.options.some((o: Row)=>o.value===value),label);p.onSelect(value); },
    tap(label: string) { const button = control('Button', label); assert.ok(!button.disabled, label); button.onPress(); },
    fill(label: string, value: string) { const input = control('Input', label); assert.ok(input.editable); input.onChangeText(value); },
    toggle(label: string, value: boolean) { const toggle = control('Switch', label); assert.ok(!toggle.disabled); toggle.onValueChange(value); },
  };
}

test('the dedicated Add route page opens the existing route for name matches and the Route 2 reservation', async () => {
  const route2 = { id:'a2000000-0000-0000-0000-000000000002', name:'Route 2: Coming soon', is_coming_soon:true };
  const rows = { routes:[route2, {id:'other', name:'Market Eastbound'}], terminals:[] };
  let writes = 0;
  const ui = await mount(rows,async()=>{writes++;return {};},'add');
  assert.equal(ui.control('Switch','Coming soon').value,true);
  for (const name of [' market   EASTBOUND ', 'Route 2: Station to Park']) {
    ui.fill('Route name and direction',name);
    assert.equal(ui.control('Button','Save route').disabled,true);
    assert.ok(ui.control('Button','Open existing route'));
  }
  ui.tap('Open existing route');
  assert.equal(ui.control('Select','Route').value,route2.id);
  assert.equal(writes,0);
});

test('a duplicate saved by another supervisor refreshes the directory and can be opened', async () => {
  const rows: Catalog = { routes:[], terminals:[] };
  const ui = await mount(rows,async()=>{
    rows.routes.push({id:'concurrent',name:'Market Eastbound'});
    return {error:{code:'23505',message:'duplicate key'}};
  },'add');
  ui.fill('Route name and direction','Market Eastbound'); ui.tap('Save route'); await setImmediate();
  assert.equal(ui.control('Button','Save route').disabled,true);
  ui.tap('Open existing route');
  assert.equal(ui.control('Select','Route').value,'concurrent');
});

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
  assert.equal(ui.draftIds.length, 1);
  ui.fill('Route name and direction', '  Z eastbound  ');
  const routeData = { name: 'Z eastbound', description: '', operating_hours: '', color_code: '#1F4E79', is_coming_soon: true };
  await save('Save route', 'supervisor_create_catalog_item', { p_request_id: ui.draftIds[0], p_kind: 'route', p_route_id: null, p_data: routeData }, () => {
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
  assert.equal(ui.draftIds.length, 2);
  assert.notEqual(ui.draftIds[1], ui.draftIds[0]);
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
  await save('Save stop', 'supervisor_create_catalog_item', { p_request_id: ui.draftIds[1], p_kind: 'stop', p_route_id: route, p_data: stopData }, () => {
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
  assert.equal(ui.draftIds.length, 2, 'only new drafts allocate request IDs');
});

test('retrying a committed route create after a lost response selects the original result', async () => {
  const rows: Catalog = { routes: [{ id: randomUUID(), name: 'A different route' }], terminals: [] };
  const calls: Array<[string, Row]> = [];
  const receipts = new Map<string, string>();
  const ui = await mount(rows, async (name, args) => {
    calls.push([name, args]);
    const savedId = receipts.get(args.p_request_id);
    if (savedId) return { data: savedId };
    const id = randomUUID();
    rows.routes.push({ ...args.p_data, id });
    receipts.set(args.p_request_id, id);
    throw new TypeError('Network request failed');
  });
  ui.tap('Add route'); ui.fill('Route name and direction', 'Z eastbound'); ui.tap('Save route');
  await setImmediate();
  assert.equal(rows.routes.length, 2, 'server committed before the response was lost');
  assert.equal(ui.changes(), 0);
  assert.equal(ui.control('Input', 'Route name and direction').value, 'Z eastbound');
  ui.tap('Save route'); await setImmediate();
  assert.equal(ui.draftIds.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'supervisor_create_catalog_item');
  assert.equal(calls[0][1].p_request_id, ui.draftIds[0]);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(rows.routes.length, 2);
  assert.equal(ui.control('Select', 'Route').value, rows.routes[1].id);
  assert.equal(ui.changes(), 1);
});

test('previewing either alignment and selecting map or list pins never writes; paired activation checks both directions and reconciles a lost reply', async () => {
  const rows:Catalog={routes:[{id:outbound,name:'Buendia'}],terminals:[]};
  const calls: Row[]=[];
  const ui=await mount(rows,async(name,args)=>{
    assert.equal(name,'supervisor_activate_route1'); calls.push(args);
    rows.routes[0].route1_variant=args.p_variant;
    rows.routes.push({id:inbound,name:'Return',route1_variant:args.p_variant});
    throw Error('Reply lost');
  },true);
  assert.ok(ui.nodes().includes('No alignment confirmed'));
  assert.ok(ui.nodes().some(n=>typeof n==='string' && n.includes('doubles back on Jupiter')));
  assert.deepEqual(ui.map().pins.map((p:Row)=>p.id),['buendia','jupiter','bridge','school','tivoli-city-hall','maysilo']);
  ui.control('Pressable','Open the dated OpenStreetMap route record').onPress();
  assert.equal(ui.sourceLinks.at(-1),variants[0].source);
  ui.map().onSelectPin('jupiter');
  assert.equal(ui.control('Select','Reference pin').value,'jupiter');
  ui.select('Preview alignment','one_ayala_2026');
  ui.select('Reference pin','one-ayala');assert.equal(ui.map().selectedPinId,'one-ayala');
  ui.toggle('Verified outbound path',true);
  ui.fill('Operator source for activation (HTTPS)',operator);
  assert.equal(ui.control('Switch','Verified outbound path').value,false);
  ui.toggle('Verified outbound path',true);
  assert.equal(ui.control('Button','Activate both directions').disabled,true);
  ui.select('Preview direction','inbound');
  assert.equal(ui.map().direction,'inbound');ui.toggle('Verified inbound path',true);
  ui.control('Pressable','Open the dated OpenStreetMap route record').onPress();
  assert.equal(ui.sourceLinks.at(-1),variants[1].returnSource);
  assert.equal(calls.length,0);
  const activate=ui.control('Button','Activate both directions').onPress;activate();activate();
  await setImmediate();
  assert.deepEqual(calls,[{p_variant:'one_ayala_2026',p_expected_variant:null,p_outbound:variants[1].outbound,p_inbound:variants[1].inbound,p_source_url:operator}]);
  assert.equal(ui.control('Button','Activate both directions').disabled,true);
  ui.tap('Refresh Route 1');await setImmediate();
  assert.ok(ui.nodes().includes(variants[1].label));
  assert.equal(ui.nodes().some(n=>n.type==='Button' && n.children.some((t:any)=>t.children?.includes('Activate both directions'))),false);
  assert.equal(calls.length,1);
});

test('a supervisor chooses an existing directional curb, places it on the map, confirms use with a source, and can withdraw it',async()=>{
  const variant='buendia_2022';
  const saved={id:terminal.existingStopId!,route_id:outbound,name:'Buendia platform',...curb,sequence_order:1,location_source_url:operator,location_verified_at:'2025-01-01'};
  const rows:Catalog={routes:[{id:outbound,name:'Buendia',route1_variant:variant},{id:inbound,name:'Return',route1_variant:variant}],terminals:[saved]};
  const calls:Array<[string,Row]>=[];
  const ui=await mount(rows,async(name,args)=>{calls.push([name,args]);Object.assign(rows.terminals[0],args.p_data,{
    passenger_use_verified_at:args.p_data.passenger_use ? '2025-01-02' : null,
  });return {data:saved.id};});
  ui.tap('Review Route 1 map and stops');ui.select('Reference pin','jupiter');
  assert.equal(ui.control('Select','Stop on this direction').value,'');
  assert.equal(ui.control('Button','Review new curb').disabled,true);
  ui.select('Stop on this direction',saved.id);ui.tap('Review existing curb');
  const before=ui.map();
  assert.equal(before.onPickCurb,undefined);
  assert.equal(before.selectedPinId,'jupiter');
  const savedPinId='saved:'+saved.id;
  assert.ok(before.pins.some((p:Row)=>p.id===savedPinId && p.point.latitude===curb.latitude));
  ui.select('Passenger use decision','board');ui.fill('Passenger use source (HTTPS)',operator);ui.toggle('Verified against the source',true);
  ui.toggle('Place curb on map',true);
  const picked={latitude:14.55001,longitude:121.03002};ui.map().onPickCurb(picked);
  assert.deepEqual(ui.map().draftCurb,picked);
  assert.ok(ui.map().pins.some((p:Row)=>p.id===savedPinId && p.point.longitude===curb.longitude));
  assert.equal(ui.control('Switch','Verified against the source').value,false);
  assert.equal(ui.control('Input','Curbside longitude').value,String(picked.longitude));
  ui.tap('Save stop');assert.equal(calls.length,0);
  ui.toggle('Verified against the source',true);ui.tap('Save stop');await setImmediate();
  assert.deepEqual(calls[0],['supervisor_save_stop',{p_route_id:outbound,p_stop_id:saved.id,p_data:{
    ...picked,location_source_url:operator,expected_route1_variant:variant,passenger_use:'board',passenger_use_source_url:operator}}]);
  const shifted = ui.map().pins.find((p:Row)=>p.id===savedPinId);
  assert.deepEqual(shifted.point,picked);
  assert.match(shifted.name,/Boarding only/);
  assert.deepEqual(ui.map().pins.find((p:Row)=>p.id===terminal.id).point,curb);
  ui.select('Reference pin',terminal.id);
  assert.equal(ui.control('Select','Stop on this direction').value,saved.id);
  assert.ok(!ui.control('Select','Stop on this direction').options.some((o:Row)=>o.value==='new'));
  ui.map().onSelectPin(savedPinId);ui.select('Passenger use decision','withdraw');
  ui.toggle('Verified against the source',true);ui.tap('Save stop');assert.equal(calls.length,1);
  ui.fill('Passenger use source (HTTPS)',operator+'/closure');ui.toggle('Verified against the source',true);
  ui.tap('Save stop');await setImmediate();
  assert.deepEqual(calls[1],['supervisor_save_stop',{p_route_id:outbound,p_stop_id:saved.id,p_data:{
    expected_route1_variant:variant,passenger_use:null,passenger_use_source_url:operator+'/closure'}}]);
  assert.equal(ui.changes(),2);
  assert.ok(!ui.map().pins.some((p:Row)=>p.id===savedPinId));
});

test('switching an active alignment sends the expected previous variant and reloads both directions and their approvals', async () => {
  const rows: Catalog = {
    routes: [outbound,inbound].map(id => ({ id, name:id, route1_variant:variants[0].id })),
    terminals: [{id:'old',route_id:outbound,name:'Old curb',...curb,sequence_order:1,location_verified_at:'2025-01-01',
      location_source_url:operator,passenger_use:'both',passenger_use_verified_at:'2025-01-02',passenger_use_source_url:operator}],
  };
  const calls:Row[]=[];
  const ui=await mount(rows,async(name,args)=>{
    assert.equal(name,'supervisor_activate_route1');calls.push(args);
    rows.routes.forEach(r=>r.route1_variant=args.p_variant);
    rows.terminals[0].passenger_use=null;
    return {};
  },true);
  assert.ok(ui.map().pins.some((p:Row)=>p.id==='saved:old'));
  ui.select('Preview alignment',variants[1].id);
  assert.ok(!ui.map().pins.some((p:Row)=>p.id==='saved:old'));
  ui.fill('Operator source for activation (HTTPS)',operator);ui.toggle('Verified outbound path',true);
  ui.select('Preview direction','inbound');ui.toggle('Verified inbound path',true);
  assert.equal(calls.length,0);ui.tap('Activate both directions');await setImmediate();
  assert.deepEqual(calls,[{p_variant:variants[1].id,p_expected_variant:variants[0].id,
    p_outbound:variants[1].outbound,p_inbound:variants[1].inbound,p_source_url:operator}]);
  assert.ok(ui.nodes().includes('Active alignment'));assert.equal(ui.changes(),1);
  ui.select('Preview direction','outbound');
  assert.ok(ui.nodes().includes('No approved passenger curbs on this direction.'));
});

test('inbound pin review never binds an outbound stop; a new confirmed curb keeps one request ID across retries',async()=>{
  const variant='one_ayala_2026';
  const rows:Catalog={routes:[{id:outbound,name:'A',route1_variant:variant},{id:inbound,name:'B',route1_variant:variant}],
    terminals:[{id:pins.find(p=>p.id==='maysilo')!.existingStopId,name:'City Hall',route_id:outbound,...curb,sequence_order:1}]};
  const calls:Row[]=[];
  const ui=await mount(rows,async(name,args)=>{assert.equal(name,'supervisor_create_catalog_item');calls.push(args);
    if(calls.length===1){rows.terminals.push({id:'new-stop',route_id:inbound,...args.p_data});throw Error('Lost reply');}
    return {data:'new-stop'};
  });
  ui.select('Route',inbound);ui.tap('Review Route 1 map and stops');
  assert.equal(ui.map().direction,'inbound');ui.select('Reference pin','maysilo');
  assert.equal(ui.control('Select','Stop on this direction').value,'');
  assert.deepEqual(ui.control('Select','Stop on this direction').options.map((o:Row)=>o.value),['new']);
  ui.select('Stop on this direction','new');ui.tap('Review new curb');
  assert.ok(ui.map().pins.some((p:Row)=>p.id==='tivoli-return'));
  assert.ok(!ui.map().pins.some((p:Row)=>p.id==='tivoli-city-hall' || p.id==='buendia'));
  assert.equal(ui.control('Input','Curbside latitude').value,'');
  ui.fill('Stop name','Return-side curb');ui.fill('Curbside latitude','14.552');ui.fill('Curbside longitude','121.032');
  ui.fill('Location source (HTTPS)',operator);ui.select('Passenger use decision','alight');ui.fill('Passenger use source (HTTPS)',operator);
  ui.toggle('Verified against the source',true);ui.tap('Save stop');await setImmediate();
  ui.tap('Save stop');await setImmediate();
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[0],{
    p_request_id:ui.draftIds[0],p_kind:'stop',p_route_id:inbound,p_data:{name:'Return-side curb',sequence_order:1,latitude:14.552,longitude:121.032,
      location_source_url:operator,passenger_use:'alight',passenger_use_source_url:operator,expected_route1_variant:variant}});
  assert.equal(rows.terminals.filter(s=>s.route_id===inbound).length,1);assert.equal(ui.changes(),1);
});

test('active map and accessible list open independently confirmed curbs only on their saved direction', async () => {
  const variant = 'one_ayala_2026';
  const evidence = { ...curb, sequence_order: 1, location_source_url: operator, location_verified_at: '2025-01-01',
    passenger_use_verified_at: '2025-01-02', passenger_use_source_url: operator };
  const rows: Catalog = {
    routes: [{id:outbound,name:'Outbound',route1_variant:variant}, {id:inbound,name:'Return',route1_variant:variant}],
    terminals: [
      { ...evidence, route_id:outbound, id:'gate', name:'Market gate', passenger_use:'both' },
      { ...evidence, route_id:inbound, id:'return', name:'Market return', passenger_use:'alight' },
      { ...evidence, route_id:outbound, id:'pending', name:'Awaiting source', passenger_use:'board', passenger_use_source_url:null },
      { ...evidence, route_id:outbound, id:'withdrawn', name:'Withdrawn', passenger_use:null },
      { ...evidence, route_id:outbound, id:'retired', name:'Retired', passenger_use:'board', is_active:false },
    ],
  };
  const ui = await mount(rows, async () => assert.fail('Review is read-only'), true);
  const savedMarkers = () => ui.map().pins.filter((pin:Row) => pin.kind === 'curb');
  assert.deepEqual(savedMarkers().map((pin:Row) => pin.name), ['1. Market gate · Boarding and alighting']);
  const overlay=ui.nodes().find(n=>n.type==='LeafletMap').props.fieldReview;
  assert.equal(overlay.pins.find((p:Row)=>p.id==='saved:gate').role,'Curb');
  overlay.onSelect('saved:gate');
  assert.equal(ui.control('Input','Stop name').value,'Market gate');
  ui.tap('Back to Route 1 review');
  ui.select('Preview direction','inbound');
  assert.deepEqual(savedMarkers().map((pin:Row) => pin.id), ['saved:return']);
  assert.deepEqual(ui.control('Select','Edit approved curb').options, [{value:'saved:return',label:'1. Market return · Alighting only'}]);
  ui.select('Edit approved curb','saved:return');
  assert.equal(ui.control('Input','Stop name').value,'Market return');
  ui.tap('Back to Route 1 review');
  ui.select('Preview alignment','buendia_2022');
  assert.deepEqual(savedMarkers(),[]);
  rows.routes[1].is_archived = true;
  ui.tap('Refresh Route 1'); await setImmediate();
  ui.select('Preview alignment',variant);
  assert.ok(ui.nodes().includes('Archived · out of service'));
  assert.deepEqual(savedMarkers(),[]);
  ui.select('Preview direction','outbound');
  assert.ok(ui.nodes().includes('In service'));
  assert.deepEqual(savedMarkers().map((pin:Row) => pin.id), ['saved:gate']);
});

test('bridge and school centers cannot become a new curb, even after manual confirmation', async () => {
  const variant = 'buendia_2022';
  for (const id of ['bridge','school']) {
    const pin = pins.find(p => p.id === id)!;
    const calls: Row[] = [];
    const rows: Catalog = { routes: [{id:outbound,name:'Outbound',route1_variant:variant},
      {id:inbound,name:'Return',route1_variant:variant}], terminals:[] };
    const ui = await mount(rows,async (_name,args) => {calls.push(args);return {data:'approved'};},true);
    ui.select('Reference pin',id); ui.select('Stop on this direction','new'); ui.tap('Review new curb');
    ui.fill('Location source (HTTPS)',operator); ui.select('Passenger use decision','both'); ui.fill('Passenger use source (HTTPS)',operator);
    ui.fill('Curbside latitude',pin.point.latitude.toFixed(6)); ui.fill('Curbside longitude',pin.point.longitude.toFixed(6));
    ui.toggle('Verified against the source',true); ui.tap('Save stop'); await setImmediate();
    assert.equal(calls.length,0);
    assert.ok(ui.nodes().some(n=>typeof n==='string' && n.includes('landmark center')));
    ui.toggle('Place curb on map',true);
    ui.map().onPickCurb({latitude:pin.point.latitude+0.0002,longitude:pin.point.longitude});
    assert.equal(ui.control('Switch','Verified against the source').value,false);
    ui.toggle('Verified against the source',true); ui.tap('Save stop'); await setImmediate();
    assert.equal(calls.length,1);
    assert.equal(calls[0].p_data.expected_route1_variant,variant);
  }
});

test('duplicate directional curb is rejected and a stale Route 1 variant requires reopening the stop', async () => {
  const variant = 'buendia_2022';
  const rows: Catalog = {routes:[{id:outbound,name:'Outbound',route1_variant:variant},{id:inbound,name:'Return',route1_variant:variant}],
    terminals:[{id:'existing',route_id:outbound,name:'Curb',...curb,sequence_order:1,location_source_url:operator,location_verified_at:'2025-01-01'}]};
  const calls:Row[]=[];
  const ui=await mount(rows,async (_name,args)=>{
    calls.push(args);rows.routes.forEach(r=>r.route1_variant='one_ayala_2026');
    return {error:{code:'40001',message:'Route 1 changed.'}};
  },true);
  ui.select('Reference pin','jupiter');ui.select('Stop on this direction','new');ui.tap('Review new curb');
  ui.fill('Location source (HTTPS)',operator);ui.toggle('Place curb on map',true);ui.map().onPickCurb(curb);
  ui.toggle('Verified against the source',true);ui.tap('Save stop');await setImmediate();
  assert.equal(calls.length,0);
  assert.ok(ui.nodes().some(n=>typeof n==='string' && n.includes('curb already exists')));
  ui.tap('Back and refresh directory');await setImmediate();
  ui.select('Stop on this direction','existing');ui.tap('Review existing curb');ui.select('Passenger use decision','board');
  ui.fill('Passenger use source (HTTPS)',operator);ui.toggle('Verified against the source',true);ui.tap('Save stop');await setImmediate();
  assert.equal(calls[0].p_data.expected_route1_variant,variant);
  assert.equal(ui.control('Button','Save stop').disabled,true);
  ui.tap('Back and refresh directory');await setImmediate();
  assert.ok(ui.nodes().includes(variants[1].label));
  assert.equal(ui.control('Select','Preview alignment').value,'buendia_2022');
});

test('edited stop retry shows the server conflict and lets the supervisor inspect the saved stop', async () => {
  const route = randomUUID(), stop = randomUUID();
  const rows: Catalog = { routes: [{ id: route, name: 'Market route' }], terminals: [] };
  const calls: Array<[string, Row]> = [];
  const message = 'This request was already used with different data.';
  const ui = await mount(rows, async (name, args) => {
    calls.push([name, args]);
    if (calls.length === 1) {
      rows.terminals.push({ ...args.p_data, route_id: route, id: stop });
      return { error: { code: '', message: 'Response lost' } };
    }
    return { error: { code: '22023', message } };
  });
  ui.tap('Add stop'); ui.fill('Stop name', 'Original gate');
  ui.fill('Curbside latitude', '14.5'); ui.fill('Curbside longitude', '121');
  ui.fill('Location source (HTTPS)', 'https://example.invalid/pin'); ui.toggle('Verified against the source', true);
  ui.tap('Save stop'); await setImmediate();
  ui.fill('Stop name', 'Edited gate'); ui.toggle('Verified against the source', true);
  ui.tap('Save stop'); await setImmediate();
  assert.equal(calls.length, 2);
  const [rpc, first] = calls[0];
  assert.equal(rpc, 'supervisor_create_catalog_item');
  assert.deepEqual([first.p_request_id, first.p_kind, first.p_route_id], [ui.draftIds[0], 'stop', route]);
  assert.deepEqual(calls[1], [rpc, { ...first, p_data: { ...first.p_data, name: 'Edited gate' } }]);
  assert.ok(ui.nodes().includes(message));
  assert.equal(ui.changes(), 0);
  ui.tap('Back and refresh directory'); await setImmediate();
  assert.equal(ui.control('Select', 'Route').value, route);
  ui.tap('Edit stop');
  assert.equal(ui.control('Input', 'Stop name').value, 'Original gate');
  ui.tap('Back to route directory'); ui.tap('Add stop');
  assert.equal(ui.draftIds.length, 2);
  assert.notEqual(ui.draftIds[0], ui.draftIds[1]);
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
