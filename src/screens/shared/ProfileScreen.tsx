import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useAuth } from '../../contexts/AuthContext';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { transitStyles } from '../../constants/transitStyles';
import { Ionicons } from '@expo/vector-icons';
import { supabase, supabaseAuth } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../locales/i18n';
import AppDownloadModal from '../../components/AppDownloadModal';
import { BottomSheetModal, FormScrollView } from '../../components/AppUI';

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

  const statusColor = status === 'approved' ? Colors.success : status === 'pending' ? Colors.warning : Colors.primaryRed;

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.identityCard}>
        <View style={styles.masthead}>
          <View style={styles.heroIdentity}>
            <Text accessibilityRole="header" style={styles.nameHeader}>{fullName || (isAdmin ? 'Admin' : 'No name set')}</Text>
            <Text style={styles.emailHeader}>{user?.email || 'Email unavailable'}</Text>
          </View>
          {!isEditingName && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Edit full name"
              onPress={() => { setIsEditingName(true); setNewName(fullName); }}
              style={styles.editButton}
            >
              <Ionicons name="pencil" size={16} color={Colors.ink} />
              <Text style={styles.editText}>{t('common.edit')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditingName && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              accessibilityLabel="Full name"
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              placeholder="Enter full name"
              placeholderTextColor={Colors.subtleGray}
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                accessibilityRole="button" accessibilityLabel="Save full name"
                onPress={handleSaveName} disabled={updatingName}
                accessibilityState={{ disabled: updatingName, busy: updatingName }}
                style={styles.primaryButton}
              >
                {updatingName ? <ActivityIndicator size="small" color={Colors.onDark} /> : <Text style={styles.primaryText}>{t('common.save')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => { setIsEditingName(false); setNewName(fullName); }}
                disabled={updatingName}
                style={styles.cancelButton}
              >
                <Text style={styles.actionText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {role !== 'driver' && (
          <View style={styles.detailRow}>
            <Text style={styles.secondaryText}>Account status</Text>
            <Text style={[styles.status, { color: statusColor }]}>{status || 'Unknown'}</Text>
          </View>
        )}
        {role === 'passenger' && !isAdmin && (
          <View style={styles.detailRow}>
            <Text style={styles.secondaryText}>Role</Text>
            <Text style={styles.fieldLabel}>Passenger</Text>
          </View>
        )}
      </View>

      <View style={styles.settingsPanel}>
        <TouchableOpacity
          style={styles.settingsRow}
          accessibilityRole="button"
          accessibilityLabel="Password and security settings"
          accessibilityState={{ expanded: showPasswordSection }}
          onPress={() => setShowPasswordSection(!showPasswordSection)}
        >
          <Ionicons name="lock-closed-outline" size={21} color={Colors.brandGreen} />
          <Text style={styles.rowTitle}>Password &amp; security</Text>
          <Ionicons
            name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.darkText}
          />
        </TouchableOpacity>

        {showPasswordSection && (
          <View style={styles.form}>

            {authProvider === 'clerk' && (
              <TextInput
                style={styles.input}
                placeholder="Current Password"
                accessibilityLabel="Current password"
                placeholderTextColor={Colors.subtleGray}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
            )}

            <TextInput
              style={styles.input}
              placeholder={authProvider === 'clerk' ? 'New Password (min 15 characters)' : 'New Password (min 6 characters)'}
              accessibilityLabel="New password"
              placeholderTextColor={Colors.subtleGray}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              accessibilityLabel="Confirm new password"
              placeholderTextColor={Colors.subtleGray}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: updatingPassword, busy: updatingPassword }}
              style={styles.primaryButton}
              onPress={handleUpdatePassword}
              disabled={updatingPassword}
            >
              {updatingPassword ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.primaryText}>Update password</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.settingsRow}
          onPress={() => setShowLanguageSelector(true)}
        >
          <Ionicons name="globe-outline" size={21} color={Colors.brandGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('profile.language')}</Text>
            <Text style={styles.secondaryText}>
              {i18n.language === 'en' ? t('profile.english') : t('profile.tagalog')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.subtleGray} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.settingsRow}
          onPress={() => setDownloadModalVisible(true)}
        >
          <Ionicons name="phone-portrait-outline" size={21} color={Colors.brandGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Install eSAKAY</Text>
            <Text style={styles.secondaryText}>Android APK and iOS installation guide</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.subtleGray} />
        </TouchableOpacity>

      </View>
      <BottomSheetModal
        visible={showLanguageSelector}
        onClose={() => setShowLanguageSelector(false)}
        scrollable={false}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t('profile.selectLanguage')}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setShowLanguageSelector(false)} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.darkText} />
          </TouchableOpacity>
        </View>

        <View style={styles.languageOptions}>
          <TouchableOpacity
            style={[
              styles.languageOption,
              i18n.language === 'en' && styles.languageOptionActive
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: i18n.language === 'en' }}
            onPress={() => handleChangeLanguage('en')}
          >
            <Ionicons 
              name={i18n.language === 'en' ? 'radio-button-on' : 'radio-button-off'} 
              size={24} 
              color={i18n.language === 'en' ? Colors.brandGreen : Colors.subtleGray}
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
            accessibilityRole="radio"
            accessibilityState={{ checked: i18n.language === 'fil' }}
            onPress={() => handleChangeLanguage('fil')}
          >
            <Ionicons 
              name={i18n.language === 'fil' ? 'radio-button-on' : 'radio-button-off'} 
              size={24} 
              color={i18n.language === 'fil' ? Colors.brandGreen : Colors.subtleGray}
              style={{ marginRight: 12 }}
            />
            <Text style={[styles.languageOptionText, i18n.language === 'fil' && styles.languageOptionTextActive]}>
              {t('profile.tagalog')}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      <AppDownloadModal
        visible={downloadModalVisible}
        onClose={() => setDownloadModalVisible(false)}
      />

      {/* Logout Button */}
      <TouchableOpacity accessibilityRole="button" style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={Colors.primaryRed} />
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  container: transitStyles.page,
  content: transitStyles.content,
  identityCard: { ...transitStyles.panel, overflow: 'hidden' },
  masthead: { ...transitStyles.masthead, borderRadius: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  heroIdentity: { minWidth: 0, flexBasis: 180, flexGrow: 1, flexShrink: 1, gap: 4 },
  nameHeader: { color: Colors.onDark, fontSize: 26, letterSpacing: -0.6, fontWeight: '800' },
  emailHeader: { color: Colors.onDark, fontSize: 14, lineHeight: 20, ...(Platform.OS === 'web' ? { overflowWrap: 'anywhere' as const } : {}) },
  editButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: 10, backgroundColor: Colors.signal },
  editText: { fontWeight: '700', fontSize: 14, color: Colors.ink },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderColor: Colors.border },
  secondaryText: { color: Colors.subtleGray, fontSize: 14, lineHeight: 20 },
  status: { textTransform: 'capitalize', fontWeight: '700', fontSize: 15 },
  form: { padding: 16, gap: 12, borderTopWidth: 1, borderColor: Colors.border },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  input: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: Colors.ink, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.subtleGray, borderRadius: 6 },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: transitStyles.primaryButton,
  primaryText: transitStyles.primaryText,
  cancelButton: { paddingHorizontal: 16, justifyContent: 'center', minHeight: 46 },
  actionText: { color: Colors.brandGreen, fontSize: 15, fontWeight: '700' },
  settingsPanel: { ...transitStyles.panel, overflow: 'hidden' },
  settingsRow: { minHeight: 56, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rowTitle: { flexShrink: 1, flexGrow: 1, fontSize: 16, fontWeight: '700', color: Colors.ink },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  modalTitle: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: Colors.ink },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  languageOptions: { gap: 8 },
  languageOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 6, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border },
  languageOptionActive: { borderColor: Colors.brandGreen, backgroundColor: Colors.paleGreen },
  languageOptionText: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: Colors.ink },
  languageOptionTextActive: { color: Colors.brandGreen },
  logoutButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: Colors.primaryRed, borderRadius: 6 },
  logoutText: { color: Colors.primaryRed, fontSize: 15, fontWeight: '700' },
});
