import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useAuth } from '../../contexts/AuthContext';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase, supabaseAuth } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../locales/i18n';
import AppDownloadModal from '../../components/AppDownloadModal';

export default function ProfileScreen() {
  const { user, role, status, isAdmin, fullName, authProvider, signOut, refreshProfile } = useAuth();
  const { i18n, t } = useTranslation();
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);

  // Edit Name State
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(fullName);
  const [updatingName, setUpdatingName] = useState(false);

  // Password Reset State
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const clerkUserHook = isClerkConfigured ? useUser() : null;

  useEffect(() => {
    if (!isEditingName) {
      setNewName(fullName);
    }
  }, [fullName, isEditingName]);

  // Language Selector State
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  const performLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (Platform.OS === 'web') window.alert(`Could not log out: ${message}`);
      else Alert.alert(t('common.error'), `Could not log out: ${message}`);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('profile.logout')}\n\n${t('profile.confirmLogout')}`)) {
        void performLogout();
      }
      return;
    }

    Alert.alert(
      t('profile.logout'),
      t('profile.confirmLogout'),
      [
        { text: t('profile.no'), style: 'cancel' },
        {
          text: t('profile.yes'),
          style: 'destructive',
          onPress: () => { void performLogout(); },
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
    if (!newPassword || !confirmPassword) {
      Alert.alert('Required Fields', 'Please fill in both password fields.');
      return;
    }
    const minLen = authProvider === 'clerk' ? 15 : 6;
    if (newPassword.length < minLen) {
      Alert.alert('Validation Error', `Password must be at least ${minLen} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }
    if (authProvider === 'clerk' && !currentPassword) {
      Alert.alert('Current Password Required', 'Enter your current password to verify this change.');
      return;
    }

    setUpdatingPassword(true);
    try {
      if (authProvider === 'clerk' && clerkUserHook?.user) {
        await clerkUserHook.user.updatePassword({
          currentPassword,
          newPassword,
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
        Alert.alert('Success', 'Password updated successfully!');
      } else {
        const { error } = await supabaseAuth.auth.updateUser({ password: newPassword });
        if (error) {
          Alert.alert('Error', error.message);
        } else {
          setNewPassword('');
          setConfirmPassword('');
          setShowPasswordSection(false);
          Alert.alert('Success', 'Password updated successfully!');
        }
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || 'Failed to update password.';
      Alert.alert('Error', msg);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const roleBadgeColor = isAdmin ? '#37535A' : role === 'driver' ? Colors.ink : '#78512F';
  const roleBadgeText = isAdmin ? 'Admin' : role === 'driver' ? 'Driver' : 'Passenger';
  const roleIcon = isAdmin ? 'shield-checkmark' : role === 'driver' ? 'car' : 'people';
  const statusColor = status === 'approved' ? '#4CAF50' : status === 'pending' ? '#FF9800' : '#F44336';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarCard}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={30} color={Colors.ink} />
        </View>
        <View style={styles.heroIdentity}>
          <Text style={styles.nameHeader}>{fullName || (isAdmin ? 'Admin' : 'No Name Set')}</Text>
          <Text style={styles.emailHeader}>{user?.email || 'Unknown'}</Text>
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
            <Ionicons name="person-outline" size={20} color={Colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Full Name</Text>
            {isEditingName ? (
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
                      <ActivityIndicator size="small" color={Colors.ink} />
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
                <TouchableOpacity
                  onPress={() => { setIsEditingName(true); setNewName(fullName); }}
                  style={styles.editBtn}
                >
                  <Ionicons name="pencil" size={16} color={Colors.ink} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Email Row (Non-Editable) */}
        <View style={styles.settingsRow}>
          <View style={styles.infoIconBg}>
            <Ionicons name="mail-outline" size={20} color={Colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValueReadOnly}>{user?.email || 'N/A'}</Text>
          </View>
        </View>

        {/* Account Status Row */}
        {role !== 'driver' && <><View style={styles.divider} /><View style={styles.settingsRow}>
          <View style={styles.infoIconBg}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.ink} />
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
        </View></>}

        {role === 'passenger' && !isAdmin && <>
          <View style={styles.divider} />
          <View style={styles.settingsRow}>
            <View style={styles.infoIconBg}>
              <Ionicons name="id-card-outline" size={20} color={Colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValueReadOnly}>{roleBadgeText}</Text>
            </View>
          </View>
        </>}

      </View>

      {/* Security settings / Change Password */}
      <TouchableOpacity
        style={styles.collapseHeader}
        accessibilityRole="button"
        accessibilityLabel="Password and security settings"
        accessibilityState={{ expanded: showPasswordSection }}
        onPress={() => setShowPasswordSection(!showPasswordSection)}
      >
        <View style={styles.securityHeading}>
          <View style={styles.securityIcon}><Ionicons name="lock-closed-outline" size={20} color={Colors.ink} /></View>
          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Password & security</Text><Text style={styles.securitySub}>Change your sign-in password</Text></View>
        </View>
        <Ionicons
          name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.darkText}
        />
      </TouchableOpacity>

      {showPasswordSection && (
        <View style={styles.infoCard}>
          <Text style={styles.passwordTitle}>Change password</Text>

          {authProvider === 'clerk' && (
            <TextInput
              style={styles.passwordInput}
              placeholder="Current Password"
              accessibilityLabel="Current password"
              placeholderTextColor="#A0A0A0"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
          )}

          <TextInput
            style={styles.passwordInput}
            placeholder={authProvider === 'clerk' ? 'New Password (min 15 characters)' : 'New Password (min 6 characters)'}
            accessibilityLabel="New password"
            placeholderTextColor="#A0A0A0"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />

          <TextInput
            style={styles.passwordInput}
            placeholder="Confirm New Password"
            accessibilityLabel="Confirm new password"
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
          <Ionicons name="globe-outline" size={22} color={Colors.ink} />
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
                  color={i18n.language === 'en' ? Colors.ink : Colors.subtleGray}
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
                  color={i18n.language === 'fil' ? Colors.ink : Colors.subtleGray}
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

      {/* App Download / iOS PWA Guide */}
      <TouchableOpacity
        style={styles.languageCard}
        onPress={() => setDownloadModalVisible(true)}
      >
        <View style={styles.languageIconBg}>
          <Ionicons name="phone-portrait-outline" size={22} color={Colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.languageLabel}>MOBILE DISTRIBUTION</Text>
          <Text style={styles.languageValue}>
            Download Android APK / iOS Install Guide
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.subtleGray} />
      </TouchableOpacity>

      <AppDownloadModal
        visible={downloadModalVisible}
        onClose={() => setDownloadModalVisible(false)}
      />

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
    backgroundColor: Colors.canvas,
  },
  content: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    padding: 18,
    paddingBottom: 36,
  },
  avatarCard: {
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 18,
  },
  heroIdentity: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  nameHeader: {
    color: Colors.ink,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  emailHeader: {
    maxWidth: '100%',
    flexShrink: 1,
    ...(Platform.OS === 'web' ? { overflowWrap: 'anywhere' as any } : {}),
    color: Colors.subtleGray,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 10,
  },
  roleBadge: {
    flexDirection: 'row',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: 'center',
  },
  roleBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0.8,
  },
  sectionHeader: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  securityHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  securityIcon: { width: 40, height: 40, borderRadius: 6, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  securitySub: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.darkText,
  },
  infoCard: {
    backgroundColor: Colors.paper,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconBg: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.paper,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.subtleGray,
    fontWeight: '700',
    textTransform: 'none',
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
    color: Colors.subtleGray,
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
    borderColor: Colors.border,
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
    backgroundColor: Colors.border,
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
    borderColor: Colors.border,
    padding: 12,
    borderRadius: 6,
    fontSize: 15,
    color: Colors.darkText,
    marginBottom: 12,
  },
  updatePasswordBtn: {
    backgroundColor: Colors.ink,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: Colors.ink,
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
  languageCard: {
    backgroundColor: Colors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  languageIconBg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: Colors.paper,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '600',
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
    fontWeight: '600',
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
    borderRadius: 8,
    backgroundColor: Colors.offWhite,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageOptionActive: {
    backgroundColor: '#FFF5F5',
    borderColor: Colors.ink,
  },
  languageOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.darkText,
  },
  languageOptionTextActive: {
    color: Colors.ink,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: Colors.ink,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 8,
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

