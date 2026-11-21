import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      const list = user ? await loadEmergencyContacts(user.id) : [];
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
      setStatus(t('passenger.sos.locating'));
      const [point, list] = await Promise.all([gpsPromise, contactPromise]);
      if (run.current !== current) return;
      if (!point) {
        setMessage([list[0]?.preset_message || t('passenger.sos.message'),
          vehicle.body && t('passenger.sos.body', { unit: vehicle.body }), vehicle.plate && t('passenger.sos.plate', { plate: vehicle.plate })].filter(Boolean).join('\n'));
        setPhase('fallback');
        setStatus(t('passenger.sos.noLocation'));
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
        setStatus(t('passenger.sos.noContacts'));
        return;
      }
      if (list.every((contact) => contact.localOnly)) {
        await openMessages(list, text, current);
        return;
      }
      setStatus(t('passenger.sos.sending'));
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
          setStatus(t('passenger.sos.accepted'));
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
      setStatus(t('passenger.sos.unconfirmed'));
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
    setStatus(t('passenger.sos.opening'));
    try {
      const phones = recipients.map((c) => c.phone_number);
      if (Platform.OS === 'web') {
        const apple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
        await Linking.openURL(`sms:${phones.join(',')}${apple ? '&' : '?'}body=${encodeURIComponent(body)}`);
        if (run.current === current)
          setStatus(t('passenger.sos.review'));
      } else if (await SMS.isAvailableAsync()) {
        if (run.current !== current) return;
        const result = await SMS.sendSMSAsync(phones, body);
        if (run.current === current)
          setStatus(
            result.result === 'sent'
              ? t('passenger.sos.reportedSent')
              : result.result === 'cancelled'
                ? t('passenger.sos.cancelled')
                : t('passenger.sos.checkSent')
          );
      } else if (run.current === current) {
        setStatus(t('passenger.sos.noMessages'));
      }
      if (run.current === current) setPhase('ready');
    } catch {
      if (run.current === current) {
        setPhase('fallback');
        setStatus(t('passenger.sos.unconfirmed'));
      }
    }
  };

  const preparing = phase === 'opening' || phase === 'locating';
  const heading = preparing ? t('passenger.sos.preparing') : phase === 'accepted' ? t('passenger.sos.acceptedTitle') : phase === 'ready' ? t('passenger.sos.smsStatus') : t('passenger.sos.notConfirmed');

  return (
    <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.sos.startLabel')}
        onPress={activate} style={[s.button, styles.sosTrigger]}>
        <Ionicons aria-hidden name="alert-circle-outline" size={24} color={Colors.white} />
        <Text style={s.buttonText}>{t('passenger.sos.start')}</Text>
      </TouchableOpacity>

      <BottomSheetModal visible={visible} onClose={close} maxWidth={480} contentContainerStyle={{ gap: 14 }}>
        {count !== null ? <>
          <Text accessibilityRole="header" style={s.title}>{t('passenger.sos.title')}</Text>
          <View style={styles.countdown}>
            <Text accessibilityLiveRegion="polite" style={styles.number}>{count}</Text>
            <Text style={s.label}>{t('passenger.sos.countdown')}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={close} style={s.button}>
            <Text style={s.buttonText}>{t('passenger.sos.cancel')}</Text>
          </TouchableOpacity>
          <Text style={s.body}>{t('passenger.sos.countdownHelp')}</Text>
          <View style={styles.ride}>
            <Ionicons aria-hidden name="bus-outline" size={22} color={Colors.action} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{activeVehicleBody ? t('passenger.sos.linked', { unit: activeVehicleBody }) : t('passenger.sos.noUnit')}</Text>
              {activeVehiclePlate && <Text style={s.muted}>{t('passenger.home.plateValue', { plate: activeVehiclePlate })}</Text>}
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
              <Ionicons aria-hidden name="chatbubble-outline" size={20} color={Colors.white} /><Text style={s.buttonText}>{t('passenger.sos.openMessages')}</Text>
            </TouchableOpacity>
            <Text style={s.muted}>{contacts.length ? t('passenger.sos.reviewRecipients', { total: contacts.length, suffix: contacts.length === 1 ? '' : 's' }) : t('passenger.sos.chooseRecipient')}</Text>
          </>}
          {!!message && !preparing && phase !== 'accepted' && <View style={styles.preview}>
            <Text style={s.label}>{t('passenger.sos.sms')}</Text>
            <Text selectable style={s.body}>{message}</Text>
          </View>}
          <EmergencyHotlines />
          <TouchableOpacity accessibilityRole="button" onPress={close} style={[s.button, s.secondary]}>
            <Text style={s.link}>{t('passenger.sos.back')}</Text>
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
