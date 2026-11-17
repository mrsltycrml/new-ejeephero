import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, Linking } from 'react-native';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import { FormScrollView } from '../../components/AppUI';
import { Colors } from '../../constants/theme';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { loadPassengerPlanningData } from '../../services/passengerDataService';
import { findVerifiedSavings, quotePassengerFare, validFareMatrix, verifiedRideDistance } from '../../services/passengerFare';
import type { FarePassengerType } from '../../services/fareCalculator';
import { manilaDateKey } from '../../utils/reportingPeriod';

const TYPES: { id: FarePassengerType; name: string }[] = [
  { id: 'regular', name: 'Regular' }, { id: 'student', name: 'Student' }, { id: 'senior', name: 'Senior' }, { id: 'pwd', name: 'PWD' },
];
const peso = (amount: number) => `₱${amount.toFixed(2)}`;

export default function FareScreen({ navigation }: any) {
  const { transit, refreshTransit, selectedRouteId, setSelectedRouteId, boardingStop, setBoardingStop, alightingStop, setAlightingStop, destinationPlace, showWalk } = usePassengerJourney();
  const { user } = useAuth();
  const { now } = useLocation();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPassengerPlanningData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'distance' | 'stops'>('stops');
  const [type, setType] = useState<FarePassengerType>('regular');
  const [distance, setDistance] = useState('');
  const [stepFree, setStepFree] = useState(false);
  const [walkExpanded, setWalkExpanded] = useState(false);
  const [maxWalk, setMaxWalk] = useState(500);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const version = ++request.current;
    setLoading(true); setError(''); setData(null);
    void loadPassengerPlanningData(transit).then(value => { if (version === request.current) setData(value); })
      .catch(() => { if (version === request.current) setError('Fare and walking information could not be refreshed. Try again.'); })
      .finally(() => { if (version === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [transit.syncedAt, transit.status, user?.id, reload]);
  const planning = data?.syncedAt === transit.syncedAt ? data : null;
  const route = transit.routes.find(item => item.id === selectedRouteId);
  const stops = transit.terminals.filter(stop => stop.route_id === selectedRouteId).sort((a, b) => a.sequence_order - b.sequence_order);
  const today = manilaDateKey(new Date(now));
  const matrix = planning?.matrices.find(item => route && validFareMatrix(item, route.id, today));
  const km = mode === 'distance' ? (distance.trim() ? Number(distance) : null)
    : boardingStop && alightingStop && route && boardingStop.sequence_order < alightingStop.sequence_order
      ? verifiedRideDistance(boardingStop.id, alightingStop.id, route.id, planning?.segments || []) : null;
  const quote = route && km != null ? quotePassengerFare(km, type, route, matrix, today) : null;
  const savings = mode === 'stops' && route && boardingStop && alightingStop && planning
    ? findVerifiedSavings({ originId: boardingStop.id, destinationId: alightingStop.id, routeId: route.id, type, stops,
      segments: planning.segments, walks: planning.walks, matrix, stepFreeOnly: stepFree, maxWalkMeters: maxWalk, date: today }) : null;
  const category = TYPES.find(item => item.id === type)!.name;
  const refresh = async () => { setLoading(true); setError(''); await refreshTransit(); setReload(value => value + 1); };

  return <FormScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 600 }]}>
    <View style={{ gap: 4 }}><Text style={s.title}>Fare & walking options</Text><Text style={s.subtitle}>Compare a sourced fare for your selected journey.</Text></View>
    <PassengerSelect label="Route" value={selectedRouteId || ''} disabled={!transit.routes.length}
      options={transit.routes.map(item => ({ value: item.id, label: item.name }))} onSelect={setSelectedRouteId} />
    {transit.status !== 'ready' && <Text style={s.muted}>{transit.syncedAt ? `Using route records read ${new Date(transit.syncedAt).toLocaleString()}. Refresh unavailable.` : 'Route information unavailable.'}</Text>}
    <View style={[s.row, { gap: 8 }]}>
      {(['stops', 'distance'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
        onPress={() => setMode(value)} style={[s.input, { flex: 1, alignItems: 'center' }, mode === value && { backgroundColor: Colors.paleGreen, borderColor: Colors.brandGreen }]}>
        <Text style={s.label}>{value === 'stops' ? 'Selected stops' : 'Enter distance'}</Text>
      </TouchableOpacity>)}
    </View>
    {mode === 'stops' ? <View style={{ gap: 14 }}>
      <PassengerSelect label="Boarding stop" value={boardingStop?.id || ''} disabled={!stops.length}
        options={stops.filter(stop => !alightingStop || stop.sequence_order < alightingStop.sequence_order).map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => setBoardingStop(stops.find(stop => stop.id === id) || null)} />
      <PassengerSelect label="Alighting stop" value={alightingStop?.id || ''} disabled={!stops.length}
        options={stops.filter(stop => !boardingStop || stop.sequence_order > boardingStop.sequence_order).map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => setAlightingStop(stops.find(stop => stop.id === id) || null)} />
      {!stops.length && <Text style={s.muted}>Verified stops unavailable for this route.</Text>}
      {destinationPlace && <Text style={s.muted}>Final destination: {destinationPlace.name}. Fare covers the ride to the alighting stop.</Text>}
    </View> : <View style={{ gap: 6 }}>
      <Text style={s.label}>Known ride distance (km)</Text>
      <TextInput accessibilityLabel="Journey distance in kilometres" style={s.input} keyboardType="decimal-pad" value={distance} onChangeText={setDistance} placeholder="Enter a known distance" placeholderTextColor={Colors.subtleGray} />
      <Text style={s.muted}>Uses the distance you enter, not a measured journey. A current fare source is still required.</Text>
      {!!distance && (km == null || !Number.isFinite(km) || km <= 0 || km > 200) && <Text accessibilityRole="alert" style={s.muted}>Enter a distance greater than 0 and up to 200 km.</Text>}
    </View>}
    <View style={{ gap: 8 }}>
      <Text style={s.label}>Passenger category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TYPES.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: type === item.id }} onPress={() => setType(item.id)}
          style={[s.input, { flexBasis: '46%', flexGrow: 1 }, type === item.id && { backgroundColor: Colors.paleGreen, borderColor: Colors.brandGreen }]}><Text style={s.label}>{item.name}</Text></TouchableOpacity>)}
      </View>
      <Text style={s.muted}>{type === 'regular' ? 'Regular fare. No concession selected.' : `${category} fare uses the concession amount in the current source. Bring the required proof of eligibility.`}</Text>
    </View>
    {loading ? <Text accessibilityRole="alert" style={s.muted}>Refreshing fare information…</Text> : error ? <Text accessibilityRole="alert" style={s.body}>{error}</Text> : quote ? <View style={[s.section, { backgroundColor: Colors.paleGreen }]}>
      <Text style={s.sectionTitle}>{category} fare</Text>
      <Text style={s.muted}>{km!.toFixed(2)} km · {route!.name}</Text>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.body}>Regular</Text><Text style={s.body}>{peso(quote.regular)}</Text></View>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.body}>{type === 'regular' ? 'Discount' : `${category} discount`}</Text><Text style={s.body}>{peso(quote.discount)}</Text></View>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.label}>Payable fare</Text><Text style={[s.title, { color: Colors.brandGreen }]}>{peso(quote.amount)}</Text></View>
      <Text style={s.muted}>Effective {quote.effective_from}{quote.effective_to ? ` through ${quote.effective_to}` : ''}. Verified {new Date(quote.verified_at).toLocaleDateString()}.</Text>
      <TouchableOpacity accessibilityRole="link" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openURL(quote.source)}><Text style={s.link}>Fare source</Text></TouchableOpacity>
    </View> : <View style={s.section}>
      <Text style={s.sectionTitle}>Fare unavailable</Text>
      <Text style={s.muted}>{!route ? 'Choose a published route.' : !matrix ? 'A current verified fare source is unavailable for this route.' : 'Choose a connected stop pair or enter a distance covered by the fare source.'}</Text>
    </View>}
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={() => void refresh()} style={[s.button, s.secondary]}><Text style={s.label}>Refresh fares, stops and routes</Text></TouchableOpacity>
    <View style={s.section}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: walkExpanded }} onPress={() => setWalkExpanded(!walkExpanded)} style={{ minHeight: 48, justifyContent: 'center', gap: 3 }}>
        <Text style={s.sectionTitle}>Walk & Save</Text><Text style={s.muted}>Compare later boarding stops on the same ride.</Text>
      </TouchableOpacity>
      {walkExpanded && <>
        <Text style={s.muted}>Extra walking starts at your selected boarding stop. The alighting stop, final destination and passenger category stay the same.</Text>
        <PassengerSelect label="Maximum extra walking" value={String(maxWalk)} options={[100, 250, 500, 1000, 2000].map(value => ({ value: String(value), label: `${value} m` }))} onSelect={value => setMaxWalk(Number(value))} />
        <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={[s.label, { flex: 1 }]}>Step-free paths only</Text><Switch accessibilityLabel="Step-free walking routes only" value={stepFree} onValueChange={setStepFree} trackColor={{ true: Colors.brandGreen }} /></View>
        {!savings ? <Text style={s.muted}>Choose a route, boarding stop and alighting stop in Selected stops mode.</Text> : <>
          <Text style={s.label}>{savings.status === 'available' ? 'Lower fares found' : savings.status === 'no-saving' ? 'No saving on the compared paths' : 'Walking comparison unavailable'}</Text>
          <Text style={s.muted}>{savings.reason}</Text>
          {savings.suggestions.map(item => <View key={`${item.stop.id}:${item.walk.source_url}`} style={[s.section, { backgroundColor: Colors.paleGreen }]}>
            <Text style={s.sectionTitle}>Save {peso(item.savings)}</Text>
            <Text style={s.body}>Walk to {item.stop.name}</Text>
            <Text style={s.muted}>{Math.round(item.walk.distance_meters)} m · about {item.minutes} min from {boardingStop!.name}</Text>
            <Text style={s.body}>{category}: {peso(item.currentFare)} → {peso(item.fare)}</Text>
            <Text style={s.muted}>{item.walk.accessible === true ? 'Step-free access verified.' : 'Accessibility unconfirmed or not step-free.'}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => {
              const stop = stops.find(value => value.id === item.stop.id);
              if (!stop || !boardingStop || !matrix || !validFareMatrix(matrix, route!.id, manilaDateKey(new Date()))) return;
              const fromLabel = boardingStop.name;
              setBoardingStop(stop); showWalk(item.walk, fromLabel, stop.name); navigation.navigate('Map');
            }} style={s.button}><Text style={s.buttonText}>Use stop & show walking directions</Text></TouchableOpacity>
          </View>)}
        </>}
      </>}
    </View>
  </FormScrollView>;
}
