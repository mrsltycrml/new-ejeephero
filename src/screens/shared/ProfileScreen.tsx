import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useAuth } from '../../contexts/AuthContext';
import { isClerkConfigured } from '../../lib/clerk';
import { color, radius, tapTarget } from '../../constants/theme';
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
      const message = error instanceof Error ? error.message : t('passenger.menu.retry');
      if (Platform.OS === 'web') window.alert(t('passenger.profile.logoutError', { message }));
      else Alert.alert(t('common.error'), t('passenger.profile.logoutError', { message }));
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
    } catch (err) {
      Alert.alert(t('common.error'), t('passenger.profile.languageError'));
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      Alert.alert(t('passenger.profile.validation'), t('passenger.profile.nameRequired'));
      return;
    }

    setUpdatingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: newName.trim() })
        .eq('id', user?.id);

      if (error) {
        Alert.alert(t('common.error'), error.message);
      } else {
        await refreshProfile();
        setIsEditingName(false);
        Alert.alert(t('common.success'), t('passenger.profile.nameUpdated'));
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('passenger.profile.nameError'));
    } finally {
      setUpdatingName(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert(t('common.requiredFields'), t('passenger.profile.bothPasswords'));
      return;
    }
    const minLen = authProvider === 'clerk' ? 15 : 6;
    if (newPassword.length < minLen) {
      Alert.alert(t('passenger.profile.validation'), t('passenger.profile.minLength', { length: minLen }));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('passenger.profile.validation'), t('passenger.profile.mismatch'));
      return;
    }
    if (authProvider === 'clerk' && !currentPassword) {
      Alert.alert(t('passenger.profile.currentRequired'), t('passenger.profile.verifyCurrent'));
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
        Alert.alert(t('common.success'), t('passenger.profile.updated'));
      } else {
        const { error } = await supabaseAuth.auth.updateUser({ password: newPassword });
        if (error) {
          Alert.alert(t('common.error'), error.message);
        } else {
          setNewPassword('');
          setConfirmPassword('');
          setShowPasswordSection(false);
          Alert.alert(t('common.success'), t('passenger.profile.updated'));
        }
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || t('passenger.profile.passwordError');
      Alert.alert(t('common.error'), msg);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const statusColor = status === 'approved' ? color.success : status === 'pending' ? color.warning : color.ember;

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.identityCard}>
        <View style={styles.masthead}>
          <View style={styles.heroIdentity}>
            <Text accessibilityRole="header" style={styles.nameHeader}>{fullName || (isAdmin ? 'Admin' : t('passenger.profile.noName'))}</Text>
            <Text style={styles.emailHeader}>{user?.email || t('passenger.profile.noEmail')}</Text>
          </View>
          {!isEditingName && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('passenger.profile.editName')}
              onPress={() => { setIsEditingName(true); setNewName(fullName); }}
              style={styles.editButton}
            >
              <Ionicons name="pencil" size={16} color={color.ink} />
              <Text style={styles.editText}>{t('common.edit')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditingName && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>{t('passenger.authSignup.fullName')}</Text>
            <TextInput
              accessibilityLabel={t('passenger.authSignup.fullName')}
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              placeholder={t('passenger.profile.enterName')}
              placeholderTextColor={color.inkMuted}
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                accessibilityRole="button" accessibilityLabel={t('passenger.profile.saveName')}
                onPress={handleSaveName} disabled={updatingName}
                accessibilityState={{ disabled: updatingName, busy: updatingName }}
                style={styles.primaryButton}
              >
                {updatingName ? <ActivityIndicator size="small" color={color.onDark} /> : <Text style={styles.primaryText}>{t('common.save')}</Text>}
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
            <Text style={styles.secondaryText}>{t('passenger.profile.status')}</Text>
            <Text style={[styles.status, { color: statusColor }]}>{status ? t('passenger.profile.states.' + status, status) : t('passenger.profile.unknown')}</Text>
          </View>
        )}
        {role === 'passenger' && !isAdmin && (
          <View style={styles.detailRow}>
            <Text style={styles.secondaryText}>{t('passenger.profile.role')}</Text>
            <Text style={styles.fieldLabel}>{t('passenger.nav.passenger')}</Text>
          </View>
        )}
      </View>

      <View style={styles.settingsPanel}>
        <TouchableOpacity
          style={styles.settingsRow}
          accessibilityRole="button"
          accessibilityLabel={t('passenger.profile.securitySettings')}
          accessibilityState={{ expanded: showPasswordSection }}
          onPress={() => setShowPasswordSection(!showPasswordSection)}
        >
          <Ionicons name="lock-closed-outline" size={21} color={color.action} />
          <Text style={styles.rowTitle}>{t('passenger.profile.security')}</Text>
          <Ionicons
            name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={color.ink}
          />
        </TouchableOpacity>

        {showPasswordSection && (
          <View style={styles.form}>

            {authProvider === 'clerk' && (
              <TextInput
                style={styles.input}
                placeholder={t('passenger.profile.currentTitle')}
                accessibilityLabel={t('passenger.profile.current')}
                placeholderTextColor={color.inkMuted}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
            )}

            <TextInput
              style={styles.input}
              placeholder={authProvider === 'clerk' ? t('passenger.profile.minFifteen') : t('passenger.profile.minSix')}
              accessibilityLabel={t('passenger.authReset.newPassword')}
              placeholderTextColor={color.inkMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.input}
              placeholder={t('passenger.profile.confirmNew')}
              accessibilityLabel={t('passenger.profile.confirmPlaceholder')}
              placeholderTextColor={color.inkMuted}
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
                <ActivityIndicator color={color.onDark} size="small" />
              ) : (
                <Text style={styles.primaryText}>{t('passenger.profile.update')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.settingsRow}
          onPress={() => setShowLanguageSelector(true)}
        >
          <Ionicons name="globe-outline" size={21} color={color.action} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('profile.language')}</Text>
            <Text style={styles.secondaryText}>
              {i18n.language === 'en' ? t('profile.english') : t('profile.tagalog')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={color.inkMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.settingsRow}
          onPress={() => setDownloadModalVisible(true)}
        >
          <Ionicons name="phone-portrait-outline" size={21} color={color.action} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('passenger.install.title')}</Text>
            <Text style={styles.secondaryText}>{t('passenger.profile.installationGuide')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={color.inkMuted} />
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
            <Ionicons name="close" size={24} color={color.ink} />
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
              color={i18n.language === 'en' ? color.action : color.inkMuted}
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
              color={i18n.language === 'fil' ? color.action : color.inkMuted}
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
        <Ionicons name="log-out-outline" size={20} color={color.ember} />
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
  nameHeader: { color: color.onDark, fontSize: 26, letterSpacing: -0.6, fontWeight: '800' },
  emailHeader: { color: color.onDark, fontSize: 14, lineHeight: 20, ...(Platform.OS === 'web' ? { overflowWrap: 'anywhere' as const } : {}) },
  editButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, minHeight: tapTarget, borderRadius: radius.md, backgroundColor: color.signal },
  editText: { fontWeight: '700', fontSize: 14, color: color.ink },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderColor: color.border },
  secondaryText: { color: color.inkMuted, fontSize: 14, lineHeight: 20 },
  status: { textTransform: 'capitalize', fontWeight: '700', fontSize: 15 },
  form: { padding: 16, gap: 12, borderTopWidth: 1, borderColor: color.border },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: color.ink },
  input: { minHeight: tapTarget, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: color.ink, backgroundColor: color.paper, borderWidth: 1, borderColor: color.border, borderRadius: radius.md },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: transitStyles.primaryButton,
  primaryText: transitStyles.primaryText,
  cancelButton: { paddingHorizontal: 16, justifyContent: 'center', minHeight: tapTarget },
  actionText: { color: color.action, fontSize: 15, fontWeight: '700' },
  settingsPanel: { ...transitStyles.panel, overflow: 'hidden' },
  settingsRow: { minHeight: 56, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowTitle: { flexShrink: 1, flexGrow: 1, fontSize: 16, fontWeight: '700', color: color.ink },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  modalTitle: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: color.ink },
  closeButton: { width: tapTarget, height: tapTarget, alignItems: 'center', justifyContent: 'center' },
  languageOptions: { gap: 8 },
  languageOption: { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: tapTarget, borderRadius: radius.md, backgroundColor: color.paper, borderWidth: 1, borderColor: color.border },
  languageOptionActive: { borderColor: color.action, backgroundColor: color.actionTint },
  languageOptionText: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: color.ink },
  languageOptionTextActive: { color: color.action },
  logoutButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', minHeight: tapTarget, paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: color.ember, borderRadius: radius.md },
  logoutText: { color: color.ember, fontSize: 15, fontWeight: '700' },
});
