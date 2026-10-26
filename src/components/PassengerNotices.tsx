import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '../contexts/LocationContext';
import { loadLoadingZones } from '../services/passengerDataService';
import { BOARDING_EDUCATION, evaluateBoardingLocation, type LoadingZone } from '../services/passengerSafety';
import { passengerStyles as s } from './PassengerUI';
import { Colors } from '../constants/theme';

export default function PassengerNotices({ open, onClose, onGuide }: { open: boolean; onClose: () => void; onGuide: () => void }) {
  const { width } = useWindowDimensions(); const { location } = useLocation();
  const [zones, setZones] = useState<LoadingZone[]>([]); const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    let active = true;
    loadLoadingZones().then(z => { if (active) setZones(z); }).catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [open]);
  if (!open) return null;
  const status = evaluateBoardingLocation(location ? { ...location.coords, timestamp: location.timestamp } : null, zones, now);
  return <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 40 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close boarding notices" onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
    <View style={[s.section, { position: 'absolute', top: 64, right: 12, width: Math.min(360, width - 24), gap: 12 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.sectionTitle}>Boarding notices</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss boarding notices" onPress={onClose} style={{ padding: 10 }}><Ionicons name="close" size={20} color={Colors.ink} /></TouchableOpacity></View>
      <Text accessibilityLiveRegion="polite" style={s.label}>{status.title}</Text><Text style={s.body}>{status.detail}</Text><Text style={s.muted}>{BOARDING_EDUCATION}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); onGuide(); }} style={s.button}><Text style={s.buttonText}>View stop guide</Text></TouchableOpacity>
    </View>
  </View>;
}
