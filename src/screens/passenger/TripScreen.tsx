import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { calculateFare, formatFare } from '../../utils/fare';
import { getDistance } from '../../utils/geo';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useETACalculator } from '../../hooks/useETACalculator';
import { useStopProximityAlert } from '../../hooks/useStopProximityAlert';
import { useVehicleTracking } from '../../hooks/useVehicleTracking';

export default function TripScreen({ navigation }: any) {
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { location } = useUserLocation();

  const vehicles = useVehicleTracking(activeTrip?.route_id);
  const vehicle = vehicles[0]; // Simplified: track first vehicle on route

  const { eta, isDelayed } = useETACalculator(
    location?.coords.latitude || null,
    location?.coords.longitude || null,
    vehicle?.latitude,
    vehicle?.longitude,
    vehicle?.speed
  );

  useStopProximityAlert(
    location?.coords.latitude || null,
    location?.coords.longitude || null,
    activeTrip?.alighting?.latitude || null,
    activeTrip?.alighting?.longitude || null,
    !!activeTrip
  );

  useEffect(() => {
    fetchActiveTrip();
  }, []);

  const fetchActiveTrip = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('trips')
      .select('*, routes(*), boarding:terminals!boarding_terminal_id(*), alighting:terminals!alighting_terminal_id(*)')
      .eq('passenger_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    setActiveTrip(data);
    setLoading(false);
  };

  const endTrip = async () => {
    if (!activeTrip) return;

    const distance = getDistance(
      activeTrip.boarding.latitude,
      activeTrip.boarding.longitude,
      activeTrip.alighting.latitude,
      activeTrip.alighting.longitude
    );
    const fare = calculateFare(distance);

    const { error } = await supabase
      .from('trips')
      .update({
        status: 'completed',
        end_time: new Date().toISOString(),
        fare_amount: fare
      })
      .eq('id', activeTrip.id);

    if (!error) {
      navigation.navigate('RatingScreen', { tripId: activeTrip.id });
      setActiveTrip(null);
    } else {
      Alert.alert('Error', 'Hindi matapos ang pasada.');
    }
  };

  if (loading) return null;

  if (!activeTrip) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Walang Aktibong Trip</Text>
        <Text style={styles.emptySubtitle}>Mag-board sa Home screen para makita ang detalye.</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.buttonText}>Pumunta sa Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.routeName}>{activeTrip.routes.name}</Text>

        {eta !== null && (
          <View style={[styles.etaBadge, isDelayed && styles.delayedBadge]}>
            <Text style={styles.etaText}>
              ETA: {Math.round(eta)} mins {isDelayed && '(Traffic)'}
            </Text>
          </View>
        )}

        <View style={styles.divider} />
        
        <View style={styles.row}>
          <View style={styles.dot} />
          <View>
            <Text style={styles.caption}>Mula sa</Text>
            <Text style={styles.terminalName}>{activeTrip.boarding.name}</Text>
          </View>
        </View>
        
        <View style={styles.line} />
        
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <View>
            <Text style={styles.caption}>Papuntang</Text>
            <Text style={styles.terminalName}>{activeTrip.alighting.name}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.caption}>Tinatayang Pamasahe</Text>
            <Text style={styles.fareValue}>
              {formatFare(calculateFare(getDistance(
                activeTrip.boarding.latitude, activeTrip.boarding.longitude,
                activeTrip.alighting.latitude, activeTrip.alighting.longitude
              )))}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.endButton} onPress={endTrip}>
          <Text style={styles.endButtonText}>Tapusin ang Trip</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.md },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  button: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 8 },
  buttonText: { ...typography.bodyBold, color: 'white' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: spacing.lg, elevation: 3 },
  routeName: { ...typography.h3, color: colors.primary, marginBottom: spacing.sm },
  etaBadge: { backgroundColor: colors.activeLight, padding: 8, borderRadius: 8, alignSelf: 'flex-start', marginBottom: spacing.md },
  delayedBadge: { backgroundColor: colors.warningLight },
  etaText: { ...typography.caption, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, marginRight: spacing.md },
  line: { width: 2, height: 20, backgroundColor: colors.border, marginLeft: 5, marginVertical: 2 },
  caption: { ...typography.caption, color: colors.textSecondary },
  terminalName: { ...typography.bodyBold, color: colors.text },
  summaryRow: { marginBottom: spacing.xl },
  fareValue: { ...typography.h3, color: colors.active },
  endButton: { backgroundColor: colors.sos, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  endButtonText: { ...typography.bodyBold, color: 'white' }
});
