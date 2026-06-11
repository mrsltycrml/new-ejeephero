import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Linking, Alert, Animated, Vibration,
} from 'react-native';
import * as SMS from 'expo-sms';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useLocation } from '../contexts/LocationContext';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

export default function SOSButton() {
  const { location } = useLocation();
  const { user } = useAuth();

  const [modalVisible, setModalVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [contact, setContact] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchContact = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) setContact(data);
    };
    fetchContact();
  }, [user?.id, modalVisible]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      triggerEmergencyActions();
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handlePressIn = () => {
    Vibration.vibrate(50);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 1500, // 1.5 seconds hold
      useNativeDriver: true,
    }).start();

    holdTimer.current = setTimeout(() => {
      Vibration.vibrate([0, 100, 50, 200]);
      progressAnim.setValue(0);
      startCountdownSequence();
    }, 1500);
  };

  const handlePressOut = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const startCountdownSequence = () => {
    if (!contact) {
      Alert.alert('No Emergency Contact', 'Please set an emergency contact in the Contacts tab first.');
      return;
    }
    setStatusMsg('');
    setCountdown(5); // 5 seconds is safer and faster than 10
    setModalVisible(true);
  };

  const cancelSOS = () => {
    setCountdown(null);
    setModalVisible(false);
  };

  const triggerEmergencyActions = async () => {
    setCountdown(null);
    setStatusMsg('Retrieving location & opening SMS...');

    let currentLoc = location;
    if (!currentLoc) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
      } catch (e) {
        console.warn('Failed to get location on-demand:', e);
      }
    }

    const lat = currentLoc?.coords.latitude;
    const lng = currentLoc?.coords.longitude;

    // Log the event in database
    try {
      await supabase.from('sos_events').insert({
        user_id: user?.id,
        latitude: lat,
        longitude: lng,
      });
    } catch (err) {
      console.warn('Failed to log SOS event:', err);
    }

    // Open native SMS directly to send via user's own SIM (P2P SMS)
    await openNativeSMS(currentLoc);
  };

  const openNativeSMS = async (passedLoc?: Location.LocationObject | null) => {
    if (!contact) return;
    const isAvailable = await SMS.isAvailableAsync();
    if (isAvailable) {
      const activeLoc = passedLoc || location;
      const coordinatesText = activeLoc
        ? `Coordinates: ${activeLoc.coords.latitude.toFixed(6)}, ${activeLoc.coords.longitude.toFixed(6)}`
        : 'Location unavailable';
      const preset = contact.preset_message || 'EMERGENCY! I need help.';
      const msg = `${preset}\n\nMy location: ${coordinatesText}`;
      await SMS.sendSMSAsync([contact.phone_number], msg);
      setStatusMsg('SMS app opened.');
    } else {
      setStatusMsg('SMS is not available on this device.');
    }
  };

  const handleCall = () => {
    if (!contact) return;
    Linking.openURL(`tel:${contact.phone_number}`);
  };

  // Interpolate animations
  const scale = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const liquidFillScale = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.01, 1], // Start small, fill up
  });



  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.touchable}
      >
        <View style={styles.container}>
          {/* Main Button with Scaling */}
          <Animated.View style={[styles.button, { transform: [{ scale }] }]}>
            {/* Liquid Gold/Yellow Hold Progress Fill */}
            <Animated.View
              style={[
                styles.progressFill,
                {
                  transform: [{ scale: liquidFillScale }],
                },
              ]}
            />
            {/* "SOS" Text */}
            <Text style={styles.text}>SOS</Text>
          </Animated.View>
        </View>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          {countdown !== null ? (
            <View style={[styles.modalContent, styles.countdownContent]}>
              <View style={styles.alertIconBg}>
                <Ionicons name="warning" size={50} color={Colors.primaryRed} />
              </View>
              <Text style={styles.countdownTitle}>SENDING SOS IN</Text>
              <Text style={styles.countdownNumber}>{countdown}</Text>
              <Text style={styles.countdownDesc}>
                Alerting <Text style={{ fontWeight: 'bold' }}>{contact?.contact_name}</Text> with your current coordinates.
              </Text>
              <TouchableOpacity style={styles.cancelBigButton} onPress={cancelSOS}>
                <Text style={styles.cancelBigText}>TAP TO CANCEL</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.modalContent}>
              <View style={styles.warningHeader}>
                <Ionicons name="shield-checkmark" size={36} color={Colors.primaryYellow} />
                <Text style={styles.modalTitle}>SOS EMERGENCY MODE</Text>
              </View>

              <View style={styles.bodyContent}>
                <Text style={styles.statusMsg}>{statusMsg}</Text>
                <Text style={styles.contactInfo}>
                  Recipient: <Text style={{ color: Colors.darkText, fontWeight: 'bold' }}>{contact?.contact_name}</Text> ({contact?.phone_number})
                </Text>

                <TouchableOpacity style={styles.actionButtonSecondary} onPress={() => openNativeSMS()}>
                  <Ionicons name="chatbubble-ellipses" size={22} color={Colors.primaryRed} style={{ marginRight: 8 }} />
                  <Text style={styles.actionTextSecondary}>Send SMS Again</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
                  <Ionicons name="call" size={22} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.actionText}>Call Contact Now</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelText}>Dismiss</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accentRed,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderWidth: 2,
    borderColor: Colors.primaryYellow,
    overflow: 'hidden', // Required for liquid fill to remain circular
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.5,
    elevation: 6,
  },
  progressFill: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryYellow,
  },
  text: {
    color: Colors.white,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.5,
    zIndex: 3,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(45, 45, 45, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    backgroundColor: Colors.white,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  countdownContent: {
    padding: 30,
    alignItems: 'center',
  },
  alertIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  countdownTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.darkText,
    letterSpacing: 1,
  },
  countdownNumber: {
    fontSize: 88,
    fontWeight: '900',
    color: Colors.primaryRed,
    marginVertical: 10,
  },
  countdownDesc: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  cancelBigButton: {
    backgroundColor: Colors.darkText,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  cancelBigText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  warningHeader: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 24,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  modalTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  bodyContent: {
    padding: 24,
    alignItems: 'stretch',
  },
  statusMsg: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryRed,
    marginBottom: 12,
  },
  contactInfo: {
    textAlign: 'center',
    fontSize: 15,
    marginBottom: 24,
    color: '#555',
  },
  actionButton: {
    backgroundColor: Colors.primaryRed,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  actionButtonSecondary: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.primaryRed,
  },
  actionText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionTextSecondary: {
    color: Colors.primaryRed,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    alignItems: 'center',
    paddingTop: 12,
  },
  cancelText: {
    color: '#777',
    fontSize: 15,
    fontWeight: '600',
  },
});
