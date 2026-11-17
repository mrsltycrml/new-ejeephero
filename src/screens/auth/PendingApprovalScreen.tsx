import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ESakayLogo from '../../components/ESakayLogo';

export default function PendingApprovalScreen() {
  const { user, status, signOut, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const isRejected = status === 'rejected';
  const isSuspended = status === 'suspended';
  const isBlocked = isRejected || isSuspended;

  return (
    <View style={styles.screen}>
      {/* Top Bar */}
      <View style={styles.topHeader}>
        <ESakayLogo compact roleLabel="Driver" roleSeparator="|" />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.mainContent}>
          <View style={[styles.iconCircle, isBlocked && styles.iconCircleRejected]}>
            <Ionicons
              name={isBlocked ? 'close-circle-outline' : 'time-outline'}
              size={34}
              color={isBlocked ? Colors.primaryRed : Colors.warning}
            />
          </View>

          <Text style={styles.title}>
            {isRejected ? 'Registration rejected' : isSuspended ? 'Account suspended' : 'Awaiting approval'}
          </Text>

          <Text style={styles.description}>
            {isRejected
              ? 'Your driver registration was not approved. Please contact your supervisor if you believe this is an error.'
              : isSuspended
                ? 'Your account has been suspended after supervisor review. Contact your supervisor for assistance.'
                : 'Your driver registration is waiting for supervisor approval.'}
          </Text>

          <View style={styles.dividerList}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account status</Text>
              <View style={[styles.statusBadge, isBlocked && styles.statusBadgeDanger]}>
                <Text style={[styles.statusBadgeText, isBlocked && styles.statusBadgeTextDanger]}>
                  {isRejected ? 'Rejected' : isSuspended ? 'Suspended' : 'Pending'}
                </Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || 'driver@example.com'}</Text>
            </View>
          </View>

          <Text style={styles.helperText}>
            You can start a shift once your account is approved.
          </Text>

          {!isBlocked && (
            <TouchableOpacity style={styles.refreshLink} onPress={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <ActivityIndicator color={Colors.brandGreen} size="small" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color={Colors.brandGreen} />
                  <Text style={styles.refreshLinkText}>Check approval status</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  topHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 28,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  mainContent: {
    alignItems: 'center',
    paddingTop: 24,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.warningBg,
    borderWidth: 1.5,
    borderColor: Colors.warningBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircleRejected: {
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.primaryRed,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: Colors.subtleGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  dividerList: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: 15,
    color: Colors.subtleGray,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: Colors.ink,
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeDanger: {
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.primaryRed,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.warning,
  },
  statusBadgeTextDanger: {
    color: Colors.primaryRed,
  },
  helperText: {
    fontSize: 13,
    color: Colors.subtleGray,
    textAlign: 'center',
    lineHeight: 19,
  },
  refreshLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  refreshLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  logoutButton: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.paper,
    marginTop: 24,
  },
  logoutText: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
});
