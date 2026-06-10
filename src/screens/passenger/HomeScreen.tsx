import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useUserLocation } from '../../hooks/useUserLocation';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { findNearestTerminals } from '../../utils/geo';

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

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map} 
        provider={PROVIDER_DEFAULT} // Uses Apple Maps on iOS, Google Maps on Android
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
        {/* Terminals */}
        {terminals.map(t => (
          <Marker
            key={`terminal-${t.id}`}
            coordinate={{ latitude: t.latitude, longitude: t.longitude }}
            title={t.name}
          >
            <View style={styles.terminalMarker} />
          </Marker>
        ))}
      </MapView>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>Nearest Terminals</Text>
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
        {error && <Text style={styles.errorText}>{error}</Text>}
        {!loading && !error && nearestTerminals.map(t => (
          <View key={t.id} style={styles.terminalItem}>
            <Text style={styles.terminalName}>{t.name}</Text>
            <Text style={styles.terminalDistance}>{(t.distanceKm).toFixed(2)} km away</Text>
          </View>
        ))}
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
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
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
  errorText: {
    color: colors.sos,
    ...typography.body,
  }
});
