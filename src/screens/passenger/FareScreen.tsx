import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import { FormScrollView } from '../../components/AppUI';
import { Colors } from '../../constants/theme';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { loadPassengerFareMatrices, loadPassengerRideSegments, loadPassengerWalkLinks } from '../../services/passengerDataService';
import type { TransitResult } from '../../services/offlineTransitService';
import { findVerifiedSavings, quotePassengerFare, validFareMatrix, verifiedRideDistance } from '../../services/passengerFare';
import type { FarePassengerType } from '../../services/fareCalculator';
import { manilaDateKey } from '../../utils/reportingPeriod';

const TYPES: { id: FarePassengerType; name: string }[] = [
  { id: 'regular', name: 'Regular' }, { id: 'student', name: 'Student' }, { id: 'senior', name: 'Senior' }, { id: 'pwd', name: 'PWD' },
];
const peso = (amount: number) => `₱${amount.toFixed(2)}`;

function usePlanningRows<T>(read: () => Promise<T[]>, catalog: TransitResult, owner?: string) {
  const [result, setResult] = useState<{ catalog: TransitResult; owner?: string; rows: T[] | null }>();
  useEffect(() => {
    let active = true;
    const finish = (rows: T[] | null) => { if (active) setResult({ catalog, owner, rows }); };
    void read().then(finish, () => finish(null));
    return () => { active = false; };
  }, [read, catalog, owner]);
  return result?.catalog === catalog && result.owner === owner ? result.rows : undefined;
}

export default function FareScreen({ navigation, route: screenRoute }: any) {
  const { transit, refreshTransit, selectedRouteId, setSelectedRouteId, boardingStop, setBoardingStop, alightingStop, setAlightingStop, destinationPlace, showWalk } = usePassengerJourney();
  const { user } = useAuth();
  const { now } = useLocation();
  const matrices = usePlanningRows(loadPassengerFareMatrices, transit, user?.id);
  const segments = usePlanningRows(loadPassengerRideSegments, transit, user?.id);
  const walks = usePlanningRows(loadPassengerWalkLinks, transit, user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<'distance' | 'stops'>('stops');
  useEffect(() => { if (screenRoute?.params?.showSelectedStops) setMode('stops'); }, [screenRoute?.params?.showSelectedStops]);
  const [type, setType] = useState<FarePassengerType>('regular');
  const [distance, setDistance] = useState('');
  const [stepFree, setStepFree] = useState(false);
  const [walkExpanded, setWalkExpanded] = useState(false);
  const [maxWalk, setMaxWalk] = useState(500);
  const scroll = useRef<React.ElementRef<typeof FormScrollView>>(null);
  const route = transit.routes.find(item => item.id === selectedRouteId);
  const stops = transit.terminals.filter(stop => stop.route_id === selectedRouteId).sort((a, b) => a.sequence_order - b.sequence_order);
  const today = manilaDateKey(new Date(now));
  const matrix = matrices?.find(item => route && validFareMatrix(item, route.id, today));
  const km = mode === 'distance' ? (distance.trim() ? Number(distance) : null)
    : boardingStop && alightingStop && route && segments && boardingStop.sequence_order < alightingStop.sequence_order
      ? verifiedRideDistance(boardingStop.id, alightingStop.id, route.id, segments) : null;
  const quote = route && km != null ? quotePassengerFare(km, type, route, matrix, today) : null;
  const savings = !refreshing && mode === 'stops' && route && boardingStop && alightingStop && matrices && segments && walks
    ? findVerifiedSavings({ originId: boardingStop.id, destinationId: alightingStop.id, routeId: route.id, type, stops,
      segments, walks, matrix, stepFreeOnly: stepFree, maxWalkMeters: maxWalk, date: today }) : null;
  const category = TYPES.find(item => item.id === type)!.name;
  const fareError = matrices === null ? 'Fare information could not be refreshed. Try again.'
    : mode === 'stops' && segments === null ? 'Ride distances are unavailable. Refresh or enter a known ride distance.' : '';
  const loading = refreshing || matrices === undefined || (mode === 'stops' && segments === undefined);
  const walkError = walks === null ? 'Walk & Save unavailable. Refresh to retry walking paths.'
    : matrices === null || segments === null ? 'Walk & Save unavailable until fares and ride distances can be refreshed.' : '';
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshTransit(); } finally { setRefreshing(false); }
  };

  return (
    <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={[s.content, styles.column]}>
      <View style={[s.heroBanner, styles.ticket]}>
        <View style={styles.headingRow}>
          <Ionicons aria-hidden name="ticket-outline" color={Colors.onDark} size={24} />
          <Text accessibilityRole="header" style={[s.heroTitle, styles.light, styles.grow]}>Fare</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh fares, walks, stops and routes" accessibilityState={{ disabled: refreshing }}
            disabled={refreshing} onPress={() => void refresh()} style={[styles.source, refreshing && { opacity: 0.6 }]}>
            <Ionicons aria-hidden name="refresh-outline" size={18} color={Colors.onDark} />
            <Text style={[s.label, styles.light]}>Refresh</Text>
          </TouchableOpacity>
        </View>
        {fareError ? <Text accessibilityRole="alert" style={styles.ticketDetail}>{fareError}</Text>
          : loading ? <Text accessibilityLiveRegion="polite" style={styles.ticketDetail}>Refreshing fare information…</Text>
          : quote ? <>
            <View style={styles.total}>
              <Text style={styles.ticketDetail}>{category} · Payable fare</Text>
              <Text style={styles.amount}>{peso(quote.amount)}</Text>
              <Text style={styles.ticketDetail}>{route!.name} · {km!.toFixed(2)} km{mode === 'distance' ? ' entered' : ''}</Text>
            </View>
            <View style={styles.ticketFooter}>
              <Text style={styles.ticketDetail}>Regular {peso(quote.regular)} · Discount {peso(quote.discount)}</Text>
              <Text style={styles.ticketDetail}>Effective {quote.effective_from}{quote.effective_to ? ` through ${quote.effective_to}` : ''}. Verified {new Date(quote.verified_at).toLocaleDateString()}.</Text>
              <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(quote.source)} style={styles.source}>
                <Text style={[s.label, styles.light]}>View fare source</Text>
                <Ionicons aria-hidden name="open-outline" size={16} color={Colors.onDark} />
              </TouchableOpacity>
            </View>
          </> : <>
            <Text style={[s.sectionTitle, styles.light]}>Fare unavailable</Text>
            <Text style={styles.ticketDetail}>{!transit.routes.length ? (transit.status === 'ready' ? 'No published active routes.' : 'Route information is unavailable.')
              : !route ? 'Choose a published route.' : !matrix ? 'A current verified fare source is unavailable for this route.'
              : 'Choose a connected stop pair or enter a distance covered by the fare source.'}</Text>
          </>}
      </View>

      <View style={s.section}>
        <PassengerSelect label="Route" value={selectedRouteId || ''} disabled={!transit.routes.length}
          options={transit.routes.map(item => ({ value: item.id, label: item.name }))} onSelect={setSelectedRouteId} />
        {transit.status !== 'ready' && <Text style={s.muted}>{transit.syncedAt ? `Using route records read ${new Date(transit.syncedAt).toLocaleString()}. Refresh unavailable.` : 'Route information unavailable.'}</Text>}
        <View style={styles.segmented}>
          {(['stops', 'distance'] as const).map(value => (
            <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)} style={[styles.segment, mode === value && styles.activeSegment]}>
              <Text style={[s.label, styles.segmentText, mode === value && styles.light]}>{value === 'stops' ? 'Selected stops' : 'Enter distance'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'stops' ? <>
          <PassengerSelect label="Boarding stop" value={boardingStop?.id || ''} disabled={!stops.length}
            options={stops.filter(stop => !alightingStop || stop.sequence_order < alightingStop.sequence_order).map(stop => ({ value: stop.id, label: stop.name }))}
            onSelect={id => setBoardingStop(stops.find(stop => stop.id === id) || null)} />
          <PassengerSelect label="Alighting stop" value={alightingStop?.id || ''} disabled={!stops.length}
            options={stops.filter(stop => !boardingStop || stop.sequence_order > boardingStop.sequence_order).map(stop => ({ value: stop.id, label: stop.name }))}
            onSelect={id => setAlightingStop(stops.find(stop => stop.id === id) || null)} />
          {!stops.length && <Text style={s.muted}>Verified stops unavailable for this route.</Text>}
          {destinationPlace && <Text style={s.muted}>Your final destination is {destinationPlace.name}. The fare covers the ride to the alighting stop.</Text>}
        </> : <View style={styles.field}>
          <Text style={s.label}>Known ride distance (km)</Text>
          <TextInput accessibilityLabel="Journey distance in kilometres" style={s.input} keyboardType="decimal-pad" value={distance} onChangeText={setDistance} placeholder="Enter distance in km" placeholderTextColor={Colors.subtleGray} />
          <Text style={s.muted}>The fare uses your entered distance and the current fare source.</Text>
          {!!distance && (km == null || !Number.isFinite(km) || km <= 0 || km > 200) && <Text accessibilityRole="alert" style={[s.muted, { color: Colors.primaryRed }]}>Enter a distance greater than 0 and up to 200 km.</Text>}
        </View>}
        <View style={s.divider} />
        <PassengerSelect label="Passenger category" value={type} options={TYPES.map(item => ({ value: item.id, label: item.name }))}
          onSelect={value => { const selected = TYPES.find(item => item.id === value); if (selected) setType(selected.id); }} />
        {type !== 'regular' && <Text style={s.muted}>{category} fare uses the concession in the current fare source. Bring the required proof of eligibility.</Text>}
        {!loading && quote && <TouchableOpacity accessibilityRole="button" onPress={() => scroll.current?.scrollTo({ y: 0, animated: false })} style={s.button}>
          <Text style={s.buttonText}>View fare · {peso(quote.amount)}</Text>
        </TouchableOpacity>}
      </View>

      <View style={s.section}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: walkExpanded }} onPress={() => setWalkExpanded(!walkExpanded)} style={styles.disclosure}>
          <Ionicons aria-hidden name="walk-outline" size={24} color={Colors.action} />
          <View style={styles.grow}><Text style={s.sectionTitle}>Walk &amp; Save</Text><Text accessibilityLiveRegion="polite" style={s.muted}>{(!walkExpanded && walkError) || 'Compare fares from later boarding stops.'}</Text></View>
          <Ionicons aria-hidden name={walkExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.ink} />
        </TouchableOpacity>
        {walkExpanded && <>
          <View style={s.divider} />
          <Text style={s.muted}>Walk from your selected boarding stop and keep the same alighting stop, destination and passenger category.</Text>
          <PassengerSelect label="Maximum extra walking" value={String(maxWalk)} options={[100, 250, 500, 1000, 2000].map(value => ({ value: String(value), label: `${value} m` }))} onSelect={value => setMaxWalk(Number(value))} />
          <View style={styles.disclosure}><Text style={[s.label, styles.grow]}>Step-free paths only</Text><Switch accessibilityLabel="Step-free walking routes only" value={stepFree} onValueChange={setStepFree} trackColor={{ true: Colors.action }} /></View>
          {!savings ? <Text accessibilityLiveRegion="polite" style={s.muted}>{walkError || (loading || walks === undefined ? 'Refreshing comparison information…'
            : 'Choose a route, boarding stop and alighting stop in Selected stops mode.')}</Text> : <>
            <Text style={s.label}>{savings.status === 'available' ? 'Lower fares found' : savings.status === 'no-saving' ? 'No saving on the compared paths' : 'Walking comparison unavailable'}</Text>
            <Text style={s.muted}>{savings.reason}</Text>
            {savings.suggestions.map(item => (
              <View key={`${item.stop.id}:${item.walk.source_url}`} style={styles.suggestion}>
                <Text style={[s.label, styles.saving]}>Save {peso(item.savings)}</Text>
                <Text style={s.sectionTitle}>Board at {item.stop.name}</Text>
                <Text style={s.body}>{Math.round(item.walk.distance_meters)} m · about {item.minutes} min from {boardingStop!.name}</Text>
                <Text style={s.body}>{category} fare drops from {peso(item.currentFare)} to {peso(item.fare)}.</Text>
                <Text style={s.muted}>{item.walk.accessible === true ? 'Step-free access verified.' : item.walk.accessible === false ? 'This path is not step-free.' : 'Step-free access unconfirmed.'}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => {
                  const stop = stops.find(value => value.id === item.stop.id);
                  if (!stop || !boardingStop || !matrix || !validFareMatrix(matrix, route!.id, manilaDateKey(new Date()))) return;
                  const fromLabel = boardingStop.name;
                  setBoardingStop(stop); showWalk(item.walk, fromLabel, stop.name); navigation.navigate('Map');
                }} style={s.button}><Text style={[s.buttonText, { flexShrink: 1, textAlign: 'center' }]}>Use stop &amp; view walking directions</Text></TouchableOpacity>
              </View>
            ))}
          </>}
        </>}
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 640 },
  ticket: { backgroundColor: Colors.midnight, borderColor: Colors.midnight, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  total: { gap: 2 },
  amount: { alignSelf: 'flex-start', paddingHorizontal: 8, borderRadius: 4, color: Colors.midnight, backgroundColor: Colors.signal, fontSize: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ticketDetail: { color: Colors.onDarkMuted, fontSize: 15, lineHeight: 21 },
  ticketFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.onDark, paddingTop: 10, gap: 3 },
  light: { color: Colors.onDark },
  source: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, alignSelf: 'flex-start' },
  segmented: { flexDirection: 'row', padding: 3, backgroundColor: Colors.canvas, borderRadius: 8 },
  segment: { flex: 1, minHeight: 48, padding: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  activeSegment: { backgroundColor: Colors.action },
  segmentText: { textAlign: 'center' },
  field: { gap: 6 },
  disclosure: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  suggestion: { borderTopWidth: 1, borderColor: Colors.border, paddingTop: 12, gap: 8 },
  saving: { color: Colors.success },
});
