import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PendingApprovalScreen() {
  const { t } = useTranslation();
  const { status, signOut, refreshProfile } = useAuth();
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={[styles.iconCircle, isBlocked && styles.iconCircleRejected]}>
          <Ionicons
            name={isBlocked ? 'close-circle-outline' : 'time-outline'}
            size={36}
            color={isBlocked ? Colors.primaryRed : Colors.ink}
          />
        </View>

        <Text style={styles.title}>
          {isRejected ? t('auth.registrationRejected') : isSuspended ? 'Account Suspended' : t('auth.pendingApproval')}
        </Text>

        <Text style={styles.description}>
          {isRejected
            ? t('auth.rejectedDesc')
            : isSuspended
              ? 'Your account has been suspended after supervisor review. Contact the operator or administrator if you believe this is an error.'
              : t('auth.pendingDesc')}
        </Text>

        {!isBlocked && (
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color={Colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.refreshText}>{t('auth.checkStatus')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.ink} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>{t('auth.logOut')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.paper,
    borderRadius: 8,
    padding: 28,
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: Colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircleRejected: {
    backgroundColor: '#FFEBEE',
    borderColor: Colors.primaryRed,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: Colors.ink,
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: Colors.subtleGray,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  refreshButton: {
    backgroundColor: Colors.ink,
    flexDirection: 'row',
    minHeight: 46,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 10,
  },
  refreshText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    minHeight: 46,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  logoutText: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
});
