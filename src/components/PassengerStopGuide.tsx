import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from './PassengerUI';
import { color } from '../constants/theme';
import { BOARDING_EDUCATION, type BoardingStatus } from '../services/passengerSafety';
import { stopLandmarks } from '../services/stopLandmarks';
import { LANDMARK_REFERENCE } from '../constants/esakayOperations';
import type { TerminalData } from '../services/offlineTransitService';
import { confirmedPassengerUse, permitsPassengerUse, passengerUseLabel } from '../services/routeMap';

export default function PassengerStopGuide({ boarding, landmarks, selectedStop, onSelectStop, onWalk, walkingBusy,
  onRefresh, loading, loadError, openRequest }: {
  boarding: BoardingStatus; landmarks: TerminalData[]; selectedStop: TerminalData | null;
  onSelectStop: (stop: TerminalData) => void; onWalk: (stop: TerminalData) => void; walkingBusy: boolean;
  onRefresh: () => void; loading: boolean; loadError: boolean; openRequest?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  useEffect(() => { if (openRequest || selectedStop) setOpen(true); }, [openRequest, selectedStop?.id]);
  const stops = landmarks.filter(stop => confirmedPassengerUse(stop));
  const active = stops.find(stop => stop.id === selectedStop?.id) || null;
  const details = stopLandmarks(active);
  const boardingColor = boarding.kind === 'prohibited' ? color.ember : boarding.kind === 'allowed' ? color.success : color.warning;
  return (
    <View style={s.section}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.guide.title')} accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)} style={styles.disclosure}>
        <Ionicons aria-hidden name="location-outline" size={22} color={color.action} />
        <Text style={[s.sectionTitle, styles.grow]}>{t('passenger.guide.title')}</Text>
        <Ionicons aria-hidden name={open ? 'chevron-up' : 'chevron-down'} size={18} color={color.action} />
      </TouchableOpacity>
      {open && <>
        <View style={[styles.boarding, { borderLeftColor: boardingColor }]}>
          <Text style={s.muted}>{t('passenger.guide.waitingArea')}</Text>
          <Text accessibilityRole={boarding.kind === 'prohibited' ? 'alert' : undefined} style={s.label}>{boarding.title}</Text>
          <Text style={s.body}>{boarding.detail}</Text>
        </View>
        <PassengerSelect label={t('passenger.guide.inspect')} value={active?.id || ''} disabled={!stops.length}
          options={stops.map(stop => ({ value: stop.id, label: `${stop.name} · ${t('passenger.map.labels.' + passengerUseLabel(stop))}` }))}
          onSelect={id => { const stop = stops.find(item => item.id === id); if (stop) onSelectStop(stop); }} />
        {!stops.length && <Text style={s.muted}>{t('passenger.guide.missing')}</Text>}
        {active && <>
          {permitsPassengerUse(active, 'board') && <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} accessibilityState={{ disabled: walkingBusy }}
            onPress={() => onWalk(active)} style={[s.button, walkingBusy && { opacity: 0.6 }]}>
            <Text style={s.buttonText}>{walkingBusy ? t('passenger.guide.findingWalk') : t('passenger.guide.walkHere')}</Text>
          </TouchableOpacity>}
          {details?.photo && failedPhoto !== details.photo ? <>
            <Image source={{ uri: details.photo }} accessibilityLabel={t('passenger.guide.photoLabel', { stop: active.name })} resizeMode="contain"
              style={styles.photo} onError={() => setFailedPhoto(details.photo)} />
            <TouchableOpacity accessibilityRole="link" style={styles.link} onPress={() => void Linking.openURL(details.photoSource!)}><Text style={s.link}>{t('passenger.guide.photoSource')}</Text></TouchableOpacity>
          </> : <Text style={s.muted}>{t('passenger.guide.noPhoto')}</Text>}
          <Text style={s.body}>{details?.description || t('passenger.guide.noDescription')}</Text>
          <View>
            {[
              ...(permitsPassengerUse(active, 'board') ? [[t('passenger.guide.boardingSide'), details?.boardingSide]] : []),
              [t('passenger.guide.direction'), details?.direction],
              [t('passenger.guide.entrance'), details?.entrance],
            ].map(([label, value]) => <View key={label} style={styles.detail}>
              <Text style={s.muted}>{label}</Text><Text style={s.label}>{value || t('passenger.home.unavailable')}</Text>
            </View>)}
          </View>
          {details && <TouchableOpacity accessibilityRole="link" style={styles.link} onPress={() => void Linking.openURL(details.source)}>
            <Text style={s.link}>{t('passenger.guide.detailsSource', { date: new Date(details.verifiedAt).toLocaleDateString() })}</Text>
          </TouchableOpacity>}
        </>}
        <Text style={s.muted}>{t('passenger.guide.education', BOARDING_EDUCATION)}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={loading} accessibilityState={{ disabled: loading }} onPress={onRefresh} style={[s.button, s.secondary]}>
          <Text style={s.link}>{loading ? t('passenger.guide.refreshing') : loadError ? t('passenger.guide.retry') : t('passenger.guide.refresh')}</Text>
        </TouchableOpacity>
      </>}
      <View style={s.divider} />
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: referenceOpen }} onPress={() => setReferenceOpen(!referenceOpen)} style={styles.disclosure}>
        <View style={styles.grow}>
          <Text style={s.link}>{t('passenger.guide.reference')}</Text><Text style={s.muted}>{LANDMARK_REFERENCE.date}</Text>
        </View>
        <Ionicons aria-hidden name={referenceOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.action} />
      </TouchableOpacity>
      {referenceOpen && <>
        <Text style={s.muted}>{t('passenger.guide.referenceNote')}</Text>
        <View>
          {LANDMARK_REFERENCE.stops.map(stop => <View key={stop.printedKm} style={styles.referenceRow}>
            <Text style={styles.km}>{stop.printedKm} km</Text><Text style={[s.body, styles.grow]}>{stop.name}</Text>
          </View>)}
        </View>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  disclosure: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 },
  boarding: { borderLeftWidth: 3, backgroundColor: color.canvas, padding: 12, gap: 4 },
  photo: { width: '100%', height: 180, borderRadius: 8, backgroundColor: color.canvas },
  link: { minHeight: 48, justifyContent: 'center' },
  detail: { gap: 3, paddingVertical: 8, borderTopWidth: 1, borderColor: color.border },
  referenceRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: color.border },
  km: { minWidth: 42, fontWeight: '700', color: color.inkMuted, fontVariant: ['tabular-nums'] },
});
