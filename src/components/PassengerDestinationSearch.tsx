import { useTranslation } from 'react-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { searchLocalPassengerPlaces, searchPassengerPlaces, type PassengerPlaceSearchScope } from '../services/placeSearchService';
import type { PassengerPlace } from '../services/passengerPlaces';

type Props = {
  scope: PassengerPlaceSearchScope;
  online: boolean;
  selectedName: string;
  onSelect: (place: PassengerPlace) => void;
};

export default function PassengerDestinationSearch({ scope, online, selectedName, onSelect }: Props) {
  const { t } = useTranslation();
  const input = useRef<React.ElementRef<typeof TextInput>>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft?.trim() ?? '';
  const local = useMemo(() => searchLocalPassengerPlaces(query, scope), [query, scope]);
  const [reply, setReply] = useState<{ scope: Props['scope']; query: string; places: PassengerPlace[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!online || query.length < 3) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const places = await searchPassengerPlaces(query, scope, request.signal);
        if (!request.signal.aborted) setReply({ scope, query, places, error: false });
      } catch {
        if (!request.signal.aborted) setReply({ scope, query, places: [], error: true });
      }
    }, 350);
    return () => { clearTimeout(timer); request.abort(); };
  }, [online, query, scope]);

  const current = online && reply?.scope === scope && reply.query === query ? reply : null;
  const results = current && !current.error ? current.places : local;
  const close = () => { setDraft(null); setReply(null); input.current?.blur(); Keyboard.dismiss(); };
  const choose = (place: PassengerPlace) => { close(); onSelect(place); };
  const status = !query ? t('passenger.search.hint')
    : current?.error ? t('passenger.search.addressUnavailable')
    : !results.length && online && query.length >= 3 && !current ? t('passenger.search.searching')
    : !results.length ? (online ? t('passenger.search.noMatches') : t('passenger.search.offlineEmpty')) : '';

  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>{t('passenger.search.heading')}</Text>
    <View style={styles.field}>
      <View pointerEvents="none" style={styles.searchIcon}><Ionicons name="search" size={22} color={Colors.ink} /></View>
      <TextInput ref={input} accessibilityLabel={t('passenger.search.destination')} style={styles.input}
        value={draft ?? selectedName} placeholder={t('passenger.search.placeholder')} placeholderTextColor={Colors.subtleGray}
        selectTextOnFocus returnKeyType="search" enterKeyHint="search"
        onFocus={() => setDraft(previous => previous ?? selectedName)} onChangeText={setDraft}
        onSubmitEditing={() => {
          const match = results.find(place => place.name.toLocaleLowerCase() === query.toLocaleLowerCase());
          if (match || results.length === 1) choose(match ?? results[0]);
          else Keyboard.dismiss();
        }} />
      {draft !== null && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.search.close')} style={styles.close} onPress={close}>
        <Ionicons name="close" size={22} color={Colors.ink} />
      </TouchableOpacity>}
    </View>
    {draft !== null && <View style={styles.list}>
      {!!status && <Text accessibilityLiveRegion="polite" style={styles.note}>{status}</Text>}
      {results.map(place => <TouchableOpacity key={place.id} accessibilityRole="button"
        accessibilityLabel={place.name + ', ' + place.address} style={styles.row} onPress={() => choose(place)}>
        <Ionicons name={place.id.startsWith('stop:') ? 'bus-outline' : 'location-outline'} size={19} color={Colors.brandGreen} />
        <View style={styles.label}><Text style={styles.name}>{place.name}</Text>
          {!!place.address && <Text style={styles.address}>{place.address}</Text>}</View>
        <Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} />
      </TouchableOpacity>)}
      {results.some(p => !p.id.startsWith('stop:') && !p.id.startsWith('landmark:')) && <Text accessibilityRole="link"
        style={styles.note} onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}>{t('passenger.search.attribution')}</Text>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 18, paddingVertical: 16, gap: 10, backgroundColor: Colors.ink },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.7, color: Colors.onDark },
  field: { minHeight: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white },
  searchIcon: { position: 'absolute', left: 14 },
  input: { minWidth: 0, minHeight: 50, flex: 1, fontSize: 16, color: Colors.ink, paddingVertical: 12, paddingLeft: 46, paddingRight: 12 },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  list: { backgroundColor: Colors.paper, paddingHorizontal: 12, borderRadius: 10 },
  note: { fontSize: 14, lineHeight: 20, color: Colors.subtleGray, paddingVertical: 12 },
  row: { minHeight: 52, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  label: { flex: 1, gap: 2 },
  name: { color: Colors.ink, fontWeight: '700', fontSize: 16 },
  address: { color: Colors.subtleGray, fontSize: 13, lineHeight: 18 },
});
