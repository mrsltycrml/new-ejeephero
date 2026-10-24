import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Linking, Alert, Animated, Vibration, ActivityIndicator
} from 'react-native';
import * as SMS from 'expo-sms';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface SOSButtonProps {
  activeVehicleId?: string;
  activeVehiclePlate?: string;
  activeVehicleBody?: string;
}

export default function SOSButton({
  activeVehicleId,
  activeVehiclePlate,
  activeVehicleBody,
}: SOSButtonProps) {
  const { user } = useAuth();

  const [modalVisible, setModalVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [dispatchLatencyMs, setDispatchLatencyMs] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsCoordinates, setGpsCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Pulse animation for SOS button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Subtly pulse SOS button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    // Fetch personal contact from Supabase or AsyncStorage fallback
    const fetchContact = async () => {
      try {
        if (user?.id && isSupabaseConfigured) {
          const { data } = await supabase
            .from('emergency_contacts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
          if (data?.length) {
            setContacts(data);
            return;
          }
        }

        // Fallback to local storage
        const local = await AsyncStorage.getItem('@ejeephero_emergency_contact');
        if (local) {
          const saved = JSON.parse(local);
          setContacts(Array.isArray(saved) ? saved : [saved]);
        }
      } catch (err) {
        // Silent fail
      }
    };

    fetchContact();
  }, [user?.id]);

  // Five-second cancellation window before preparing the alert.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => {
        Vibration.vibrate(40);
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      executeEmergencyDispatch();
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  /**
   * SO4: One-touch emergency panic activation
   */
  const handleOneTouchPress = () => {
    Vibration.vibrate([0, 80, 50, 120]);
    setStatusMsg('');
    setGpsCoordinates(null);
    setCountdown(5);
    setModalVisible(true);
  };

  const cancelEmergency = () => {
    Vibration.vibrate(30);
    setCountdown(null);
    setModalVisible(false);
  };

  /**
   * SO4: Execute emergency dispatch (<3s target, <10m GPS accuracy)
   */
  const executeEmergencyDispatch = async () => {
    setCountdown(null);
    setIsDispatching(true);
    const startTime = performance.now();
    setStatusMsg('Getting your current location…');

    let currentLocation: Location.LocationObject | null = null;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location permission was denied.');
      // Take a fresh high-accuracy fix at SOS activation rather than relying on the map's last update.
      const highAccLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      if (highAccLoc) currentLocation = highAccLoc;
    } catch (e) {
      console.warn('Could not get a fresh SOS GPS fix:', e);
      setStatusMsg('Could not get a fresh GPS fix. Check location permission or call a hotline below.');
    }

    if (!currentLocation?.coords || !user?.id) {
      setIsDispatching(false);
      setStatusMsg(!user?.id ? 'Sign in to save and share an SOS alert.' : 'Location is unavailable. Call a hotline below.');
      return;
    }

    const currentLat = currentLocation.coords.latitude;
    const currentLon = currentLocation.coords.longitude;
    const accuracy = currentLocation.coords.accuracy == null ? null : Math.round(currentLocation.coords.accuracy);

    setGpsAccuracy(accuracy);
    setGpsCoordinates({ latitude: currentLat, longitude: currentLon });

    // Payload with real GPS and active vehicle metadata (SO3).
    const alertPayload = {
      user_id: user.id,
      latitude: currentLat,
      longitude: currentLon,
      gps_accuracy_meters: accuracy,
      vehicle_id: activeVehicleId ?? null,
      vehicle_plate_number: activeVehiclePlate ?? null,
      vehicle_body_number: activeVehicleBody ?? null,
      timestamp: new Date().toISOString(),
      status: 'ALERT_PREPARED',
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.functions.invoke('emergency-dispatch', {
        body: {
          latitude: currentLat,
          longitude: currentLon,
          accuracy,
          vehicle_id: activeVehicleId ?? null,
          vehicle_plate: activeVehiclePlate ?? null,
          vehicle_body_number: activeVehicleBody ?? null,
        },
      });
      if (!error && data?.accepted) {
        const totalLatency = Math.round(performance.now() - startTime);
        setDispatchLatencyMs(totalLatency);
        setIsDispatching(false);
        setStatusMsg(`Alert accepted by the SMS gateway in ${totalLatency}ms. Delivery confirmation may take time.`);
        try { await AsyncStorage.setItem('@ejeephero_last_sos', JSON.stringify(alertPayload)); } catch (e) {}
        return;
      }
      if (data?.error) console.warn('Automated SOS dispatch unavailable:', data.error);
    }

    // Fallback logs locally and opens a native message that the user must send.
    try {
      await supabase.from('sos_events').insert({
        user_id: user.id,
        latitude: currentLat,
        longitude: currentLon,
        gps_accuracy_meters: accuracy,
        vehicle_id: activeVehicleId ?? null,
        vehicle_plate: activeVehiclePlate ?? null,
        vehicle_body_number: activeVehicleBody ?? null,
      });
    } catch (err) {
      console.warn('Supabase alert logging offline:', err);
    }
    try { await AsyncStorage.setItem('@ejeephero_last_sos', JSON.stringify(alertPayload)); } catch (e) {}
    setDispatchLatencyMs(Math.round(performance.now() - startTime));
    setIsDispatching(false);
    setStatusMsg('Automated SMS is unavailable. Preparing your message…');
    await triggerSMSFallback(currentLat, currentLon, accuracy);
  };

  const triggerSMSFallback = async (lat: number, lon: number, accuracy: number | null) => {
    const recipients = contacts.map((contact) => contact.phone_number).filter(Boolean);
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
    if (recipients.length === 0) {
      setStatusMsg('No personal emergency contact is saved. Call a hotline below.');
      return;
    }
    const vehicle = activeVehiclePlate || activeVehicleBody
      ? `\nVehicle: ${activeVehiclePlate || 'plate unavailable'} (${activeVehicleBody || 'body number unavailable'})`
      : '\nVehicle details unavailable';
    const message = `${contacts[0]?.preset_message || 'EMERGENCY! I need help. Please check on me.'}\n\nEjeepHero SOS\nLocation: ${lat.toFixed(6)}, ${lon.toFixed(6)}${accuracy == null ? '' : ` (±${accuracy}m)`}\nMaps: ${mapsLink}${vehicle}`;

    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        setStatusMsg('SMS is unavailable on this device. Call a hotline below.');
        return;
      }
      const result = await SMS.sendSMSAsync(recipients, message);
      setStatusMsg(result.result === 'sent' ? 'SMS sent from your messaging app.' : 'SMS was not sent. You can call a hotline below.');
    } catch {
      setStatusMsg('SMS is unavailable on this device. Call a hotline below.');
    }
  };

  const callMakatiC3 = () => {
    Linking.openURL('tel:168');
  };

  const callPNPMakati = () => {
    Linking.openURL('tel:0288876642');
  };

  const callContact = (contact: any) => {
    if (contact?.phone_number) {
      Linking.openURL(`tel:${contact.phone_number}`);
    } else {
      callMakatiC3();
    }
  };

  return (
    <>
      {/* ─── ONE-TOUCH FLOATING PANIC BUTTON ─── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleOneTouchPress}
        style={styles.touchable}
      >
        <Animated.View style={[styles.sosButton, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.sosSubText}>1-Touch</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* ─── RAPID DISPATCH & HOTLINE MODAL (SO4) ─── */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          {countdown !== null ? (
            /* 3-Second Rapid Cancel Window (False Alarm Prevention) */
            <View style={styles.countdownCard}>
              <View style={styles.warningIconBg}>
                <Ionicons name="warning" size={42} color={Colors.primaryRed} />
              </View>

            <Text style={styles.countdownTitle}>PREPARING EMERGENCY ALERT</Text>
              <Text style={styles.countdownNumber}>{countdown}</Text>

              <View style={styles.metadataCard}>
                <Text style={styles.metadataLabel}>BOUND VEHICLE METADATA (SO4):</Text>
                <Text style={styles.metadataValue}>
                Plate: <Text style={{ fontWeight: 'bold' }}>{activeVehiclePlate || 'Not selected'}</Text> • Body: {activeVehicleBody || 'Not selected'}
                </Text>
              </View>

              <Text style={styles.countdownDesc}>
                Cancel within 5 seconds. We’ll send to your saved contact if automatic SMS is configured; otherwise we’ll prepare a message for you to send.
                {contacts.length ? `\nWill alert ${contacts.length} saved contact${contacts.length === 1 ? '' : 's'}.` : '\nNo personal emergency contact is saved yet.'}
              </Text>

            <TouchableOpacity style={styles.cancelButton} onPress={cancelEmergency}>
                <Ionicons name="hand-left" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.cancelButtonText}>TAP TO CANCEL (FALSE ALARM)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Dispatched Mode & One-Touch Hotline Access */
            <View style={styles.dispatchCard}>
              <View style={styles.dispatchHeader}>
                <Ionicons name="shield-checkmark" size={32} color={Colors.primaryYellow} />
                <Text style={styles.dispatchTitle}>SOS ALERT STATUS</Text>
              </View>

              <View style={styles.dispatchBody}>
                {isDispatching ? (
                  <ActivityIndicator size="large" color={Colors.primaryRed} />
                ) : (
                  <View style={styles.latencyBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
                    <Text style={styles.latencyText}>{statusMsg}</Text>
                  </View>
                )}

                <View style={styles.telemetryBox}>
                  <Text style={styles.telemetryTitle}>TRANSMITTED PAYLOAD (SO4):</Text>
                  <Text style={styles.telemetryRow}>
                  • Live GPS: <Text style={{ fontWeight: 'bold' }}>{gpsCoordinates ? `${gpsCoordinates.latitude.toFixed(6)}, ${gpsCoordinates.longitude.toFixed(6)}` : 'Unavailable'}</Text>
                  </Text>
                  <Text style={styles.telemetryRow}>
                  • GPS Accuracy: <Text style={{ fontWeight: 'bold' }}>{gpsAccuracy == null ? 'Unavailable' : `±${gpsAccuracy} meters`}</Text>
                  </Text>
                  <Text style={styles.telemetryRow}>
                  • Bound Vehicle: <Text style={{ fontWeight: 'bold' }}>{activeVehiclePlate || 'Unavailable'}</Text> ({activeVehicleBody || 'Unavailable'})
                  </Text>
                  <Text style={styles.telemetryRow}>
                  • If automatic SMS is unavailable, your messaging app needs your confirmation
                  </Text>
                </View>

                <Text style={styles.hotlineHeader}>DIRECT EMERGENCY HOTLINES:</Text>

                <TouchableOpacity style={styles.hotlineBtnPrimary} onPress={() => Linking.openURL('tel:911')}>
                  <Ionicons name="call" size={18} color={Colors.white} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.hotlineName}>National Emergency Hotline</Text>
                    <Text style={styles.hotlineNum}>Dial 911</Text>
                  </View>
                </TouchableOpacity>

                {/* Makati C3 Hotline 168 */}
                <TouchableOpacity style={styles.hotlineBtnPrimary} onPress={callMakatiC3}>
                  <Ionicons name="call" size={18} color={Colors.white} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.hotlineName}>Makati C3 Command Center</Text>
                    <Text style={styles.hotlineNum}>Dial 168 • Makati emergency response</Text>
                  </View>
                </TouchableOpacity>

                {/* PNP Makati Station */}
                <TouchableOpacity style={styles.hotlineBtnSecondary} onPress={callPNPMakati}>
                  <Ionicons name="shield" size={18} color={Colors.darkText} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.hotlineNameDark}>Makati Police Department</Text>
                    <Text style={styles.hotlineNumDark}>(02) 8887-6642</Text>
                  </View>
                </TouchableOpacity>

                {/* Personal Emergency Contacts */}
                {contacts.map((contact) => (
                  <TouchableOpacity key={contact.id ?? contact.phone_number} style={styles.hotlineBtnContact} onPress={() => callContact(contact)}>
                    <Ionicons name="person" size={18} color={Colors.primaryRed} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.hotlineNameRed}>Call {contact.contact_name}</Text>
                      <Text style={styles.hotlineNumDark}>{contact.phone_number}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity style={styles.dismissBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.dismissText}>Dismiss Emergency Panel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  touchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: Colors.primaryYellow,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
  },
  sosText: {
    color: Colors.white,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.8,
  },
  sosSubText: {
    color: Colors.primaryYellow,
    fontWeight: 'bold',
    fontSize: 9,
    marginTop: -2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 25, 25, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  countdownCard: {
    width: '92%',
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  warningIconBg: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  countdownTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.darkText,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  countdownNumber: {
    fontSize: 76,
    fontWeight: '900',
    color: Colors.primaryRed,
    marginVertical: 4,
  },
  metadataCard: {
    backgroundColor: Colors.offWhite,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  metadataLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
  },
  metadataValue: {
    fontSize: 13,
    color: Colors.darkText,
    marginTop: 2,
  },
  countdownDesc: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 16,
  },
  cancelButton: {
    backgroundColor: Colors.darkText,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    width: '100%',
  },
  cancelButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Dispatch card
  dispatchCard: {
    width: '92%',
    backgroundColor: Colors.white,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  dispatchHeader: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dispatchTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dispatchBody: {
    padding: 20,
  },
  latencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    gap: 6,
  },
  latencyText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  telemetryBox: {
    backgroundColor: Colors.offWhite,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    marginBottom: 16,
  },
  telemetryTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  telemetryRow: {
    fontSize: 12,
    color: Colors.darkText,
    marginTop: 2,
  },
  hotlineHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.darkText,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  hotlineBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryRed,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  hotlineName: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  hotlineNum: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
  },
  hotlineBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  hotlineNameDark: {
    color: Colors.darkText,
    fontSize: 13,
    fontWeight: 'bold',
  },
  hotlineNumDark: {
    color: '#666',
    fontSize: 11,
  },
  hotlineBtnContact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF2F2',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  hotlineNameRed: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: 'bold',
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  dismissText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
});
