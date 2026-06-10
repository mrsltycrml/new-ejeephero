import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
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

export default function HomeScreen() {
  const { location, loading, error } = useUserLocation();
  const [routes, setRoutes] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [nearestTerminals, setNearestTerminals] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const vehicles = useVehicleTracking(selectedRoute || undefined);

  useEffect(() => {
    const fetchRoutesAndTerminals = async () => {
      const { data: routesData } = await supabase.from('routes').select('*');
      const { data: terminalsData } = await supabase.from('terminals').select('*');
      
      if (routesData) setRoutes(routesData);
      if (terminalsData) setTerminals(terminalsData);
    };
    fetchRoutesAndTerminals();
  }, []);

  useEffect(() => {
    if (location && terminals.length > 0) {
      const nearest = findNearestTerminals(location.coords.latitude, location.coords.longitude, terminals, 3);
      setNearestTerminals(nearest);
    }
  }, [location, terminals]);

  const routePath = selectedRoute ? terminals
    .filter(t => t.route_id === selectedRoute)
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map(t => ({ latitude: t.latitude, longitude: t.longitude })) : [];

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
        {/* Route Path */}
        {routePath.length > 1 && (
          <Polyline
            coordinates={routePath}
            strokeColor={routes.find(r => r.id === selectedRoute)?.color_code || colors.primary}
            strokeWidth={5}
          />
        )}

        {/* Vehicle Markers */}
        {vehicles.map(v => (
          <VehicleMarker key={v.id} vehicle={v} />
        ))}

        {/* Terminals */}
        {terminals.map(t => (
          <Marker
            key={`terminal-${t.id}`}
            coordinate={{ latitude: t.latitude, longitude: t.longitude }}
            onPress={() => setSelectedRoute(t.route_id)}
          >
            <View style={styles.terminalMarker} />
          </Marker>
        ))}
      </MapView>

      <WeatherBanner />

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>
          {selectedRoute ? `Ruta: ${routes.find(r => r.id === selectedRoute)?.name}` : 'Pinakamalapit na Terminal'}
        </Text>

        {loading && <ActivityIndicator size="small" color={colors.primary} />}

        {!selectedRoute && nearestTerminals.map(t => (
          <View key={t.id} style={styles.terminalItem}>
            <Text style={styles.terminalName}>{t.name}</Text>
            <Text style={styles.terminalDistance}>{(t.distanceKm).toFixed(2)} km away</Text>
          </View>
        ))}

        {selectedRoute && (
          <View style={styles.routeStats}>
            <Text style={styles.bodyText}>Aktibong E-Jeeps: {vehicles.length}</Text>
            <TouchableOpacity onPress={() => setSelectedRoute(null)}>
              <Text style={styles.linkText}>I-clear ang Filter</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
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
  },
  bodyText: {
    ...typography.body,
    color: colors.text,
  },
  linkText: {
    ...typography.bodyBold,
    color: colors.accent,
  }
});
