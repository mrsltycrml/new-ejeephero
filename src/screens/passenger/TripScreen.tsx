import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { calculateFare } from '../../utils/fare';
import { supabase } from '../../lib/supabase';

export default function TripScreen({ navigation }: any) {
  const [distanceKm, setDistanceKm] = useState(5.5); // Mock distance
  const [isDiscounted, setIsDiscounted] = useState(false);
  const [activeTrip, setActiveTrip] = useState<any>(null);

  useEffect(() => {
    // In a real app, we would fetch the active trip from Supabase
    // supabase.from('trips').select('*').eq('status', 'active').single()
  }, []);

  const fare = calculateFare(distanceKm, isDiscounted);

  const endTrip = async () => {
    // Navigate to rating screen
    navigation.navigate('RatingScreen', { tripId: activeTrip?.id || 'mock-id' });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Fare Calculator (Reference)</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Distance:</Text>
          <Text style={styles.value}>{distanceKm.toFixed(1)} km</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.toggleRow} 
          onPress={() => setIsDiscounted(!isDiscounted)}
        >
          <Text style={styles.label}>Student / Senior / PWD Discount:</Text>
          <View style={[styles.checkbox, isDiscounted && styles.checkboxActive]} />
        </TouchableOpacity>

        <View style={styles.divider} />
        
        <View style={styles.row}>
          <Text style={styles.totalLabel}>Estimated Fare:</Text>
          <Text style={styles.totalValue}>₱{fare.toFixed(2)}</Text>
        </View>
        <Text style={styles.note}>* Pay exactly this amount in cash or card to the driver. No payment is processed through the app.</Text>
      </View>

      {/* Mock Active Trip */}
      <View style={styles.card}>
        <Text style={styles.title}>Current Trip</Text>
        <Text style={styles.body}>Route: One Ayala ↔ Circuit Makati</Text>
        <Text style={styles.body}>Boarded: One Ayala Terminal</Text>
        <Text style={styles.body}>Status: In Transit</Text>

        <TouchableOpacity style={styles.endButton} onPress={endTrip}>
          <Text style={styles.endButtonText}>End Trip & Rate</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  value: {
    ...typography.bodyBold,
    color: colors.text,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
  },
  checkboxActive: {
    backgroundColor: colors.active,
    borderColor: colors.active,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  totalLabel: {
    ...typography.h2,
    color: colors.text,
  },
  totalValue: {
    ...typography.h1,
    color: colors.primary,
  },
  note: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  endButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  endButtonText: {
    ...typography.bodyBold,
    color: colors.textInverse,
  }
});
