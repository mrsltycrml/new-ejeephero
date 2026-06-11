import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, FlatList, TextInput, KeyboardAvoidingView,
  Platform, Keyboard, TouchableWithoutFeedback, ScrollView
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

export default function ContactsScreen() {
  const { user } = useAuth();
  const [currentContact, setCurrentContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [presetMessage, setPresetMessage] = useState(
    'EMERGENCY! I need help. Please check on me.'
  );

  useEffect(() => {
    const fetchContact = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setCurrentContact(data);
        if (data.preset_message) setPresetMessage(data.preset_message);
      }
      setLoading(false);
    };
    fetchContact();
  }, []);

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
    const phoneNumber = contact.phoneNumbers?.[0]?.number;
    if (!phoneNumber) return;

    setSaving(true);
    setShowPicker(false);

    const { error } = await supabase.from('emergency_contacts').upsert(
      {
        user_id: user?.id,
        contact_name: contact.name,
        phone_number: phoneNumber,
        preset_message: presetMessage,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCurrentContact({
        contact_name: contact.name,
        phone_number: phoneNumber,
        preset_message: presetMessage,
      });
      Alert.alert('Saved', `${contact.name} set as your emergency contact.`);
    }
    setSaving(false);
  };

  const savePresetMessage = async () => {
    if (!currentContact) {
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
      Alert.alert('Saved', 'Preset message updated.');
    }
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
            Manage your emergency contact and custom SOS message broadcast.
          </Text>

          {/* Current Contact Card */}
          {currentContact ? (
            <View style={styles.currentCard}>
              <View style={styles.cardIcon}>
                <Ionicons name="shield-checkmark" size={32} color={Colors.primaryYellow} />
              </View>
              <Text style={styles.currentLabel}>Active Emergency Contact</Text>
              <Text style={styles.currentName}>{currentContact.contact_name}</Text>
              <Text style={styles.currentPhone}>{currentContact.phone_number}</Text>
            </View>
          ) : (
            <View style={[styles.currentCard, styles.noContactCard]}>
              <View style={[styles.cardIcon, { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="warning" size={32} color={Colors.primaryRed} />
              </View>
              <Text style={styles.noContactText}>No Contact Configured</Text>
              <Text style={styles.noContactSub}>You must set a contact to enable SOS alerts.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.chooseButton} onPress={loadPhoneContacts}>
            <Ionicons name="people" size={20} color={Colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.chooseButtonText}>
              {currentContact ? 'Change Emergency Contact' : 'Select from Contacts'}
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
              This text is automatically composed and sent to your contact during an SOS.
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
