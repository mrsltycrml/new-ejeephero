import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/theme';

export type AdminPanel = 'alerts' | 'profile' | null;
type AlertRow = { id: string; title: string; detail: string; time: string; kind: 'speed' | 'route' };

export default function AdminHeaderPopover({ panel, onClose, onManageProfile }: { panel: AdminPanel; onClose: () => void; onManageProfile: () => void }) {
  const { user, fullName, status, signOut } = useAuth();
  const { width, height } = useWindowDimensions();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    const [speed, routes, drivers] = await Promise.all([
      supabase.from('speed_events').select('*').order('created_at', { ascending: false }).limit(8),
      supabase.from('trip_violations').select('*').neq('status', 'dismissed').order('created_at', { ascending: false }).limit(8),
      supabase.from('profiles').select('id,full_name,email').eq('role', 'driver'),
    ]);
    if (speed.error || routes.error) {
      setError('Alerts could not load. Try again.');
      setLoading(false);
      return;
    }
    const names = new Map<string, string>((drivers.data ?? []).map((driver: any) => [driver.id, driver.full_name || driver.email || 'Driver']));
    const speedRows: AlertRow[] = (speed.data ?? []).map((event: any) => ({
      id: `speed-${event.id}`, kind: 'speed', title: names.get(event.driver_id) || 'Driver',
      detail: `${Math.round(Number(event.speed_kph))} km/h · ${event.body_number || event.plate_number || 'Unit'}`,
      time: event.created_at,
    }));
    const routeRows: AlertRow[] = (routes.data ?? []).map((event: any) => ({
      id: `route-${event.id}`, kind: 'route', title: names.get(event.driver_id) || 'Driver',
      detail: `Route cut · ${event.body_number || event.plate_number || 'Unit'} · ${String(event.status).replace('_', ' ')}`,
      time: event.created_at,
    }));
    setAlerts([...speedRows, ...routeRows].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 10));
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (panel !== 'alerts') return;
    void loadAlerts();
    const timer = setInterval(() => { void loadAlerts(); }, 15000);
    const channel = supabase.channel('admin-header-alert-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => { void loadAlerts(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => { void loadAlerts(); })
      .subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [panel, loadAlerts]);

  if (!panel) return null;
  const logout = () => {
    const perform = async () => {
      try { onClose(); await signOut(); }
      catch (cause) { Alert.alert('Could not log out', cause instanceof Error ? cause.message : 'Please try again.'); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Log out of your admin account?')) void perform();
    } else {
      Alert.alert('Log out?', 'You can sign in again at any time.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => { void perform(); } },
      ]);
    }
  };

  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" activeOpacity={1} onPress={onClose} style={styles.scrim} />
    <View style={[styles.panel, { width: Math.min(width - 24, panel === 'alerts' ? 390 : 330), maxHeight: Math.max(220, height - 92) }]}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{panel === 'alerts' ? 'Recent alerts' : 'Your account'}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={19} color={Colors.ink} /></TouchableOpacity>
      </View>
      {panel === 'profile' ? <>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarLetter}>{(fullName || user?.email || 'A').charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{fullName || 'Admin account'}</Text>
            <Text style={styles.email} numberOfLines={2}>{user?.email || 'Email unavailable'}</Text>
          </View>
        </View>
        <View style={styles.statusRow}><View style={styles.statusDot} /><Text style={styles.statusText}>{status === 'approved' ? 'Account active' : 'Account status unavailable'}</Text></View>
        <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); onManageProfile(); }} style={styles.menuItem}><Ionicons name="settings-outline" size={18} color={Colors.ink} /><Text style={styles.menuText}>Account settings</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={logout} style={styles.menuItem}><Ionicons name="log-out-outline" size={18} color={Colors.ink} /><Text style={styles.menuText}>Log out</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>
      </> : <>
        <Text style={styles.panelSub}>GPS speed and route records appear as they arrive.</Text>
        {loading && alerts.length === 0 ? <Text style={styles.empty}>Loading alerts…</Text> : null}
        {!!error && <TouchableOpacity onPress={() => { void loadAlerts(); }}><Text accessibilityRole="alert" style={styles.error}>{error} Tap to retry.</Text></TouchableOpacity>}
        {!loading && !error && alerts.length === 0 ? <View style={styles.emptyBox}><Ionicons name="checkmark-circle-outline" size={27} color={Colors.subtleGray} /><Text style={styles.empty}>No recorded violations</Text></View> : null}
        {alerts.length > 0 && <ScrollView style={styles.alertList} nestedScrollEnabled>
          {alerts.map((item) => <View key={item.id} style={styles.alertRow}>
            <View style={styles.alertIcon}><Ionicons name={item.kind === 'speed' ? 'speedometer-outline' : 'alert-circle-outline'} size={17} color={Colors.primaryRed} /></View>
            <View style={{ flex: 1 }}><Text style={styles.alertName}>{item.title}</Text><Text style={styles.alertDetail}>{item.detail}</Text><Text style={styles.alertTime}>{new Date(item.time).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT</Text></View>
          </View>)}
        </ScrollView>}
      </>}
    </View>
  </>;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, backgroundColor: 'rgba(14, 27, 31, 0.08)' },
  panel: { position: 'absolute', top: 66, right: 12, zIndex: 40, overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.paper, padding: 18, shadowColor: '#102027', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 26, elevation: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  panelTitle: { color: Colors.ink, fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  closeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.offWhite },
  panelSub: { color: Colors.subtleGray, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  avatar: { width: 42, height: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paper },
  avatarLetter: { color: Colors.ink, fontSize: 20, fontWeight: '600' },
  name: { color: Colors.ink, fontSize: 15, fontWeight: '600' },
  email: { color: Colors.subtleGray, fontSize: 12, lineHeight: 15, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 13 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#28764A' },
  statusText: { color: '#24643E', fontSize: 12, fontWeight: '700' },
  menuItem: { minHeight: 46, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 11 },
  menuText: { flex: 1, color: Colors.ink, fontSize: 13, fontWeight: '700' },
  alertList: { maxHeight: 320 },
  alertRow: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: Colors.border },
  alertIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  alertName: { color: Colors.ink, fontSize: 12, fontWeight: '600' },
  alertDetail: { color: Colors.subtleGray, fontSize: 12, lineHeight: 16, marginTop: 2 },
  alertTime: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 25, gap: 8 },
  empty: { color: Colors.subtleGray, fontSize: 12, textAlign: 'center' },
  error: { color: Colors.primaryRed, fontSize: 12, paddingVertical: 14 },
});
