import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

type Alert = {
  id: string;
  type: 'anomaly' | 'overcapacity' | 'route_deviation' | 'safety' | 'system';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
};

const DEMO_ALERTS: Alert[] = [
  {
    id: '1',
    type: 'safety',
    severity: 'critical',
    title: 'Makati C3 Advisory',
    message: 'Heavy traffic along EDSA-Buendia area. Expect 15-20 min delay. Route re-optimization recommended.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    isRead: false,
  },
  {
    id: '2',
    type: 'anomaly',
    severity: 'warning',
    title: 'Speed Anomaly Detected',
    message: 'Your vehicle speed exceeded 60 km/h in a 40 km/h zone near Jupiter St. Please observe safe driving.',
    timestamp: new Date(Date.now() - 18 * 60 * 1000),
    isRead: false,
  },
  {
    id: '3',
    type: 'overcapacity',
    severity: 'warning',
    title: 'Overcapacity Warning',
    message: 'Your unit is approaching max passenger capacity (18/20 pax). Please proceed to nearest unloading bay.',
    timestamp: new Date(Date.now() - 32 * 60 * 1000),
    isRead: true,
  },
  {
    id: '4',
    type: 'route_deviation',
    severity: 'info',
    title: 'Route Deviation Notice',
    message: 'GPS indicates minor deviation from assigned route (MRT Buendia → Maysilo Circle). Please follow designated corridor.',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    isRead: true,
  },
  {
    id: '5',
    type: 'system',
    severity: 'info',
    title: 'Shift Reminder',
    message: 'Your current pasada has been active for 4 hours. Please take a mandatory 30-minute rest break at the nearest terminal.',
    timestamp: new Date(Date.now() - 90 * 60 * 1000),
    isRead: true,
  },
  {
    id: '6',
    type: 'safety',
    severity: 'info',
    title: 'Weather Update',
    message: 'Light to moderate rain expected in Makati area from 6PM onwards. Reduce speed and ensure headlights are on.',
    timestamp: new Date(Date.now() - 120 * 60 * 1000),
    isRead: true,
  },
];

function getAlertIcon(type: Alert['type']): string {
  switch (type) {
    case 'anomaly': return 'speedometer';
    case 'overcapacity': return 'people';
    case 'route_deviation': return 'git-branch';
    case 'safety': return 'warning';
    case 'system': return 'notifications';
    default: return 'alert-circle';
  }
}

function getSeverityColor(severity: Alert['severity']): string {
  switch (severity) {
    case 'critical': return '#D32F2F';
    case 'warning': return '#E65100';
    case 'info': return '#1565C0';
    default: return Colors.subtleGray;
  }
}

function getSeverityBg(severity: Alert['severity']): string {
  switch (severity) {
    case 'critical': return '#FFEBEE';
    case 'warning': return '#FFF3E0';
    case 'info': return '#E3F2FD';
    default: return Colors.offWhite;
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function NotificationsScreen() {
  const { fullName } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = alerts.filter(a => !a.isRead).length;

  const markAllRead = () => {
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
  };

  const markRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // In production, this would fetch from Supabase
    await new Promise(resolve => setTimeout(resolve, 800));
    setRefreshing(false);
  };

  const displayedAlerts = filter === 'unread'
    ? alerts.filter(a => !a.isRead)
    : alerts;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Driver Alerts</Text>
          <Text style={styles.headerSub}>
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Ionicons name="checkmark-done" size={16} color={Colors.primaryRed} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All ({alerts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
          onPress={() => setFilter('unread')}
        >
          <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Alert List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primaryRed]} />
        }
      >
        {displayedAlerts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={52} color={Colors.subtleGray} />
            <Text style={styles.emptyTitle}>No alerts</Text>
            <Text style={styles.emptySub}>You're all clear, {fullName?.split(' ')[0] || 'Driver'}!</Text>
          </View>
        ) : (
          displayedAlerts.map(alert => (
            <TouchableOpacity
              key={alert.id}
              style={[
                styles.alertCard,
                { backgroundColor: getSeverityBg(alert.severity) },
                !alert.isRead && styles.alertCardUnread,
              ]}
              onPress={() => markRead(alert.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.alertIconBg, { backgroundColor: getSeverityColor(alert.severity) }]}>
                <Ionicons
                  name={getAlertIcon(alert.type) as any}
                  size={20}
                  color={Colors.white}
                />
              </View>

              <View style={styles.alertBody}>
                <View style={styles.alertTitleRow}>
                  <Text style={[styles.alertTitle, { color: getSeverityColor(alert.severity) }]} numberOfLines={1}>
                    {alert.title}
                  </Text>
                  <Text style={styles.alertTime}>{formatRelativeTime(alert.timestamp)}</Text>
                </View>
                <Text style={styles.alertMessage} numberOfLines={3}>
                  {alert.message}
                </Text>
                <View style={styles.alertFooter}>
                  <View style={[styles.severityPill, { backgroundColor: getSeverityColor(alert.severity) + '22' }]}>
                    <Text style={[styles.severityPillText, { color: getSeverityColor(alert.severity) }]}>
                      {alert.severity.toUpperCase()}
                    </Text>
                  </View>
                  {!alert.isRead && <View style={styles.unreadDot} />}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Info Footer */}
        <View style={styles.infoFooter}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.subtleGray} />
          <Text style={styles.infoFooterText}>
            Alerts are generated by the SO3/SO4 Anomaly Detection and Makati C3 integration. Pull to refresh for latest updates.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },

  header: {
    backgroundColor: Colors.primaryRed,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  markAllText: { fontSize: 12, fontWeight: 'bold', color: Colors.primaryRed },

  filterRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#E8DFD3',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  filterTabActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  filterTabText: { fontSize: 13, fontWeight: '700', color: Colors.darkText },
  filterTabTextActive: { color: Colors.white },

  scrollContent: { padding: 16, paddingBottom: 40 },

  alertCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  alertCardUnread: {
    borderColor: '#FFB30040',
    shadowOpacity: 0.12,
  },
  alertIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  alertBody: { flex: 1 },
  alertTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  alertTitle: { fontSize: 14, fontWeight: '800', flex: 1, marginRight: 8 },
  alertTime: { fontSize: 11, color: Colors.subtleGray, fontWeight: '600', flexShrink: 0 },
  alertMessage: { fontSize: 12, color: '#555', lineHeight: 17, marginBottom: 8 },
  alertFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  severityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryRed,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.darkText },
  emptySub: { fontSize: 14, color: Colors.subtleGray },

  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  infoFooterText: {
    fontSize: 11,
    color: Colors.subtleGray,
    flex: 1,
    lineHeight: 15,
  },
});
