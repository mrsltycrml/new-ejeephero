import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { AuthAction, AuthLink, AuthPage, authStyles } from './AuthUI';

export default function PendingApprovalScreen() {
  const { t } = useTranslation();
  const { user, status, role, isAdmin, signOut, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshing(false);
    }
  };

  const isBlocked = status === 'rejected' || status === 'suspended';
  const heading = status === 'rejected' ? t('passenger.pending.rejected') : status === 'suspended' ? t('passenger.pending.suspended')
    : status === 'pending' ? t('passenger.pending.waiting') : t('passenger.pending.unknown');
  const description = status === 'rejected'
    ? t('passenger.pending.rejectedDetail')
    : status === 'suspended'
      ? t('passenger.pending.suspendedDetail')
      : status === 'pending'
        ? role === 'driver'
          ? t('passenger.pending.driverReview')
          : t('passenger.pending.passengerReview')
        : t('passenger.pending.retry');

  return (
    <AuthPage title={isAdmin ? t('passenger.pending.supervisor') : role === 'driver' ? t('passenger.pending.driver') : t('passenger.pending.access')}>
      <View style={authStyles.form}>
        <View style={[styles.status, isBlocked && styles.blocked]} accessibilityLiveRegion="polite">
          <Ionicons aria-hidden name={isBlocked ? 'close-circle-outline' : 'time-outline'}
            size={24} color={isBlocked ? Colors.primaryRed : Colors.warning} />
          <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
        </View>
        <Text style={authStyles.body}>{description}</Text>
        {!!user?.email && (
          <View style={styles.identity}>
            <Text style={authStyles.label}>{t('passenger.authLogin.email')}</Text>
            <Text selectable style={styles.email}>{user.email}</Text>
          </View>
        )}
        {!isBlocked && <AuthAction label={t('passenger.pending.check')} loading={refreshing} onPress={handleRefresh} icon="refresh-outline" />}
        <AuthLink label={t('passenger.menu.signOut')} onPress={signOut} />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 4, borderColor: Colors.warning,
    backgroundColor: Colors.warningBg, paddingHorizontal: 14, paddingVertical: 16 },
  blocked: { borderColor: Colors.primaryRed, backgroundColor: Colors.dangerBg },
  heading: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.ink },
  identity: { borderTopWidth: 1, borderColor: Colors.border, gap: 6, paddingVertical: 16 },
  email: { color: Colors.ink, fontSize: 16 },
});
