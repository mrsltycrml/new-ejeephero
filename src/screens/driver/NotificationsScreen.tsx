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
import { useRouteWarnings } from '../../contexts/RouteWarningsContext';
import { color, radius, tapTarget } from '../../constants/theme';
import { transitStyles } from '../../constants/transitStyles';
import { offlineTransit, type RouteData, type TerminalData } from '../../services/offlineTransitService';

type AlertItem = {
  id: string;
  category: 'announcement' | 'speed' | 'violation' | 'deviation';
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
  const { warnings, error: warningError } = useRouteWarnings();
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
          body: `${v.body_number || 'Unit unavailable'} · ${statusLabel}`,
          timestamp: v.created_at,
          severity: v.status === 'confirmed' ? 'danger' : v.status === 'dismissed' ? 'info' : 'warning',
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
  const visibleItems = [...items, ...warnings.map((warning): AlertItem => ({
    id: `warning-${warning.id}`, category: 'deviation', title: 'Possible off-route movement',
    body: `${Math.round(warning.distance_meters)} m from the assigned line (±${Math.round(warning.accuracy_meters)} m GPS). Logged for supervisor review.`,
    timestamp: warning.captured_at, severity: 'warning', unitLabel: warning.unit_label, routeLabel: warning.route_name,
  }))].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const todayItems = visibleItems.filter((item) => new Date(item.timestamp).toDateString() === todayStr);
  const olderItems = visibleItems.filter((item) => new Date(item.timestamp).toDateString() !== todayStr);

  const renderRow = (item: AlertItem) => {
    const iconName =
      item.category === 'announcement'
        ? 'chatbubble-outline'
        : item.category === 'speed'
          ? 'warning-outline'
          : 'git-branch-outline';
    const iconColor =
      item.severity === 'danger'
        ? color.ember
        : item.severity === 'warning'
          ? color.warning
          : color.ink;
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
        <Ionicons name={iconName} size={20} color={iconColor} />
        <View style={styles.message}>
          <Text style={styles.rowTime}>
            {new Date(item.timestamp).toDateString() !== todayStr && `${new Date(item.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · `}
            {timeText}
          </Text>
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowBody}>{item.body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={color.inkMuted} />
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
        <Text accessibilityRole="header" style={styles.title}>Shift alerts</Text>

        {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
        {!!warningError && <Text accessibilityRole="alert" style={styles.error}>{warningError}</Text>}
        {!loadError && !warningError && !visibleItems.length && <Text style={styles.empty}>No alerts.</Text>}

        {[{ label: 'Today', rows: todayItems }, { label: 'Earlier', rows: olderItems }].map(({ label, rows }) =>
          rows.length > 0 && (
            <View key={label} style={styles.listSection}>
              <View style={styles.groupBand}>
                <Text accessibilityRole="header" style={styles.groupBandText}>{label}</Text>
                <Text style={styles.groupCount}>{rows.length}</Text>
              </View>
              {rows.map(renderRow)}
            </View>
          )
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: tapTarget }}
            >
              <Ionicons name="chevron-back" size={20} color={color.ink} />
              <Text style={styles.sheetHeaderLabel}>
                {selectedFlag.category === 'violation' ? 'Route flag' : 'Alert details'}
              </Text>
            </TouchableOpacity>

            <Text accessibilityRole="header" style={styles.detailHeading}>{selectedFlag.title}</Text>
            {selectedFlag.category === 'violation' && (
              <Text style={[
                styles.statusText,
                selectedFlag.severity === 'danger' && { color: color.ember, backgroundColor: color.dangerBg },
                selectedFlag.severity === 'warning' && { color: color.warning, backgroundColor: color.warningBg },
              ]}>
                {selectedFlag.statusLabel || 'Awaiting supervisor review'}
              </Text>
            )}

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
                <Text style={styles.kvLabel}>Route reference map</Text>
                <View style={styles.mapBox}>
                  <LeafletMap routes={mapRoutes} terminals={mapTerminals} vehicles={[]} fleetMode />
                </View>
                <Text style={styles.readOnlyNote}>
                  This end-of-shift check looks for missed stops. See the status above.
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
  container: transitStyles.page,
  content: transitStyles.content,
  title: { ...transitStyles.heading, color: color.ink },
  groupBand: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupBandText: { fontSize: 18, fontWeight: '700', color: color.ink },
  groupCount: { fontSize: 14, color: color.inkMuted, fontVariant: ['tabular-nums'] },
  listSection: transitStyles.panel,
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: tapTarget, padding: 16, borderTopWidth: 1, borderColor: color.border },
  message: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: color.ink },
  rowTime: { fontSize: 13, color: color.inkMuted, fontVariant: ['tabular-nums'] },
  rowBody: { fontSize: 14, lineHeight: 20, color: color.inkMuted },
  empty: { padding: 18, backgroundColor: color.paper, borderColor: color.border, borderWidth: 1, borderRadius: radius.md, color: color.ink },
  error: { padding: 14, color: color.ember, backgroundColor: color.dangerBg, borderRadius: radius.md },
  sheetHeaderLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: color.ink,
  },
  statusText: { alignSelf: 'flex-start', color: color.ink, backgroundColor: color.canvas, fontWeight: '700', fontSize: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  detailHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: color.ink,
  },
  kvGroup: {
    borderTopWidth: 1,
    borderColor: color.border,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: color.border,
  },
  kvLabel: {
    fontSize: 14,
    color: color.inkMuted,
  },
  kvValue: {
    flexShrink: 1,
    marginLeft: 12,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  mapBox: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
  },
  readOnlyNote: {
    fontSize: 14,
    color: color.inkMuted,
    lineHeight: 20,
  },
});
