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

export default function SafetyScreen() {
  const { user, getAccessToken } = useAuth();
  const { unit } = usePassengerJourney();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState('EMERGENCY! I need help. Please check on me.');
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
    <FormScrollView style={s.screen} contentContainerStyle={styles.container}>
      <View style={{ gap: 2 }}>
        <Text style={s.title}>Safety</Text>
        <Text style={s.subtitle}>Keep trusted people within reach.</Text>
      </View>

      {/* Trusted Contacts Section */}
      <View style={{ gap: 4 }}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Trusted contacts</Text>
          <Text style={styles.countText}>{contacts.length} of 5</Text>
        </View>

        {loading && (
          <View style={{ gap: 10, paddingVertical: 6 }}>
            <SkeletonBlock height={56} />
            <SkeletonBlock height={56} />
          </View>
        )}

        {!loading && !contacts.length && (
          <View style={styles.emptyBox}>
            <Text style={s.label}>No trusted contacts added yet</Text>
            <Text style={s.muted}>Add up to 5 trusted contacts to receive your SOS location and ride details.</Text>
          </View>
        )}

        <View style={styles.contactList}>
          {contacts.map((c) => (
            <Pressable
              key={c.phone_number}
              onLongPress={() => openContactActions(c)}
              delayLongPress={350}
              style={styles.contactRow}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {(c.contact_name || 'C').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.contact_name}</Text>
                <Text style={styles.contactPhone}>{c.phone_number}</Text>
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

        {feedback !== '' && <Text accessibilityRole="alert" style={[s.muted, { color: Colors.brandGreen, fontWeight: '600' }]}>{feedback}</Text>}

        {formOpen ? (
          <View style={styles.formBox}>
            <Text style={s.label}>Contact name</Text>
            <TextInput
              accessibilityLabel="Contact name"
              style={s.input}
              value={name}
              onChangeText={setName}
              maxLength={80}
              placeholder="Ana Santos"
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
          contacts.length < 5 && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setEditing(false);
                setName('');
                setPhone('');
                setFormOpen(true);
                setFeedback('');
              }}
              style={styles.addContactBtn}
            >
              <Ionicons name="add" size={20} color={Colors.brandGreen} />
              <Text style={styles.addContactText}>Add contact</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Linked Unit Row */}
      <View style={styles.linkedRideRow}>
        <View style={styles.busIconBox}>
          <Ionicons name="bus-outline" size={20} color={Colors.brandGreen} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.contactName}>
            {unit ? `Linked unit ${unit.body_number}` : 'No unit linked'}
          </Text>
          <Text style={styles.contactPhone}>
            Plate {unit?.plate_number || 'Unavailable'}
          </Text>
        </View>
      </View>

      {/* Emergency SOS Button */}
      <SOSButton
        activeVehicleId={unit?.vehicle_id}
        activeVehicleBody={unit?.body_number}
        activeVehiclePlate={unit?.plate_number || undefined}
      />

      <View style={{ gap: 6 }}>
        <Text style={styles.helperCenter}>
          Starts a 5-second countdown. You can cancel before it ends.
        </Text>
        <Text style={styles.helperCenter}>
          Your location and linked unit details help identify your ride.
        </Text>
      </View>

      <View style={[s.section, { marginTop: 8 }]}>
        <EmergencyHotlines />
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  emptyBox: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  contactList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  contactPhone: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  iconBtn: {
    padding: 8,
  },
  addContactBtn: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen,
    backgroundColor: Colors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  addContactText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  formBox: {
    gap: 10,
    paddingTop: 12,
  },
  linkedRideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  busIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperCenter: {
    fontSize: 13,
    color: Colors.subtleGray,
    textAlign: 'center',
    lineHeight: 18,
  },
});
