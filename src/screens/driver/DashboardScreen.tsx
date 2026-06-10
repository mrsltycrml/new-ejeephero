import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Switch } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { startTelemetry, stopTelemetry } from '../../services/telemetry';

export default function DashboardScreen() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isShiftActive, setIsShiftActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<any>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    const { data: routesData } = await supabase.from('routes').select('*');
    setRoutes(routesData || []);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', user.id)
        .single();

      if (vehicleData) {
        setVehicle(vehicleData);
        setIsShiftActive(vehicleData.is_active);
        setSelectedRouteId(vehicleData.route_id);

        if (vehicleData.is_active) {
          startTelemetry(vehicleData.id);
        }
      }
    }
    setLoading(false);
  };

  const toggleShift = async () => {
    if (!selectedRouteId) {
      Alert.alert('Patalastas', 'Mangyaring pumili muna ng ruta.');
      return;
    }

    const newStatus = !isShiftActive;

    const { error } = await supabase
      .from('vehicles')
      .update({
        is_active: newStatus,
        route_id: selectedRouteId,
        updated_at: new Date().toISOString()
      })
      .eq('id', vehicle.id);

    if (!error) {
      setIsShiftActive(newStatus);
      if (newStatus) {
        startTelemetry(vehicle.id);
      } else {
        stopTelemetry();
      }
    } else {
      Alert.alert('Error', 'Hindi mabago ang status ng pasada.');
    }
  };

  const renderRouteItem = ({ item }: { item: any }) => {
    const isSelected = selectedRouteId === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.routeButton,
          { borderLeftColor: item.color_code },
          isSelected && styles.selectedRoute
        ]}
        onPress={() => !isShiftActive && setSelectedRouteId(item.id)}
        disabled={isShiftActive}
      >
        <Text style={[styles.routeName, isSelected && styles.selectedRouteText]}>{item.name}</Text>
        <Text style={styles.routeHours}>{item.operating_hours}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard ng Driver</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isShiftActive ? colors.active : colors.textSecondary }]} />
          <Text style={styles.statusText}>{isShiftActive ? 'On Duty' : 'Off Duty'}</Text>
        </View>
      </View>

      <View style={styles.shiftCard}>
        <Text style={styles.label}>PASADA STATUS</Text>
        <View style={styles.row}>
          <Text style={styles.shiftTitle}>
            {isShiftActive ? 'Kasalukuyang pumapasada' : 'Simulan ang iyong pasada'}
          </Text>
          <Switch
            value={isShiftActive}
            onValueChange={toggleShift}
            trackColor={{ false: colors.border, true: colors.activeLight }}
            thumbColor={isShiftActive ? colors.active : '#f4f3f4'}
          />
        </View>
        <TouchableOpacity
          style={[styles.masterButton, isShiftActive ? styles.buttonStop : styles.buttonStart]}
          onPress={toggleShift}
        >
          <Text style={styles.masterButtonText}>
            {isShiftActive ? 'TAPUSIN ANG PASADA' : 'MAGSIMULA NG PASADA'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Pumili ng Ruta</Text>
      <FlatList
        data={routes}
        renderItem={renderRouteItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        numColumns={1}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    ...typography.caption,
    color: colors.text,
  },
  shiftCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  shiftTitle: {
    ...typography.h4,
    color: colors.text,
    flex: 1,
  },
  masterButton: {
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  buttonStart: {
    backgroundColor: colors.active,
  },
  buttonStop: {
    backgroundColor: colors.textSecondary,
  },
  masterButtonText: {
    ...typography.bodyBold,
    color: 'white',
    fontSize: 16,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  listContainer: {
    paddingBottom: spacing.xl,
  },
  routeButton: {
    backgroundColor: 'white',
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderLeftWidth: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedRoute: {
    backgroundColor: '#E6F4FE',
    borderColor: colors.primary,
  },
  routeName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  selectedRouteText: {
    color: colors.primary,
  },
  routeHours: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  }
});
