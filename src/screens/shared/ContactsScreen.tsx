import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, FlatList, TextInput, KeyboardAvoidingView,
  Platform, Keyboard, TouchableWithoutFeedback, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts/legacy';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

const LOCAL_CONTACTS_KEY = '@ejeephero_emergency_contact';

export default function ContactsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [currentContacts, setCurrentContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [presetMessage, setPresetMessage] = useState(
    'EMERGENCY! I need help. Please check on me.'
  );

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const syncLocalContacts = async (list: any[]) => {
    try {
      await AsyncStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(list));
    } catch {
      // Ignore storage error
    }
  };

  const normalizePhilippineNumber = (value: string) => {
    const compact = value.trim().replace(/[\s()-]/g, '');
    if (/^\+639\d{9}$/.test(compact)) return compact;
    if (/^639\d{9}$/.test(compact)) return `+${compact}`;
    if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
    return null;
  };

  useEffect(() => {
    const fetchContact = async () => {
      try {
        let localList: any[] = [];
        const cached = await AsyncStorage.getItem(LOCAL_CONTACTS_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          localList = Array.isArray(parsed) ? parsed : [parsed];
        }

        if (!user?.id) {
          setCurrentContacts(localList);
          if (localList[0]?.preset_message) setPresetMessage(localList[0].preset_message);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('emergency_contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error && error.code !== 'PGRST116') {
          console.error('Fetch error:', error);
        }

        const remoteList = data ?? [];
        const mergedMap = new Map<string, any>();
        for (const item of [...remoteList, ...localList]) {
          if (item?.phone_number) mergedMap.set(item.phone_number, item);
        }
        const merged = Array.from(mergedMap.values());
        setCurrentContacts(merged);
        await syncLocalContacts(merged);
        if (merged[0]?.preset_message) setPresetMessage(merged[0].preset_message);
      } catch (err) {
        console.error('Exception fetching contact:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchContact();
  }, [user?.id]);

  const loadPhoneContacts = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Use Manual Entry on Web', 'Enter the contact name and Philippine mobile number in the form below.');
      return;
    }
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });
      if (data.length > 0) {
        setContacts(data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0));
        setShowPicker(true);
      } else {
        Alert.alert(t('contacts.noContactsFound'), t('contacts.phonebookEmpty'));
      }
    } else {
      Alert.alert(
        t('contacts.permissionDenied'),
        t('contacts.contactsPermissionMsg')
      );
    }
  };

  const persistContact = async (name: string, rawPhone: string) => {
    const trimmedName = name.trim();
    const phoneNumber = normalizePhilippineNumber(rawPhone);
    if (!trimmedName) {
      Alert.alert(t('common.error'), 'Please enter a contact name.');
      return;
    }
    if (!phoneNumber) {
      Alert.alert('Use a Philippine mobile number', 'Enter a mobile number in 09XXXXXXXXX or +639XXXXXXXXX format.');
      return;
    }
    if (!user?.id) return;

    setSaving(true);
    setShowPicker(false);

    try {
      let savedContact: any = {
        id: `${user.id}-${phoneNumber}`,
        user_id: user.id,
        contact_name: trimmedName,
        phone_number: phoneNumber,
        preset_message: presetMessage,
      };

      const { data, error } = await supabase
        .from('emergency_contacts')
        .upsert(
          {
            user_id: user.id,
            contact_name: trimmedName,
            phone_number: phoneNumber,
            preset_message: presetMessage,
          },
          { onConflict: 'user_id,phone_number' }
        )
        .select()
        .single();

      if (error) {
        // Fallback if database still has legacy single-user unique constraint
        const fallback = await supabase
          .from('emergency_contacts')
          .upsert(
            {
              user_id: user.id,
              contact_name: trimmedName,
              phone_number: phoneNumber,
              preset_message: presetMessage,
            },
            { onConflict: 'user_id' }
          )
          .select()
          .single();
        if (fallback.data) {
          savedContact = fallback.data;
        }
      } else if (data) {
        savedContact = data;
      }

      const nextList = [
        ...currentContacts.filter((item) => item.phone_number !== savedContact.phone_number),
        savedContact,
      ];
      setCurrentContacts(nextList);
      await syncLocalContacts(nextList);
      setManualName('');
      setManualPhone('');
      Alert.alert(t('common.success'), t('contacts.contactSetSuccess', { name: trimmedName }));
    } catch (err) {
      console.error('Exception:', err);
      Alert.alert(t('common.error'), t('contacts.unexpectedError'));
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedContact = async (contact: Contacts.Contact) => {
    const rawPhoneNumber = contact.phoneNumbers?.[0]?.number || '';
    await persistContact(contact.name || 'Emergency Contact', rawPhoneNumber);
  };

  const saveManualContact = async () => {
    Keyboard.dismiss();
    await persistContact(manualName, manualPhone);
  };

  const savePresetMessage = async () => {
    if (currentContacts.length === 0) {
      Alert.alert(t('contacts.noContactAlertTitle'), t('contacts.noContactAlertMsg'));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('emergency_contacts')
      .update({ preset_message: presetMessage })
      .eq('user_id', user?.id);

    setSaving(false);
    const updatedList = currentContacts.map((contact) => ({ ...contact, preset_message: presetMessage }));
    setCurrentContacts(updatedList);
    await syncLocalContacts(updatedList);
    if (error) {
      console.warn('Preset message saved locally:', error.message);
    }
    Alert.alert(t('contacts.savedTitle'), t('contacts.presetMessageUpdated'));
  };

  const removeEmergencyContact = async (contactToRemove: any) => {
    if (contactToRemove?.id && user?.id) {
      await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', contactToRemove.id)
        .eq('user_id', user.id);
    }
    const nextList = currentContacts.filter(
      (contact) =>
        (contact.id && contact.id !== contactToRemove.id) ||
        contact.phone_number !== contactToRemove.phone_number
    );
    setCurrentContacts(nextList);
    await syncLocalContacts(nextList);
  };

  const handleMessageChange = (text: string) => {
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
          <Text style={styles.pickerTitle}>{t('contacts.chooseEmergencyContact')}</Text>
        </View>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={20} color={Colors.subtleGray} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('contacts.searchContacts')}
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
  const mainBody = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>{t('contacts.title')}</Text>
          <Text style={styles.subtitle}>{t('contacts.subtitle')}</Text>

          {/* Current Contact Card */}
          {currentContacts.length ? (
            <View style={styles.currentCard}>
              <View style={styles.cardIcon}>
                <Ionicons name="shield-checkmark" size={32} color={Colors.primaryYellow} />
              </View>
              <Text style={styles.currentLabel}>{t('contacts.title')} ({currentContacts.length})</Text>
              {currentContacts.map((contact) => (
                <View key={contact.id ?? contact.phone_number} style={styles.savedContactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.currentName}>{contact.contact_name}</Text>
                    <Text style={styles.currentPhone}>{contact.phone_number}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeEmergencyContact(contact)} accessibilityLabel={`Remove ${contact.contact_name}`}>
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
              <Text style={styles.noContactText}>{t('contacts.noContactConfigured')}</Text>
              <Text style={styles.noContactSub}>{t('contacts.pleaseSelectContactBelow')}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.chooseButton} onPress={loadPhoneContacts}>
            <Ionicons name="people" size={20} color={Colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.chooseButtonText}>
              {currentContacts.length ? t('contacts.changeEmergencyContact') : t('contacts.selectFromContacts')}
            </Text>
          </TouchableOpacity>

          {/* Manual Contact Entry Card */}
          <View style={[styles.messageCard, { marginBottom: 20 }]}>
            <Text style={styles.sectionTitle}>Add Contact Manually</Text>
            <Text style={styles.sectionSub}>
              Enter a name and Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).
            </Text>
            <TextInput
              style={styles.manualInput}
              placeholder="Contact Name (e.g. Maria Dela Cruz)"
              placeholderTextColor="#A0A0A0"
              value={manualName}
              onChangeText={setManualName}
            />
            <TextInput
              style={[styles.manualInput, { marginTop: 10 }]}
              placeholder="Mobile Number (e.g. 09171234567)"
              placeholderTextColor="#A0A0A0"
              keyboardType="phone-pad"
              value={manualPhone}
              onChangeText={setManualPhone}
            />
            <TouchableOpacity
              style={styles.saveMessageButton}
              onPress={saveManualContact}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveMessageText}>Save Manual Contact</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Preset Message Card */}
          <View style={styles.messageCard}>
            <View style={styles.messageHeaderRow}>
              <Text style={styles.sectionTitle}>{t('contacts.presetSosMessage')}</Text>
              {keyboardVisible && (
                <TouchableOpacity onPress={Keyboard.dismiss} style={styles.keyboardDone}>
                  <Text style={styles.keyboardDoneText}>{t('common.done')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.sectionSub}>
              {t('contacts.presetSosMessageDesc')}
            </Text>
            <TextInput
              style={styles.messageInput}
              multiline
              numberOfLines={4}
              value={presetMessage}
              onChangeText={handleMessageChange}
              placeholder={t('contacts.messagePlaceholder')}
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
                <Text style={styles.saveMessageText}>{t('contacts.saveCustomMessage')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
    </KeyboardAvoidingView>
  );

  if (Platform.OS === 'web') {
    return mainBody;
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {mainBody}
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.offWhite },
  container: { flex: 1, backgroundColor: Colors.offWhite },
  scrollContent: { padding: 20, paddingBottom: 40 },
title: { fontSize: 23, fontWeight: '600', color: Colors.ink },
  subtitle: { fontSize: 14, color: Colors.darkText, marginBottom: 24, marginTop: 4, lineHeight: 20 },
  pickerContainer: { flex: 1, backgroundColor: Colors.offWhite },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ink,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderColor: Colors.border,
  },
  noContactCard: { borderColor: '#FFCDD2' },
  cardIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.ink,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.primaryYellow,
  },
  currentLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    textTransform: 'none',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  currentName: { fontSize: 18, fontWeight: 'bold', color: Colors.darkText },
  currentPhone: { fontSize: 15, color: '#555', marginTop: 2 },
  savedContactRow: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0E6D8' },
  noContactText: { fontSize: 18, fontWeight: 'bold', color: Colors.primaryRed, marginTop: 4 },
  noContactSub: { fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' },
  chooseButton: {
    backgroundColor: Colors.ink,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  chooseButtonText: { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
  messageCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
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
  manualInput: {
    backgroundColor: Colors.offWhite,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.darkText,
  },
  messageInput: {
    backgroundColor: Colors.offWhite,
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 90,
    color: Colors.darkText,
  },
  saveMessageButton: {
    backgroundColor: Colors.ink,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveMessageText: { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
});
