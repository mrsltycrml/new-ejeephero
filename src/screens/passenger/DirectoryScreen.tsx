import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import PassengerRouteRow from '../../components/PassengerRouteRow';
import { color, radius, space, tapTarget, type } from '../../constants/theme';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { confirmedPassengerUse, verifiedStop } from '../../services/routeMap';
import { passengerMapOverview } from '../../services/passengerMapOverview';

export default function DirectoryScreen() {
  const { transit, refreshTransit, selectedRouteId } = usePassengerJourney();
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const route = transit.routes.find(r => r.id === (selected ?? selectedRouteId)) ?? transit.routes[0];
  const stops = transit.terminals.filter(stop => stop.route_id === route?.id && verifiedStop(stop))
    .sort((a, b) => a.sequence_order - b.sequence_order);
  const overview = route && !stops.length ? passengerMapOverview(transit.routes, transit.terminals, route.id) : null;
  const refresh = async () => {
    setRefreshing(true);
    setFailed(false);
    try { await refreshTransit(); } catch { setFailed(true); } finally { setRefreshing(false); }
  };
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]} keyboardShouldPersistTaps="always"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {transit.routes.length > 1 && <View style={styles.choices}>
        <Text accessibilityRole="header" style={s.label}>{t('passenger.directory.routes')}</Text>
        {transit.routes.map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === route?.id }}
          onPress={() => setSelected(item.id)} style={[styles.choice, item.id === route?.id && styles.selected]}>
          <Text style={[s.label, { flex: 1 }]}>{item.name}</Text>
          {item.id === route?.id && <Ionicons aria-hidden name="checkmark" size={20} color={color.ink} />}
        </TouchableOpacity>)}
      </View>}
      <View style={styles.directory}>
        <View style={[styles.cardBody, styles.routeHeader]}>
          <Text accessibilityRole="header" style={styles.detailTitle}>{route?.name || t('passenger.nav.directory')}</Text>
          {!!route?.description && <Text style={s.heroSubtitle}>{route.description}</Text>}
          {transit.status === 'ready' && !route && <Text style={s.heroSubtitle}>{t('passenger.directory.empty')}</Text>}
        </View>
        {(failed || transit.status !== 'ready') && <Text accessibilityRole="alert" style={styles.notice}>{transit.syncedAt
          ? t('passenger.directory.cached', { date: new Date(transit.syncedAt).toLocaleString(i18n.language) })
          : t('passenger.directory.unavailable')}</Text>}
        {route && <View style={styles.itinerary}>
          <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.directory.stops')}</Text>
          {!stops.length && <Text style={s.muted}>{t('passenger.directory.none')}</Text>}
          <View>{stops.map((stop, index) => <PassengerRouteRow key={stop.id} first={index === 0} last={index === stops.length - 1}>
            <Text style={styles.stopName}>{stop.name}</Text>
            <Text style={s.muted}>{t('passenger.directory.' + (confirmedPassengerUse(stop) || 'unknown'))}</Text>
          </PassengerRouteRow>)}</View>
          {!!overview?.landmarks.length && <>
            <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.directory.reference')}</Text>
            <Text style={s.muted}>{t('passenger.directory.referenceHint', { source: overview.variant.label })}</Text>
            {overview.landmarks.map(pin => <Text key={pin.id} style={s.body}>{pin.name}</Text>)}
          </>}
        </View>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: refreshing }} disabled={refreshing} onPress={refresh} style={styles.refresh}>
          <Ionicons aria-hidden name="refresh-outline" color={color.action} size={18} />
          <Text style={s.link}>{t(refreshing ? 'passenger.directory.refreshing' : 'passenger.directory.refresh')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  choices: { gap: 6 },
  choice: { minHeight: tapTarget, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderWidth: 1, borderColor: color.border, borderRadius: radius.pill, backgroundColor: color.paper },
  selected: { backgroundColor: color.volt },
  directory: { backgroundColor: color.paper, borderWidth: 1, borderColor: color.border, borderRadius: radius.lg, overflow: 'hidden' },
  routeHeader: { borderRadius: 0 },
  notice: { ...s.body, color: color.ink, backgroundColor: color.warningBg, padding: 16 },
  cardBody: { padding: space.lg, gap: space.xs },
  detailTitle: { ...type.headline, color: color.ink, flexShrink: 1, minWidth: 0 },
  itinerary: { padding: space.lg, gap: 12 },
  stopName: { ...s.body, fontWeight: '700' },
  refresh: { minHeight: tapTarget, paddingHorizontal: space.lg, borderTopWidth: 1, borderTopColor: color.border, flexDirection: 'row', gap: 8, alignItems: 'center' },
});
