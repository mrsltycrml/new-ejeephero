import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function NotificationsScreen() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverRouteId, setDriverRouteId] = useState<string | null>(null);

  useEffect(() => {
    fetchDriverRoute();
  }, []);

  const fetchDriverRoute = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('route_id')
        .eq('driver_id', user.id)
        .single();

      if (vehicle) {
        setDriverRouteId(vehicle.route_id);
        fetchAnnouncements(vehicle.route_id);
        subscribeToAnnouncements(vehicle.route_id);
      } else {
        setLoading(false);
      }
    }
  };

  const fetchAnnouncements = async (routeId: string) => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .or(`route_id.eq.${routeId},route_id.is.null`)
      .order('created_at', { ascending: false });

    setAnnouncements(data || []);
    setLoading(false);
  };

  const subscribeToAnnouncements = (routeId: string) => {
    const channel = supabase.channel('announcements_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          const newAnn = payload.new;
          if (!newAnn.route_id || newAnn.route_id === routeId) {
            setAnnouncements(prev => [newAnn, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.announcementCard}>
      <View style={styles.cardHeader}>
        <Ionicons
          name={item.type === 'weather' ? 'cloud' : item.type === 'alert' ? 'warning' : 'information-circle'}
          size={24}
          color={item.type === 'alert' ? colors.sos : colors.primary}
        />
        <Text style={styles.announcementType}>{item.type?.toUpperCase()}</Text>
        <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
      <Text style={styles.announcementTitle}>{item.title}</Text>
      <Text style={styles.announcementBody}>{item.body}</Text>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Mga Anunsyo at Abiso</Text>
      <FlatList
        data={announcements}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Walang bagong anunsyo sa kasalukuyan.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  list: {
    paddingBottom: spacing.xl,
  },
  announcementCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  announcementType: {
    ...typography.caption,
    fontWeight: 'bold',
    marginLeft: 8,
    flex: 1,
  },
  time: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  announcementTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 4,
  },
  announcementBody: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  }
});
