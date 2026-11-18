import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from './PassengerUI';
import { Colors } from '../constants/theme';
import { BOARDING_EDUCATION, type BoardingStatus } from '../services/passengerSafety';
import { stopLandmarks } from '../services/stopLandmarks';
import { LANDMARK_REFERENCE } from '../constants/esakayOperations';
import type { TerminalData } from '../services/offlineTransitService';

export default function PassengerStopGuide({ boarding, landmarks, selectedStop, onSelectStop, onWalk, walkingBusy,
  onRefresh, loading, loadError, openRequest }: {
  boarding: BoardingStatus; landmarks: TerminalData[]; selectedStop: TerminalData | null;
  onSelectStop: (stop: TerminalData) => void; onWalk: (stop: TerminalData) => void; walkingBusy: boolean;
  onRefresh: () => void; loading: boolean; loadError: boolean; openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  useEffect(() => { if (openRequest || selectedStop) setOpen(true); }, [openRequest, selectedStop?.id]);
  const active = landmarks.find(stop => stop.id === selectedStop?.id) || null;
  const details = stopLandmarks(active);
  const boardingColor = boarding.kind === 'prohibited' ? Colors.primaryRed : boarding.kind === 'allowed' ? Colors.success : Colors.warning;
  return (
    <View style={s.section}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop landmarks" accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)} style={styles.disclosure}>
        <Ionicons aria-hidden name="location-outline" size={22} color={Colors.action} />
        <Text style={[s.sectionTitle, styles.grow]}>Stop landmarks</Text>
        <Ionicons aria-hidden name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.action} />
      </TouchableOpacity>
      {open && <>
        <View style={[styles.boarding, { borderLeftColor: boardingColor }]}>
          <Text style={s.muted}>Your current waiting area</Text>
          <Text accessibilityRole={boarding.kind === 'prohibited' ? 'alert' : undefined} style={s.label}>{boarding.title}</Text>
          <Text style={s.body}>{boarding.detail}</Text>
        </View>
        <PassengerSelect label="Inspect a stop" value={active?.id || ''} disabled={!landmarks.length}
          options={landmarks.map(stop => ({ value: stop.id, label: stop.name }))}
          onSelect={id => { const stop = landmarks.find(item => item.id === id); if (stop) onSelectStop(stop); }} />
        {!landmarks.length && <Text style={s.muted}>Verified stop locations are unavailable. The historical landmark reference is available below.</Text>}
        {active && <>
          <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} accessibilityState={{ disabled: walkingBusy }}
            onPress={() => onWalk(active)} style={[s.button, walkingBusy && { opacity: 0.6 }]}>
            <Text style={s.buttonText}>{walkingBusy ? 'Finding a walking route…' : 'Walk to this stop'}</Text>
          </TouchableOpacity>
          {details?.photo && failedPhoto !== details.photo ? <>
            <Image source={{ uri: details.photo }} accessibilityLabel={`Recorded landmark at ${active.name}`} resizeMode="contain"
              style={styles.photo} onError={() => setFailedPhoto(details.photo)} />
            <TouchableOpacity accessibilityRole="link" style={styles.link} onPress={() => void Linking.openURL(details.photoSource!)}><Text style={s.link}>Photo source</Text></TouchableOpacity>
          </> : <Text style={s.muted}>Stop photo unavailable.</Text>}
          <Text style={s.body}>{details?.description || 'Landmark description unavailable.'}</Text>
          <View>
            {[
              ['Boarding side', details?.boardingSide],
              ['Travel direction', details?.direction],
              ['Entrance', details?.entrance],
            ].map(([label, value]) => <View key={label} style={styles.detail}>
              <Text style={s.muted}>{label}</Text><Text style={s.label}>{value || 'Unavailable'}</Text>
            </View>)}
          </View>
          {details && <TouchableOpacity accessibilityRole="link" style={styles.link} onPress={() => void Linking.openURL(details.source)}>
            <Text style={s.link}>Stop details source · verified {new Date(details.verifiedAt).toLocaleDateString()}</Text>
          </TouchableOpacity>}
        </>}
        <Text style={s.muted}>{BOARDING_EDUCATION}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={loading} accessibilityState={{ disabled: loading }} onPress={onRefresh} style={[s.button, s.secondary]}>
          <Text style={s.link}>{loading ? 'Refreshing…' : loadError ? 'Retry stops and routes' : 'Refresh stops and routes'}</Text>
        </TouchableOpacity>
      </>}
      <View style={s.divider} />
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: referenceOpen }} onPress={() => setReferenceOpen(!referenceOpen)} style={styles.disclosure}>
        <View style={styles.grow}>
          <Text style={s.link}>Historical landmark reference</Text><Text style={s.muted}>{LANDMARK_REFERENCE.date}</Text>
        </View>
        <Ionicons aria-hidden name={referenceOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.action} />
      </TouchableOpacity>
      {referenceOpen && <>
        <Text style={s.muted}>Distances are printed labels from the photographed sheet. Current travel distances, coordinates, boarding sides and entrances require separate verification.</Text>
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
  boarding: { borderLeftWidth: 3, backgroundColor: Colors.canvas, padding: 12, gap: 4 },
  photo: { width: '100%', height: 180, borderRadius: 8, backgroundColor: Colors.canvas },
  link: { minHeight: 48, justifyContent: 'center' },
  detail: { gap: 3, paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.border },
  referenceRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.border },
  km: { minWidth: 42, fontWeight: '700', color: Colors.subtleGray, fontVariant: ['tabular-nums'] },
});
