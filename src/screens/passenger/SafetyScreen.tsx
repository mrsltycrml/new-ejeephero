import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, Pressable } from 'react-native';
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

export default function SafetyScreen({ navigation }: any) {
  const { user, getAccessToken } = useAuth();
  const { unit, signal } = usePassengerJourney();
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
      return () => { active = false; };
    }, [user?.id]),
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
      setContacts(items => [...items.filter(c => c.phone_number !== saved.phone_number), saved]);
      triggerHaptic('success');
      setFormOpen(false);
      setName('');
      setPhone('');
      setFeedback(saved.localOnly ? 'Saved on this device. SOS can use this contact in Messages.' : 'Emergency contact saved.');
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
    Alert.alert('Remove emergency contact?', `${contact.contact_name} will no longer receive your alerts.`, [
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
    <FormScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* DARK EMERGENCY COMMAND HERO */}
      <View style={[s.heroBanner, { backgroundColor: '#1C0A0A', borderColor: '#7F1D1D' }]}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrow, { color: '#FCA5A5' }]}>Emergency Dispatch Console</Text>
            <Text style={s.heroTitle}>Safety & SOS</Text>
          </View>
          <View style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: unit ? Colors.successBg : '#3F1515' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: unit ? Colors.success : '#FCA5A5' }}>
              {unit ? `LINKED · ${unit.body_number}` : 'TRANSPONDER STANDBY'}
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 14, lineHeight: 20, color: '#FECACA' }}>
          Pressing Emergency SOS starts a 5-second cancellation window, then dispatches your GPS coordinates and boarded vehicle identity to your trusted contacts.
        </Text>

        <SOSButton
          activeVehicleId={unit?.vehicle_id}
          activeVehicleBody={unit?.body_number}
          activeVehiclePlate={unit?.plate_number || undefined}
          activeVehicleIsSample={unit?.source === 'sample'}
        />

        <View style={{ padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(252,165,165,0.2)', gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.white }}>
            {unit ? `${unit.source === 'sample' ? 'Sample ride' : 'Current ride'} · ${unit.body_number} (Plate ${unit.plate_number || 'N/A'})` : 'No active vehicle linked yet'}
          </Text>
          <Text style={{ fontSize: 12, color: '#FCA5A5' }}>
            {unit ? signal : 'Select your destination on the cockpit map to link your ride automatically.'}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.navigate('Map')}
          style={{ minHeight: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          <Ionicons name="map-outline" size={17} color={Colors.white} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.white }}>Open live route map</Text>
        </TouchableOpacity>
      </View>

      {/* TRUSTED CIRCLE CONTACTS */}
      <View style={s.section}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={s.eyebrow}>Trusted Circle</Text>
            <Text style={s.sectionTitle}>Emergency contacts</Text>
          </View>
          <View style={s.pill}>
            <Text style={s.label}>{contacts.length} / 5 saved</Text>
          </View>
        </View>

        {loading && (
          <View style={{ gap: 10, paddingVertical: 6 }}>
            <SkeletonBlock height={58} />
            <SkeletonBlock height={58} />
          </View>
        )}

        {!loading && !contacts.length && (
          <View style={{ padding: 16, borderRadius: 14, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
            <Text style={s.label}>Your Trusted Circle is empty</Text>
            <Text style={s.muted}>Add up to 5 family members or friends to receive your live location during an emergency.</Text>
          </View>
        )}

        {contacts.map(c => (
          <Pressable
            key={c.phone_number}
            onLongPress={() => openContactActions(c)}
            delayLongPress={350}
            style={[
              s.row,
              {
                padding: 14,
                borderRadius: 16,
                backgroundColor: Colors.sand,
                borderWidth: 1,
                borderColor: Colors.border,
              },
            ]}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: Colors.brandMintLight }}>
                {(c.contact_name || 'C').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.ink }}>{c.contact_name}</Text>
              <Text style={s.muted}>
                {c.phone_number} · {c.localOnly ? 'On this device' : 'Cloud synced'}
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${c.contact_name}`} onPress={() => startEdit(c)} style={{ padding: 10 }}>
              <Ionicons name="create-outline" size={20} color={Colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${c.contact_name}`} onPress={() => remove(c)} style={{ padding: 10 }}>
              <Ionicons name="trash-outline" size={20} color={Colors.primaryRed} />
            </TouchableOpacity>
          </Pressable>
        ))}

        {feedback !== '' && <Text accessibilityRole="alert" style={s.body}>{feedback}</Text>}

        {formOpen ? (
          <View style={{ gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border }}>
            <Text style={s.label}>Contact name</Text>
            <TextInput accessibilityLabel="Contact name" style={s.input} value={name} onChangeText={setName} maxLength={80} placeholder="Name" placeholderTextColor={Colors.subtleGray} />
            <Text style={s.label}>Mobile number</Text>
            <TextInput accessibilityLabel="Contact mobile number" style={s.input} value={phone} editable={!editing} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="09XXXXXXXXX or +639XXXXXXXXX" placeholderTextColor={Colors.subtleGray} />
            <Text style={s.label}>Emergency message</Text>
            <TextInput accessibilityLabel="Emergency message" style={[s.input, { minHeight: 85, textAlignVertical: 'top' }]} multiline value={preset} onChangeText={setPreset} maxLength={300} />
            <Text style={s.muted}>Your GPS location, body number, and plate number are added automatically.</Text>
            <View style={s.row}>
              <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={save} style={[s.button, { flex: 1 }, saving && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.buttonText}>Save contact</Text>}
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => setFormOpen(false)} style={[s.button, s.secondary]}>
                <Text style={s.label}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          contacts.length < 5 && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => { setEditing(false); setName(''); setPhone(''); setFormOpen(true); setFeedback(''); }}
              style={s.button}
            >
              <Ionicons name="person-add-outline" size={18} color={Colors.brandMintLight} />
              <Text style={s.buttonText}>Add emergency contact</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <View style={s.section}>
        <EmergencyHotlines />
      </View>
    </FormScrollView>
  );
}
