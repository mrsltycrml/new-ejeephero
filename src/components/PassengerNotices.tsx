import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '../contexts/LocationContext';
import { usePassengerJourney } from '../contexts/PassengerJourneyContext';
import { loadLoadingZones } from '../services/passengerDataService';
import { BOARDING_EDUCATION, evaluateBoardingLocation, type LoadingZone } from '../services/passengerSafety';
import { passengerStyles as s } from './PassengerUI';
import { Colors } from '../constants/theme';

export default function PassengerNotices({ open, onClose, onGuide }: { open: boolean; onClose: () => void; onGuide: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions(); const { location, foreground, errorMsg } = useLocation();
  const insets = useSafeAreaInsets();
  const { transit, selectedRouteId } = usePassengerJourney();
  const [zones, setZones] = useState<LoadingZone[]>([]); const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    let active = true;
    loadLoadingZones().then(z => { if (active) setZones(z); }).catch(() => { if (active) setZones([]); });
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [open]);
  if (!open) return null;
  const stops = transit.terminals.filter(stop => !selectedRouteId || stop.route_id === selectedRouteId);
  const status = evaluateBoardingLocation(location && foreground && !errorMsg ? { ...location.coords, timestamp: location.timestamp } : null, zones, now, stops, t);
  return <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 40 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.notice.close')} onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
    <View style={[s.section, { position: 'absolute', top: 58 + insets.top, right: 12, width: Math.min(360, width - 24), gap: 12, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 9 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.sectionTitle}>{t('passenger.notice.title')}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.notice.dismiss')} onPress={onClose} style={{ padding: 10 }}><Ionicons name="close" size={20} color={Colors.ink} /></TouchableOpacity></View>
      <Text accessibilityLiveRegion="polite" style={s.label}>{status.title}</Text><Text style={s.body}>{status.detail}</Text><Text style={s.muted}>{t('passenger.guide.education', BOARDING_EDUCATION)}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); onGuide(); }} style={s.button}><Text style={s.buttonText}>{t('passenger.notice.guide')}</Text></TouchableOpacity>
    </View>
  </View>;
}
