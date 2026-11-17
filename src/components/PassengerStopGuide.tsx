import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
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
  return <View style={s.section}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop details" accessibilityState={{ expanded: open }}
      onPress={() => setOpen(!open)} style={[s.row, { minHeight: 48, justifyContent: 'space-between' }]}>
      <Text style={s.sectionTitle}>Stop landmarks</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.brandGreen} />
    </TouchableOpacity>
    {open && <>
      <PassengerSelect label="Inspect a stop" value={active?.id || ''} disabled={!landmarks.length}
        options={landmarks.map(stop => ({ value: stop.id, label: stop.name }))}
        onSelect={id => { const stop = landmarks.find(item => item.id === id); if (stop) onSelectStop(stop); }} />
      {!landmarks.length && <Text style={s.muted}>Verified stop locations are unavailable. You can still read the historical landmark reference below.</Text>}
      {active && <>
        <Text style={s.label}>{active.name}</Text>
        {details?.photo && failedPhoto !== details.photo ? <>
          <Image source={{ uri: details.photo }} accessibilityLabel={`Recorded landmark at ${active.name}`} resizeMode="contain"
            style={{ width: '100%', height: 180, backgroundColor: Colors.canvas, borderRadius: 10 }} onError={() => setFailedPhoto(details.photo)} />
          <TouchableOpacity accessibilityRole="link" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openURL(details.photoSource!)}><Text style={s.link}>Photo source</Text></TouchableOpacity>
        </> : <Text style={s.muted}>Stop photo unavailable.</Text>}
        <Text style={s.body}>{details?.description || 'Landmark description unavailable.'}</Text>
        <Text style={s.muted}>Boarding side: {details?.boardingSide || 'Unavailable'}</Text>
        <Text style={s.muted}>Travel direction: {details?.direction || 'Unavailable'}</Text>
        <Text style={s.muted}>Entrance: {details?.entrance || 'Unavailable'}</Text>
        {details && <TouchableOpacity accessibilityRole="link" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openURL(details.source)}>
          <Text style={s.link}>Stop details source · verified {new Date(details.verifiedAt).toLocaleDateString()}</Text>
        </TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" disabled={walkingBusy} accessibilityState={{ disabled: walkingBusy }} onPress={() => onWalk(active)} style={s.button}>
          <Text style={s.buttonText}>{walkingBusy ? 'Finding a walking route…' : 'Walk to this stop'}</Text>
        </TouchableOpacity>
      </>}
      <View style={{ gap: 4 }}>
        <Text style={s.label}>Your current waiting area</Text>
        <Text accessibilityRole={boarding.kind === 'prohibited' ? 'alert' : undefined} style={s.muted}>{boarding.title}. {boarding.detail}</Text>
      </View>
      <Text style={s.muted}>{BOARDING_EDUCATION}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={onRefresh} style={[s.button, s.secondary]}>
        <Text style={s.label}>{loading ? 'Refreshing…' : loadError ? 'Retry stops and routes' : 'Refresh stops and routes'}</Text>
      </TouchableOpacity>
    </>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: referenceOpen }} onPress={() => setReferenceOpen(!referenceOpen)} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={s.link}>Landmark reference · {LANDMARK_REFERENCE.date}</Text>
    </TouchableOpacity>
    {referenceOpen && <View style={{ gap: 10 }}>
      <Text style={s.muted}>From the photographed sheet. These printed kilometres are historical labels, not current travel distances or verified boarding points.</Text>
      {LANDMARK_REFERENCE.stops.map(stop => <Text key={stop.printedKm} style={s.body}>{stop.printedKm} km · {stop.name}</Text>)}
      <Text style={s.muted}>Exact stop coordinates, boarding side and entrances still require verification.</Text>
    </View>}
  </View>;
}
