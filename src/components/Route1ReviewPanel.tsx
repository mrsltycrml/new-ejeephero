import React, { useRef, useState } from 'react';
import { Linking, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { RouteData, TerminalData } from '../services/offlineTransitService';
import { ROUTE1_INBOUND_ID, ROUTE1_OUTBOUND_ID, route1Pins, route1Variants } from '../services/route1FieldMap';
import { https } from '../services/supervisorCatalogForm';
import { activeRoute, confirmedPassengerUse, passengerUseLabel } from '../services/routeMap';
import { PassengerSelect, passengerStyles as s } from './PassengerUI';
import Route1ReviewMap from './Route1ReviewMap';

type Variant = (typeof route1Variants)[number];
export type FieldPin = (typeof route1Pins)[number];
export type ReviewSelection = { variantId?: Variant['id']; direction: 'outbound' | 'inbound'; pinId: string | null };

export function route1Direction(id: string) {
  return id === ROUTE1_OUTBOUND_ID ? 'outbound' : id === ROUTE1_INBOUND_ID ? 'inbound' : null;
}
export function previewVariant(id?: string | null) {
  return route1Variants.find(v => v.id === id) ?? route1Variants[0];
}
export function variantPins(id: Variant['id'], direction: ReviewSelection['direction']) {
  return route1Pins.filter(p => (!p.variantId || p.variantId === id) && (!p.direction || p.direction === direction));
}

export function savedCurbPin(stop: TerminalData, direction: ReviewSelection['direction']): FieldPin {
  return {
    id: 'saved:' + stop.id, name: `${stop.sequence_order}. ${stop.name} · ${passengerUseLabel(stop)}`,
    point: { latitude: stop.latitude, longitude: stop.longitude }, kind: 'curb', direction,
    source: stop.location_source_url ?? '', note: 'Current catalog position',
  };
}

export default function Route1ReviewPanel({ routes, stops, selection, onChange, onEdit, onRefresh, onBack, loading, notice }: {
  routes: RouteData[]; stops: TerminalData[]; selection: ReviewSelection; onChange: (s: ReviewSelection) => void;
  onEdit: (route: RouteData, stop?: TerminalData, reference?: FieldPin) => void;
  onRefresh: (changed: boolean) => Promise<void>; onBack: () => void; loading: boolean; notice: string;
}) {
  const [source, setSource] = useState('');
  const [checked, setChecked] = useState({ outbound: false, inbound: false });
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const outbound = routes.find(r => r.id === ROUTE1_OUTBOUND_ID);
  const inbound = routes.find(r => r.id === ROUTE1_INBOUND_ID);
  const activeId = outbound?.route1_variant ?? null;
  const consistent = !!outbound && (inbound ? activeId !== null && inbound.route1_variant === activeId : activeId === null);
  const variant = previewVariant(selection.variantId ?? activeId);
  const activeLabel = route1Variants.find(v => v.id === activeId)?.label ?? activeId ?? 'No alignment confirmed';
  const { direction, pinId } = selection;
  const route = direction === 'outbound' ? outbound : inbound;
  const selectedAlignment = consistent && activeId === variant.id;
  const active = selectedAlignment && !!route && activeRoute(route);
  const bothInService = selectedAlignment && !!outbound && !!inbound && activeRoute(outbound) && activeRoute(inbound);
  const pins = variantPins(variant.id,direction);
  const pin = pins.find(p => p.id === pinId);
  const directionStops = stops.filter(t => t.route_id === route?.id);
  const saved = active ? directionStops.filter(t => confirmedPassengerUse(t)).map(stop => ({
    stop, pin: savedCurbPin(stop, direction),
  })) : [];
  const matched = direction === 'outbound' && pin?.existingStopId
    ? directionStops.find(t => t.id === pin.existingStopId) : undefined;
  const chosen = directionStops.find(t => t.id === (target || matched?.id));
  const locked = saving || loading;
  const canActivate = !bothInService && consistent && checked.outbound && checked.inbound && https(source.trim()) && !needsRefresh;
  function review(next: ReviewSelection) {
    if (pending.current || loading) return;
    setTarget(''); setMessage(''); onChange(next);
  }
  function clearChecks() { setChecked({outbound:false, inbound:false}); }
  function selectMapPin(id: string) {
    if (locked || pending.current) return;
    const curb = saved.find(entry => entry.pin.id === id);
    if (curb && route) onEdit(route, curb.stop);
    else if (pins.some(p => p.id === id)) review({ variantId: variant.id, direction, pinId: id });
  }
  async function reload() {
    clearChecks(); setMessage(''); setTarget(''); setNeedsRefresh(false); await onRefresh(needsRefresh);
  }
  async function activate() {
    if (pending.current || locked || !canActivate) return;
    pending.current = true; setSaving(true); setMessage('');
    try {
      const {error} = await supabase.rpc('supervisor_activate_route1', { p_variant:variant.id, p_expected_variant:activeId,
        p_outbound:variant.outbound, p_inbound:variant.inbound, p_source_url:source.trim() });
      if (error) throw new Error(['22023','42501','40001','55000'].includes(error.code) ? error.message : 'Activation could not be confirmed.');
      clearChecks(); setSource(''); setTarget(''); await onRefresh(true);
      setMessage('Route 1 activation saved. Review the passenger stops for each direction.');
    } catch (cause) {
      clearChecks(); setNeedsRefresh(true);
      setMessage(`${cause instanceof Error ? cause.message : 'Activation could not be confirmed.'} Refresh Route 1 before trying again.`);
    } finally { pending.current=false; setSaving(false); }
  }
  function button(label: string, press: () => void, disabled = false) {
    return <TouchableOpacity accessibilityRole="button" disabled={locked || disabled} accessibilityState={{disabled:locked || disabled}}
      onPress={press} style={[s.button,(locked || disabled) && {opacity:0.55}]}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
  }
  return <ScrollView style={s.screen} contentContainerStyle={[s.content,{maxWidth:800}]} keyboardShouldPersistTaps="handled">
    {button('Back',onBack)}
    <Text accessibilityRole="header" style={s.title}>Route 1 review</Text>
    <View style={s.section}>
      <Text style={s.label}>Confirmed alignment</Text><Text style={s.body}>{!consistent ? 'Paired route records unavailable or inconsistent. Refresh the directory.'
        : activeLabel}</Text>
      <PassengerSelect label="Preview alignment" value={variant.id} disabled={locked} options={route1Variants.map(v=>({value:v.id,label:v.label}))}
        onSelect={id=>{ const v=route1Variants.find(item=>item.id===id); if(v){clearChecks();setSource('');review({...selection,variantId:v.id,pinId:null});} }}/>
      <PassengerSelect label="Preview direction" value={direction} disabled={locked}
        options={[{value:'outbound',label:'Outbound toward City Hall'},{value:'inbound',label:'Return from City Hall'}]}
        onSelect={v=>{if(v==='outbound'||v==='inbound')review({variantId:variant.id,direction:v,pinId:null});}}/>
      <Text style={s.label}>{active ? 'Active alignment' : 'Preview only'}</Text>
      <Text style={s.muted}>{direction === 'outbound' ? 'Current outbound service' : 'Current return service'} · {route
        ? activeRoute(route) ? 'In service' : route.is_archived ? 'Archived · out of service' : 'Out of service'
        : 'No route record'}</Text>
      {variant.id === 'buendia_2022' && <Text style={s.muted}>The archived return path doubles back on Jupiter after reaching Buendia. Check both directions before activation.</Text>}
      <Route1ReviewMap variant={variant} direction={direction} pins={[...pins, ...saved.map(entry => entry.pin)]}
        selectedPinId={pin?.id ?? null} onSelectPin={selectMapPin}/>
      {active && (saved.length
        ? <PassengerSelect label="Edit approved curb" value="" disabled={locked} onSelect={selectMapPin}
            options={saved.map(({pin: curb}) => ({ value: curb.id, label: curb.name }))}/>
        : <Text style={s.muted}>No approved passenger curbs on this direction.</Text>)}
      <PassengerSelect label="Reference pin" value={pin?.id ?? ''} disabled={locked} options={pins.map(p=>({value:p.id,label:p.name}))}
        onSelect={id=>review({variantId:variant.id,direction,pinId:id})}/>
      {pin && <>
        <Text style={s.label}>{pin.name}</Text><Text style={s.body}>{pin.note}</Text>
        <Text style={s.muted}>{pin.kind==='landmark'?'Landmark':'Platform candidate'} · {pin.point.latitude}, {pin.point.longitude}</Text>
        <TouchableOpacity accessibilityRole="link" onPress={()=>void Linking.openURL(pin.source)}><Text style={s.link}>View pin source</Text></TouchableOpacity>
        {active && route ? <>
          <PassengerSelect label="Stop on this direction" value={target || matched?.id || ''} disabled={locked}
            options={[...directionStops.map(t=>({value:t.id,label:`${t.sequence_order}. ${t.name}`})),...(!matched?[{value:'new',label:'Add a distinct stop'}]:[])]} onSelect={setTarget}/>
          {chosen && <Text style={s.muted}>Current passenger use · {passengerUseLabel(chosen)}</Text>}
          {button(chosen?'Review existing curb':'Review new curb',()=>onEdit(route,chosen,pin),!chosen && target!=='new')}
        </> : <Text style={s.muted}>Activate this alignment to review its operational stops.</Text>}
      </>}
    </View>
    {!bothInService && <View style={s.section}>
      <Text accessibilityRole="header" style={s.sectionTitle}>Activate both directions</Text>
      <Text style={s.body}>Activation replaces both operational paths and clears previous stop approvals when the alignment changes.</Text>
      <Text style={s.label}>Operator source for activation (HTTPS)</Text>
      <TextInput accessibilityLabel="Operator source for activation (HTTPS)" value={source} editable={!locked} autoCapitalize="none" keyboardType="url"
        style={s.input} onChangeText={v=>{setSource(v);clearChecks();}}/>
      <View style={s.row}><Switch accessibilityLabel={`Verified ${direction} path`} disabled={locked} value={checked[direction]}
        onValueChange={v=>setChecked(prev=>({...prev,[direction]:v}))}/><Text style={[s.body,{flex:1}]}>I verified this {direction} path against the operator source.</Text></View>
      <Text style={s.muted}>Outbound {checked.outbound?'checked':'pending'} · Return {checked.inbound?'checked':'pending'}</Text>
      {button(saving?'Activating…':'Activate both directions',()=>void activate(),!canActivate)}
    </View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text>}
    {button('Refresh Route 1',()=>void reload())}
  </ScrollView>;
}
