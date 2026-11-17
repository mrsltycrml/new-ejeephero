import React, { useEffect, useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from './PassengerUI';
import { Colors } from '../constants/theme';
import { BOARDING_EDUCATION, isVerifiedLoadingZone, type BoardingStatus, type LoadingZone } from '../services/passengerSafety';
import type { TerminalData } from '../services/offlineTransitService';

export default function PassengerStopGuide({
  boarding,
  zones,
  landmarks,
  onRefresh,
  loading,
  loadError,
  openRequest,
}: {
  boarding: BoardingStatus;
  zones: LoadingZone[];
  landmarks: TerminalData[];
  onRefresh: () => void;
  loading: boolean;
  loadError: boolean;
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const official = zones.filter((z) => z.kind === 'loading' && isVerifiedLoadingZone(z));
  const options = official.length ? official : landmarks;
  const activeId = options.some((o) => o.id === selected) ? selected : options[0]?.id || '';
  const active = official.find((o) => o.id === activeId);
  const activeName = options.find((o) => o.id === activeId)?.name;
  const photo =
    active?.photo_url && /^https:\/\//.test(active.photo_url) && /^https:\/\//.test(active.photo_source_url || '')
      ? active.photo_url
      : null;

  useEffect(() => {
    setPreview(false);
  }, [boarding.kind, boarding.zone?.id]);

  const prohibited = boarding.kind === 'prohibited';

  if (!open && !prohibited) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text style={s.muted}>{boarding.title}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open stop details"
          onPress={() => setOpen(true)}
          style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 6 }}
        >
          <Text style={s.link}>Stop details</Text>
          <Ionicons name="chevron-down" size={15} color={Colors.brandGreen} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.section, prohibited && { borderColor: Colors.primaryRed }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.sectionTitle}>Stops & waiting areas</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(!open)} style={{ padding: 4 }}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray} />
        </TouchableOpacity>
      </View>
      <PassengerSelect
        label={official.length ? 'Official stop' : 'Route stop'}
        value={activeId}
        options={options.map((o) => ({ value: o.id, label: o.name }))}
        onSelect={setSelected}
      />
      {photo && failedPhoto !== photo ? (
        <View style={{ gap: 8 }}>
          <Image
            source={{ uri: photo }}
            accessibilityLabel={active?.photo_caption || `Waiting area at ${activeName}`}
            resizeMode="contain"
            style={{ width: '100%', height: 180, backgroundColor: Colors.canvas, borderRadius: 10 }}
            onError={() => setFailedPhoto(photo)}
          />
          <Text style={s.muted}>{active?.photo_caption || activeName}</Text>
          <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(active!.photo_source_url!)}>
            <Text style={s.link}>Photo source</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={s.muted}>{BOARDING_EDUCATION}</Text>
      <View style={s.row}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading}
          onPress={onRefresh}
          style={[s.button, s.secondary, { flex: 1 }]}
        >
          <Text style={s.label}>{loading ? 'Refreshing…' : loadError ? 'Retry stops' : 'Refresh stops'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setPreview(!preview)}
          style={[s.button, s.secondary, { flex: 1 }]}
        >
          <Text style={s.label}>{preview ? 'Hide alert' : 'Preview zone alert'}</Text>
        </TouchableOpacity>
      </View>
      {preview && (
        <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: Colors.border }}>
          <Text style={[s.label, { color: Colors.primaryRed }]}>No loading in this area (example)</Text>
          <Text style={s.muted}>Move to a designated loading bay before boarding.</Text>
        </View>
      )}
    </View>
  );
}
