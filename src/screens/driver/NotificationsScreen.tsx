import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, ScreenSkeleton } from '../../components/AppUI';
import LeafletMap from '../../components/LeafletMap';
import { realRows } from '../../utils/realData';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { offlineTransit, type RouteData, type TerminalData } from '../../services/offlineTransitService';

type AlertItem = {
  id: string;
  category: 'announcement' | 'speed' | 'violation';
  title: string;
  body: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'danger';
  unitLabel?: string;
  routeLabel?: string;
  statusLabel?: string;
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<AlertItem | null>(null);
  const [mapRoutes, setMapRoutes] = useState<RouteData[]>([]);
  const [mapTerminals, setMapTerminals] = useState<TerminalData[]>([]);

  useEffect(() => {
    void offlineTransit.getTransitData().then((data) => {
      setMapRoutes(data.routes.filter((r) => !r.is_coming_soon));
      setMapTerminals(data.terminals);
    });
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const [announcementsRes, speedRes, violationsRes] = await Promise.all([
        supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        user?.id
          ? supabase
              .from('speed_events')
              .select('*')
              .eq('driver_id', user.id)
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
        user?.id
          ? supabase
              .from('trip_violations')
              .select('*')
              .eq('driver_id', user.id)
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (announcementsRes.error || speedRes.error || violationsRes.error) throw new Error('Alerts unavailable. Pull to refresh.');
      setLoadError('');
      const merged: AlertItem[] = [];

      for (const a of realRows(announcementsRes.data ?? [])) {
        merged.push({
          id: `ann-${a.id}`,
          category: 'announcement',
          title: a.title || 'Dispatch notice',
          body: a.body || '',
          timestamp: a.created_at,
          severity: 'info',
        });
      }

      for (const s of realRows(speedRes.data ?? [])) {
        merged.push({
          id: `spd-${s.id}`,
          category: 'speed',
          title: 'Operator cap exceeded',
          body: `${Math.round(Number(s.speed_kph))} km/h recorded (${Math.round(Number(s.limit_kph))} km/h cap)`,
          timestamp: s.created_at,
          severity: 'danger',
          unitLabel: [s.body_number, s.plate_number].filter(Boolean).join(' · ') || 'Unit unavailable',
        });
      }

      for (const v of realRows(violationsRes.data ?? [])) {
        const statusLabel =
          v.status === 'confirmed'
            ? 'Confirmed route cut'
            : v.status === 'dismissed'
              ? 'Dismissed'
              : 'Awaiting supervisor review';
        merged.push({
          id: `vio-${v.id}`,
          category: 'violation',
          title: 'Potential route cut',
          body: `${v.body_number || 'Unit unavailable'} · ${v.status === 'confirmed' ? 'Confirmed' : 'Awaiting review'}`,
          timestamp: v.created_at,
          severity: v.status === 'confirmed' ? 'danger' : 'warning',
          unitLabel: [v.body_number, v.plate_number].filter(Boolean).join(' · ') || 'Unit unavailable',
          routeLabel: 'Route unavailable',
          statusLabel,
        });
      }

      merged.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
      setItems(merged);
    } catch {
      setItems([]);
      setLoadError('Alerts unavailable. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadNotifications();
    const channel = supabase
      .channel('driver-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => loadNotifications())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  if (loading) {
    return <ScreenSkeleton preset="list" />;
  }

  const todayStr = new Date().toDateString();
  const todayItems = items.filter((item) => new Date(item.timestamp).toDateString() === todayStr);
  const olderItems = items.filter((item) => new Date(item.timestamp).toDateString() !== todayStr);

  const renderRow = (item: AlertItem) => {
    const iconName =
      item.category === 'announcement'
        ? 'chatbubble-outline'
        : item.category === 'speed'
          ? 'warning-outline'
          : 'git-branch-outline';
    const circleStyle =
      item.severity === 'danger'
        ? styles.circleDanger
        : item.severity === 'warning'
          ? styles.circleWarning
          : styles.circleInfo;
    const iconColor =
      item.severity === 'danger'
        ? Colors.primaryRed
        : item.severity === 'warning'
          ? Colors.warning
          : Colors.brandGreen;
    const timeText = new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return (
      <TouchableOpacity
        key={item.id}
        accessibilityRole="button"
        onPress={() => setSelectedFlag(item)}
        style={styles.row}
      >
        <View style={[styles.iconCircle, circleStyle]}>
          <Ionicons name={iconName} size={19} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowTime}>{timeText}</Text>
          </View>
          <Text style={styles.rowBody}>{item.body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
      </TouchableOpacity>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Alerts</Text>
        {!!loadError && <Text accessibilityRole="alert">{loadError}</Text>}
        {!loadError && !items.length && <Text>No alerts.</Text>}
          <Text style={styles.subtitle}>Updates for your shifts.</Text>
        </View>

        {todayItems.length > 0 && (
          <>
            <View style={styles.groupBand}>
              <Text style={styles.groupBandText}>Today</Text>
            </View>
            <View style={styles.listSection}>{todayItems.map(renderRow)}</View>
          </>
        )}

        {olderItems.length > 0 && (
          <>
            <View style={styles.groupBand}>
              <Text style={styles.groupBandText}>Earlier</Text>
            </View>
            <View style={styles.listSection}>{olderItems.map(renderRow)}</View>
          </>
        )}
      </ScrollView>

      {/* READ-ONLY ROUTE FLAG / ALERT DETAIL SHEET */}
      <BottomSheetModal
        visible={Boolean(selectedFlag)}
        onClose={() => setSelectedFlag(null)}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        {selectedFlag && (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setSelectedFlag(null)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.ink} />
              <Text style={styles.sheetHeaderLabel}>
                {selectedFlag.category === 'violation' ? 'Route flag' : 'Alert details'}
              </Text>
            </TouchableOpacity>

            {selectedFlag.category === 'violation' && (
              <View style={styles.amberStatusPill}>
                <Text style={styles.amberStatusText}>
                  {selectedFlag.statusLabel || 'Awaiting supervisor review'}
                </Text>
              </View>
            )}

            <Text style={styles.detailHeading}>{selectedFlag.title}</Text>

            <View style={styles.kvGroup}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Detected</Text>
                <Text style={styles.kvValue}>
                  {new Date(selectedFlag.timestamp).toLocaleString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Unit</Text>
                <Text style={styles.kvValue}>{selectedFlag.unitLabel || 'Unit unavailable'}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Route</Text>
                <Text style={styles.kvValue}>{selectedFlag.routeLabel || 'Route unavailable'}</Text>
              </View>
            </View>

            {selectedFlag.category === 'violation' ? (
              <>
                <View style={styles.mapBox}>
                  <LeafletMap routes={mapRoutes} terminals={mapTerminals} vehicles={[]} fleetMode />
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: Colors.brandGreen }]} />
                    <Text style={styles.legendText}>Assigned route</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: Colors.warning }]} />
                    <Text style={styles.legendText}>Recorded path</Text>
                  </View>
                </View>
                <Text style={styles.readOnlyNote}>
                  A route deviation was detected. Your supervisor will review this flag.
                </Text>
              </>
            ) : (
              <Text style={styles.readOnlyNote}>{selectedFlag.body}</Text>
            )}
          </>
        )}
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 36 },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 2,
  },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: Colors.ink },
  subtitle: { fontSize: 15, color: Colors.subtleGray, lineHeight: 21 },
  groupBand: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  groupBandText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.subtleGray,
  },
  listSection: {
    backgroundColor: Colors.paper,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleWarning: {
    backgroundColor: Colors.warningBg,
  },
  circleDanger: {
    backgroundColor: Colors.dangerBg,
  },
  circleInfo: {
    backgroundColor: Colors.paleGreen,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  rowTime: { fontSize: 13, color: Colors.subtleGray },
  rowBody: { fontSize: 13, color: Colors.subtleGray, marginTop: 2 },
  sheetHeaderLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },
  amberStatusPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  amberStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.warning,
  },
  detailHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink,
  },
  kvGroup: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  kvLabel: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  kvValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
  },
  mapBox: {
    height: 170,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 12,
    color: Colors.subtleGray,
    fontWeight: '600',
  },
  readOnlyNote: {
    fontSize: 14,
    color: Colors.subtleGray,
    lineHeight: 20,
  },
});
