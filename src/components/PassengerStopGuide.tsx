import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from './PassengerUI';
import { Colors } from '../constants/theme';
import { BOARDING_EDUCATION, isVerifiedLoadingZone, type BoardingStatus, type LoadingZone } from '../services/passengerSafety';
import type { TerminalData } from '../services/offlineTransitService';

// Reference landmarks are not promoted to official loading bays without source-backed boundaries.
export default function PassengerStopGuide({ boarding, zones, landmarks, onRefresh, loading, loadError, openRequest }: {
  boarding: BoardingStatus; zones: LoadingZone[]; landmarks: TerminalData[];
  onRefresh: () => void; loading: boolean; loadError: boolean;
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const official = zones.filter(z => z.kind === 'loading' && isVerifiedLoadingZone(z));
  const options = official.length ? official : landmarks;
  const activeId = options.some(o => o.id === selected) ? selected : options[0]?.id || '';
  const active = official.find(o => o.id === activeId);
  const activeName = options.find(o => o.id === activeId)?.name;
  const photo = active?.photo_url && /^https:\/\//.test(active.photo_url) && /^https:\/\//.test(active.photo_source_url || '') ? active.photo_url : null;
  useEffect(() => { setPreview(false); }, [boarding.kind, boarding.zone?.id]);
  const prohibited = boarding.kind === 'prohibited';
  if (!open && !prohibited) return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingVertical: 4 }}>
    <Ionicons name="location-outline" size={17} color={Colors.subtleGray}/>
    <Text style={[s.muted, { flex: 1, minWidth: 140 }]}>{boarding.title}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open stops and boarding guidance" onPress={() => setOpen(true)} style={{ minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text style={s.label}>Where to board</Text><Ionicons name="chevron-down" size={15} color={Colors.ink}/></TouchableOpacity>
  </View>;
  return <View style={[s.section, prohibited && { borderColor: Colors.primaryRed }]}>
    <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
      <Ionicons name={prohibited ? 'warning-outline' : boarding.kind === 'allowed' ? 'checkmark-circle-outline' : 'location-outline'} size={23} color={Colors.primaryRed} />
      <View style={{ flex: 1, gap: 4 }} accessibilityLiveRegion={prohibited ? 'assertive' : 'polite'} accessibilityRole={prohibited ? 'alert' : undefined}>
        <Text style={s.sectionTitle}>{boarding.title}</Text><Text style={s.body}>{boarding.detail}</Text>
      </View>
    </View>
    {prohibited && <Text style={s.body}>{BOARDING_EDUCATION}</Text>}
    <View style={s.row}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={[s.button, s.secondary]}><Ionicons name="bus-outline" size={18} color={Colors.primaryRed} /><Text style={s.label}>{open ? 'Close stop guide' : 'Where to board'}</Text><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.ink} /></TouchableOpacity>
      <Text style={[s.muted, { flex: 1, minWidth: 140 }]}>{loading ? 'Checking stop information…' : loadError ? 'Could not refresh stops. Try again below.' : official.length ? `${official.length} verified loading bays` : 'Official boarding points awaiting confirmation'}</Text>
    </View>
    {open && <>
      <View style={s.divider} />
      <Text style={s.sectionTitle}>Stops & waiting areas</Text>
      {!official.length && <Text style={s.body}>These are route landmarks. The exact boarding sides and official loading bays are not confirmed yet. Follow posted signs before waiting.</Text>}
      <PassengerSelect label={official.length ? 'Official stop' : 'Route landmark'} value={activeId} options={options.map(o => ({ value: o.id, label: o.name }))} onSelect={setSelected} />
      {photo && failedPhoto !== photo ? <View style={{ gap: 8 }}>
        <Image source={{ uri: photo }} accessibilityLabel={active?.photo_caption || `Waiting area at ${activeName}`} resizeMode="contain" style={{ width: '100%', height: 220, backgroundColor: Colors.canvas, borderRadius: 6 }} onError={() => setFailedPhoto(photo)} />
        <Text style={s.muted}>{active?.photo_caption || activeName}</Text>
        <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(active!.photo_source_url!)}><Text style={s.link}>Photo source</Text></TouchableOpacity>
      </View> : <View style={{ minHeight: 132, padding: 20, gap: 8, backgroundColor: Colors.canvas, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="image-outline" size={28} color={Colors.subtleGray} /><Text style={s.label}>{photo ? 'Photo could not load' : 'Waiting-area photo not available'}</Text>
        <Text style={[s.muted, { textAlign: 'center' }]}>{activeName || 'Select a stop'}{!active ? ' · Boarding point not confirmed' : ''}</Text>
        {photo && <TouchableOpacity accessibilityRole="button" onPress={() => setFailedPhoto(null)} style={[s.button, s.secondary]}><Text style={s.label}>Retry photo</Text></TouchableOpacity>}
      </View>}
      {active?.boarding_instructions && <Text style={s.body}>{active.boarding_instructions}</Text>}
      {active && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(active.source_url)}><Text style={s.link}>View stop verification</Text></TouchableOpacity>}
      <Text style={s.sectionTitle}>Board safely</Text><Text style={s.body}>{BOARDING_EDUCATION}</Text>
      <Text style={s.muted}>While this dashboard is open, your location is checked against verified loading and no-loading areas. An unmapped area is not automatically treated as illegal.</Text>
      <View style={s.row}><TouchableOpacity accessibilityRole="button" disabled={loading} accessibilityState={{ disabled: loading }} onPress={onRefresh} style={[s.button, s.secondary]}><Text style={s.label}>{loading ? 'Refreshing…' : 'Refresh stops'}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: preview }} onPress={() => setPreview(!preview)} style={[s.button, s.secondary]}><Text style={s.label}>{preview ? 'Close example' : 'Preview warning'}</Text></TouchableOpacity></View>
      {preview && <View accessibilityLiveRegion="polite" style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderColor: Colors.border }}><Text style={s.label}>Example notification · Not your current location</Text><Text style={[s.sectionTitle, { color: Colors.primaryRed }]}>No loading in this area</Text><Text style={s.body}>Move to a designated loading bay before boarding.</Text><Text style={s.body}>{BOARDING_EDUCATION}</Text></View>}
    </>}
  </View>;
}
