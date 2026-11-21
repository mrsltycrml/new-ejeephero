import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import PassengerRouteRow from '../../components/PassengerRouteRow';
import { ScreenSkeleton } from '../../components/AppUI';
import { Colors } from '../../constants/theme';
import { offlineTransit, type TransitResult } from '../../services/offlineTransitService';
import { confirmedPassengerUse, passengerUseLabel } from '../../services/routeMap';

export default function DirectoryScreen({ driverMode }: { navigation?: any; driverMode?: boolean }) {
  const [data, setData] = useState<TransitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState('');
  const refresh = async () => {
    setLoading(true);
    try { setData(await offlineTransit.getTransitData()); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  if (loading && !data) return <ScreenSkeleton preset="cards" />;
  const route = data?.routes.find(item => item.id === selectedRoute) ?? data?.routes[0];
  const stops = (data?.terminals ?? []).filter(stop => stop.route_id === route?.id && (driverMode || confirmedPassengerUse(stop))).sort((a, b) => a.sequence_order - b.sequence_order);
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
      {data && data.routes.length > 1 && <PassengerSelect label="Select route" value={route?.id || ''} onSelect={setSelectedRoute}
        options={data.routes.map(item => ({ value: item.id, label: item.name }))} />}
      <View style={styles.directory}>
        <View style={[s.heroBanner, styles.routeHeader]}>
          <Ionicons aria-hidden name="git-branch-outline" color={Colors.signal} size={26} />
          <Text accessibilityRole="header" style={s.heroTitle}>{route?.name || 'Route directory'}</Text>
          {route && <Text style={s.heroSubtitle}>{route.description || 'Route description unavailable.'}</Text>}
          {data?.status === 'ready' && !data.routes.length && <Text style={s.heroSubtitle}>No published active routes.</Text>}
        </View>
        {data?.status !== 'ready' && <Text accessibilityRole="alert" style={styles.notice}>{data?.syncedAt
          ? `Cached at ${new Date(data.syncedAt).toLocaleString()}. Refresh unavailable.`
          : 'Route data unavailable. Refresh to try again.'}</Text>}
        {route && <View style={styles.itinerary}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Stops in travel order</Text>
          {!stops.length && <Text style={s.muted}>{driverMode ? 'Verified stop locations unavailable.' : 'Confirmed passenger stops unavailable.'}</Text>}
          <View>
            {stops.map((stop, index) => (
              <PassengerRouteRow key={stop.id} first={index === 0} last={index === stops.length - 1}>
                <Text style={styles.stopName}>{stop.name}</Text>
                {!driverMode && <Text style={s.muted}>{passengerUseLabel(stop)}</Text>}
              </PassengerRouteRow>
            ))}
          </View>
        </View>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={refresh} style={styles.refresh}>
          <Ionicons aria-hidden name="refresh-outline" color={Colors.brandGreen} size={18} />
          <Text style={s.link}>{loading ? 'Refreshing…' : 'Refresh routes'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  directory: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' },
  routeHeader: { borderRadius: 0 },
  notice: { ...s.body, color: Colors.ink, backgroundColor: Colors.warningBg, padding: 16 },
  itinerary: { padding: 20, gap: 12 },
  stopName: { ...s.body, fontWeight: '700' },
  refresh: { minHeight: 48, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: 'row', gap: 8, alignItems: 'center' },
});
