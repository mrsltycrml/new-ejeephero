import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';
import { passengerStyles as s } from './PassengerUI';
import EmergencyHotlines from './EmergencyHotlines';
import { buildEmergencyMessage, type PassengerFix } from '../services/passengerSafety';
import { loadEmergencyContacts, type EmergencyContact } from '../services/emergencyService';

type Props = { activeVehicleId?: string; activeVehiclePlate?: string; activeVehicleBody?: string; activeVehicleIsSample?: boolean };
export default function SOSButton({ activeVehicleId, activeVehiclePlate, activeVehicleBody, activeVehicleIsSample }: Props) {
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
  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => { run.current++; clearTimer(); }, []);
  const close = () => { run.current++; clearTimer(); busy.current = false; setCount(null); setVisible(false); };

  const activate = () => {
    if (busy.current) return;
    busy.current = true;
    const current = ++run.current;
    const vehicle = { id: activeVehicleId, plate: activeVehiclePlate, body: activeVehicleBody, sample: activeVehicleIsSample };
    setVisible(true); setCount(5); setPhase('countdown'); setStatus(''); setFix(null); setMessage(''); setContacts([]); setContactsLoaded(false);
    // Start collecting a fresh fix during the cancel window. Nothing is sent yet.
    const gpsPromise = (async (): Promise<PassengerFix | null> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = (async () => {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') return null;
          const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
          if (Date.now() - point.timestamp > 60_000) return null;
          return { latitude: point.coords.latitude, longitude: point.coords.longitude, accuracy: point.coords.accuracy, timestamp: point.timestamp };
        })();
        return await Promise.race([request, new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 15_000); })]);
      } catch { return null; } finally { if (timeout) clearTimeout(timeout); }
    })();
    const contactPromise = (async () => {
      const token = await getAccessToken().catch(() => null);
      const list = user ? await loadEmergencyContacts(user.id, token) : [];
      if (run.current === current) { setContacts(list); setContactsLoaded(true); }
      return list;
    })();
    const deadline = Date.now() + 5000;
    const dispatch = async () => {
      clearTimer(); setCount(null); setPhase('locating'); setStatus('Getting your current location…');
      const [point, list] = await Promise.all([gpsPromise, contactPromise]);
      if (run.current !== current) return;
      if (!point) { setPhase('fallback'); setStatus('Could not get a fresh location. Check location access or call a hotline below.'); return; }
      setFix(point);
      const text = buildEmergencyMessage({ message: list[0]?.preset_message, fix: point, body: vehicle.body, plate: vehicle.plate, isSample: vehicle.sample });
      setMessage(text);
      if (!list.length) { setPhase('fallback'); setStatus('No emergency contacts are saved. Call a hotline below, or add a contact in Safety.'); return; }
      await openMessages(list, text, current);
    };
    timer.current = setInterval(() => {
      if (run.current !== current) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCount(remaining);
      if (remaining === 0) void dispatch();
    }, 100);
  };

  const openMessages = async (recipients = contacts, body = message, current = run.current) => {
    setPhase('opening'); setStatus('Opening Messages…');
    try {
      const phones = recipients.map(c => c.phone_number);
      if (Platform.OS === 'web') {
        const apple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
        await Linking.openURL(`sms:${phones.join(',')}${apple ? '&' : '?'}body=${encodeURIComponent(body)}`);
        if (run.current === current) setStatus('Tap Send in Messages to share your alert. If Messages did not open, use the button below on your phone.');
      } else if (await SMS.isAvailableAsync()) {
        if (run.current !== current) return;
        const result = await SMS.sendSMSAsync(phones, body);
        if (run.current === current) setStatus(result.result === 'sent' ? 'Your messaging app reports that the SMS was sent.' : result.result === 'cancelled' ? 'Message cancelled. No send was confirmed.' : 'Check Messages to confirm your alert was sent.');
      } else if (run.current === current) setStatus('Messages is unavailable on this device. Open eSAKAY on your phone or call a hotline below.');
      if (run.current === current) setPhase('ready');
    } catch { if (run.current === current) { setPhase('fallback'); setStatus('Could not open Messages. Try the button below on your phone or call a hotline.'); } }
  };
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Emergency SOS, starts a five second cancellation timer" onPress={activate} style={[s.button, { backgroundColor: Colors.primaryRed }]}><Ionicons name="alert-circle-outline" size={20} color={Colors.white} /><Text style={s.buttonText}>Emergency SOS</Text></TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, padding: 16, backgroundColor: 'rgba(24,40,46,0.5)', alignItems: 'center', justifyContent: 'center' }}>
        <ScrollView style={{ maxHeight: '92%', width: '100%', maxWidth: 480, borderRadius: 12, backgroundColor: Colors.paper }} contentContainerStyle={{ padding: 22, gap: 16 }}>
          <Text accessibilityRole="header" style={s.title}>{phase === 'countdown' ? 'Preparing an SOS alert' : 'Emergency alert'}</Text>
          {count !== null ? <><Text accessibilityLiveRegion="polite" style={{ fontSize: 44, fontWeight: '800', color: Colors.primaryRed, fontVariant: ['tabular-nums'] }}>{count} sec</Text><Text style={s.body}>When the timer ends, Messages will open with your saved contacts, current GPS location, body number, and plate number. Tap Send in Messages to share the alert.</Text><TouchableOpacity accessibilityRole="button" style={[s.button, { backgroundColor: Colors.ink }]} onPress={close}><Text style={s.buttonText}>Cancel alert</Text></TouchableOpacity></>
            : <><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.body}>{status}</Text>{(phase === 'locating' || phase === 'opening') && <ActivityIndicator color={Colors.primaryRed} />}{phase === 'locating' && <TouchableOpacity accessibilityRole="button" style={[s.button, s.secondary]} onPress={close}><Text style={s.label}>Cancel alert</Text></TouchableOpacity>}</>}
          <View style={{ gap: 4 }}><Text style={s.label}>Unit {activeVehicleBody || 'not selected'} · Plate {activeVehiclePlate || 'not selected'}</Text><Text style={s.muted}>{contactsLoaded ? `${contacts.length} saved contact${contacts.length === 1 ? '' : 's'}` : 'Checking saved contacts…'}</Text>{fix && <Text style={s.muted}>Location captured at {new Date(fix.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{fix.accuracy == null ? '' : ` · accuracy ±${Math.round(fix.accuracy)} m`}</Text>}</View>
          {(phase === 'ready' || phase === 'fallback') && message && contacts.length > 0 && <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => { void openMessages(); }}><Text style={s.buttonText}>Open Messages</Text></TouchableOpacity>}
          <EmergencyHotlines />
          {contacts.map(c => <TouchableOpacity key={c.phone_number} accessibilityRole="link" onPress={() => Linking.openURL(`tel:${c.phone_number}`)} style={[s.button, s.secondary]}><Ionicons name="call-outline" size={18} color={Colors.ink} /><Text style={s.label}>Call {c.contact_name}</Text></TouchableOpacity>)}
          {(phase === 'ready' || phase === 'fallback' || phase === 'opening') && <TouchableOpacity accessibilityRole="button" onPress={close} style={[s.button, s.secondary]}><Text style={s.label}>Close</Text></TouchableOpacity>}
        </ScrollView>
      </View>
    </Modal>
  </>;
}
