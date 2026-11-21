import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { realRows } from '../utils/realData';
import type { RouteData, TerminalData } from '../services/offlineTransitService';
import { routeChanges, routeForm, stopChanges, stopForm } from '../services/supervisorCatalogForm';
import { verifiedStop } from '../services/routeMap';
import { PassengerSelect, passengerStyles as s } from './PassengerUI';
import RouteLineEditor from './RouteLineEditor';

type Catalog = { routes: RouteData[]; stops: TerminalData[] };
type Draft = { kind: 'route'; original?: RouteData; form: ReturnType<typeof routeForm> }
  | { kind: 'stop'; original?: TerminalData; initial: ReturnType<typeof stopForm>; form: ReturnType<typeof stopForm> };
type Retire = { kind: 'route' | 'stop'; id: string; name: string };

async function currentRows<T>(table: 'routes' | 'terminals') {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(start, start + 499);
    if (error || !data) throw new Error('The route directory could not load. Check your connection and refresh.');
    rows.push(...realRows(data) as T[]);
    if (data.length < 500) return rows;
  }
}

export default function SupervisorRouteManager({ onBack, onChanged }: { onBack: () => void; onChanged: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [id, setId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
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
      setCatalog({ routes, stops: allStops.filter(t => t.is_active !== false && !t.deleted_at).sort((a,b) => a.sequence_order - b.sequence_order) });
      setId(old => routes.find(r => r.id === (preferred ?? old))?.id ?? routes[0]?.id ?? '');
    } catch (cause) {
      if (request === version.current) { setCatalog(null); setError(cause instanceof Error ? cause.message : 'Route directory unavailable.'); }
    } finally { if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { version.current++; }; }, [refresh]);
  const route = catalog?.routes.find(r => r.id === id);
  const stops = catalog?.stops.filter(t => t.route_id === id) ?? [];
  const locked = busy || loading;
  function edit(next: Draft | null) { setDraft(next); setRetire(null); setVerified(false); setError(''); setNotice(''); }
  function editStop(stop?: TerminalData) {
    const position = stop ? stops.findIndex(t => t.id === stop.id) + 1 : stops.length + 1;
    const initial = stopForm(position, stop);
    edit({ kind: 'stop', original: stop, initial, form: initial });
  }
  async function submit() {
    if (pending.current || locked) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      let rpc: string, args: Record<string, unknown>, message: string;
      let nextId = id;
      if (retire) {
        rpc = retire.kind === 'route' ? 'supervisor_retire_route' : 'supervisor_retire_stop';
        args = retire.kind === 'route' ? { p_route_id: retire.id } : { p_stop_id: retire.id };
        message = `${retire.name} retired.`;
      } else if (draft?.kind === 'route') {
        const data = routeChanges(draft.form, draft.original);
        if (!Object.keys(data).length) { setNotice('No changes to save.'); return; }
        rpc = 'supervisor_save_route'; args = { p_route_id: draft.original?.id ?? null, p_data: data };
        message = 'Route saved.';
      } else if (draft?.kind === 'stop' && route) {
        const data = stopChanges(draft.form, draft.initial, !draft.original, stops.length + (draft.original ? 0 : 1), verified,
          !!draft.original && !verifiedStop(draft.original));
        if (!Object.keys(data).length) { setNotice('No changes to save.'); return; }
        rpc = 'supervisor_save_stop'; args = { p_route_id: route.id, p_stop_id: draft.original?.id ?? null, p_data: data };
        message = 'Stop saved.';
      } else return;
      const result = await supabase.rpc(rpc, args);
      if (result.error) throw new Error(result.error.code === '22023' || result.error.code === '42501' ? result.error.message :
        'Could not confirm the change. Refresh the directory before trying again.');
      if (rpc === 'supervisor_save_route' && typeof result.data === 'string') nextId = result.data;
      setDraft(null); setRetire(null); setNotice(message);
      await refresh(nextId); void onChanged();
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
  if (lineOpen && route) return <RouteLineEditor key={route.id} routes={[route]} initialRouteId={route.id}
    onBack={() => setLineOpen(false)} onPublished={async () => { await refresh(id); await onChanged(); }} />;
  return <ScrollView key={draft?.kind ?? 'list'} style={s.screen} contentContainerStyle={[s.content, { maxWidth: 720 }]} keyboardShouldPersistTaps="handled">
    {button(draft || retire ? 'Back to route directory' : 'Back to fleet', () => draft || retire ? edit(null) : onBack())}
    <Text accessibilityRole="header" style={s.title}>{draft ? `${draft.original ? 'Edit' : 'Add'} ${draft.kind}` : 'Manage routes and stops'}</Text>
    {draft?.kind === 'route' && <View style={s.section}>
      {([['name','Route name and direction'],['description','Description'],['operating_hours','Verified operating hours (optional)'],['color_code','Map color']] as const)
        .map(([k,label]) => field(k,label,draft.form[k],v=>setDraft({ ...draft, form: { ...draft.form, [k]: v } })))}
      <View style={s.row}><Switch accessibilityLabel="Coming soon" disabled={busy} value={draft.form.is_coming_soon}
        onValueChange={v=>setDraft({ ...draft, form: { ...draft.form, is_coming_soon: v } })} /><Text style={s.label}>Coming soon</Text></View>
      <Text style={s.muted}>Keep this on while preparing a route. Switch it off when the route enters service.</Text>
    </View>}
    {draft?.kind === 'stop' && <View style={s.section}>
      <Text style={s.sectionTitle}>{route?.name}</Text>
      {([['name','Stop name'],['sequence_order','Position in travel order'],['latitude','Curbside latitude'],['longitude','Curbside longitude'],
        ['location_source_url','Location source (HTTPS)'],['landmark_desc','Landmark description (optional)'],['boarding_side','Boarding side (optional)'],['travel_direction','Travel direction (optional)'],
        ['entrance_instructions','Entrance instructions (optional)'],['stop_details_source_url','Boarding details source (HTTPS)']] as const)
        .map(([k,label]) => field(k,label,draft.form[k],v=>{ setDraft({ ...draft, form: { ...draft.form, [k]: v } }); setVerified(false); },
          ['sequence_order','latitude','longitude'].includes(k)))}
      <View style={s.row}><Switch accessibilityLabel="Verified against the source" disabled={busy} value={verified} onValueChange={setVerified} />
        <Text style={[s.body,{flex:1}]}>I checked the location and any updated boarding details against their sources.</Text></View>
    </View>}
    {draft && button(busy ? 'Saving…' : `Save ${draft.kind}`, () => void submit(), true, loading)}
    {retire && <View style={s.section}><Text style={s.sectionTitle}>Retire {retire.name}?</Text>
      <Text style={s.body}>It will disappear from passenger planning. Existing trip records are kept.</Text>
      {button(`Confirm retire ${retire.kind}`, () => void submit(), true, loading)}{button('Cancel', () => edit(null))}</View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}
    {!draft && !retire && <>
      {loading && <Text style={s.muted}>Loading route directory…</Text>}
      {catalog && <View style={s.section}>
        {button('Add route', () => edit({ kind:'route', form:routeForm() }), true, locked)}
        {catalog.routes.length > 0 ? <PassengerSelect label="Route" value={id} disabled={locked}
          options={catalog.routes.map(r=>({ value:r.id,label:r.name + (r.is_coming_soon ? ' · Coming soon' : '') }))}
          onSelect={v=>{ setId(v); setNotice(''); setError(''); }} /> : <Text style={s.muted}>No current routes.</Text>}
        {route && <>{button('Edit route',()=>edit({kind:'route',original:route,form:routeForm(route)}),false,locked)}
          {button('Set verified route line',()=>setLineOpen(true),false,locked || !!route.is_coming_soon)}
          {route.is_coming_soon && <Text style={s.muted}>Publish the route line after marking the route in service.</Text>}
          {button('Retire route',()=>confirmRetire({kind:'route',id:route.id,name:route.name}),false,locked)}</>}
      </View>}
      {route && <View style={s.section}><Text accessibilityRole="header" style={s.sectionTitle}>Stops in travel order</Text>
        {button('Add stop',()=>editStop(),true,locked)}
        {!stops.length && <Text style={s.muted}>No current stops on this route.</Text>}
        {stops.map((t,i)=><View key={t.id} style={{gap:6}}><View style={s.divider}/><Text style={s.label}>{i+1}. {t.name}</Text>
          <Text style={s.muted}>{verifiedStop(t) ? 'Location verified' : 'Location verification needed'}</Text>
          <View style={s.row}>{button('Edit stop',()=>editStop(t),false,locked)}
            {button('Retire stop',()=>confirmRetire({kind:'stop',id:t.id,name:t.name}),false,locked)}</View>
        </View>)}</View>}
      {button('Refresh directory',()=>void refresh(),false,locked)}
    </>}
  </ScrollView>;
}
