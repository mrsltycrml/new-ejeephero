import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
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
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      try {
        const token = await getAccessToken();
        const list = user ? await loadEmergencyContacts(user.id, token) : [];
        if (!active) return;
        setContacts(list);
      } catch { if (active) setFeedback('Could not refresh your contacts. Please try again.'); }
      finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [user?.id]));
  const save = async () => {
    if (!user) return;
    setSaving(true); setFeedback('');
    try {
      const saved = await saveEmergencyContact(user.id, await getAccessToken(), { user_id: user.id, contact_name: name, phone_number: phone, preset_message: preset.trim().slice(0, 300) });
      setContacts(items => [...items.filter(c => c.phone_number !== saved.phone_number), saved]);
      setFormOpen(false); setName(''); setPhone('');
      setFeedback(saved.localOnly ? 'Saved on this device. SOS can use this contact in Messages.' : 'Emergency contact saved.');
    } catch (e: any) { setFeedback(e.message || 'Could not save the contact. Try again.'); }
    finally { setSaving(false); }
  };
  const remove = (contact: EmergencyContact) => Alert.alert('Remove emergency contact?', `${contact.contact_name} will no longer receive your alerts.`, [{ text: 'Keep contact', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { if (!user) return; try { setContacts(await removeEmergencyContact(user.id, await getAccessToken(), contact)); } catch { setFeedback('Could not remove this contact. Check your connection and try again.'); } } }]);
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View><Text style={s.title}>Safety</Text><Text style={s.subtitle}>Your emergency contacts, unit details, and local help.</Text></View>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Get help quickly</Text><Text style={s.body}>SOS gives you 5 seconds to cancel, then opens Messages with your saved contacts, current GPS location, and unit details.</Text>
      <SOSButton activeVehicleId={unit?.vehicle_id} activeVehicleBody={unit?.body_number} activeVehiclePlate={unit?.plate_number || undefined} activeVehicleIsSample={unit?.source === 'sample'} />
      <Text style={s.muted}>Tap Send in Messages to share the alert. You can call a hotline at any time.</Text>
      <View style={s.divider} />
      <Text style={s.label}>{unit ? `${unit.source === 'sample' ? 'Sample ride' : 'Current ride'} · ${unit.body_number}` : 'Unit not detected yet'}</Text>
      <Text style={s.muted}>{unit ? `Plate ${unit.plate_number || 'unavailable'} · Added to SOS automatically.` : 'Choose your destination on the dashboard. The app checks your unit as you travel; no body or plate number to type.'}</Text>
      {unit && <Text style={s.muted}>{signal}</Text>}
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Map')} style={[s.button, s.secondary]}><Text style={s.label}>View journey</Text></TouchableOpacity>
    </View>
    <View style={s.section}><EmergencyHotlines /></View>
    <View style={s.section}>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.sectionTitle}>Emergency contacts</Text><Text style={s.muted}>{contacts.length} of 5</Text></View>
      {loading && <ActivityIndicator color={Colors.primaryRed} />}
      {!loading && !contacts.length && <Text style={s.body}>Add someone you trust so they can receive your emergency location.</Text>}
      {contacts.map(c => <View key={c.phone_number} style={[s.row, { paddingVertical: 10, borderBottomWidth: 1, borderColor: Colors.border }]}><Ionicons name="person-outline" size={21} color={Colors.subtleGray} /><View style={{ flex: 1 }}><Text style={s.label}>{c.contact_name}</Text><Text style={s.muted}>{c.phone_number}{c.localOnly ? ' · On this device' : ''}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${c.contact_name}`} onPress={() => { setEditing(true); setName(c.contact_name); setPhone(c.phone_number); setPreset(c.preset_message); setFormOpen(true); }} style={{ padding: 12 }}><Ionicons name="create-outline" size={20} color={Colors.ink} /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${c.contact_name}`} onPress={() => remove(c)} style={{ padding: 12 }}><Ionicons name="trash-outline" size={20} color={Colors.primaryRed} /></TouchableOpacity></View>)}
      {feedback !== '' && <Text accessibilityRole="alert" style={s.body}>{feedback}</Text>}
      {formOpen ? <View style={{ gap: 12 }}><Text style={s.label}>Contact name</Text><TextInput accessibilityLabel="Contact name" style={s.input} value={name} onChangeText={setName} maxLength={80} placeholder="Name" placeholderTextColor={Colors.subtleGray} /><Text style={s.label}>Mobile number</Text><TextInput accessibilityLabel="Contact mobile number" style={s.input} value={phone} editable={!editing} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="09XXXXXXXXX or +639XXXXXXXXX" placeholderTextColor={Colors.subtleGray} /><Text style={s.label}>Emergency message</Text><TextInput accessibilityLabel="Emergency message" style={[s.input, { minHeight: 85, textAlignVertical: 'top' }]} multiline value={preset} onChangeText={setPreset} maxLength={300} /><Text style={s.muted}>Your GPS location, body number, and plate number are added automatically.</Text><View style={s.row}><TouchableOpacity accessibilityRole="button" disabled={saving} onPress={save} style={[s.button, saving && { opacity: 0.6 }]}>{saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.buttonText}>Save contact</Text>}</TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => setFormOpen(false)} style={[s.button, s.secondary]}><Text style={s.label}>Cancel</Text></TouchableOpacity></View></View>
        : contacts.length < 5 && <TouchableOpacity accessibilityRole="button" onPress={() => { setEditing(false); setName(''); setPhone(''); setFormOpen(true); setFeedback(''); }} style={[s.button, s.secondary]}><Ionicons name="add" size={18} color={Colors.ink} /><Text style={s.label}>Add emergency contact</Text></TouchableOpacity>}
    </View>
  </ScrollView>;
}
