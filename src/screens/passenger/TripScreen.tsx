import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { calculateFare, formatFare } from '../../utils/fare';
import { getDistance } from '../../utils/geo';
import RouteCard from '../../components/common/RouteCard';

export default function TripScreen({ navigation }: any) {
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      .single();

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
      Alert.alert('Error', 'Hindi matapos ang pasada. Pakisubukang muli.');
    }
  };

  if (loading) return <View style={styles.center}><Text>Loading...</Text></View>;

  if (!activeTrip) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Walang Aktibong Pasada</Text>
        <Text style={styles.emptySubtitle}>Pumili ng ruta at sumakay para makita ang detalye ng iyong trip.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.buttonText}>Maghanap ng Sasakyan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const distance = getDistance(
    activeTrip.boarding.latitude,
    activeTrip.boarding.longitude,
    activeTrip.alighting.latitude,
    activeTrip.alighting.longitude
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Aktibong Ruta</Text>
        <Text style={styles.routeName}>{activeTrip.routes.name}</Text>

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
            <Text style={styles.caption}>Distansya</Text>
            <Text style={styles.value}>{distance.toFixed(2)} km</Text>
          </View>
          <View style={styles.alignRight}>
            <Text style={styles.caption}>Tinatayang Pamasahe</Text>
            <Text style={styles.fareValue}>{formatFare(calculateFare(distance))}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.endButton} onPress={endTrip}>
          <Text style={styles.endButtonText}>Tapusin ang Pasada</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        *Ang pamasahe ay para sa reference lamang. Magbayad sa driver pagbaba ng sasakyan.
      </Text>
    </ScrollView>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    textAlign: 'center',
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  buttonText: {
    ...typography.bodyBold,
    color: colors.textInverse,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  routeName: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: spacing.md,
  },
  line: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginVertical: 2,
  },
  caption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  terminalName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  value: {
    ...typography.h4,
    color: colors.text,
  },
  fareValue: {
    ...typography.h3,
    color: colors.active,
  },
  endButton: {
    backgroundColor: colors.sos,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  endButtonText: {
    ...typography.bodyBold,
    color: 'white',
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    fontStyle: 'italic',
  }
});
