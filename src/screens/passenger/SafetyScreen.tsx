import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { FormScrollView, SkeletonBlock, triggerHaptic } from '../../components/AppUI';
import EmergencyHotlines from '../../components/EmergencyHotlines';
import SOSButton from '../../components/SOSButton';
import { useAuth } from '../../contexts/AuthContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { loadEmergencyContacts, saveEmergencyContact, removeEmergencyContact, type EmergencyContact } from '../../services/emergencyService';
import { Colors } from '../../constants/theme';

const DEFAULT_MESSAGE = 'EMERGENCY! I need help. Please check on me.';

export default function SafetyScreen() {
  const { user, getAccessToken } = useAuth();
  const { unit } = usePassengerJourney();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState(DEFAULT_MESSAGE);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const token = await getAccessToken();
          const list = user ? await loadEmergencyContacts(user.id, token) : [];
          if (!active) return;
          setContacts(list);
        } catch {
          if (active) setFeedback('Could not refresh your contacts. Please try again.');
        } finally {
          if (active) setLoading(false);
        }
      };
      void load();
      return () => {
        active = false;
      };
    }, [user?.id, getAccessToken]),
  );

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setFeedback('');
    try {
      const saved = await saveEmergencyContact(user.id, await getAccessToken(), {
        user_id: user.id,
        contact_name: name,
        phone_number: phone,
        preset_message: preset.trim().slice(0, 300),
      });
      setContacts((items) => [...items.filter((c) => c.phone_number !== saved.phone_number), saved]);
      triggerHaptic('success');
      setFormOpen(false);
      setName('');
      setPhone('');
      setFeedback(saved.localOnly ? 'Saved on this device. SOS can use this contact in Messages.' : 'Trusted contact saved.');
    } catch (e: any) {
      triggerHaptic('error');
      setFeedback(e.message || 'Could not save the contact. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: EmergencyContact) => {
    setEditing(true);
    setName(c.contact_name);
    setPhone(c.phone_number);
    setPreset(c.preset_message);
    setFormOpen(true);
  };

  const remove = (contact: EmergencyContact) =>
    Alert.alert('Remove trusted contact?', `${contact.contact_name} will no longer receive your alerts.`, [
      { text: 'Keep contact', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!user) return;
          try {
            setContacts(await removeEmergencyContact(user.id, await getAccessToken(), contact));
            triggerHaptic('medium');
          } catch {
            triggerHaptic('error');
            setFeedback('Could not remove this contact. Check your connection and try again.');
          }
        },
      },
    ]);

  const openContactActions = (c: EmergencyContact) => {
    if (Platform.OS === 'web') return;
    triggerHaptic('light');
    Alert.alert(c.contact_name, c.phone_number, [
      { text: 'Edit', onPress: () => startEdit(c) },
      { text: 'Remove', style: 'destructive', onPress: () => remove(c) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <FormScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]}>
      <View style={s.heroBanner}>
        <Text accessibilityRole="header" style={s.heroTitle}>Safety</Text>
        <Text style={s.heroSubtitle}>Send your location and ride details to trusted contacts. You have five seconds to cancel.</Text>
        <SOSButton activeVehicleId={unit?.vehicle_id} activeVehicleBody={unit?.body_number} activeVehiclePlate={unit?.plate_number || undefined} />
        <View style={styles.ride}>
          <Ionicons aria-hidden name="bus-outline" size={20} color={Colors.onDark} />
          <View style={{ flex: 1 }}>
            <Text style={[s.label, styles.light]}>{unit ? `Linked unit ${unit.body_number}` : 'No unit linked'}</Text>
            {unit && <Text style={[s.muted, styles.light]}>Plate {unit.plate_number || 'unavailable'}</Text>}
          </View>
        </View>
      </View>

      <View style={s.section}><EmergencyHotlines /></View>

      <View style={s.section}>
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[s.sectionTitle, { flex: 1 }]}>Trusted contacts</Text>
          {!loading && <Text style={s.muted}>{contacts.length} of 5</Text>}
        </View>
        {loading && (
          <View style={{ gap: 10, paddingVertical: 6 }}>
            <SkeletonBlock height={56} />
            <SkeletonBlock height={56} />
          </View>
        )}

        {!loading && !contacts.length && (
          <Text style={s.muted}>Add up to five people who can receive your SOS location and ride details.</Text>
        )}

        <View style={{ gap: 2 }}>
          {contacts.map((c) => (
            <Pressable
              key={c.phone_number}
              onLongPress={() => openContactActions(c)}
              accessible={false}
              delayLongPress={350}
              style={styles.contactRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{c.contact_name}</Text>
                <Text style={s.muted}>{c.phone_number}</Text>
                {c.localOnly && <Text style={s.muted}>Saved on this device</Text>}
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Edit ${c.contact_name}`}
                onPress={() => startEdit(c)}
                style={styles.iconBtn}
              >
                <Ionicons name="pencil-outline" size={19} color={Colors.brandGreen} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.contact_name}`}
                onPress={() => remove(c)}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={19} color={Colors.subtleGray} />
              </TouchableOpacity>
            </Pressable>
          ))}
        </View>

        {feedback !== '' && <Text accessibilityRole="alert" style={s.body}>{feedback}</Text>}

        {formOpen ? (
          <View style={styles.formBox}>
            <Text style={s.label}>Contact name</Text>
            <TextInput
              accessibilityLabel="Contact name"
              style={s.input}
              value={name}
              onChangeText={setName}
              maxLength={80}
              placeholder="Contact name"
              placeholderTextColor={Colors.subtleGray}
            />
            <Text style={s.label}>Mobile number</Text>
            <TextInput
              accessibilityLabel="Contact mobile number"
              style={s.input}
              value={phone}
              editable={!editing}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={20}
              placeholder="09XXXXXXXXX or +639XXXXXXXXX"
              placeholderTextColor={Colors.subtleGray}
            />
            <Text style={s.label}>Emergency message</Text>
            <TextInput
              accessibilityLabel="Emergency message"
              style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
              multiline
              value={preset}
              onChangeText={setPreset}
              maxLength={300}
            />
            <View style={s.row}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={saving}
                onPress={save}
                style={[s.button, { flex: 1 }, saving && { opacity: 0.6 }]}
              >
                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.buttonText}>Save contact</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={saving}
                onPress={() => setFormOpen(false)}
                style={[s.button, s.secondary]}
              >
                <Text style={s.label}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          user && !loading && contacts.length < 5 && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setEditing(false);
                setName('');
                setPhone('');
                setPreset(DEFAULT_MESSAGE);
                setFormOpen(true);
                setFeedback('');
              }}
              style={[s.button, s.secondary]}
            >
              <Ionicons name="add" size={20} color={Colors.brandGreen} />
              <Text style={s.link}>Add contact</Text>
            </TouchableOpacity>
          )
        )}
      </View>

    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  light: { color: Colors.onDark },
  ride: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.onDarkMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderColor: Colors.border },
  iconBtn: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  formBox: { gap: 10, paddingTop: 8 },
});
