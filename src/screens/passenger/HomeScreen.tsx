import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useLocation } from '../../contexts/LocationContext';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import WeatherBanner from '../../components/WeatherBanner';
import SOSButton from '../../components/SOSButton';

// Makati Center
const INITIAL_REGION = {
  latitude: 14.5547,
  longitude: 121.0244,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function PassengerHomeScreen() {
  const { location } = useLocation();
  const mapRef = useRef<MapView | null>(null);
  const [hasCentered, setHasCentered] = useState(false);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  useEffect(() => {
    if (location && !hasCentered && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 1000);
      setHasCentered(true);
    }
  }, [location, hasCentered]);

  useEffect(() => {
    // Fetch terminals
    supabase.from('terminals').select('*, routes(*)').then(({ data }) => {
      if (data) setTerminals(data);
    });

    // Fetch initial vehicle positions
    supabase.from('vehicle_positions').select('*').then(({ data }) => {
      if (data) setVehicles(data);
    });

    // Subscribe to realtime vehicle positions
    const sub = supabase
      .channel('public:vehicle_positions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions' }, payload => {
        setVehicles(current => {
          const newV = payload.new;
          // Replace old position for the same vehicle
          const filtered = current.filter(v => v.vehicle_id !== newV.vehicle_id);
          return [...filtered, newV];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  return (
    <View style={styles.container}>
      <MapView 
        ref={mapRef}
        style={styles.map} 
        initialRegion={INITIAL_REGION}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {/* Custom Terminal Stop Markers */}
        {terminals.map(terminal => (
          <Marker
            key={terminal.id}
            coordinate={{ latitude: terminal.latitude, longitude: terminal.longitude }}
            title={terminal.name}
            description={`Route: ${terminal.routes?.name || 'N/A'}`}
          >
            <View style={[styles.terminalMarker, { backgroundColor: terminal.routes?.color_code || Colors.primaryRed }]}>
              <Ionicons name="bus" size={14} color={Colors.white} />
            </View>
          </Marker>
        ))}

        {/* Custom Active Jeepney Markers */}
        {vehicles.map(vehicle => (
          <Marker
            key={vehicle.id}
            coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }}
            title="E-Jeepney"
            description={`Speed: ${vehicle.speed} km/h`}
          >
            <View style={styles.jeepneyMarker}>
              <Ionicons name="car" size={15} color={Colors.primaryRed} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Weather Advisory Overlay at the top */}
      <View style={styles.weatherOverlay}>
        <WeatherBanner />
      </View>

      {/* Floating SOS Button */}
      <View style={styles.sosOverlay}>
        <SOSButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  weatherOverlay: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  sosOverlay: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 10,
  },
  terminalMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  jeepneyMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primaryRed,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2.5,
    elevation: 4,
  }
});
