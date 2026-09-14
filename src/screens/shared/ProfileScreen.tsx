import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput, ActivityIndicator, Modal } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../locales/i18n';

export default function ProfileScreen() {
  const { user, role, status, isAdmin, fullName, signOut, refreshProfile, isGuest } = useAuth();
  const { i18n, t } = useTranslation();

  // Edit Name State
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(fullName);
  const [updatingName, setUpdatingName] = useState(false);

  // Password Reset State
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Language Selector State
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('profile.logout'),
      t('profile.confirmLogout'),
      [
        { text: t('profile.no'), style: 'cancel' },
        {
          text: t('profile.yes'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  const handleChangeLanguage = async (lang: string) => {
    try {
      await changeLanguage(lang);
      setShowLanguageSelector(false);
      Alert.alert(t('common.success'), `${lang === 'en' ? 'English' : 'Tagalog'} selected!`);
    } catch (err) {
      Alert.alert(t('common.error'), 'Failed to change language');
    }
  };

  const handleSaveName = async () => {
    if (isGuest) {
      Alert.alert('Guest Mode', 'Profile editing is not available in guest mode. Please create an account.');
      return;
    }
    if (!newName.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }

    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: newName.trim() })
        .eq('id', user?.id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        await refreshProfile();
        setIsEditingName(false);
        Alert.alert('Success', 'Profile name updated successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile name.');
    } finally {
      setUpdatingName(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (isGuest) {
      Alert.alert('Guest Mode', 'Password change is not available in guest mode.');
      return;
    }
    if (!newPassword || !confirmPassword) {
      Alert.alert('Required Fields', 'Please fill in both password fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
        Alert.alert('Success', 'Password updated successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const roleBadgeColor = role === 'driver' ? Colors.primaryRed : Colors.primaryYellow;
  const roleBadgeText = role === 'driver' ? 'Driver' : 'Passenger';
  const statusColor = status === 'approved' ? '#4CAF50' : status === 'pending' ? '#FF9800' : '#F44336';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Guest Mode Notice */}
      {isGuest && (
        <View style={styles.guestNoticeCard}>
          <Ionicons name="person-circle-outline" size={22} color="#FF9800" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.guestNoticeTitle}>Guest Mode Active</Text>
            <Text style={styles.guestNoticeText}>Profile editing and password changes require a registered account. Log out and register to unlock full features.</Text>
          </View>
        </View>
      )}

      {/* Avatar Card */}
      <View style={styles.avatarCard}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={48} color={Colors.white} />
        </View>
        <Text style={styles.nameHeader}>{fullName || 'No Name Set'}</Text>
        <Text style={styles.emailHeader}>{user?.email || 'Unknown'}</Text>
        <View style={[styles.roleBadge, { backgroundColor: roleBadgeColor }]}>
          <Ionicons
            name={role === 'driver' ? 'car' : 'people'}
            size={14}
            color={Colors.white}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.roleBadgeText}>{roleBadgeText}</Text>
        </View>
      </View>

      {/* Account Settings Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Account Settings</Text>
      </View>

      <View style={styles.infoCard}>
        {/* Full Name Edit Row */}
        <View style={styles.settingsRow}>
          <View style={styles.infoIconBg}>
            <Ionicons name="person-outline" size={20} color={Colors.primaryRed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Full Name</Text>
            {isEditingName && !isGuest ? (
              <View style={styles.editInputContainer}>
                <TextInput
                  style={styles.editInput}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  placeholder="Enter full name"
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={handleSaveName} disabled={updatingName} style={styles.iconButton}>
                    {updatingName ? (
                      <ActivityIndicator size="small" color={Colors.primaryRed} />
                    ) : (
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setIsEditingName(false); setNewName(fullName); }}
                    disabled={updatingName}
                    style={styles.iconButton}
                  >
                    <Ionicons name="close-circle" size={24} color="#F44336" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.displayRow}>
                <Text style={styles.infoValue}>{fullName || 'Not Set'}</Text>
                {!isGuest && (
                  <TouchableOpacity
                    onPress={() => { setIsEditingName(true); setNewName(fullName); }}
                    style={styles.editBtn}
                  >
                    <Ionicons name="pencil" size={16} color={Colors.primaryRed} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Email Row (Non-Editable) */}
        <View style={styles.settingsRow}>
          <View style={styles.infoIconBg}>
            <Ionicons name="mail-outline" size={20} color={Colors.primaryRed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValueReadOnly}>{user?.email || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Account Status Row */}
        <View style={styles.settingsRow}>
          <View style={styles.infoIconBg}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primaryRed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Account Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.infoValue, { color: statusColor, textTransform: 'capitalize' }]}>
                {status || 'Unknown'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Role Row */}
        <View style={styles.settingsRow}>
          <View style={styles.infoIconBg}>
            <Ionicons name="id-card-outline" size={20} color={Colors.primaryRed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValueReadOnly}>{roleBadgeText}</Text>
          </View>
        </View>

        {isAdmin && (
          <>
            <View style={styles.divider} />
            <View style={styles.settingsRow}>
              <View style={[styles.infoIconBg, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="star" size={20} color="#FF9800" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Admin Access</Text>
                <Text style={[styles.infoValue, { color: '#FF9800' }]}>Enabled</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Security settings / Change Password */}
      {!isGuest && (
        <TouchableOpacity
          style={styles.collapseHeader}
          onPress={() => setShowPasswordSection(!showPasswordSection)}
        >
          <Text style={styles.sectionTitle}>{t('profile.accountSettings')}</Text>
          <Ionicons
            name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.darkText}
          />
        </TouchableOpacity>
      )}

      {showPasswordSection && (
        <View style={styles.infoCard}>
          <Text style={styles.passwordTitle}>Change Password</Text>
          
          <TextInput
            style={styles.passwordInput}
            placeholder="New Password (min 6 characters)"
            placeholderTextColor="#A0A0A0"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />

          <TextInput
            style={styles.passwordInput}
            placeholder="Confirm New Password"
            placeholderTextColor="#A0A0A0"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.updatePasswordBtn}
            onPress={handleUpdatePassword}
            disabled={updatingPassword}
          >
            {updatingPassword ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color={Colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.updatePasswordText}>Update Password</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Language Settings */}
      <TouchableOpacity
        style={styles.languageCard}
        onPress={() => setShowLanguageSelector(true)}
      >
        <View style={styles.languageIconBg}>
          <Ionicons name="globe-outline" size={22} color={Colors.primaryRed} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.languageLabel}>{t('profile.language')}</Text>
          <Text style={styles.languageValue}>
            {i18n.language === 'en' ? t('profile.english') : t('profile.tagalog')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.subtleGray} />
      </TouchableOpacity>

      {/* Language Selector Modal */}
      <Modal
        visible={showLanguageSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.languageModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.selectLanguage')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageSelector(false)}>
                <Ionicons name="close" size={24} color={Colors.darkText} />
              </TouchableOpacity>
            </View>

            <View style={styles.languageOptions}>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  i18n.language === 'en' && styles.languageOptionActive
                ]}
                onPress={() => handleChangeLanguage('en')}
              >
                <Ionicons 
                  name={i18n.language === 'en' ? 'radio-button-on' : 'radio-button-off'} 
                  size={24} 
                  color={i18n.language === 'en' ? Colors.primaryRed : Colors.subtleGray}
                  style={{ marginRight: 12 }}
                />
                <Text style={[styles.languageOptionText, i18n.language === 'en' && styles.languageOptionTextActive]}>
                  {t('profile.english')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.languageOption,
                  i18n.language === 'fil' && styles.languageOptionActive
                ]}
                onPress={() => handleChangeLanguage('fil')}
              >
                <Ionicons 
                  name={i18n.language === 'fil' ? 'radio-button-on' : 'radio-button-off'} 
                  size={24} 
                  color={i18n.language === 'fil' ? Colors.primaryRed : Colors.subtleGray}
                  style={{ marginRight: 12 }}
                />
                <Text style={[styles.languageOptionText, i18n.language === 'fil' && styles.languageOptionTextActive]}>
                  {t('profile.tagalog')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* App Info */}
      <View style={styles.appInfoCard}>
        <Text style={styles.appInfoTitle}>EjeepHero</Text>
        <Text style={styles.appInfoVersion}>Version 1.0.0</Text>
        <Text style={styles.appInfoDesc}>Philippine e-Jeepney Transit Tracker</Text>
        {isGuest && (
          <Text style={[styles.appInfoDesc, { color: '#FF9800', marginTop: 4, fontWeight: '600' }]}>🔒 Guest Mode</Text>
        )}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={Colors.white} style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.offWhite,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  guestNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#FFB300',
  },
  guestNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E65100',
    marginBottom: 3,
  },
  guestNoticeText: {
    fontSize: 12,
    color: '#795548',
    lineHeight: 17,
  },
  avatarCard: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: Colors.primaryYellow,
  },
  nameHeader: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  emailHeader: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 14,
    textAlign: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
  },
  roleBadgeText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.darkText,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0E6D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.subtleGray,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: Colors.darkText,
    fontWeight: '600',
  },
  infoValueReadOnly: {
    fontSize: 16,
    color: '#777',
    fontWeight: '500',
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  editBtn: {
    padding: 6,
  },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  editInput: {
    flex: 1,
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 15,
    color: Colors.darkText,
    marginRight: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0E6D8',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  passwordTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 12,
  },
  passwordInput: {
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 12,
    borderRadius: 10,
    fontSize: 15,
    color: Colors.darkText,
    marginBottom: 12,
  },
  updatePasswordBtn: {
    backgroundColor: Colors.primaryRed,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  updatePasswordText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  appInfoCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F0E6D8',
  },
  appInfoTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 0.5,
  },
  appInfoVersion: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 4,
  },
  appInfoDesc: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  languageCard: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  languageIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  languageValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.darkText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  languageModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.darkText,
  },
  languageOptions: {
    gap: 12,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.offWhite,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageOptionActive: {
    backgroundColor: '#FFF5F5',
    borderColor: Colors.primaryRed,
  },
  languageOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.darkText,
  },
  languageOptionTextActive: {
    color: Colors.primaryRed,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: Colors.accentRed,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.accentRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  logoutText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
});

