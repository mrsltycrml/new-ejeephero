import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, FlatList, TextInput, KeyboardAvoidingView,
  Platform, Keyboard, TouchableWithoutFeedback, ScrollView
} from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

export default function ContactsScreen() {
  const { user } = useAuth();
  const [currentContacts, setCurrentContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [presetMessage, setPresetMessage] = useState(
    'EMERGENCY! I need help. Please check on me.'
  );

  const normalizePhilippineNumber = (value: string) => {
    const compact = value.trim().replace(/[\s()-]/g, '');
    if (/^\+639\d{9}$/.test(compact)) return compact;
    if (/^639\d{9}$/.test(compact)) return `+${compact}`;
    if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
    return null;
  };

  useEffect(() => {
    const fetchContact = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('emergency_contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error && error.code !== 'PGRST116') {
          console.error('Fetch error:', error);
        }

        setCurrentContacts(data ?? []);
        if (data?.[0]?.preset_message) setPresetMessage(data[0].preset_message);
      } catch (err) {
        console.error('Exception fetching contact:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchContact();
  }, [user?.id]);

  const loadPhoneContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });
      if (data.length > 0) {
        setContacts(data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0));
        setShowPicker(true);
      } else {
        Alert.alert('No contacts found', 'Your phone book is empty.');
      }
    } else {
      Alert.alert(
        'Permission Denied',
        'EjeepHero needs contacts permission to let you select an emergency contact.'
      );
    }
  };

  const saveSelectedContact = async (contact: Contacts.Contact) => {
    const rawPhoneNumber = contact.phoneNumbers?.[0]?.number;
    const phoneNumber = rawPhoneNumber ? normalizePhilippineNumber(rawPhoneNumber) : null;
    if (!phoneNumber) {
      Alert.alert('Use a Philippine mobile number', 'Choose a contact with a number in 09XXXXXXXXX or +639XXXXXXXXX format.');
      return;
    }
    if (!user?.id) return;

    setSaving(true);
    setShowPicker(false);

    try {
      const { data, error } = await supabase.from('emergency_contacts').upsert(
        {
          user_id: user.id,
          contact_name: contact.name,
          phone_number: phoneNumber,
          preset_message: presetMessage,
        },
        { onConflict: 'user_id,phone_number' }
      ).select().single();

      if (error) {
        console.error('Save error:', error);
        Alert.alert('Error', error.message || 'Failed to save emergency contact');
      } else {
        const savedContact = data ?? {
          user_id: user.id,
          contact_name: contact.name,
          phone_number: phoneNumber,
          preset_message: presetMessage,
        };
        setCurrentContacts((existing) => [
          ...existing.filter((item) => item.phone_number !== savedContact.phone_number),
          savedContact,
        ]);
        Alert.alert('Success!', `${contact.name} set as your emergency contact.`);
      }
    } catch (err) {
      console.error('Exception:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const savePresetMessage = async () => {
    if (currentContacts.length === 0) {
      Alert.alert('No Contact', 'Please choose an emergency contact first.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('emergency_contacts')
      .update({ preset_message: presetMessage })
      .eq('user_id', user?.id);

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCurrentContacts((existing) => existing.map((contact) => ({ ...contact, preset_message: presetMessage })));
      Alert.alert('Saved', 'Preset message updated.');
    }
  };

  const removeEmergencyContact = async (contactId: string) => {
    const { error } = await supabase
      .from('emergency_contacts')
      .delete()
      .eq('id', contactId)
      .eq('user_id', user?.id);
    if (error) {
      Alert.alert('Could not remove contact', error.message);
      return;
    }
    setCurrentContacts((existing) => existing.filter((contact) => contact.id !== contactId));
  };

  const handleMessageChange = (text: string) => {
    // If user presses return/enter on their keyboard (adds \n), dismiss the keyboard and strip it
    if (text.endsWith('\n')) {
      Keyboard.dismiss();
      setPresetMessage(text.slice(0, -1));
    } else {
      setPresetMessage(text);
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primaryRed} />
      </View>
    );

  // ─── Contact Picker ───
  if (showPicker) {
    return (
      <View style={styles.pickerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Choose Emergency Contact</Text>
        </View>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={20} color={Colors.subtleGray} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <FlatList
          data={filteredContacts}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.contactItem}
              onPress={() => saveSelectedContact(item)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={styles.contactText}>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactPhone}>
                  {item.phoneNumbers?.[0]?.number}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CCC" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  // ─── Main Screen ───
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Emergency Contact</Text>
          <Text style={styles.subtitle}>
            Manage the contacts who receive your SOS alert and the shared emergency message.
          </Text>

          {/* Current Contact Card */}
          {currentContacts.length ? (
            <View style={styles.currentCard}>
              <View style={styles.cardIcon}>
                <Ionicons name="shield-checkmark" size={32} color={Colors.primaryYellow} />
              </View>
              <Text style={styles.currentLabel}>Emergency Contacts ({currentContacts.length})</Text>
              {currentContacts.map((contact) => (
                <View key={contact.id ?? contact.phone_number} style={styles.savedContactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.currentName}>{contact.contact_name}</Text>
                    <Text style={styles.currentPhone}>{contact.phone_number}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeEmergencyContact(contact.id)} accessibilityLabel={`Remove ${contact.contact_name}`}>
                    <Ionicons name="trash-outline" size={20} color={Colors.primaryRed} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.currentCard, styles.noContactCard]}>
              <View style={[styles.cardIcon, { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="warning" size={32} color={Colors.primaryRed} />
              </View>
              <Text style={styles.noContactText}>No Contact Configured</Text>
              <Text style={styles.noContactSub}>Add at least one contact to send SOS alerts.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.chooseButton} onPress={loadPhoneContacts}>
            <Ionicons name="people" size={20} color={Colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.chooseButtonText}>
              {currentContacts.length ? 'Add Emergency Contact' : 'Select from Contacts'}
            </Text>
          </TouchableOpacity>

          {/* Preset Message Card */}
          <View style={styles.messageCard}>
            <View style={styles.messageHeaderRow}>
              <Text style={styles.sectionTitle}>Preset SOS Message</Text>
              {Keyboard.isVisible() && (
                <TouchableOpacity onPress={Keyboard.dismiss} style={styles.keyboardDone}>
                  <Text style={styles.keyboardDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.sectionSub}>
              This message is sent to all saved contacts during an SOS.
            </Text>
            <TextInput
              style={styles.messageInput}
              multiline
              numberOfLines={4}
              value={presetMessage}
              onChangeText={handleMessageChange}
              placeholder="Type your emergency message here..."
              placeholderTextColor="#A0A0A0"
              blurOnSubmit={true}
              returnKeyType="done"
            />
            <TouchableOpacity 
              style={styles.saveMessageButton} 
              onPress={() => { Keyboard.dismiss(); savePresetMessage(); }} 
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveMessageText}>Save Custom Message</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.offWhite },
  container: { flex: 1, backgroundColor: Colors.offWhite },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '900', color: Colors.primaryRed },
  subtitle: { fontSize: 14, color: Colors.darkText, marginBottom: 24, marginTop: 4, lineHeight: 20 },
  
  // ── Picker ──
  pickerContainer: { flex: 1, backgroundColor: Colors.offWhite },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.primaryRed, 
    paddingTop: 50, 
    paddingBottom: 16, 
    paddingHorizontal: 16 
  },
  backBtn: { padding: 4 },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.white, marginLeft: 12 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.darkText,
  },
  contactItem: {
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16,
    backgroundColor: Colors.white, 
    borderBottomWidth: 1, 
    borderColor: '#F0E6D8',
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryYellow,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 18, fontWeight: 'bold' },
  contactText: { marginLeft: 14 },
  contactName: { fontSize: 16, fontWeight: 'bold', color: Colors.darkText },
  contactPhone: { fontSize: 13, color: '#666', marginTop: 2 },
  
  // ── Main ──
  currentCard: {
    backgroundColor: Colors.white, 
    borderRadius: 20, 
    padding: 24, 
    alignItems: 'center',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, 
    shadowRadius: 8, 
    elevation: 3, 
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  noContactCard: { borderColor: '#FFCDD2' },
  cardIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryRed,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.primaryYellow,
  },
  currentLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  currentName: { fontSize: 22, fontWeight: 'bold', color: Colors.darkText },
  currentPhone: { fontSize: 16, color: '#555', marginTop: 4 },
  savedContactRow: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0E6D8' },
  noContactText: { fontSize: 18, fontWeight: 'bold', color: Colors.primaryRed, marginTop: 4 },
  noContactSub: { fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' },
  
  chooseButton: {
    backgroundColor: Colors.primaryRed, 
    flexDirection: 'row', 
    padding: 16,
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 24,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  chooseButtonText: { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
  
  // ── Preset Message ──
  messageCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  messageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.darkText },
  keyboardDone: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  keyboardDoneText: {
    color: Colors.primaryRed,
    fontWeight: 'bold',
    fontSize: 15,
  },
  sectionSub: { fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 18 },
  messageInput: {
    backgroundColor: Colors.offWhite, 
    borderRadius: 12, 
    padding: 14,
    fontSize: 15, 
    textAlignVertical: 'top', 
    borderWidth: 1, 
    borderColor: '#E8DFD3',
    minHeight: 90,
    color: Colors.darkText,
  },
  saveMessageButton: {
    backgroundColor: Colors.primaryRed, 
    padding: 15, 
    borderRadius: 12,
    alignItems: 'center', 
    marginTop: 16,
  },
  saveMessageText: { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
});
