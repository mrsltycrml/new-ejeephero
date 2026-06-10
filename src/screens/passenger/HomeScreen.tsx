import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useVehicleTracking } from '../../hooks/useVehicleTracking';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { findNearestTerminals } from '../../utils/geo';
import VehicleMarker from '../../components/map/VehicleMarker';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
Mapbox.setAccessToken(MAPBOX_TOKEN);

const MAKATI_CENTER: [number, number] = [121.0244, 14.5547];

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

  const routeLine = selectedRoute ? {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: terminals
        .filter(t => t.route_id === selectedRoute)
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map(t => [t.longitude, t.latitude])
    }
  } : null;

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          zoomLevel={14}
          centerCoordinate={
            location
              ? [location.coords.longitude, location.coords.latitude]
              : MAKATI_CENTER
          }
          animationMode="flyTo"
          animationDuration={2000}
        />

        <Mapbox.UserLocation />

        {/* Route Path */}
        {routeLine && routeLine.geometry.coordinates.length > 1 && (
          <Mapbox.ShapeSource id="routeSource" shape={routeLine}>
            <Mapbox.LineLayer
              id="routeFill"
              style={{
                lineColor: routes.find(r => r.id === selectedRoute)?.color_code || colors.primary,
                lineWidth: 5,
                lineOpacity: 0.8,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Vehicle Markers */}
        {vehicles.map(v => (
          <VehicleMarker key={v.id} vehicle={v} />
        ))}

        {/* Terminals */}
        {terminals.map(t => (
          <Mapbox.PointAnnotation
            key={`terminal-${t.id}`}
            id={`terminal-${t.id}`}
            coordinate={[t.longitude, t.latitude]}
            onSelected={() => setSelectedRoute(t.route_id)}
          >
            <View style={styles.terminalMarker} />
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>
          {selectedRoute ? `Route: ${routes.find(r => r.id === selectedRoute)?.name}` : 'Nearest Terminals'}
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
            <Text style={styles.bodyText}>Active E-Jeeps: {vehicles.length}</Text>
            <Text style={styles.linkText} onPress={() => setSelectedRoute(null)}>Clear Filter</Text>
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
