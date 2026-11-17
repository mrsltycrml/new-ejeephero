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
      <View>
        <Text style={s.eyebrow}>Commuter Protection</Text>
        <Text style={s.title}>Safety</Text>
        <Text style={s.subtitle}>Emergency SOS dispatch, active ride telemetry, and local hotlines.</Text>
      </View>

      {/* SOS & Ride Status Card */}
      <View style={s.section}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.sectionTitle}>Get help quickly</Text>
          <View style={[s.pill, unit && { backgroundColor: Colors.successBg, borderColor: 'transparent' }]}>
            <Ionicons name={unit ? 'radio-outline' : 'shield-outline'} size={13} color={unit ? Colors.success : Colors.subtleGray} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: unit ? Colors.success : Colors.subtleGray }}>
              {unit ? `${unit.source === 'sample' ? 'Sample' : 'Active'} · ${unit.body_number}` : 'No active ride'}
            </Text>
          </View>
        </View>
        <Text style={s.body}>
          SOS gives you 5 seconds to cancel, then attempts to send your GPS location and unit details to your saved contacts.
        </Text>
        <SOSButton
          activeVehicleId={unit?.vehicle_id}
          activeVehicleBody={unit?.body_number}
          activeVehiclePlate={unit?.plate_number || undefined}
          activeVehicleIsSample={unit?.source === 'sample'}
        />
        <Text style={s.muted}>
          If automatic messaging is unavailable, open Messages and tap Send. You can call a hotline at any time.
        </Text>

        <View style={{ padding: 14, borderRadius: 10, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
          <Text style={s.label}>
            {unit ? `${unit.source === 'sample' ? 'Sample ride' : 'Current ride'} · ${unit.body_number}` : 'Unit not detected yet'}
          </Text>
          <Text style={s.muted}>
            {unit
              ? `Plate ${unit.plate_number || 'unavailable'} · Added to SOS automatically.`
              : 'Choose your destination on the dashboard. The app checks your unit as you travel; no body or plate number to type.'}
          </Text>
          {unit && <Text style={s.muted}>{signal}</Text>}
        </View>

        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Map')} style={[s.button, s.secondary]}>
          <Ionicons name="map-outline" size={17} color={Colors.ink} />
          <Text style={s.label}>View journey on map</Text>
        </TouchableOpacity>
      </View>

      {/* Emergency Contacts Card */}
      <View style={s.section}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={s.sectionTitle}>Emergency contacts</Text>
            <Text style={s.muted}>Up to 5 trusted recipients for SOS alerts</Text>
          </View>
          <View style={s.pill}>
            <Text style={s.label}>{contacts.length} / 5</Text>
          </View>
        </View>

        {loading && (
          <View style={{ gap: 10, paddingVertical: 6 }}>
            <SkeletonBlock height={54} />
            <SkeletonBlock height={54} />
          </View>
        )}

        {!loading && !contacts.length && (
          <View style={{ padding: 16, borderRadius: 10, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
            <Text style={s.label}>No emergency contacts saved yet</Text>
            <Text style={s.muted}>Add someone you trust so they can receive your live GPS location and ride details.</Text>
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
                padding: 12,
                borderRadius: 10,
                backgroundColor: Colors.sand,
                borderWidth: 1,
                borderColor: Colors.border,
              },
            ]}
          >
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person-outline" size={19} color={Colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{c.contact_name}</Text>
              <Text style={s.muted}>
                {c.phone_number}
                {c.localOnly ? ' · On this device' : ' · Synced'}
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
          <View style={{ gap: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border }}>
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
              style={[s.button, s.secondary]}
            >
              <Ionicons name="add-circle-outline" size={19} color={Colors.ink} />
              <Text style={s.label}>Add emergency contact</Text>
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
