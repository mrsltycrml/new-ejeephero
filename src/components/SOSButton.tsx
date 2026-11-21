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
import { validPoint } from '../services/locationQuality';
import { getBrowserPosition } from '../services/browserLocation';
import { callEmergencyService, loadEmergencyContacts, type EmergencyContact } from '../services/emergencyService';

type Props = {
  activeVehicleId?: string;
  activeVehiclePlate?: string;
  activeVehicleBody?: string;
};

async function requestSosPosition() {
  if (Platform.OS === 'web') return getBrowserPosition();
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
}

export default function SOSButton({
  activeVehicleId,
  activeVehiclePlate,
  activeVehicleBody,
}: Props) {
  const { user, getAccessToken } = useAuth();
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [phase, setPhase] = useState<'countdown' | 'locating' | 'opening' | 'ready' | 'accepted' | 'fallback'>('countdown');
  const [status, setStatus] = useState('');
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
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
    setMessage('');
    setContacts([]);

    const gpsPromise = (async (): Promise<PassengerFix | null> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = (async () => {
          const point = await requestSosPosition();
          if (!point || !validPoint(point.coords) || !Number.isFinite(point.timestamp) || Math.abs(Date.now() - point.timestamp) > 60_000) return null;
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
        setMessage([list[0]?.preset_message || 'EMERGENCY! I need help. Please check on me.',
          vehicle.body && `Body number: ${vehicle.body}`, vehicle.plate && `Plate number: ${vehicle.plate}`].filter(Boolean).join('\n'));
        setPhase('fallback');
        setStatus('Your location is unavailable. Add your location in Messages or call a hotline.');
        return;
      }
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
          setPhase('accepted');
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
        if (run.current !== current) return;
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
        setStatus('Messages is unavailable on this device. Use your phone or call a hotline below.');
      }
      if (run.current === current) setPhase('ready');
    } catch {
      if (run.current === current) {
        setPhase('fallback');
        setStatus("We couldn't confirm your alert. Send an SMS as a backup.");
      }
    }
  };

  const preparing = phase === 'opening' || phase === 'locating';
  const heading = preparing ? 'Preparing alert…' : phase === 'accepted' ? 'Alert accepted' : phase === 'ready' ? 'SMS status' : 'Dispatch not confirmed';

  return (
    <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Emergency SOS, starts a five second cancellation timer"
        onPress={activate} style={[s.button, styles.sosTrigger]}>
        <Ionicons aria-hidden name="alert-circle-outline" size={24} color={Colors.white} />
        <Text style={s.buttonText}>Emergency SOS</Text>
      </TouchableOpacity>

      <BottomSheetModal visible={visible} onClose={close} maxWidth={480} contentContainerStyle={{ gap: 14 }}>
        {count !== null ? <>
          <Text accessibilityRole="header" style={s.title}>Preparing your SOS</Text>
          <View style={styles.countdown}>
            <Text accessibilityLiveRegion="polite" style={styles.number}>{count}</Text>
            <Text style={s.label}>seconds to cancel</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={close} style={s.button}>
            <Text style={s.buttonText}>Cancel SOS</Text>
          </TouchableOpacity>
          <Text style={s.body}>Dispatch starts when the countdown ends. SOS is checking your location.</Text>
          <View style={styles.ride}>
            <Ionicons aria-hidden name="bus-outline" size={22} color={Colors.action} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{activeVehicleBody ? `Linked unit ${activeVehicleBody}` : 'No linked unit'}</Text>
              {activeVehiclePlate && <Text style={s.muted}>Plate {activeVehiclePlate}</Text>}
            </View>
          </View>
        </> : <>
          <View style={styles.statusRow}>
            {preparing ? <ActivityIndicator color={Colors.action} />
              : <Ionicons aria-hidden name={phase === 'accepted' ? 'checkmark-circle-outline' : phase === 'ready' ? 'chatbubble-outline' : 'warning-outline'}
                size={26} color={phase === 'accepted' ? Colors.success : phase === 'ready' ? Colors.action : Colors.warning} />}
            <Text accessibilityRole="header" style={[s.sectionTitle, { flex: 1 }]}>{heading}</Text>
          </View>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.body}>{status}</Text>
          {!preparing && phase !== 'accepted' && <>
            <TouchableOpacity accessibilityRole="button" onPress={() => void openMessages()} style={s.button}>
              <Ionicons aria-hidden name="chatbubble-outline" size={20} color={Colors.white} /><Text style={s.buttonText}>Open Messages</Text>
            </TouchableOpacity>
            <Text style={s.muted}>{contacts.length ? `Review the message for ${contacts.length} saved contact${contacts.length === 1 ? '' : 's'} before sending.` : 'Choose a recipient in Messages before sending.'}</Text>
          </>}
          {!!message && !preparing && phase !== 'accepted' && <View style={styles.preview}>
            <Text style={s.label}>SMS message</Text>
            <Text selectable style={s.body}>{message}</Text>
          </View>}
          <EmergencyHotlines />
          <TouchableOpacity accessibilityRole="button" onPress={close} style={[s.button, s.secondary]}>
            <Text style={s.link}>Back to Safety</Text>
          </TouchableOpacity>
        </>}
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  sosTrigger: { minHeight: 54, backgroundColor: Colors.primaryRed },
  countdown: { padding: 16, borderRadius: 8, backgroundColor: Colors.dangerBg, alignItems: 'center' },
  number: { fontSize: 64, fontWeight: '800', color: Colors.primaryRed, fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ride: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: Colors.border, paddingTop: 12 },
  preview: { gap: 6, padding: 12, borderLeftWidth: 3, borderColor: Colors.action, backgroundColor: Colors.canvas },
});
