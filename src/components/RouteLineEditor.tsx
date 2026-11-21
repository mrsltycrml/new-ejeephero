import React, { useRef, useState } from 'react';
import { Linking, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { PassengerSelect, passengerStyles as s } from './PassengerUI';
import { supabase } from '../lib/supabase';
import type { RouteData } from '../services/offlineTransitService';
import { parseVerifiedRouteLine } from '../services/routeLineImport';
import { verifiedRoute } from '../services/routeMap';

export default function RouteLineEditor({ routes, onPublished, onBack, initialRouteId = '' }: {
  routes: RouteData[]; onPublished: () => Promise<void>; onBack: () => void; initialRouteId?: string;
}) {
  const [routeId, setRouteId] = useState(initialRouteId);
  const [line, setLine] = useState('');
  const [source, setSource] = useState('');
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const route = routes.find(r => r.id === routeId);
  const verified = route && verifiedRoute(route);

  const publish = async () => {
    if (!checked || pending.current || !route) return;
    const coordinates = parseVerifiedRouteLine(line);
    if (!coordinates) { setMessage('Paste a GeoJSON LineString with 2 to 5,000 valid points.'); return; }
    const sourceUrl = source.trim();
    if (!/^https:\/\/[^\s]+$/.test(sourceUrl)) { setMessage('Enter an HTTPS link to the source of the route line.'); return; }
    pending.current = true;
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('publish_esakay_route_line', {
        p_route_id: route.id, p_coordinates: coordinates, p_source_url: sourceUrl,
      });
      if (error) {
        setMessage(error.code === '22023' ? error.message : 'Could not publish the route line. Check supervisor access and the database setup.');
        return;
      }
      setLine('');
      setSource('');
      setChecked(false);
      setMessage('Verified route line published.');
      await onPublished();
    } catch {
      setMessage('Could not finish checking the route line. Refresh to confirm its status.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 720 }]} keyboardShouldPersistTaps="handled">
    <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={onBack} style={[s.row, { minHeight: 44, alignSelf: 'flex-start' }]}>
      <Ionicons name="chevron-back" size={18} color={Colors.action} />
      <Text style={s.link}>Back to routes</Text>
    </TouchableOpacity>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.sectionTitle}>Set verified route line</Text>
      <PassengerSelect label="Route" value={routeId} disabled={saving || routes.length === 0} options={routes.map(item => ({ value: item.id, label: item.name }))}
        onSelect={id => { setRouteId(id); setMessage(''); setChecked(false); }} />
      {!!route && <Text style={s.muted}>{verified ? `Current line verified ${new Date(route.geometry_verified_at!).toLocaleDateString()}.` : 'No verified line published.'}</Text>}
      {verified && route?.geometry_source_url && <TouchableOpacity accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => void Linking.openURL(route.geometry_source_url!)}>
        <Text style={s.link}>Current route source</Text>
      </TouchableOpacity>}
      <View style={s.divider} />
      <Text style={s.label}>GeoJSON route line</Text>
      <Text style={s.muted}>Paste the operator’s verified trace in the direction the jeep travels.</Text>
      <TextInput accessibilityLabel="GeoJSON route line" style={[s.input, { minHeight: 112, textAlignVertical: 'top' }]}
        editable={!saving} multiline maxLength={400000} value={line} onChangeText={value => { setLine(value); setChecked(false); }} />
      <Text style={s.label}>Route source link</Text>
      <TextInput accessibilityLabel="Route source link" style={s.input} editable={!saving} autoCapitalize="none"
        keyboardType="url" maxLength={1000} value={source} onChangeText={value => { setSource(value); setChecked(false); }} />
      <View style={s.divider} />
      <Text style={s.muted}>Publishing replaces the line used on maps and for off-route warnings.</Text>
      <View style={s.row}>
        <Text style={[s.body, { flex: 1 }]}>I verified the route line and its travel direction.</Text>
        <Switch accessibilityLabel="I verified the route line and its travel direction" disabled={saving} value={checked} onValueChange={setChecked} />
      </View>
      {!!message && <Text accessibilityRole="alert" style={s.body}>{message}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={!route || !checked || saving}
        accessibilityState={{ disabled: !route || !checked || saving }} style={[s.button, (!route || !checked || saving) && { opacity: 0.5 }]} onPress={() => void publish()}>
        <Text style={s.buttonText}>{saving ? 'Publishing…' : 'Publish verified route line'}</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>;
}
