import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Linking, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';
import { BottomSheetModal, triggerHaptic } from './AppUI';
import { passengerStyles as s } from './PassengerUI';
import EmergencyHotlines from './EmergencyHotlines';
import { buildEmergencyMessage, type PassengerFix } from '../services/passengerSafety';
import { callEmergencyService, loadEmergencyContacts, type EmergencyContact } from '../services/emergencyService';

type Props = {
  activeVehicleId?: string;
  activeVehiclePlate?: string;
  activeVehicleBody?: string;
};

export default function SOSButton({
  activeVehicleId,
  activeVehiclePlate,
  activeVehicleBody,
}: Props) {
  const { user, getAccessToken } = useAuth();
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [phase, setPhase] = useState<'countdown' | 'locating' | 'opening' | 'ready' | 'fallback'>('countdown');
  const [status, setStatus] = useState('');
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [fix, setFix] = useState<PassengerFix | null>(null);
  const [message, setMessage] = useState('');
  const run = useRef(0);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => {
    run.current++;
    clearTimer();
  }, []);

  const close = () => {
    if (count !== null) triggerHaptic('light');
    run.current++;
    clearTimer();
    busy.current = false;
    setCount(null);
    setVisible(false);
  };

  const activate = () => {
    if (busy.current) return;
    busy.current = true;
    triggerHaptic('warning');
    const current = ++run.current;
    const vehicle = {
      id: activeVehicleId,
      plate: activeVehiclePlate,
      body: activeVehicleBody,
    };
    setVisible(true);
    setCount(5);
    setPhase('countdown');
    setStatus('');
    setFix(null);
    setMessage('');
    setContacts([]);
    setContactsLoaded(false);

    const gpsPromise = (async (): Promise<PassengerFix | null> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = (async () => {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') return null;
          const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
          if (Date.now() - point.timestamp > 60_000) return null;
          return {
            latitude: point.coords.latitude,
            longitude: point.coords.longitude,
            accuracy: point.coords.accuracy,
            timestamp: point.timestamp,
          };
        })();
        return await Promise.race([
          request,
          new Promise<null>((resolve) => {
            timeout = setTimeout(() => resolve(null), 15_000);
          }),
        ]);
      } catch {
        return null;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    })();

    const contactPromise = (async () => {
      const token = await getAccessToken().catch(() => null);
      const list = user ? await loadEmergencyContacts(user.id, token) : [];
      if (run.current === current) {
        setContacts(list);
        setContactsLoaded(true);
      }
      return list;
    })();

    const deadline = Date.now() + 5000;
    const dispatch = async () => {
      clearTimer();
      triggerHaptic('medium');
      setCount(null);
      setPhase('locating');
      setStatus('Getting your precise location…');
      const [point, list] = await Promise.all([gpsPromise, contactPromise]);
      if (run.current !== current) return;
      if (!point) {
        setPhase('fallback');
        setStatus("We couldn't confirm your alert. Send an SMS as a backup.");
        return;
      }
      setFix(point);
      const text = buildEmergencyMessage({
        message: list[0]?.preset_message,
        fix: point,
        body: vehicle.body,
        plate: vehicle.plate,
      });
      setMessage(text);
      if (!list.length) {
        setPhase('fallback');
        setStatus('No trusted contacts are saved yet. Call a hotline below or add a contact in Safety.');
        return;
      }
      if (list.every((contact) => contact.localOnly)) {
        await openMessages(list, text, current);
        return;
      }
      setStatus('Sending emergency alert…');
      try {
        const token = await getAccessToken();
        if (run.current !== current) return;
        const result = await callEmergencyService(token, {
          action: 'dispatch',
          requestId: Crypto.randomUUID(),
          fix: point,
          vehicleBody: vehicle.body,
          vehiclePlate: vehicle.plate,
        });
        if (run.current !== current) return;
        if (result.accepted === list.length && result.total === list.length && !list.some((contact) => contact.localOnly)) {
          setPhase('ready');
          setStatus('SMS provider accepted the alert for all saved contacts. Call a hotline if you need immediate help.');
          return;
        }
      } catch (err: any) {
        if (run.current !== current) return;
        if (err?.status === 503) {
          await openMessages(list, text, current);
          return;
        }
      }
      if (run.current !== current) return;
      setPhase('fallback');
      setStatus("We couldn't confirm your alert. Send an SMS as a backup.");
    };

    timer.current = setInterval(() => {
      if (run.current !== current) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCount(remaining);
      if (remaining === 0) void dispatch();
    }, 100);
  };

  const openMessages = async (recipients = contacts, body = message, current = run.current) => {
    setPhase('opening');
    setStatus('Opening Messages…');
    try {
      const phones = recipients.map((c) => c.phone_number);
      if (Platform.OS === 'web') {
        const apple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
        await Linking.openURL(`sms:${phones.join(',')}${apple ? '&' : '?'}body=${encodeURIComponent(body)}`);
        if (run.current === current)
          setStatus('Messages will open for you to review and send.');
      } else if (await SMS.isAvailableAsync()) {
        if (run.current === current) return;
        const result = await SMS.sendSMSAsync(phones, body);
        if (run.current === current)
          setStatus(
            result.result === 'sent'
              ? 'Your messaging app reports that the SMS was sent.'
              : result.result === 'cancelled'
                ? 'Message cancelled. No send was confirmed.'
                : 'Check Messages to confirm your alert was sent.'
          );
      } else if (run.current === current) {
        setStatus('Messages is unavailable on this device. Open ejeephero on your phone or call a hotline below.');
      }
      if (run.current === current) setPhase('ready');
    } catch {
      if (run.current === current) {
        setPhase('fallback');
        setStatus("We couldn't confirm your alert. Send an SMS as a backup.");
      }
    }
  };

  const unitLabel = `${activeVehicleBody || 'Not selected'} · ${activeVehiclePlate || 'Not selected'}`;

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS, starts a five second cancellation timer"
        onPress={activate}
        style={styles.sosTrigger}
      >
        <Ionicons name="shield-outline" size={22} color={Colors.white} />
        <Text style={styles.sosTriggerText}>Emergency SOS</Text>
      </TouchableOpacity>

      <BottomSheetModal visible={visible} onClose={close} maxWidth={480} contentContainerStyle={{ gap: 14 }}>
        {count !== null ? (
          /* BOARD 03 MIDDLE: PREPARING YOUR SOS */
          <View style={{ gap: 14 }}>
            <Text style={styles.brandWordmark}>ejeephero</Text>
            <Text accessibilityRole="header" style={styles.countdownHeading}>
              Preparing your SOS
            </Text>

            <View style={styles.countdownBox}>
              <Text accessibilityLiveRegion="polite" style={styles.countdownNumber}>
                {count}
              </Text>
              <Text style={styles.countdownSub}>seconds to cancel</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={Colors.brandGreen} />
              <Text style={styles.infoText}>Getting your precise location...</Text>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="bus-outline" size={20} color={Colors.brandGreen} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>Unit {unitLabel}</Text>
                <Text style={styles.infoSub}>Location, time and ride details will be included.</Text>
              </View>
            </View>

            <Text style={styles.dispatchCaption}>Dispatch starts when the countdown ends.</Text>

            <TouchableOpacity accessibilityRole="button" style={styles.cancelOutlineBtn} onPress={close}>
              <Text style={styles.cancelOutlineText}>Cancel SOS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* BOARD 03 RIGHT: DISPATCH NOT CONFIRMED / SMS BACKUP */
          <View style={{ gap: 14 }}>
            <TouchableOpacity accessibilityRole="button" onPress={close} style={styles.backSafetyRow}>
              <Ionicons name="chevron-back" size={20} color={Colors.ink} />
              <Text style={styles.backSafetyText}>Safety</Text>
            </TouchableOpacity>

            <View style={styles.warningTitleRow}>
              <View style={styles.amberIconCircle}>
                <Ionicons name="warning-outline" size={24} color={Colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={styles.fallbackHeading}>
                  {phase === 'locating' || phase === 'opening' ? 'Preparing alert…' : 'Dispatch not confirmed'}
                </Text>
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.subtitle}>
                  {status || "We couldn't confirm your alert. Send an SMS as a backup."}
                </Text>
              </View>
            </View>

            {(phase === 'locating' || phase === 'opening') && (
              <ActivityIndicator color={Colors.brandGreen} style={{ marginVertical: 6 }} />
            )}

            <View style={{ gap: 6 }}>
              <Text style={s.label}>Your SOS message</Text>
              <View style={styles.messagePreviewBox}>
                <Text style={styles.messagePreviewLine}>I need help.</Text>
                <Text style={styles.messagePreviewLine}>
                  Unit {activeVehicleBody || 'Not selected'} · Plate {activeVehiclePlate || 'Not selected'}
                </Text>
                <Text style={styles.messagePreviewSub}>
                  {fix
                    ? `Location captured at ${new Date(fix.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Location link and timestamp included'}
                </Text>
              </View>
            </View>

            <Text style={s.muted}>
              {contactsLoaded
                ? `Messages will open for you to review and send (${contacts.length} saved contact${contacts.length === 1 ? '' : 's'}).`
                : 'Messages will open for you to review and send.'}
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              style={s.button}
              onPress={() => {
                void openMessages();
              }}
            >
              <Text style={s.buttonText}>Open Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" onPress={close} style={styles.backLinkCenter}>
              <Text style={styles.backLinkText}>Back to Safety</Text>
            </TouchableOpacity>

            <View style={s.divider} />
            <EmergencyHotlines />
          </View>
        )}
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  sosTrigger: {
    minHeight: 60,
    borderRadius: 12,
    backgroundColor: Colors.primaryRed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  sosTriggerText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  brandWordmark: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  countdownHeading: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.ink,
    textAlign: 'center',
  },
  countdownBox: {
    backgroundColor: Colors.dangerBg,
    borderRadius: 16,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: Colors.primaryRed,
    fontVariant: ['tabular-nums'],
    lineHeight: 70,
  },
  countdownSub: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    fontSize: 15,
    color: Colors.ink,
    fontWeight: '500',
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  infoSub: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  dispatchCaption: {
    fontSize: 13,
    color: Colors.subtleGray,
    textAlign: 'center',
  },
  cancelOutlineBtn: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelOutlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  backSafetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backSafetyText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  warningTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  amberIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink,
  },
  messagePreviewBox: {
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  messagePreviewLine: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
  },
  messagePreviewSub: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  backLinkCenter: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  backLinkText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
});
