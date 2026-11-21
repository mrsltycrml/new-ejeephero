import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { realRows } from '../utils/realData';
import type { RouteData, TerminalData } from '../services/offlineTransitService';
import { matchingRoute, routeChanges, routeForm, stopChanges, stopForm } from '../services/supervisorCatalogForm';
import { validPoint } from '../services/locationQuality';
import { meters } from '../services/passengerJourney';
import Route1ReviewPanel, { previewVariant, route1Direction, savedCurbPin, variantPins, type FieldPin, type ReviewSelection } from './Route1ReviewPanel';
import Route1ReviewMap from './Route1ReviewMap';
import { confirmedPassengerUse, passengerUseLabel, verifiedStop } from '../services/routeMap';
import { PassengerSelect, passengerStyles as s } from './PassengerUI';
import RouteLineEditor from './RouteLineEditor';

type Catalog = { routes: RouteData[]; route1: RouteData[]; stops: TerminalData[] };
type DraftTarget<T> = { original: T } | { original?: undefined; requestId: string };
type Draft = (DraftTarget<RouteData> & { kind: 'route'; form: ReturnType<typeof routeForm> })
  | (DraftTarget<TerminalData> & { kind: 'stop'; initial: ReturnType<typeof stopForm>; form: ReturnType<typeof stopForm>;
      expectedVariant?: string | null; referenceId?: string });
type Retire = { kind: 'route' | 'stop'; id: string; name: string };

function newRouteDraft(): Draft {
  return { kind: 'route', requestId: randomUUID(), form: routeForm() };
}

async function currentRows<T>(table: 'routes' | 'terminals') {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(start, start + 499);
    if (error || !data) throw new Error('The route directory could not load. Check your connection and refresh.');
    rows.push(...realRows(data) as T[]);
    if (data.length < 500) return rows;
  }
}

export default function SupervisorRouteManager({ onBack, onChanged, initialPage = 'list' }: { onBack: () => void; onChanged: () => Promise<void>; initialPage?: 'list' | 'add' | 'route1' }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [id, setId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(() => initialPage === 'add' ? newRouteDraft() : null);
  const [review, setReview] = useState<ReviewSelection | null>(initialPage === 'route1' ? {direction:'outbound',pinId:null} : null);
  const [placingCurb,setPlacingCurb] = useState(false);
  const [requiresRefresh,setRequiresRefresh] = useState(false);
  const [retire, setRetire] = useState<Retire | null>(null);
  const [lineOpen, setLineOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const version = useRef(0);
  const refresh = useCallback(async (preferred?: string) => {
    const request = ++version.current;
    setLoading(true); setError('');
    try {
      const [allRoutes, allStops] = await Promise.all([currentRows<RouteData>('routes'), currentRows<TerminalData>('terminals')]);
      if (request !== version.current) return;
      const routes = allRoutes.filter(r => !r.is_archived && !r.deleted_at).sort((a,b) => a.name.localeCompare(b.name));
      setCatalog({ routes, route1:allRoutes.filter(r=>route1Direction(r.id) && !r.deleted_at),
        stops: allStops.filter(t => t.is_active !== false && !t.deleted_at).sort((a,b) => a.sequence_order - b.sequence_order) });
      setId(old => routes.find(r => r.id === (preferred ?? old))?.id ?? routes[0]?.id ?? '');
    } catch (cause) {
      if (request === version.current) { setCatalog(null); setError(cause instanceof Error ? cause.message : 'Route directory unavailable.'); }
    } finally { if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { version.current++; }; }, [refresh]);
  const route = catalog?.routes.find(r => r.id === id);
  const stops = catalog?.stops.filter(t => t.route_id === id) ?? [];
  const locked = busy || loading;
  const creating = draft !== null && !draft.original;
  const duplicate = draft?.kind === 'route' && catalog
    ? matchingRoute(catalog.routes, draft.form.name, draft.original?.id) : undefined;
  function edit(next: Draft | null) { setDraft(next); setRetire(null); setVerified(false); setPlacingCurb(false); setRequiresRefresh(false); setError(''); setNotice(''); }
  function editStop(stop?: TerminalData, targetRoute=route, pin?: FieldPin) {
    if (!targetRoute) return;
    const rows = catalog?.stops.filter(t=>t.route_id===targetRoute.id) ?? [];
    const position = stop ? rows.findIndex(t => t.id === stop.id) + 1 : rows.length + 1;
    const initial = stopForm(position, stop);
    setId(targetRoute.id);
    edit({ kind: 'stop', ...(stop ? { original: stop } : { requestId: randomUUID() }), initial,
      expectedVariant: route1Direction(targetRoute.id) ? targetRoute.route1_variant ?? null : undefined,
      referenceId:pin?.id, form: !stop && pin ? {...initial,name:pin.name} : initial });
  }
  async function submit() {
    if (pending.current || locked || requiresRefresh || !catalog || duplicate) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      let rpc: string, args: Record<string, unknown>, message: string;
      let nextId = id;
      if (retire) {
        rpc = retire.kind === 'route' ? 'supervisor_retire_route' : 'supervisor_retire_stop';
        args = retire.kind === 'route' ? { p_route_id: retire.id } : { p_stop_id: retire.id };
        message = `${retire.name} retired.`;
      } else if (draft && (draft.kind === 'route' || route)) {
        const data = draft.kind === 'route' ? routeChanges(draft.form, draft.original)
          : stopChanges(draft.form, draft.initial, !draft.original, stops.length + (draft.original ? 0 : 1), verified,
              !!draft.original && !verifiedStop(draft.original));
        if (!Object.keys(data).length) { setNotice('No changes to save.'); return; }
        if (draft.kind==='stop' && draft.expectedVariant!==undefined) {
          const point={latitude:Number(draft.form.latitude),longitude:Number(draft.form.longitude)};
          const verifyingPin=!draft.original || 'location_source_url' in data || typeof data.passenger_use==='string';
          // A one-metre tolerance catches the same reference center after decimal rounding.
          if (verifyingPin && variantPins(previewVariant(draft.expectedVariant).id,route1Direction(id)!)
            .some(p=>p.kind==='landmark' && meters(p.point,point)<=1)) {
            throw new Error('This is a landmark center. Place or enter the surveyed curb before confirming this stop.');
          }
          if ((!draft.original || 'latitude' in data || 'longitude' in data) &&
            stops.some(t=>t.id!==draft.original?.id && validPoint(t) && meters(t,point)<=1)) {
            throw new Error('This curb already exists in this direction. Choose its existing stop.');
          }
          Object.assign(data,{expected_route1_variant:draft.expectedVariant});
        }
        if (!draft.original) {
          rpc = 'supervisor_create_catalog_item';
          args = { p_request_id: draft.requestId, p_kind: draft.kind, p_route_id: draft.kind === 'route' ? null : id, p_data: data };
        } else if (draft.kind === 'route') {
          rpc = 'supervisor_save_route'; args = { p_route_id: draft.original.id, p_data: data };
        } else {
          rpc = 'supervisor_save_stop'; args = { p_route_id: id, p_stop_id: draft.original.id, p_data: data };
        }
        message = draft.kind === 'route' ? 'Route saved.' : 'Stop saved.';
      } else return;
      let result;
      try { result = await supabase.rpc(rpc, args); } catch {
        if (!creating) setRequiresRefresh(true);
        throw new Error(creating ? 'The save response was lost. Retry this draft or refresh to check.' : 'The save response was lost. Refresh the directory to check.');
      }
      if (result.error || (creating && (typeof result.data !== 'string' || !result.data))) {
        if (draft?.kind === 'route' && result.error?.code === '23505') {
          await refresh();
          if (result.error.message.startsWith('This direction belongs to Route 1.')) throw new Error('This direction belongs to Route 1. Open Route 1 review.');
          throw new Error('This route already exists. Open it from the route directory.');
        }
        if (result.error?.code === '40001') { setRequiresRefresh(true); throw new Error('The directory changed. Refresh before editing this stop again.'); }
        if (result.error?.code === '22023' || result.error?.code === '42501') throw new Error(result.error.message);
        if (!creating) setRequiresRefresh(true);
        throw new Error(creating ? `Could not confirm that the ${draft.kind} was added. Retry this draft or refresh the directory to check.`
          : 'Could not confirm the change. Refresh the directory before trying again.');
      }
      if (draft?.kind === 'route' && typeof result.data === 'string') nextId = result.data;
      setDraft(null); setRetire(null); setNotice(message);
      await refresh(nextId); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm the change. Refresh to check.'); }
    finally { pending.current = false; setBusy(false); }
  }
  function button(label: string, press: () => void, primary = false, disabled = false) {
    return <TouchableOpacity accessibilityRole="button" disabled={disabled || busy} accessibilityState={{ disabled: disabled || busy }}
      onPress={press} style={[s.button, !primary && s.secondary, (busy || disabled) && { opacity: 0.55 }]}>
      <Text style={primary ? s.buttonText : s.link}>{label}</Text></TouchableOpacity>;
  }
  function field(key: string, label: string, value: string, update: (value: string) => void, numeric = false) {
    return <View key={key} style={{ gap: 4 }}><Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={update} editable={!busy} autoCapitalize="none"
        keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} style={s.input} /></View>;
  }
  function confirmRetire(next: Retire) { edit(null); setRetire(next); }
  if (review && catalog && !draft && !retire) return <Route1ReviewPanel routes={catalog.route1} stops={catalog.stops}
    selection={review} onChange={v=>{setReview(v);setNotice('');}} loading={locked} notice={notice}
    onEdit={(r,t,p)=>editStop(t,r,p)} onBack={()=>{setReview(null);setNotice('');if(initialPage==='route1')onBack();}}
    onRefresh={async changed=>{await refresh(id);if(changed)await onChanged();}}/>;
  if (lineOpen && route) return <RouteLineEditor key={route.id} routes={[route]} initialRouteId={route.id}
    onBack={() => setLineOpen(false)} onPublished={async () => { await refresh(id); await onChanged(); }} />;
  const inspectCreate = (creating && !!error) || requiresRefresh;
  const direction = route1Direction(id);
  const variant = previewVariant(draft?.kind==='stop' ? draft.expectedVariant : null);
  const mapPins: FieldPin[] = draft?.kind==='stop' && direction ? variantPins(variant.id,direction) : [];
  let originalPinId: string | undefined;
  if (draft?.kind==='stop' && draft.original && direction && validPoint(draft.original)) {
    const originalPin = savedCurbPin(draft.original, direction);
    originalPinId = originalPin.id;
    mapPins.push(originalPin);
  }
  const curb = draft?.kind==='stop' && draft.form.latitude.trim() && draft.form.longitude.trim()
    ? {latitude:Number(draft.form.latitude),longitude:Number(draft.form.longitude)} : null;
  return <ScrollView key={draft?.kind ?? 'list'} style={s.screen} contentContainerStyle={[s.content, { maxWidth: 720 }]} keyboardShouldPersistTaps="always">
    {button(inspectCreate ? 'Back and refresh directory' : draft && review ? 'Back to Route 1 review' : draft || retire ? 'Back to route directory' : 'Back to fleet', () => {
      if (!draft && !retire) return onBack();
      edit(null);
      if (inspectCreate) void refresh();
    })}
    <Text accessibilityRole="header" style={s.title}>{draft ? `${draft.original ? 'Edit' : 'Add'} ${draft.kind}` : 'Manage routes and stops'}</Text>
    {draft?.kind === 'route' && <View style={s.section}>
      {([['name','Route name and direction'],['description','Description'],['operating_hours','Verified operating hours (optional)'],['color_code','Map color']] as const)
        .map(([k,label]) => field(k,label,draft.form[k],v=>setDraft({ ...draft, form: { ...draft.form, [k]: v } })))}
      <View style={s.row}><Switch accessibilityLabel="Coming soon" disabled={busy} value={draft.form.is_coming_soon}
        onValueChange={v=>setDraft({ ...draft, form: { ...draft.form, is_coming_soon: v } })} /><Text style={s.label}>Coming soon</Text></View>
      <Text style={s.muted}>Keep this on while preparing a route. Switch it off when the route enters service.</Text>
      {duplicate && <>
        <Text accessibilityLiveRegion="polite" style={s.body}>Already in the directory · {duplicate.name}</Text>
        {button('Open existing route', () => { setId(duplicate.id); edit(null); }, false, locked)}
      </>}
    </View>}
    {draft?.kind === 'stop' && <View style={s.section}>
      <Text style={s.sectionTitle}>{route?.name}</Text>
      {direction && <>
        <Text style={s.label}>{variant.label} · {direction} curb review</Text>
        <Text style={s.muted}>Reference pins mark places to inspect. Enter surveyed coordinates or place the actual curb on the map.</Text>
        <View style={s.row}><Switch accessibilityLabel="Place curb on map" value={placingCurb} disabled={locked} onValueChange={setPlacingCurb}/>
          <Text style={s.body}>Place curb on map</Text></View>
        <Route1ReviewMap variant={variant} direction={direction} pins={mapPins} selectedPinId={draft.referenceId ?? originalPinId ?? null}
          onSelectPin={pinId=>{if(!locked && mapPins.some(p=>p.id===pinId))setDraft({...draft,referenceId:pinId});}}
          draftCurb={curb && validPoint(curb) ? curb : null}
          onPickCurb={placingCurb && !locked ? p=>{if(!validPoint(p))return;
            setDraft({...draft,form:{...draft.form,latitude:String(p.latitude),longitude:String(p.longitude)}});
            setVerified(false);setPlacingCurb(false);
          } : undefined}/>
      </>}
      {([['name','Stop name'],['sequence_order','Position in travel order'],['latitude','Curbside latitude'],['longitude','Curbside longitude'],
        ['location_source_url','Location source (HTTPS)'],['landmark_desc','Landmark description (optional)'],['boarding_side','Boarding side (optional)'],['travel_direction','Travel direction (optional)'],
        ['entrance_instructions','Entrance instructions (optional)'],['stop_details_source_url','Boarding details source (HTTPS)']] as const)
        .map(([k,label]) => field(k,label,draft.form[k],v=>{ setDraft({ ...draft, form: { ...draft.form, [k]: v } }); setVerified(false); },
          ['sequence_order','latitude','longitude'].includes(k)))}
      <Text style={s.muted}>Current passenger use · {draft.original ? passengerUseLabel(draft.original) : 'Passenger use unconfirmed'}</Text>
      {draft.original?.passenger_use_source_url && confirmedPassengerUse(draft.original) && <TouchableOpacity accessibilityRole="link"
        onPress={()=>void Linking.openURL(draft.original!.passenger_use_source_url!)}><Text style={s.link}>View current passenger use source</Text></TouchableOpacity>}
      <PassengerSelect label="Passenger use decision" value={draft.form.useAction} disabled={locked} options={[
        {value:'',label:'No new approval'},{value:'board',label:'Board only'},{value:'alight',label:'Alight only'},
        {value:'both',label:'Board and alight'},{value:'withdraw',label:'Withdraw passenger use'}]}
        onSelect={useAction=>{setDraft({...draft,form:{...draft.form,useAction,useSource:useAction?draft.form.useSource:''}});setVerified(false);}}/>
      {!!draft.form.useAction && field('useSource','Passenger use source (HTTPS)',draft.form.useSource,useSource=>{
        setDraft({...draft,form:{...draft.form,useSource}});setVerified(false);})}
      {!!draft.original?.passenger_use && <Text style={s.muted}>Changing the name, curb or boarding details clears the previous permission. Reconfirm passenger use to keep it available.</Text>}
      <View style={s.row}><Switch accessibilityLabel="Verified against the source" disabled={busy} value={verified} onValueChange={setVerified} />
        <Text style={[s.body,{flex:1}]}>I checked the curb, travel direction and any passenger use decision against their sources.</Text></View>
    </View>}
    {draft && button(busy ? 'Saving…' : `Save ${draft.kind}`, () => void submit(), true, !catalog || loading || requiresRefresh || !!duplicate)}
    {retire && <View style={s.section}><Text style={s.sectionTitle}>Retire {retire.name}?</Text>
      <Text style={s.body}>It will disappear from passenger planning. Existing trip records are kept.</Text>
      {button(`Confirm retire ${retire.kind}`, () => void submit(), true, loading)}{button('Cancel', () => edit(null))}</View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}
    {!draft && !retire && <>
      {loading && <Text style={s.muted}>Loading route directory…</Text>}
      {catalog && <View style={s.section}>
        {button('Add route', () => edit(newRouteDraft()), true, locked)}
        {catalog.routes.length > 0 ? <PassengerSelect label="Route" value={id} disabled={locked}
          options={catalog.routes.map(r=>({ value:r.id,label:r.name + (r.is_coming_soon ? ' · Coming soon' : '') }))}
          onSelect={v=>{ setId(v); setNotice(''); setError(''); }} /> : <Text style={s.muted}>No current routes.</Text>}
        {route && <>{button('Edit route',()=>edit({kind:'route',original:route,form:routeForm(route)}),false,locked)}
          {direction ? button('Review Route 1 map and stops',()=>setReview({direction,pinId:null}),false,locked)
            : button('Set verified route line',()=>setLineOpen(true),false,locked || !!route.is_coming_soon)}
          {route.is_coming_soon && <Text style={s.muted}>Publish the route line after marking the route in service.</Text>}
          {button('Retire route',()=>confirmRetire({kind:'route',id:route.id,name:route.name}),false,locked)}</>}
      </View>}
      {route && <View style={s.section}><Text accessibilityRole="header" style={s.sectionTitle}>Stops in travel order</Text>
        {button('Add stop',()=>editStop(),true,locked)}
        {!stops.length && <Text style={s.muted}>No current stops on this route.</Text>}
        {stops.map((t,i)=><View key={t.id} style={{gap:6}}><View style={s.divider}/><Text style={s.label}>{i+1}. {t.name}</Text>
          <Text style={s.muted}>{verifiedStop(t) ? 'Location verified' : 'Location verification needed'} · {passengerUseLabel(t)}</Text>
          <View style={s.row}>{button('Edit stop',()=>editStop(t),false,locked)}
            {button('Retire stop',()=>confirmRetire({kind:'stop',id:t.id,name:t.name}),false,locked)}</View>
        </View>)}</View>}
      {button('Refresh directory',()=>void refresh(),false,locked)}
    </>}
  </ScrollView>;
}
