import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Profile = {
  id: string;
  email: string;
  role: string;
  status: string;
  is_admin: boolean;
  full_name: string;
  created_at: string;
};

type FilterTab = 'pending' | 'approved' | 'rejected';

export default function AdminDashboardScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && !error) {
      setProfiles(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfiles();
    setRefreshing(false);
  };

  const updateProfile = async (profileId: string, updates: Partial<Profile>) => {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profileId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await fetchProfiles();
    }
  };

  const handleApprove = (profile: Profile) => {
    Alert.alert(
      'Approve User',
      `Approve ${profile.email} as ${profile.role}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => updateProfile(profile.id, { status: 'approved' }),
        },
      ]
    );
  };

  const handleReject = (profile: Profile) => {
    Alert.alert(
      'Reject User',
      `Reject ${profile.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => updateProfile(profile.id, { status: 'rejected' }),
        },
      ]
    );
  };

  const handleToggleRole = (profile: Profile) => {
    const newRole = profile.role === 'passenger' ? 'driver' : 'passenger';
    Alert.alert(
      'Change Role',
      `Change ${profile.email} from ${profile.role} to ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Set as ${newRole}`,
          onPress: () => updateProfile(profile.id, { role: newRole }),
        },
      ]
    );
  };

  const filteredProfiles = profiles.filter(p => p.status === activeTab && !p.is_admin);
  const pendingCount = profiles.filter(p => p.status === 'pending' && !p.is_admin).length;

  const renderProfile = ({ item }: { item: Profile }) => {
    const roleColor = item.role === 'driver' ? Colors.primaryRed : Colors.primaryYellow;
    const isPending = item.status === 'pending';

    return (
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={20} color={Colors.white} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileEmail} numberOfLines={1}>{item.email}</Text>
            {item.full_name ? (
              <Text style={styles.profileName}>{item.full_name}</Text>
            ) : null}
            <Text style={styles.profileDate}>
              {new Date(item.created_at).toLocaleDateString('en-PH', {
                year: 'numeric', month: 'short', day: 'numeric'
              })}
            </Text>
          </View>
          <View style={[styles.roleChip, { backgroundColor: roleColor }]}>
            <Text style={styles.roleChipText}>{item.role}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {isPending ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleApprove(item)}
              >
                <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleReject(item)}
              >
                <Ionicons name="close-circle" size={18} color={Colors.white} />
                <Text style={styles.actionBtnText}>Reject</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.roleBtn]}
                onPress={() => handleToggleRole(item)}
              >
                <Ionicons name="swap-horizontal" size={18} color={Colors.primaryRed} />
                <Text style={[styles.actionBtnText, { color: Colors.primaryRed }]}>Switch Role</Text>
              </TouchableOpacity>
              {item.status === 'approved' ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleReject(item)}
                >
                  <Ionicons name="ban" size={18} color={Colors.white} />
                  <Text style={styles.actionBtnText}>Revoke</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => handleApprove(item)}
                >
                  <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                  <Text style={styles.actionBtnText}>Re-Approve</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primaryRed} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.tabRow}>
        {(['pending', 'approved', 'rejected'] as FilterTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {tab === 'pending' && pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredProfiles}
        renderItem={renderProfile}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primaryRed]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.subtleGray} />
            <Text style={styles.emptyText}>No {activeTab} users</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.offWhite,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E8DFD3',
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.darkText,
  },
  tabTextActive: {
    color: Colors.white,
  },
  badge: {
    backgroundColor: Colors.primaryYellow,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0E6D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileInfo: {
    flex: 1,
  },
  profileEmail: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  profileName: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  profileDate: {
    fontSize: 11,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleChipText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  approveBtn: {
    backgroundColor: '#4CAF50',
  },
  rejectBtn: {
    backgroundColor: '#F44336',
  },
  roleBtn: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
  },
  actionBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.subtleGray,
    fontWeight: '600',
  },
});
