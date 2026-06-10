import React, { useState, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function SOSButton() {
  const [isActive, setIsActive] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const triggerSOS = async () => {
    setIsActive(true);

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Kailangan ng GPS access para sa SOS.');
        stopSOS();
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { data: { user } } = await supabase.auth.getUser();

      // Get active vehicle if any
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('id')
        .eq('driver_id', user?.id)
        .eq('is_active', true)
        .single();

      const { error } = await supabase.from('sos_events').insert({
        user_id: user?.id,
        vehicle_id: vehicle?.id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        triggered_at: new Date().toISOString()
      });

      if (!error) {
        Alert.alert('SOS Naisend!', 'Napadala na ang iyong lokasyon sa mga emergency contacts.');
      }
    } catch (error) {
      console.error('SOS Trigger Error:', error);
    }
  };

  const stopSOS = () => {
    setIsActive(false);
    scaleAnim.setValue(1);
    scaleAnim.stopAnimation();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.button, isActive && styles.activeButton]}
        onPress={isActive ? stopSOS : triggerSOS}
        activeOpacity={0.7}
      >
        <Ionicons name="alert-circle" size={32} color="white" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.sos,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  activeButton: {
    backgroundColor: colors.sosLight,
  }
});
