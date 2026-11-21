import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { BottomSheetModal, FormScrollView, triggerHaptic } from '../../components/AppUI';
import EmergencyHotlines from '../../components/EmergencyHotlines';
import SOSButton from '../../components/SOSButton';
import { useAuth } from '../../contexts/AuthContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { readEmergencyContacts, saveEmergencyContact, removeEmergencyContact, type EmergencyContact } from '../../services/emergencyService';
import { Colors } from '../../constants/theme';

function TrustedContacts({ userId }: { userId?: string }) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [draft, setDraft] = useState<EmergencyContact | null>(null);
  const [toRemove, setToRemove] = useState<EmergencyContact | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await readEmergencyContacts(userId);
      if (request === generation.current) { setContacts(result.contacts); setSynced(result.synced); }
    } catch {
      if (request === generation.current) setSynced(false);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [userId]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current++; };
  }, [load]));

  const save = async () => {
    if (!userId || !draft || busy) return;
    setBusy(true);
    setFeedback('');
    try {
      const saved = await saveEmergencyContact(userId, draft);
      setContacts(items => [...items.filter(c => c.phone_number !== saved.phone_number), saved]);
      setDraft(null);
      setFeedback(saved.localOnly ? 'savedLocal' : 'saved');
      triggerHaptic('success');
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      setFeedback(reason === 'invalid' || reason === 'limit' ? reason : 'saveError');
      triggerHaptic('error');
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!userId || !toRemove || busy) return;
    setBusy(true);
    setFeedback('');
    try {
      await removeEmergencyContact(userId, toRemove);
      setContacts(items => items.filter(item => item.phone_number !== toRemove.phone_number));
      if (draft?.phone_number === toRemove.phone_number) setDraft(null);
      triggerHaptic('medium');
    } catch { setFeedback('removeError'); } finally { setBusy(false); setToRemove(null); }
  };
  return <View style={s.section}>
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={[s.sectionTitle, styles.grow]}>{t('passenger.safety.contacts')}</Text>
      {userId && synced && !loading && <Text style={s.muted}>{t('passenger.safety.count', { count: contacts.length })}</Text>}
    </View>
    {!userId ? <Text style={s.muted}>{t('passenger.safety.signIn')}</Text>
      : loading ? <Text accessibilityLiveRegion="polite" style={s.muted}>{t('passenger.safety.checking')}</Text>
      : !synced ? <View style={styles.offline}>
        <Text style={s.muted}>{t('passenger.safety.offline')}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={load} style={styles.retry}><Text style={s.link}>{t('passenger.safety.retry')}</Text></TouchableOpacity>
      </View> : !contacts.length && !draft && <Text style={s.muted}>{t('passenger.safety.empty')}</Text>}
    {contacts.map(c => <View key={c.phone_number} style={styles.contactRow}>
      <View style={styles.grow}>
        <Text style={s.label}>{c.contact_name}</Text>
        <Text style={s.muted}>{c.phone_number}</Text>
        {c.localOnly && <Text style={s.muted}>{t('passenger.safety.local')}</Text>}
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.safety.edit', { name: c.contact_name })}
        disabled={busy} onPress={() => { setDraft(c); setEditing(true); setFeedback(''); }} style={styles.iconBtn}>
        <Ionicons aria-hidden name="pencil-outline" size={20} color={Colors.brandGreen} />
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.safety.removeName', { name: c.contact_name })}
        disabled={busy} onPress={() => setToRemove(c)} style={styles.iconBtn}>
        <Ionicons aria-hidden name="trash-outline" size={20} color={Colors.subtleGray} />
      </TouchableOpacity>
    </View>)}
    {!!feedback && <Text accessibilityLiveRegion="polite" style={s.body}>{t('passenger.safety.' + feedback)}</Text>}
    {draft ? <View style={styles.formBox}>
      <Text style={s.label}>{t('passenger.safety.name')}</Text>
      <TextInput accessibilityLabel={t('passenger.safety.name')} style={s.input} editable={!busy} value={draft.contact_name}
        onChangeText={contact_name => setDraft({ ...draft, contact_name })} maxLength={80} />
      <Text style={s.label}>{t('passenger.safety.phone')}</Text>
      <TextInput accessibilityLabel={t('passenger.safety.phone')} style={s.input} editable={!busy && !editing} value={draft.phone_number}
        onChangeText={phone_number => setDraft({ ...draft, phone_number })} keyboardType="phone-pad" maxLength={20} placeholder="09XXXXXXXXX" />
      <Text style={s.label}>{t('passenger.safety.message')}</Text>
      <TextInput accessibilityLabel={t('passenger.safety.message')} style={[s.input, { minHeight: 76 }]} editable={!busy} value={draft.preset_message}
        onChangeText={preset_message => setDraft({ ...draft, preset_message })} maxLength={300} multiline />
      <View style={s.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={save} style={s.button}>
          <Text style={s.buttonText}>{t('passenger.safety.save')}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { setDraft(null); setFeedback(''); }} style={[s.button, s.secondary]}>
          <Text style={s.label}>{t('passenger.safety.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View> : userId && contacts.length < 5 && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => {
      setEditing(false); setFeedback('');
      setDraft({ user_id: userId, contact_name: '', phone_number: '', preset_message: t('sos.emergencyText') });
    }} style={s.button}>
      <Ionicons aria-hidden name="add" size={20} color={Colors.white} />
      <Text style={s.buttonText}>{t('passenger.safety.add')}</Text>
    </TouchableOpacity>}
    {toRemove && <BottomSheetModal visible onClose={() => { if (!busy) setToRemove(null); }}>
      <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.safety.removeTitle')}</Text>
      <Text style={s.body}>{t('passenger.safety.removeHint', { name: toRemove.contact_name })}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={remove} style={s.button}>
        <Text style={s.buttonText}>{t('passenger.safety.remove')}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setToRemove(null)} style={[s.button, s.secondary]}>
        <Text style={s.label}>{t('passenger.safety.keep')}</Text>
      </TouchableOpacity>
    </BottomSheetModal>}
  </View>;
}

export default function SafetyScreen({ route }: { route?: { params?: { section?: string } } }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unit } = usePassengerJourney();
  const contactsFirst = route?.params?.section === 'contacts';
  const scroll = useRef<React.ElementRef<typeof FormScrollView>>(null);
  useFocusEffect(useCallback(() => {
    if (contactsFirst) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [contactsFirst]));
  const contacts = <TrustedContacts key={user?.id || 'signed-out'} userId={user?.id} />;
  return <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]} keyboardShouldPersistTaps="always">
    {contactsFirst && contacts}
    <View style={s.heroBanner}>
      <Text accessibilityRole="header" style={s.heroTitle}>{t('passenger.safety.emergency')}</Text>
      <Text style={s.heroSubtitle}>{t('passenger.safety.sosHint')}</Text>
      <SOSButton activeVehicleId={unit?.vehicle_id} activeVehicleBody={unit?.body_number} activeVehiclePlate={unit?.plate_number || undefined} />
      <Text style={s.heroSubtitle}>{unit ? [t('passenger.safety.linked', { unit: unit.body_number }),
        unit.plate_number && t('passenger.safety.plate', { plate: unit.plate_number })].filter(Boolean).join(' · ') : t('passenger.safety.noUnit')}</Text>
    </View>
    {!contactsFirst && contacts}
    <View style={s.section}><EmergencyHotlines /></View>
  </FormScrollView>;
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderColor: Colors.border },
  iconBtn: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center' },
  offline: { gap: 4 },
  formBox: { gap: 8 },
});
