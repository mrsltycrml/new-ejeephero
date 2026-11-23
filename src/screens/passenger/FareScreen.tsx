import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import { FormScrollView } from '../../components/AppUI';
import { color, radius, tapTarget } from '../../constants/theme';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { loadPassengerFareMatrices, loadPassengerRideSegments, loadPassengerWalkLinks } from '../../services/passengerDataService';
import type { TransitResult } from '../../services/offlineTransitService';
import { findVerifiedSavings, quotePassengerFare, validFareMatrix, verifiedRideDistance } from '../../services/passengerFare';
import type { FarePassengerType } from '../../services/fareCalculator';
import { manilaDateKey } from '../../utils/reportingPeriod';
import { passengerStopOptions } from '../../services/routeMap';
import { nearbyFareBoardingStop } from '../../services/passengerTrip';

const TYPES: FarePassengerType[] = ['regular', 'student', 'senior', 'pwd'];
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
  const { t } = useTranslation();
  const { transit, refreshTransit, selectedRouteId, setSelectedRouteId, boardingStop, setBoardingStop, alightingStop, setAlightingStop, destinationPlace, showWalk, getJourneyVersion } = usePassengerJourney();
  const journeyVersion = getJourneyVersion();
  const { user } = useAuth();
  const { now, fix, foreground, errorMsg } = useLocation();
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
  const route = !selectedRouteId && transit.routes.length === 1 ? transit.routes[0] : transit.routes.find(item => item.id === selectedRouteId);
  const stops = transit.terminals.filter(stop => stop.route_id === route?.id).sort((a, b) => a.sequence_order - b.sequence_order);
  const boardingOptions = passengerStopOptions(stops, 'board', alightingStop);
  const alightingOptions = passengerStopOptions(stops, 'alight', boardingStop);
  const today = manilaDateKey(new Date(now));
  const matrix = matrices?.find(item => route && validFareMatrix(item, route.id, today));
  const km = mode === 'distance' ? (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(distance.trim()) ? Number(distance) : null)
    : boardingStop && alightingStop && route && segments && boardingStop.sequence_order < alightingStop.sequence_order
      ? verifiedRideDistance(boardingStop.id, alightingStop.id, route.id, segments, stops) : null;
  const quote = route && km != null ? quotePassengerFare(km, type, route, matrix, today) : null;
  const nearbyBoarding = mode === 'stops' && !boardingStop && alightingStop && segments &&
    transit.status === 'ready' && !refreshing && foreground && !errorMsg
    ? nearbyFareBoardingStop(fix, now, alightingStop, stops, segments) : null;
  const savings = !refreshing && mode === 'stops' && route && boardingStop && alightingStop && matrices && segments && walks
    ? findVerifiedSavings({ originId: boardingStop.id, destinationId: alightingStop.id, routeId: route.id, type, stops,
      segments, walks, matrix, stepFreeOnly: stepFree, maxWalkMeters: maxWalk, date: today }) : null;
  const category = t('passenger.fare.' + type);
  const fareError = matrices === null ? t('passenger.fare.refreshError')
    : mode === 'stops' && segments === null ? t('passenger.fare.distanceUnavailable') : '';
  const loading = refreshing || matrices === undefined || (mode === 'stops' && segments === undefined);
  function fareHint() {
    if (!transit.routes.length) return transit.status === 'ready' ? t('passenger.fare.noActiveRoutes') : t('passenger.fare.loadRoutes');
    if (!route) return t('passenger.fare.chooseRoute');
    if (!matrix) return t('passenger.fare.askTable');
    if (mode === 'distance') {
      if (!km || km <= 0) return t('passenger.fare.knownDistance');
      return t('passenger.fare.outsideTable');
    }
    if (!boardingOptions.length || !alightingOptions.length) return t('passenger.fare.unknownStops');
    if (!boardingStop || !alightingStop) return t('passenger.fare.choosePair');
    return km == null ? t('passenger.fare.unconfirmedDistance') : t('passenger.fare.outsideTable');
  }
  function walkHint() {
    if (mode !== 'stops') return t('passenger.fare.compareBoarding');
    if (walks === null || matrices === null || segments === null) return t('passenger.fare.refreshComparison');
    if (loading || walks === undefined) return t('passenger.fare.loadingWalks');
    if (!route) return transit.routes.length ? t('passenger.fare.walkRoute') : t('passenger.fare.refreshRoutes');
    const stopIds = new Set(stops.map(stop => stop.id));
    if (!walks.some(walk => stopIds.has(walk.from_stop_id) && stopIds.has(walk.to_stop_id))) return t('passenger.fare.noWalks');
    if (!matrix) return t('passenger.fare.matrixNeeded');
    if (!boardingOptions.length || !alightingOptions.length) return t('passenger.fare.confirmStops');
    return savings ? t('passenger.fare.reasons.' + savings.reason, savings.reason) : t('passenger.fare.choosePair');
  }
  const stopPrompt = (boarding: boolean) => {
    if (!route) return t('passenger.fare.routeFirst');
    if (!stops.length && transit.status === 'unavailable') return t('passenger.fare.refreshStops');
    if (boarding && alightingStop && passengerStopOptions(stops, 'board', null).length) return t('passenger.fare.clearDropHint');
    if (!boarding && boardingStop && passengerStopOptions(stops, 'alight', null).length) return t('passenger.fare.clearBoardHint');
    return boarding ? t('passenger.fare.askBoard') : t('passenger.fare.askDrop');
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await refreshTransit(); } finally { setRefreshing(false); }
  };

  return (
    <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={[s.content, styles.layout]}>
      <View style={[s.heroBanner, styles.ticket]}>
        <View style={styles.headingRow}>
          <Ionicons aria-hidden name="ticket-outline" color={color.signal} size={24} />
          <Text accessibilityRole="header" style={[s.heroTitle, styles.grow]}>{t('passenger.nav.fare')}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.fare.refreshAll')} accessibilityState={{ disabled: refreshing }}
            disabled={refreshing} onPress={() => void refresh()} style={[styles.source, refreshing && { opacity: 0.6 }]}>
            <Ionicons aria-hidden name="refresh-outline" size={18} color={color.onDark} />
            <Text style={[s.label, styles.light]}>{t('passenger.fare.refresh')}</Text>
          </TouchableOpacity>
        </View>
        {fareError ? <Text accessibilityRole="alert" style={styles.ticketDetail}>{fareError}</Text>
          : loading ? <Text accessibilityLiveRegion="polite" style={styles.ticketDetail}>{t('passenger.fare.loading')}</Text>
          : quote ? <>
            <View style={styles.total}>
              <Text style={styles.ticketDetail}>{t('passenger.fare.payable', { category })}</Text>
              <Text style={styles.amount}>{peso(quote.amount)}</Text>
              <Text style={styles.ticketDetail}>{route!.name} · {t(mode === 'distance' ? 'passenger.fare.enteredKm' : 'passenger.fare.rideKm', { km: km!.toFixed(2) })}</Text>
            </View>
            <View style={styles.ticketFooter}>
              <Text style={styles.ticketDetail}>{t('passenger.fare.discountBreakdown', { regular: peso(quote.regular), discount: peso(quote.discount) })}</Text>
              <Text style={styles.ticketDetail}>{t(quote.effective_to ? 'passenger.fare.dateRange' : 'passenger.fare.effective', {
                start: quote.effective_from, end: quote.effective_to, verified: new Date(quote.verified_at).toLocaleDateString(),
              })}</Text>
              <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(quote.source)} style={styles.source}>
                <Text style={[s.label, styles.light]}>{t('passenger.fare.source')}</Text>
                <Ionicons aria-hidden name="open-outline" size={16} color={color.onDark} />
              </TouchableOpacity>
            </View>
          </> : <>
            <Text style={[s.sectionTitle, styles.light]}>{t('passenger.fare.unavailable')}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.ticketDetail}>{fareHint()}</Text>
          </>}
      </View>

      <View style={styles.controls}>
        <View style={s.section}>
          <PassengerSelect label={t('passenger.home.route')} value={route?.id || ''} inline={transit.routes.length <= 3} disabled={!transit.routes.length}
            options={transit.routes.map(item => ({ value: item.id, label: item.name }))} onSelect={setSelectedRouteId} />
          {transit.status !== 'ready' && <Text style={s.muted}>{transit.syncedAt ? t('passenger.fare.cached', { date: new Date(transit.syncedAt).toLocaleString() }) : t('passenger.fare.unavailableRoutes')}</Text>}
          <View style={styles.segmented}>
            {(['stops', 'distance'] as const).map(value => (
              <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
                onPress={() => setMode(value)} style={[styles.segment, mode === value && s.selected]}>
                <Text style={[s.label, styles.segmentText, mode === value && s.selectedText]}>{value === 'stops' ? t('passenger.fare.selectedStops') : t('passenger.fare.enterDistance')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'stops' ? <>
            <PassengerSelect label={t('passenger.home.boardStop')} value={boardingStop?.id || ''} inline={boardingOptions.length <= 3} emptyLabel={stopPrompt(true)}
              options={[...boardingOptions.map(stop => ({ value: stop.id, label: stop.name })), ...(boardingStop ? [{ value: '', label: t('passenger.fare.clearBoard') }] : [])]}
              onSelect={id => setBoardingStop(boardingOptions.find(stop => stop.id === id) || null)} />
            <PassengerSelect label={t('passenger.home.dropStop')} value={alightingStop?.id || ''} inline={alightingOptions.length <= 3} emptyLabel={stopPrompt(false)}
              options={[...alightingOptions.map(stop => ({ value: stop.id, label: stop.name })), ...(alightingStop ? [{ value: '', label: t('passenger.fare.clearDrop') }] : [])]}
              onSelect={id => setAlightingStop(alightingOptions.find(stop => stop.id === id) || null)} />
            {nearbyBoarding && <TouchableOpacity accessibilityRole="button" style={s.input}
              onPress={() => setBoardingStop(nearbyBoarding.stop)}>
              <Text style={s.label}>{t('passenger.fare.useNearbyBoarding', { stop: nearbyBoarding.stop.name })}</Text>
              <Text style={s.muted}>{t('passenger.fare.nearbyStraightLine', { distance: Math.round(nearbyBoarding.distance) })}</Text>
            </TouchableOpacity>}
            {destinationPlace && <Text style={s.muted}>{t('passenger.fare.destinationCoverage', { place: destinationPlace.name })}</Text>}
          </> : <View style={styles.field}>
            <Text style={s.label}>{t('passenger.fare.distanceKm')}</Text>
            <TextInput accessibilityLabel={t('passenger.fare.distanceLabel')} style={s.input} keyboardType="decimal-pad" value={distance} onChangeText={setDistance} placeholder={t('passenger.fare.distancePlaceholder')} placeholderTextColor={color.inkMuted} />
            <Text style={s.muted}>{t('passenger.fare.distanceNote')}</Text>
            {!!distance && (km == null || !Number.isFinite(km) || km <= 0 || km > 200) && <Text accessibilityRole="alert" style={[s.muted, { color: color.ember }]}>{t('passenger.fare.distanceRange')}</Text>}
          </View>}
          <View style={s.divider} />
          <PassengerSelect label={t('passenger.fare.passengerCategory')} value={type} inline options={TYPES.map(id => ({ value: id, label: t('passenger.fare.' + id) }))}
            onSelect={value => { const selected = TYPES.find(id => id === value); if (selected) setType(selected); }} />
          {type !== 'regular' && <Text style={s.muted}>{t('passenger.fare.eligibility', { category })}</Text>}
          {!loading && quote && <TouchableOpacity accessibilityRole="button" onPress={() => scroll.current?.scrollTo({ y: 0, animated: false })} style={s.button}>
            <Text style={s.buttonText}>{t('passenger.fare.viewQuote', { fare: peso(quote.amount) })}</Text>
          </TouchableOpacity>}
        </View>

        <View style={[s.section, styles.walkCard]}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: walkExpanded }} onPress={() => setWalkExpanded(!walkExpanded)} style={styles.disclosure}>
            <Ionicons aria-hidden name="walk-outline" size={24} color={color.action} />
            <View style={styles.grow}><Text style={s.sectionTitle}>{t('passenger.fare.walkSave')}</Text>{!walkExpanded && <Text accessibilityLiveRegion="polite" style={s.muted}>{savings?.status === 'available' ? t('passenger.fare.cheaperFare') : walkHint()}</Text>}</View>
            <Ionicons aria-hidden name={walkExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={color.ink} />
          </TouchableOpacity>
          {walkExpanded && <>
            <View style={s.divider} />
            {!savings ? <><Text accessibilityLiveRegion="polite" style={s.muted}>{walkHint()}</Text>
              {mode === 'distance' && <TouchableOpacity accessibilityRole="button" onPress={() => setMode('stops')} style={s.input}><Text style={s.label}>{t('passenger.fare.useSelected')}</Text></TouchableOpacity>}
            </> : <>
            <PassengerSelect label={t('passenger.fare.maxWalk')} value={String(maxWalk)} options={[100, 250, 500, 1000, 2000].map(value => ({ value: String(value), label: `${value} m` }))} onSelect={value => setMaxWalk(Number(value))} />
            <View style={styles.disclosure}><Text style={[s.label, styles.grow]}>{t('passenger.fare.stepFree')}</Text><Switch accessibilityLabel={t('passenger.fare.stepFreeLabel')} value={stepFree} onValueChange={setStepFree} trackColor={{ true: color.action }} /></View>
              <Text style={s.label}>{savings.status === 'available' ? t('passenger.fare.lowerFare') : savings.status === 'no-saving' ? t('passenger.fare.noSaving') : t('passenger.fare.comparisonUnavailable')}</Text>
              <Text style={s.muted}>{t('passenger.fare.reasons.' + savings.reason, savings.reason)}</Text>
              {savings.suggestions.map(item => (
                <View key={`${item.stop.id}:${item.walk.source_url}`} style={styles.suggestion}>
                  <Text style={[s.label, styles.saving]}>{t('passenger.fare.saveAmount', { amount: peso(item.savings) })}</Text>
                  <Text style={s.sectionTitle}>{t('passenger.home.boardAtStop', { stop: item.stop.name })}</Text>
                  <Text style={s.body}>{t('passenger.fare.walkingDistance', { distance: Math.round(item.walk.distance_meters), minutes: item.minutes, stop: boardingStop!.name })}</Text>
                  <Text style={s.body}>{t('passenger.fare.reducedFare', { category, current: peso(item.currentFare), lower: peso(item.fare) })}</Text>
                  <Text style={s.muted}>{item.walk.accessible === true ? t('passenger.fare.stepFreeVerified') : item.walk.accessible === false ? t('passenger.fare.hasSteps') : t('passenger.fare.stepFreeUnknown')}</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => {
                    const stop = boardingOptions.find(value => value.id === item.stop.id);
                    if (journeyVersion !== getJourneyVersion() || !stop || !boardingStop || !matrix || !validFareMatrix(matrix, route!.id, manilaDateKey(new Date()))) return;
                    const fromLabel = boardingStop.name;
                    setBoardingStop(stop); showWalk(item.walk, fromLabel, stop.name); navigation.navigate('Map');
                  }} style={s.button}><Text style={[s.buttonText, { flexShrink: 1, textAlign: 'center' }]}>{t('passenger.fare.useWalk')}</Text></TouchableOpacity>
                </View>
              ))}
            </>}
          </>}
        </View>
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', maxWidth: 1024 },
  ticket: { flexBasis: 300, flexGrow: 3, flexShrink: 1, minWidth: 0, gap: 12 },
  controls: { flexBasis: 360, flexGrow: 5, flexShrink: 1, minWidth: 0, gap: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  total: { gap: 2 },
  amount: { color: color.signal, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ticketDetail: { color: color.onDarkMuted, fontSize: 15, lineHeight: 21 },
  ticketFooter: { borderTopWidth: 1, borderTopColor: color.onDarkMuted, borderStyle: 'dashed', paddingTop: 12, gap: 4 },
  light: { color: color.onDark },
  source: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, alignSelf: 'flex-start' },
  segmented: { flexDirection: 'row', padding: 3, backgroundColor: color.sand, borderRadius: radius.md },
  segment: { flex: 1, minHeight: tapTarget, padding: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentText: { textAlign: 'center' },
  field: { gap: 6 },
  disclosure: { minHeight: tapTarget, flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  suggestion: { borderTopWidth: 1, borderColor: color.border, paddingTop: 12, gap: 8 },
  saving: { color: color.success },
  walkCard: { borderColor: color.signal, borderWidth: 1.5, backgroundColor: color.paper },
});
