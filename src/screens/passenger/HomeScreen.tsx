import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, Alert, Modal } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useVehicleTracking } from '../../hooks/useVehicleTracking';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { findNearestTerminals } from '../../utils/geo';
import VehicleMarker from '../../components/map/VehicleMarker';
import WeatherBanner from '../../components/common/WeatherBanner';

const MAKATI_CENTER = {
  latitude: 14.5547,
  longitude: 121.0244,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function HomeScreen({ navigation }: any) {
  const { location, loading, error } = useUserLocation();
  const [routes, setRoutes] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [nearestTerminals, setNearestTerminals] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [boardingModalVisible, setBoardingModalVisible] = useState(false);
  const [boardingTerminal, setBoardingTerminal] = useState<any>(null);
  const [alightingTerminal, setAlightingTerminal] = useState<any>(null);

  const vehicles = useVehicleTracking(selectedRouteId || undefined);

  useEffect(() => {
    fetchRoutesAndTerminals();
  }, []);

  const fetchRoutesAndTerminals = async () => {
    const { data: routesData } = await supabase.from('routes').select('*');
    const { data: terminalsData } = await supabase.from('terminals').select('*');
    if (routesData) setRoutes(routesData);
    if (terminalsData) setTerminals(terminalsData);
  };

  useEffect(() => {
    if (location && terminals.length > 0) {
      const nearest = findNearestTerminals(location.coords.latitude, location.coords.longitude, terminals, 3);
      setNearestTerminals(nearest);
    }
  }, [location, terminals]);

  const routePath = selectedRouteId ? terminals
    .filter(t => t.route_id === selectedRouteId)
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map(t => ({ latitude: t.latitude, longitude: t.longitude })) : [];

  const handleBoarding = async () => {
    if (!boardingTerminal || !alightingTerminal || !selectedRouteId) {
      Alert.alert('Error', 'Pakipili ang boarding at alighting terminals.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.from('trips').insert({
      passenger_id: user?.id,
      route_id: selectedRouteId,
      boarding_terminal_id: boardingTerminal.id,
      alighting_terminal_id: alightingTerminal.id,
      status: 'active',
      start_time: new Date().toISOString()
    }).select().single();

    if (!error) {
      setBoardingModalVisible(false);
      navigation.navigate('Trip');
    } else {
      Alert.alert('Error', 'Hindi makapagsimula ng trip. Subukan muli.');
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={
          location ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          } : MAKATI_CENTER
        }
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {routePath.length > 1 && (
          <Polyline
            coordinates={routePath}
            strokeColor={routes.find(r => r.id === selectedRouteId)?.color_code || colors.primary}
            strokeWidth={5}
          />
        )}

        {vehicles.map(v => (
          <VehicleMarker key={v.id} vehicle={v} />
        ))}

        {terminals.map(t => (
          <Marker
            key={`terminal-${t.id}`}
            coordinate={{ latitude: t.latitude, longitude: t.longitude }}
            onPress={() => setSelectedRouteId(t.route_id)}
          >
            <View style={styles.terminalMarker} />
          </Marker>
        ))}
      </MapView>

      <WeatherBanner />

      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {selectedRouteId ? `Ruta: ${routes.find(r => r.id === selectedRouteId)?.name}` : 'Pinakamalapit na Terminal'}
          </Text>
          {selectedRouteId && (
            <TouchableOpacity onPress={() => setBoardingModalVisible(true)} style={styles.boardButton}>
              <Text style={styles.boardButtonText}>Sakay Na</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading && <ActivityIndicator size="small" color={colors.primary} />}

        {!selectedRouteId && nearestTerminals.map(t => (
          <View key={t.id} style={styles.terminalItem}>
            <Text style={styles.terminalName}>{t.name}</Text>
            <Text style={styles.terminalDistance}>{(t.distanceKm).toFixed(2)} km away</Text>
          </View>
        ))}

        {selectedRouteId && (
          <View style={styles.routeStats}>
            <Text style={styles.bodyText}>Aktibong E-Jeeps: {vehicles.length}</Text>
            <TouchableOpacity onPress={() => setSelectedRouteId(null)}>
              <Text style={styles.linkText}>I-clear ang Filter</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={boardingModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Saan ka sasakay?</Text>

            <Text style={styles.label}>Boarding Terminal</Text>
            <View style={styles.pickerContainer}>
              {terminals.filter(t => t.route_id === selectedRouteId).map(t => (
                <TouchableOpacity
                  key={`board-${t.id}`}
                  onPress={() => setBoardingTerminal(t)}
                  style={[styles.pickerItem, boardingTerminal?.id === t.id && styles.selectedItem]}
                >
                  <Text style={styles.itemText}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Alighting Terminal</Text>
            <View style={styles.pickerContainer}>
              {terminals.filter(t => t.route_id === selectedRouteId).map(t => (
                <TouchableOpacity
                  key={`alight-${t.id}`}
                  onPress={() => setAlightingTerminal(t)}
                  style={[styles.pickerItem, alightingTerminal?.id === t.id && styles.selectedItem]}
                >
                  <Text style={styles.itemText}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setBoardingModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBoarding} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simulan ang Trip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  map: {
    flex: 1,
  },
  terminalMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'white',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 5,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  boardButton: {
    backgroundColor: colors.active,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  boardButtonText: {
    ...typography.bodyBold,
    color: 'white',
  },
  terminalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  terminalName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  terminalDistance: {
    ...typography.body,
    color: colors.textSecondary,
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  bodyText: {
    ...typography.body,
    color: colors.text,
  },
  linkText: {
    ...typography.bodyBold,
    color: colors.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  modalTitle: {
    ...typography.h2,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  pickerContainer: {
    marginBottom: spacing.lg,
  },
  pickerItem: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  selectedItem: {
    borderColor: colors.primary,
    backgroundColor: '#E6F4FE',
  },
  itemText: {
    ...typography.body,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  cancelButton: {
    padding: spacing.md,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  confirmText: {
    ...typography.bodyBold,
    color: 'white',
  }
});
