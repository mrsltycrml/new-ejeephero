import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Switch, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import { MAKATI_PRIMARY_ROUTE } from '../../services/offlineTransitService';
import { loadPassengerPlanningData } from '../../services/passengerDataService';
import { findVerifiedSavings, quotePassengerFare, verifiedRideDistance } from '../../services/passengerFare';
import type { FarePassengerType } from '../../services/fareCalculator';

const TYPES: { id: FarePassengerType; name: string }[] = [{ id: 'regular', name: 'Regular' }, { id: 'student', name: 'Student' }, { id: 'senior', name: 'Senior citizen' }, { id: 'pwd', name: 'PWD' }];
const peso = (n: number) => `₱${n.toFixed(2)}`;
export default function FareScreen() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPassengerPlanningData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'stops' | 'distance'>('distance');
  const [type, setType] = useState<FarePassengerType>('regular');
  const [distance, setDistance] = useState('4');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [stepFree, setStepFree] = useState(false);
  useEffect(() => { let active = true; loadPassengerPlanningData().then(value => { if (active) setData(value); }).catch(() => {}).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const route = MAKATI_PRIMARY_ROUTE;
  const stops = useMemo(() => (data?.terminals || []).filter(t => t.route_id === route.id && t.location_source_url && t.location_verified_at), [data]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const matrix = data?.matrices.find(m => m.route_id === route.id && m.effective_from <= today && (!m.effective_to || m.effective_to >= today));
  const km = mode === 'distance' ? (distance.trim() ? Number(distance) : NaN) : (origin && destination ? verifiedRideDistance(origin, destination, route.id, data?.segments || []) : null);
  const quote = km == null ? null : quotePassengerFare(km, type, route, matrix, today);
  const savings = mode === 'stops' && data ? findVerifiedSavings({ originId: origin, destinationId: destination, routeId: route.id, type, route, stops, segments: data.segments, walks: data.walks, matrix, stepFreeOnly: stepFree, date: today }) : [];
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View><Text style={s.title}>Fare calculator</Text><Text style={s.subtitle}>Check your fare before you travel.</Text></View>
    <View style={s.section}>
      <Text style={s.sectionTitle}>MRT Buendia – Mandaluyong City Hall</Text>
      <View style={s.row}>{TYPES.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: type === item.id }} onPress={() => setType(item.id)} style={[s.button, s.secondary, type === item.id && { borderColor: Colors.ink, backgroundColor: Colors.sand }]}><Text style={[s.label, type === item.id && { color: Colors.ink }]}>{item.name}</Text></TouchableOpacity>)}</View>
      <View style={s.row}>{(['distance', 'stops'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={{ paddingVertical: 10, paddingHorizontal: 2, marginRight: 14, borderBottomWidth: 2, borderColor: mode === value ? Colors.ink : 'transparent' }}><Text style={[s.label, { color: mode === value ? Colors.ink : Colors.subtleGray }]}>{value === 'distance' ? 'Enter distance' : 'Choose stops'}</Text></TouchableOpacity>)}</View>
      {mode === 'distance' ? <View style={{ gap: 7 }}><Text style={s.label}>Journey distance (km)</Text><TextInput accessibilityLabel="Journey distance in kilometres" style={s.input} keyboardType="decimal-pad" value={distance} onChangeText={setDistance} placeholder="e.g. 6" placeholderTextColor={Colors.subtleGray} /><Text style={s.muted}>Use the road distance for your journey.</Text>{distance !== '' && (!Number.isFinite(km) || Number(km) <= 0 || Number(km) > 200) && <Text accessibilityRole="alert" style={[s.muted, { color: Colors.primaryRed }]}>Enter a distance greater than 0 and up to 200 km.</Text>}</View>
        : loading ? <ActivityIndicator color={Colors.ink} /> : stops.length < 2 ? <Text style={s.body}>Stop-to-stop distances are being verified. Use “Enter distance” to estimate your fare for now.</Text> : <View style={{ gap: 14 }}><PassengerSelect label="Boarding stop" value={origin} options={stops.map(t => ({ value: t.id, label: t.name }))} onSelect={setOrigin} /><PassengerSelect label="Destination" value={destination} options={stops.filter(t => t.id !== origin).map(t => ({ value: t.id, label: t.name }))} onSelect={setDestination} />{origin && destination && km == null && <Text style={s.muted}>A verified road connection is not available for these stops in this direction.</Text>}</View>}
      {quote && <><View style={s.divider} /><View style={[s.row, { justifyContent: 'space-between' }]}><View><Text style={s.label}>{quote.basis}</Text><Text style={s.muted}>{TYPES.find(t => t.id === type)?.name} · {Number(km).toFixed(2)} km</Text></View><Text style={{ fontSize: 32, fontWeight: '600', color: Colors.ink, fontVariant: ['tabular-nums'] }}>{peso(quote.amount)}</Text></View>
        {quote.official ? <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(quote.source!)}><Text style={s.link}>View LTFRB fare matrix</Text></TouchableOpacity> : <Text style={s.muted}>First 4 km: ₱{type === 'regular' ? ESAKAY_OPERATIONS.regularBaseFare : ESAKAY_OPERATIONS.discountedBaseFare}. Add ₱1 per km after 4 km. Operator-provided rates; confirm against the fare matrix displayed in the unit.</Text>}
        {type !== 'regular' && <Text style={s.muted}>Bring your valid student, senior citizen, or PWD identification.</Text>}
      </>}
    </View>
    <View style={s.section}>
      <View style={s.row}><Ionicons name="walk-outline" size={22} color={Colors.ink} /><Text style={s.sectionTitle}>Walk & save</Text></View>
      <Text style={s.body}>Compare boarding at a nearby stop to reduce your fare.</Text>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={[s.label, { flex: 1 }]}>Step-free walking routes only</Text><Switch accessibilityLabel="Step-free walking routes only" value={stepFree} onValueChange={setStepFree} trackColor={{ true: Colors.ink }} /></View>
      {savings.length ? savings.map(item => <View key={item.stop.id} style={{ borderTopWidth: 1, borderColor: Colors.border, paddingTop: 15, gap: 7 }}><Text style={[s.sectionTitle, { color: '#24613D' }]}>Walk {item.minutes} min, save {peso(item.savings)}</Text><Text style={s.body}>Board at {item.stop.name}. Your fare becomes {peso(item.fare)}.</Text><Text style={s.muted}>{Math.round(item.walk.distance_meters)} m along a mapped walking path · Walking time is an estimate.</Text><TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(item.walk.source_url)}><Text style={s.link}>View walking route</Text></TouchableOpacity></View>) : <Text style={s.muted}>{mode !== 'stops' || !origin || !destination ? 'Choose your boarding stop and destination to check nearby options.' : 'No verified cheaper walking option is available for this journey.'}</Text>}
    </View>
  </ScrollView>;
}
