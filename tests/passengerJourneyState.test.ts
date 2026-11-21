import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

let states: any[] = [], refs: any[] = [], index = 0, refIndex = 0;
let mounted=false, hook=0;
const hooksState:any[]=[];
let afterRender:Array<()=>void>=[];
function memo(fn:()=>any,deps:any[]) {
  if (!mounted) return fn();
  const i=hook++, old=hooksState[i];
  if (!old || deps.some((v,j)=>v!==old.deps[j])) hooksState[i]={deps,value:fn()};
  return hooksState[i].value;
}
const react = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  createContext: () => ({ Provider: 'JourneyProvider' }), useContext: () => null,
  useState(initial: any) { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
  useRef(initial: any) { return refs[refIndex++] ??= { current: initial }; },
  useCallback: (fn:any,deps:any[])=>memo(()=>fn,deps), useMemo:memo,
  useEffect: (fn:()=>any,deps:any[])=>{
    if (!mounted) return;
    const i=hook++,old=hooksState[i];
    if (!old || deps.some((v,j)=>v!==old.deps[j])) afterRender.push(()=>{
      old?.cleanup?.();hooksState[i]={deps,cleanup:fn()};
    });
  },
};
const route = { id: 'r', name: 'Fixture route', coordinates: [] };
const stops = ['a', 'b', 'c'].map((id, sequence_order) => ({ id, name: id, route_id: 'r', sequence_order, latitude: 14.5, longitude: 121 + sequence_order / 1000,
  location_source_url: 'https://operator.example/stops', location_verified_at: '2026-01-01',
  passenger_use: 'both', passenger_use_source_url: 'https://operator.example/permissions', passenger_use_verified_at: '2026-01-01' }));
const catalog = { routes: [route], terminals: stops, status: 'ready', syncedAt: '2026-11-18T00:00:00Z', isFromCache: false, latencyMs: 0, error: null };
let read: () => Promise<any> = async () => catalog;
let liveRoutes = new Set<string>(), fleet:any[]=[], device:any=null;
Object.assign(globalThis, { __journeyReact: react, __journeyRead: () => read(), __journeyRoutes:()=>new Set(liveRoutes),
  __journeyFleet:()=>fleet, __journeyLocation:()=>device });
const fixtures: Record<string, string> = {
  react: 'const r=globalThis.__journeyReact; export default r; export const {createContext,useContext,useState,useRef,useCallback,useMemo,useEffect}=r;',
  './AuthContext': 'export const useAuth=()=>({user:{id:"passenger"}});',
  './NetworkContext': 'export const useNetwork=()=>({isConnected:true});',
  './LocationContext': 'export const useLocation=()=>({location:globalThis.__journeyLocation(),errorMsg:null,foreground:true});',
  '/services/offlineTransitService': 'export const offlineTransit={getTransitData:()=>globalThis.__journeyRead(),getInServiceRouteIds:async()=>globalThis.__journeyRoutes(),getVehicles:async()=>globalThis.__journeyFleet()};',
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const key = Object.keys(fixtures).find(key => specifier === key || specifier.endsWith(key));
    if (key) return { url: 'data:text/javascript,' + encodeURIComponent(fixtures[key]), shortCircuit: true };
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/PassengerJourneyContext.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { PassengerJourneyProvider } = await import('../src/contexts/PassengerJourneyContext.tsx');
hooks.deregister();
const render = () => { index = 0; refIndex = 0; hook=0;afterRender=[];return PassengerJourneyProvider({ children: null }).props.value; };
const path = { id: 'p', source: 'Fixture', coordinates: stops.slice(0, 2), distance_meters: 120, duration_seconds: 90, steps: [], source_url: 'https://operator.example/walk', verified_at: '2026-01-01', accessible: null };

test('passenger map, nearby matches and a confirmed ride lose an off-catalog unit on refresh',async t=>{
  states=[];refs=[];mounted=true;read=async()=>catalog;liveRoutes=new Set(['r','unlisted']);
  const now=Date.now(), point={latitude:14.5,longitude:121,accuracy:4};
  t.mock.timers.enable({apis:['Date','setInterval'],now});
  device={coords:point,timestamp:now};
  fleet=['r','upcoming','unlisted'].map(id=>({...point,id,vehicle_id:id,route_id:id,body_number:id,plate_number:'TEST',recorded_at:new Date(now).toISOString()}));
  async function settle(){
    for(let i=0;i<3;i++){render();afterRender.forEach(fn=>fn());await setImmediate();}
    return render();
  }
  try{
    let journey=await settle();
    assert.deepEqual(journey.vehicles.map((v:any)=>v.id),['r']);
    assert.deepEqual(journey.nearby.map((v:any)=>v.id),['r']);
    journey.setUnit(fleet[1]);assert.equal(render().unit,null);
    journey.setUnit(fleet[0]);assert.equal(render().unit.vehicle_id,'r');
    liveRoutes.clear();t.mock.timers.tick(5000);await setImmediate();journey=await settle();
    assert.deepEqual(journey.vehicles,[]);assert.deepEqual(journey.nearby,[]);assert.equal(journey.unit,null);
    liveRoutes.add('r');t.mock.timers.tick(5000);await setImmediate();journey=await settle();
    assert.equal(journey.unit,null);
  }finally{
    hooksState.forEach(slot=>slot?.cleanup?.());hooksState.length=0;mounted=false;device=null;fleet=[];t.mock.timers.reset();
  }
});

test('applying a walking choice preserves its path after boarding changes and refresh clears obsolete choices', async () => {
  states = []; refs = []; read = async () => catalog;
  await render().refreshTransit();
  let journey = render(); journey.setSelectedRouteId('r');
  journey = render(); journey.setBoardingStop(stops[0]); journey.setAlightingStop(stops[2]);
  journey = render(); journey.setBoardingStop(stops[1]); journey.showWalk(path, 'a', 'b');
  journey = render();
  assert.equal(journey.boardingStop.id, 'b');
  assert.equal(journey.alightingStop.id, 'c');
  assert.equal(journey.walk.fromLabel, 'a');
  assert.deepEqual(journey.walkingRoutes[0].coordinates, path.coordinates);
  const pendingVersion = journey.getJourneyVersion();
  journey.setDestinationPlace({ id: 'place', name: 'New destination', latitude: 14.6, longitude: 121 });
  assert.equal(journey.showWalk(path, 'Old origin', 'Old destination', pendingVersion), false, 'an old request cannot restore a cleared path before React renders');
  assert.equal(render().walk, null);
  read = async () => ({ ...catalog, terminals: [stops[0]], syncedAt: '2026-11-18T00:01:00Z' });
  await journey.refreshTransit(); journey = render();
  assert.equal(journey.boardingStop, null); assert.equal(journey.alightingStop, null);
  assert.equal(journey.walk, null); assert.deepEqual(journey.walkingRoutes, []);
});

test('a slower old catalog refresh cannot restore records removed by a newer successful read', async () => {
  states = []; refs = [];
  const resolves: Array<(value: any) => void> = [];
  read = () => new Promise(resolve => resolves.push(resolve));
  const journey = render(), old = journey.refreshTransit(), latest = journey.refreshTransit();
  resolves[1]({ ...catalog, routes: [], terminals: [] }); await latest;
  resolves[0](catalog); await old;
  assert.deepEqual(render().transit.routes, []);
});

test('catalog refresh revokes a selected boarding role and its walk while keeping the valid exit', async () => {
  states = []; refs = []; read = async () => catalog;
  await render().refreshTransit();
  render().setRideStops(stops[0], stops[2]);
  const oldChoice = render().setBoardingStop;
  render().showWalk(path, 'a', 'b');
  const version = render().getJourneyVersion();
  read = async () => ({ ...catalog, terminals: [{ ...stops[0], passenger_use: 'alight' }, ...stops.slice(1)] });
  await render().refreshTransit();
  const journey = render();
  assert.equal(journey.boardingStop, null); assert.equal(journey.alightingStop.id, 'c');
  assert.equal(journey.walk, null);
  assert.equal(journey.showWalk(path, 'a', 'b', version), false);
  oldChoice(stops[0]); assert.equal(render().boardingStop, null);
});

test('using a suggested pair replaces both stops together and keeps the final destination', async () => {
  states = []; refs = []; read = async () => catalog;
  await render().refreshTransit();
  const place = { id: 'place', name: 'Final destination', latitude: 14.5, longitude: 121.003 };
  let journey = render();
  journey.setDestinationPlace(place);
  journey.setRideStops(stops[0], stops[1]);
  journey = render();
  journey.showWalk(path, 'a', 'b');
  journey.setRideStops(stops[1], stops[2]);
  journey = render();
  assert.equal(journey.boardingStop.id, 'b');
  assert.equal(journey.alightingStop.id, 'c');
  assert.equal(journey.selectedRouteId, 'r');
  assert.equal(journey.destinationPlace, place);
  assert.equal(journey.walk, null);
  journey.setRideStops(stops[2], stops[0]);
  assert.equal(render().boardingStop.id, 'b');
  assert.equal(render().alightingStop.id, 'c');
});
