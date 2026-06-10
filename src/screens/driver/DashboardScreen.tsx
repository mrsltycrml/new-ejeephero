import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { startTelemetry, stopTelemetry } from '../../services/telemetry';
import { useBattery } from '../../hooks/useBattery';

export default function DashboardScreen() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [isShiftActive, setIsShiftActive] = useState(false);
  
  const { batteryLevel, isLowPowerMode } = useBattery();

  useEffect(() => {
    fetchRoutes();
    setupDriverVehicle();
  }, []);

  const fetchRoutes = async () => {
    const { data } = await supabase.from('routes').select('*');
    if (data) setRoutes(data);
  };

  const setupDriverVehicle = async () => {
    // In a real app, this ensures the driver has a vehicle assigned
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase
      .from('vehicles')
      .select('id, route_id')
      .eq('driver_id', userData.user.id)
      .single();

    if (data) {
      setVehicleId(data.id);
      if (data.route_id) setSelectedRoute(data.route_id);
    }
  };

  const toggleShift = async () => {
    if (!selectedRoute) {
      Alert.alert('Error', 'Pumili muna ng ruta bago magsimula ng pasada.');
      return;
    }
    if (!vehicleId) {
      Alert.alert('Error', 'Wala kang nakatalagang sasakyan.');
      return;
    }

    if (isShiftActive) {
      // End Shift
      await stopTelemetry(vehicleId);
      setIsShiftActive(false);
    } else {
      // Start Shift
      // Assign vehicle to route if needed
      await supabase.from('vehicles').update({ route_id: selectedRoute }).eq('id', vehicleId);
      
      const started = await startTelemetry(vehicleId, isLowPowerMode);
      if (started) {
        setIsShiftActive(true);
      } else {
        Alert.alert('Error', 'Hindi masimulan ang GPS tracking.');
      }
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Baterya ng Device:</Text>
          <Text style={[styles.statusValue, isLowPowerMode && { color: colors.sos }]}>
            {Math.round(batteryLevel * 100)}%
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Telemetry Rate:</Text>
          <Text style={styles.statusValue}>
            {isShiftActive ? (isLowPowerMode ? 'Every 5s (Eco)' : 'Every 3s (Fast)') : 'Off'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Pumili ng Ruta</Text>
      <View style={styles.routesGrid}>
        {routes.map(route => (
          <TouchableOpacity
            key={route.id}
            style={[
              styles.routeButton,
              { borderLeftColor: route.color_code },
              selectedRoute === route.id && styles.routeButtonSelected
            ]}
            onPress={() => setSelectedRoute(route.id)}
            disabled={isShiftActive}
          >
            <Text style={styles.routeButtonText}>{route.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.masterToggle,
          isShiftActive ? styles.masterToggleActive : styles.masterToggleInactive
        ]}
        onPress={toggleShift}
      >
        <Text style={styles.masterToggleText}>
          {isShiftActive ? 'Tapusin ang Pasada' : 'Magsimula ng Pasada'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statusLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statusValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  routesGrid: {
    flexDirection: 'column',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  routeButton: {
    backgroundColor: 'white',
    padding: spacing.md,
    borderRadius: 8,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 48, // 48px touch target
    justifyContent: 'center',
  },
  routeButtonSelected: {
    backgroundColor: '#E8F0FE',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  routeButtonText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  masterToggle: {
    padding: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: spacing.xl,
    minHeight: 64,
    justifyContent: 'center',
  },
  masterToggleInactive: {
    backgroundColor: colors.active,
  },
  masterToggleActive: {
    backgroundColor: colors.textSecondary,
  },
  masterToggleText: {
    ...typography.h3,
    color: 'white',
  }
});
