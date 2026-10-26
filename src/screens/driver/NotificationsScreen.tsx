import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';

type AlertItem = {
  id: string;
  category: 'announcement' | 'speed' | 'violation';
  title: string;
  body: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'danger';
};

const EXAMPLE_ALERTS = [
  { id: 'sample-speed', icon: 'speedometer-outline' as const, title: 'Speed alert', body: 'A unit exceeded the 20 km/h company limit. The recorded GPS trail is available for review.' },
  { id: 'sample-route', icon: 'git-branch-outline' as const, title: 'Route review', body: 'A shift ended before the final checkpoint. Check your route record for details.' },
  { id: 'sample-dispatch', icon: 'megaphone-outline' as const, title: 'Service advisory', body: 'eSAKAY service runs from 4:00 AM to 12:00 AM.' },
];

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const [announcementsRes, speedRes, violationsRes] = await Promise.all([
        supabase
          .from('announcements')
          .select('id,title,body,created_at')
          .order('created_at', { ascending: false })
          .limit(20),
        user?.id
          ? supabase
              .from('speed_events')
              .select('id,zone_label,policy_type,speed_kph,limit_kph,created_at')
              .eq('driver_id', user.id)
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
        user?.id
          ? supabase
              .from('trip_violations')
              .select('id,reason,status,created_at')
              .eq('driver_id', user.id)
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const merged: AlertItem[] = [];

      for (const a of announcementsRes.data ?? []) {
        merged.push({
          id: `ann-${a.id}`,
          category: 'announcement',
          title: a.title || 'Fleet Advisory',
          body: a.body || '',
          timestamp: a.created_at,
          severity: 'info',
        });
      }

      for (const s of speedRes.data ?? []) {
        merged.push({
          id: `spd-${s.id}`,
          category: 'speed',
          title: `Speed Advisory: ${s.zone_label || 'eSAKAY safety rule'}`,
          body: s.policy_type === 'operator_cap'
            ? `Recorded ${Math.round(Number(s.speed_kph))} km/h above eSAKAY's ${Math.round(Number(s.limit_kph))} km/h company cap.`
            : `Recorded ${Math.round(Number(s.speed_kph))} km/h in a ${Math.round(Number(s.limit_kph))} km/h verified road zone.`,
          timestamp: s.created_at,
          severity: 'warning',
        });
      }

      for (const v of violationsRes.data ?? []) {
        merged.push({
          id: `vio-${v.id}`,
          category: 'violation',
          title: `Route Review (${String(v.status).replace('_', ' ').toUpperCase()})`,
          body: v.reason || 'Route compliance review recorded.',
          timestamp: v.created_at,
          severity: v.status === 'confirmed' ? 'danger' : 'warning',
        });
      }

      merged.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
      setItems(merged);
    } catch (err) {
      console.warn('Could not load driver notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
    const channel = supabase
      .channel('driver-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => loadNotifications())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primaryRed} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.subtitle}>Fleet notices and your driving alerts.</Text>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={26} color="#2E7D32" />
          <View style={{ flex: 1 }}><Text style={styles.emptyTitle}>No new alerts</Text>
            <Text style={styles.emptySub}>Your driving and dispatch alerts will appear here.</Text></View>
        </View>
      ) : (
        items.map((item) => {
          const iconName =
            item.category === 'announcement'
              ? 'megaphone'
              : item.category === 'speed'
                ? 'speedometer'
                : 'warning';
          const badgeColor =
            item.severity === 'danger'
              ? '#C62828'
              : item.severity === 'warning'
                ? '#D97706'
                : Colors.navy;
          return (
            <View key={item.id} style={styles.card}>
              <View style={[styles.iconBox, { backgroundColor: badgeColor }]}>
                <Ionicons name={iconName} size={20} color={Colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
                <Text style={styles.cardTime}>
                  {new Date(item.timestamp).toLocaleString()}
                </Text>
              </View>
            </View>
          );
        })
      )}
      <Text style={styles.examplesTitle}>Example alerts</Text>
      {EXAMPLE_ALERTS.map((item) => <View key={item.id} style={styles.card}>
        <View style={styles.exampleIcon}><Ionicons name={item.icon} size={20} color={Colors.primaryRed} /></View>
        <View style={{ flex: 1 }}><View style={styles.exampleHeading}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.sampleLabel}>Sample</Text></View><Text style={styles.cardBody}>{item.body}</Text></View>
      </View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 960, alignSelf: 'center', padding: 18, paddingBottom: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.canvas },
  title: { fontSize: 23, fontWeight: '600', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.subtleGray, marginTop: 4, marginBottom: 20, lineHeight: 19 },
  examplesTitle: { color: Colors.ink, fontSize: 17, fontWeight: '600', marginTop: 24, marginBottom: 12 },
  exampleIcon: { width: 40, height: 40, borderRadius: 6, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  exampleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  sampleLabel: { color: Colors.ink, backgroundColor: '#F6E6DA', borderRadius: 8, overflow: 'hidden', fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4 },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.darkText },
  emptySub: { fontSize: 12, color: Colors.subtleGray, marginTop: 3, lineHeight: 17 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.darkText },
  cardBody: { fontSize: 13, color: '#444', marginTop: 4, lineHeight: 18 },
  cardTime: { fontSize: 12, color: Colors.subtleGray, marginTop: 6 },
});
