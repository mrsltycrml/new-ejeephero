import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { ScreenSkeleton } from '../../components/AppUI';
import { Colors } from '../../constants/theme';
import { offlineTransit, type TransitResult } from '../../services/offlineTransitService';

export default function DirectoryScreen({ navigation }: { navigation?: any; driverMode?: boolean }) {
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
  const stops = (data?.terminals ?? []).filter(stop => stop.route_id === route?.id).sort((a, b) => a.sequence_order - b.sequence_order);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
      <Text style={styles.routeTitle}>Routes</Text>
      {data?.status !== 'ready' && <Text accessibilityRole="alert" style={styles.selectorText}>{data?.syncedAt ? `Cached at ${new Date(data.syncedAt).toLocaleString()}. Refresh unavailable.` : 'Route data unavailable. Pull to refresh.'}</Text>}
      {data?.status === 'ready' && !data.routes.length && <Text style={styles.selectorText}>No published active routes.</Text>}
      {data?.routes.map(item => (
        <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: route?.id === item.id }} onPress={() => setSelectedRoute(item.id)} style={styles.selectorBox}>
          <Text style={styles.selectorText}>{item.name}</Text>
        </TouchableOpacity>
      ))}
      {route && <>
        <Text style={styles.routeTitle}>{route.name}</Text>
        <Text style={styles.selectorText}>{route.description || 'Route description unavailable.'}</Text>
        {!stops.length && <Text style={styles.selectorText}>Verified stop locations unavailable.</Text>}
        {stops.map(stop => (
          <View key={stop.id} style={styles.timelineRow}>
            <View style={styles.timelineAxis}><View style={styles.timelineDotActive} /></View>
            <View style={styles.timelineContent}>
              <Text style={styles.stopNameText}>{stop.name}</Text>
            </View>
          </View>
        ))}
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
  },
  selectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  routeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
  },
  timelineBlock: {
    paddingLeft: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 62,
  },
  timelineRowCompact: {
    flexDirection: 'row',
    minHeight: 34,
    alignItems: 'center',
  },
  timelineAxis: {
    width: 24,
    alignItems: 'center',
  },
  timelineDotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.brandGreen,
    marginTop: 4,
  },
  timelineDotMuted: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.brandGreen,
    backgroundColor: Colors.paper,
    marginTop: 6,
  },
  timelineDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.brandGreen,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.brandGreen,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 14,
    gap: 4,
  },
  stopBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stopBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  stopNameText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },
  intermediateText: {
    fontSize: 14,
    color: Colors.subtleGray,
    fontWeight: '600',
    marginTop: 2,
  },
  compactStopText: {
    fontSize: 13,
    color: Colors.ink,
    paddingLeft: 12,
    paddingBottom: 8,
  },
  infoNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  infoNoteText: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  comingSoonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  comingSoonPill: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  comingSoonPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink,
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.ink,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  modalNumBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  modalItemSub: {
    fontSize: 12,
    color: Colors.subtleGray,
    marginTop: 2,
  },
});
