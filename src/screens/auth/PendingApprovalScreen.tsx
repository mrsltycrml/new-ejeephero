import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function PendingApprovalScreen() {
  const { status, signOut, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const isRejected = status === 'rejected';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={[styles.iconCircle, isRejected && styles.iconCircleRejected]}>
          <Ionicons
            name={isRejected ? 'close-circle' : 'hourglass'}
            size={56}
            color={isRejected ? '#F44336' : Colors.primaryYellow}
          />
        </View>

        <Text style={styles.title}>
          {isRejected ? 'Registration Rejected' : 'Pending Approval'}
        </Text>

        <Text style={styles.description}>
          {isRejected
            ? 'Your registration has been rejected by an administrator. Please contact support if you believe this is an error.'
            : 'Your account is awaiting admin approval. You will be able to access the app once an administrator reviews and approves your registration.'}
        </Text>

        {!isRejected && (
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="refresh" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.refreshText}>Check Status</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.primaryRed} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.offWhite,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 36,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F0E6D8',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF8E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 3,
    borderColor: Colors.primaryYellow,
  },
  iconCircleRejected: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.darkText,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  refreshButton: {
    backgroundColor: Colors.primaryRed,
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 12,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  refreshText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 2,
    borderColor: Colors.primaryRed,
    backgroundColor: Colors.white,
  },
  logoutText: {
    color: Colors.primaryRed,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
