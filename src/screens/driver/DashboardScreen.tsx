import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { startAnomalyDetection, stopAnomalyDetection } from '../../services/anomalyDetector';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import SOSButton from '../../components/SOSButton';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  // Animation for active glow
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.from('routes').select('*').then(({ data }) => {
      if (data) setRoutes(data);
    });

    return () => {
      if (locationSub.current) {
        locationSub.current.remove();
        locationSub.current = null;
      }
      stopAnomalyDetection();
    };
  }, []);

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isActive]);

  const toggleShift = async () => {
    if (!selectedRoute) {
      Alert.alert('Selection Required', 'Please select a jeepney route to start your shift.');
      return;
    }

    if (isActive) {
      // End Shift
      setIsActive(false);
      stopAnomalyDetection();
      if (locationSub.current) {
        locationSub.current.remove();
        locationSub.current = null;
      }
      if (vehicleId) {
        await supabase.from('vehicles').update({ is_active: false }).eq('id', vehicleId);
        setVehicleId(null);
      }
      Location.stopLocationUpdatesAsync('telemetry-task').catch(() => {});
    } else {
      // Start Shift
      const { data, error } = await supabase.from('vehicles').insert({
        driver_id: user?.id,
        route_id: selectedRoute,
        is_active: true
      }).select().single();

      if (error) {
        Alert.alert('Error starting shift', error.message);
        return;
      }
      
      setVehicleId(data.id);
      setIsActive(true);
      startAnomalyDetection(data.id);

      // watch position in foreground
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000 },
        async (loc) => {
          await supabase.from('vehicle_positions').insert({
            vehicle_id: data.id,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            speed: (loc.coords.speed || 0) * 3.6, // Convert m/s to km/h
            heading: loc.coords.heading || 0
          });
        }
      );
      locationSub.current = sub;
    }
  };

  const currentRouteName = routes.find(r => r.id === selectedRoute)?.name || '';

  // Glowing style interpolations
  const pulseScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <View style={styles.container}>
      {!isActive ? (
        <View style={styles.routeContainer}>
          <Text style={styles.sectionHeader}>Select Assigned Route</Text>
          <Text style={styles.sectionSub}>Choose the active modernized jeepney route you are operating today.</Text>
          
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {routes.map(r => {
              const isSelected = selectedRoute === r.id;
              return (
                <TouchableOpacity 
                  key={r.id} 
                  style={[
                    styles.routeCard, 
                    isSelected && { borderColor: Colors.primaryYellow, borderWidth: 2, backgroundColor: '#FFFDF0' }
                  ]}
                  onPress={() => setSelectedRoute(r.id)}
                >
                  <View style={[styles.colorIndicator, { backgroundColor: r.color_code || Colors.primaryRed }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeName}>{r.name}</Text>
                    <Text style={styles.routeHours} numberOfLines={1}>Operating: {r.operating_hours}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.primaryYellow} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.activeContainer}>
          <Animated.View style={[styles.glowCard, { transform: [{ scale: pulseScale }] }]}>
            <View style={styles.pulseInnerCircle}>
              <Ionicons name="pulse" size={48} color={Colors.primaryRed} />
            </View>
            <Text style={styles.activeText}>PASADA ACTIVE</Text>
            <Text style={styles.subActiveText}>Broadcasting GPS coordinates in real-time</Text>
            
            <View style={styles.divider} />
            
            <View style={styles.routeDetails}>
              <Text style={styles.detailsLabel}>CURRENT ROUTE</Text>
              <Text style={styles.detailsValue}>{currentRouteName}</Text>
            </View>
          </Animated.View>
        </View>
      )}

      <View style={styles.buttonWrapper}>
        <TouchableOpacity 
          style={[styles.toggleButton, isActive ? styles.buttonStop : styles.buttonStart]} 
          onPress={toggleShift}
        >
          <Ionicons 
            name={isActive ? "stop" : "play"} 
            size={22} 
            color={Colors.white} 
            style={{ marginRight: 8 }} 
          />
          <Text style={styles.buttonText}>
            {isActive ? 'Tapusin ang Pasada (End Shift)' : 'Magsimula ng Pasada (Start Shift)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Floating SOS Button */}
      <View style={styles.sosOverlay}>
        <SOSButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: Colors.offWhite, 
    padding: 20,
    justifyContent: 'space-between',
    position: 'relative', // added to support absolute position of child
  },
  sosOverlay: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 10,
  },
  routeContainer: { 
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.primaryRed,
    marginBottom: 4,
    marginTop: 10,
  },
  sectionSub: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 18,
  },
  routeCard: { 
    flexDirection: 'row', 
    padding: 16, 
    backgroundColor: Colors.white, 
    marginBottom: 12, 
    borderRadius: 16, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8DFD3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  colorIndicator: { 
    width: 12, 
    height: 40, 
    borderRadius: 6, 
    marginRight: 16 
  },
  routeName: { 
    fontSize: 16, 
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  routeHours: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  activeContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  glowCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 30,
    width: '90%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primaryYellow,
    shadowColor: Colors.primaryYellow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  pulseInnerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF8F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primaryYellow,
    marginBottom: 20,
  },
  activeText: { 
    fontSize: 24, 
    fontWeight: '900', 
    color: Colors.primaryRed, 
    letterSpacing: 1,
    marginBottom: 8 
  },
  subActiveText: { 
    fontSize: 14, 
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8DFD3',
    width: '100%',
    marginVertical: 20,
  },
  routeDetails: {
    alignItems: 'center',
    width: '100%',
  },
  detailsLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailsValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.darkText,
    textAlign: 'center',
  },
  buttonWrapper: {
    paddingVertical: 10,
  },
  toggleButton: { 
    flexDirection: 'row',
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonStart: { 
    backgroundColor: Colors.primaryRed,
  },
  buttonStop: { 
    backgroundColor: Colors.darkText,
  },
  buttonText: { 
    color: Colors.white, 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
});
