import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useRouteWarnings } from '../contexts/RouteWarningsContext';
import { realRows } from '../utils/realData';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/theme';
import { SkeletonBlock } from './AppUI';

export type AdminPanel = 'alerts' | 'profile' | null;
type AlertRow = { id: string; title: string; detail: string; time: string; kind: 'speed' | 'route'; open?: boolean };

export default function AdminHeaderPopover({ panel, onClose, onManageProfile }: { panel: AdminPanel; onClose: () => void; onManageProfile: () => void }) {
  const { user, fullName, status, signOut } = useAuth();
  const { warnings, error: warningError } = useRouteWarnings();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const displayedAlerts = [...alerts, ...warnings.map((warning): AlertRow => ({
    id: `warning-${warning.id}`, kind: 'route', title: `Possible off-route · ${warning.unit_label}`,
    detail: `${warning.route_name} · ${Math.round(warning.distance_meters)} m from line (±${Math.round(warning.accuracy_meters)} m GPS)`,
    time: warning.captured_at, open: warning.closed_at === null,
  }))].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).filter((row, index) => index < 10 || row.open);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    const [speed, routes, drivers] = await Promise.all([
      supabase.from('speed_events').select('*').order('created_at', { ascending: false }).limit(8),
      supabase.from('trip_violations').select('*').neq('status', 'dismissed').order('created_at', { ascending: false }).limit(8),
      supabase.from('profiles').select('*').eq('role', 'driver'),
    ]);
    if (speed.error || routes.error) {
      setError('Alerts could not load. Try again.');
      setLoading(false);
      return;
    }
    const names = new Map<string, string>(realRows(drivers.data ?? []).map((driver: any) => [driver.id, driver.full_name || driver.email || 'Driver']));
    const speedRows: AlertRow[] = realRows(speed.data ?? []).map((event: any) => ({
      id: `speed-${event.id}`, kind: 'speed', title: names.get(event.driver_id) || 'Driver',
      detail: `${Math.round(Number(event.speed_kph))} km/h · ${event.body_number || event.plate_number || 'Unit'}`,
      time: event.created_at,
    }));
    const routeRows: AlertRow[] = realRows(routes.data ?? []).map((event: any) => ({
      id: `route-${event.id}`, kind: 'route', title: names.get(event.driver_id) || 'Driver',
      detail: `Route cut · ${event.body_number || event.plate_number || 'Unit'} · ${String(event.status).replace('_', ' ')}`,
      time: event.created_at,
    }));
    setAlerts([...speedRows, ...routeRows].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 10));
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    setConfirmLogout(false);
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
    setConfirmLogout(false);
    void signOut().then(onClose).catch(cause => Alert.alert('Could not log out', cause instanceof Error ? cause.message : 'Please try again.'));
  };

  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" activeOpacity={1} onPress={onClose} style={styles.scrim} />
    <View style={[styles.panel, { top: 58 + insets.top, width: Math.min(width - 24, panel === 'alerts' ? 390 : 330), maxHeight: Math.max(220, height - 92 - insets.top) }]}>
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
        {confirmLogout ? <View style={styles.confirmBox}><Text style={styles.confirmTitle}>Log out of your account?</Text><View style={styles.confirmRow}><TouchableOpacity accessibilityRole="button" onPress={logout} style={styles.confirmDanger}><Text style={styles.confirmDangerText}>Confirm log out</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => setConfirmLogout(false)} style={styles.confirmCancel}><Text style={styles.menuText}>Cancel</Text></TouchableOpacity></View></View> : <TouchableOpacity accessibilityRole="button" onPress={() => setConfirmLogout(true)} style={styles.menuItem}><Ionicons name="log-out-outline" size={18} color={Colors.ink} /><Text style={styles.menuText}>Log out</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>}
      </> : <>
        <Text style={styles.panelSub}>GPS speed and route records appear as they arrive.</Text>
        {loading && displayedAlerts.length === 0 ? <View style={{ gap: 8, paddingVertical: 8 }}><SkeletonBlock height={48} /><SkeletonBlock height={48} /><SkeletonBlock height={48} /></View> : null}
        {!!error && <TouchableOpacity onPress={() => { void loadAlerts(); }}><Text accessibilityRole="alert" style={styles.error}>{error} Tap to retry.</Text></TouchableOpacity>}
        {!!warningError && <Text style={styles.error}>{warningError}</Text>}
        {!loading && !error && !warningError && displayedAlerts.length === 0 ? <View style={styles.emptyBox}><Ionicons name="checkmark-circle-outline" size={27} color={Colors.subtleGray} /><Text style={styles.empty}>No recorded alerts</Text></View> : null}
        {displayedAlerts.length > 0 && <ScrollView style={styles.alertList} nestedScrollEnabled>
          {displayedAlerts.map((item) => <View key={item.id} style={styles.alertRow}>
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
  panel: { position: 'absolute', top: 66, right: 12, zIndex: 40, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.paper, padding: 18, shadowColor: '#102027', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 26, elevation: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  panelTitle: { color: Colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: Colors.sand },
  panelSub: { color: Colors.subtleGray, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  avatar: { width: 42, height: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.sand },
  avatarLetter: { color: Colors.ink, fontSize: 20, fontWeight: '600' },
  name: { color: Colors.ink, fontSize: 15, fontWeight: '600' },
  email: { color: Colors.subtleGray, fontSize: 12, lineHeight: 15, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 13 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#28764A' },
  statusText: { color: '#24643E', fontSize: 12, fontWeight: '700' },
  menuItem: { minHeight: 46, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 11 },
  menuText: { flex: 1, color: Colors.ink, fontSize: 13, fontWeight: '700' },
  confirmBox: { paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  confirmTitle: { color: Colors.ink, fontSize: 13, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', gap: 8 },
  confirmDanger: { flex: 1, minHeight: 44, borderRadius: 6, backgroundColor: Colors.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  confirmDangerText: { color: Colors.paper, fontSize: 13, fontWeight: '700' },
  confirmCancel: { minHeight: 44, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  alertList: { maxHeight: 320 },
  alertRow: { flexDirection: 'row', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: Colors.border },
  alertIcon: { width: 32, height: 32, borderRadius: 6, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' },
  alertName: { color: Colors.ink, fontSize: 14, fontWeight: '700' },
  alertDetail: { color: Colors.subtleGray, fontSize: 12, lineHeight: 16, marginTop: 2 },
  alertTime: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 25, gap: 8 },
  empty: { color: Colors.subtleGray, fontSize: 12, textAlign: 'center' },
  error: { color: Colors.primaryRed, fontSize: 12, paddingVertical: 14 },
});
