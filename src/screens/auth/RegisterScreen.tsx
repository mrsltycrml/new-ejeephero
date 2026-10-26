import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSignUp } from '@clerk/clerk-expo';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ESakayLogo from '../../components/ESakayLogo';

function splitFullName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Commuter', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function ClerkRegisterForm() {
  const { t } = useTranslation();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setLocalRole] = useState<'passenger' | 'driver'>('passenger');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const finalizeClerkUser = async (_clerkUserId: string | null | undefined, sessionId: string | null | undefined) => {
    // AuthContext securely bootstraps the profile after Clerk activates the session.
    if (sessionId && setActive) {
      await setActive({ session: sessionId });
    }
  };

  const handleStartSignUp = async () => {
    setErrorMessage('');
    setInfoMessage('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password) {
      setErrorMessage(t('auth.fillNameEmailPassword'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 15) {
      setErrorMessage(`Password must be at least 15 characters long (currently ${password.length}/15). Try a memorable phrase like MakatiCommute2026!`);
      return;
    }
    if (!isLoaded || !signUp) {
      setErrorMessage('Authentication service is still initializing. Please wait a moment and tap Create Account again.');
      return;
    }

    setLoading(true);
    try {
      const { firstName, lastName } = splitFullName(trimmedName);
      const created = await signUp.create({
        firstName,
        ...(lastName ? { lastName } : {}),
        emailAddress: trimmedEmail,
        password,
        unsafeMetadata: { role, full_name: trimmedName },
      });

      if (created.status === 'complete') {
        await finalizeClerkUser(created.createdUserId, created.createdSessionId);
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
      setInfoMessage(`We sent a 6-digit verification code to ${trimmedEmail}. Check your inbox (and spam folder).`);
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Unable to register. Please try a stronger password or a different email.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || !signUp) return;
    setErrorMessage('');
    setInfoMessage('');
    setResending(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setInfoMessage(`Sent a fresh 6-digit verification code to ${email.trim().toLowerCase()}.`);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || 'Could not resend code. Please wait a moment.';
      setErrorMessage(msg);
    } finally {
      setResending(false);
    }
  };

  const handleVerifyEmail = async () => {
    setErrorMessage('');
    setInfoMessage('');
    const cleanCode = code.replace(/\s+/g, '');
    if (!cleanCode) {
      setErrorMessage('Please enter the 6-digit verification code sent to your email.');
      return;
    }
    if (!isLoaded || !signUp) {
      setErrorMessage('Authentication service is still loading. Please try again in a second.');
      return;
    }

    setLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: cleanCode });
      if (attempt.status === 'complete') {
        await finalizeClerkUser(attempt.createdUserId, attempt.createdSessionId);
      } else {
        setErrorMessage(
          `Verification incomplete (status: ${attempt.status}). Missing: ${(attempt.missingFields || []).join(', ') || 'none'}. Please double-check the 6-digit code.`
        );
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Verification failed.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <View style={styles.formCard}>
        <Text style={styles.sectionLabel}>Enter Email Verification Code</Text>
        <Text style={[styles.noteText, { marginBottom: 14, flex: 0 }]}>
          Enter the 6-digit code sent to <Text style={{ fontWeight: '700' }}>{email.trim().toLowerCase()}</Text>.
        </Text>

        {!!errorMessage && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color="#B71C1C" />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {!!infoMessage && (
          <View style={styles.infoBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#1B5E20" />
            <Text style={styles.infoBannerText}>{infoMessage}</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="6-digit verification code"
          placeholderTextColor={Colors.subtleGray}
          value={code}
          onChangeText={(val) => {
            setCode(val);
            if (errorMessage) setErrorMessage('');
          }}
          keyboardType="number-pad"
          maxLength={8}
          autoComplete="one-time-code"
        />

        <TouchableOpacity style={styles.button} onPress={handleVerifyEmail} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>Verify Email & Continue</Text>
          )}
        </TouchableOpacity>

        <View style={styles.verifyActionsRow}>
          <TouchableOpacity onPress={handleResendCode} disabled={resending} style={styles.secondaryLinkBtn}>
            <Text style={styles.secondaryLinkText}>{resending ? 'Sending…' : 'Resend Code'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPendingVerification(false);
              setCode('');
              setErrorMessage('');
              setInfoMessage('');
            }}
            style={styles.secondaryLinkBtn}
          >
            <Text style={[styles.secondaryLinkText, { color: '#666' }]}>Change Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.formCard}>
      {!!errorMessage && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color="#B71C1C" />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {!isLoaded && (
        <View style={styles.loadingAuthRow}>
          <ActivityIndicator size="small" color={Colors.navy} />
          <Text style={styles.loadingAuthText}>Connecting to secure sign-up…</Text>
        </View>
      )}

      <Text style={{ fontSize: 14, color: Colors.ink, marginBottom: 8, fontWeight: '500' }}>Full name</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Full name"
        placeholder={t('auth.fullNamePlaceholder')}
        placeholderTextColor={Colors.subtleGray}
        value={fullName}
        onChangeText={(val) => {
          setFullName(val);
          if (errorMessage) setErrorMessage('');
        }}
        autoCapitalize="words"
        autoComplete="name"
      />
      <Text style={{ fontSize: 14, color: Colors.ink, marginBottom: 8, fontWeight: '500' }}>Email address</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Email address"
        placeholder={t('auth.emailPlaceholder')}
        placeholderTextColor={Colors.subtleGray}
        value={email}
        onChangeText={(val) => {
          setEmail(val);
          if (errorMessage) setErrorMessage('');
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Text style={{ fontSize: 14, color: Colors.ink, marginBottom: 8, fontWeight: '500' }}>Password</Text>
      <View style={styles.passwordWrapper}>
        <TextInput
          style={styles.passwordInput}
          accessibilityLabel="Password"
          placeholder={t('auth.passwordPlaceholder')}
          placeholderTextColor={Colors.subtleGray}
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errorMessage) setErrorMessage('');
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((prev) => !prev)}
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.passwordHint, password.length >= 15 && { color: '#2E7D32', fontWeight: '700' }]}>
        {password.length >= 15
          ? `Strong passphrase length (${password.length} characters)`
          : `Minimum 15 characters required (${password.length}/15) — e.g. MakatiCommute2026!`}
      </Text>

      <Text style={styles.sectionLabel}>{t('auth.selectRole')}</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[
            styles.roleButton,
            role === 'passenger' ? styles.roleActivePassenger : styles.roleInactive,
          ]}
          onPress={() => setLocalRole('passenger')}
        >
          <Ionicons
            name="people"
            size={22}
            color={role === 'passenger' ? Colors.white : Colors.darkText}
          />
          <Text
            style={[
              styles.roleText,
              role === 'passenger' ? styles.roleTextActive : styles.roleTextInactive,
            ]}
          >
            {t('auth.passenger')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.roleButton,
            role === 'driver' ? styles.roleActiveDriver : styles.roleInactive,
          ]}
          onPress={() => setLocalRole('driver')}
        >
          <Ionicons
            name="car"
            size={22}
            color={role === 'driver' ? Colors.white : Colors.darkText}
          />
          <Text
            style={[
              styles.roleText,
              role === 'driver' ? styles.roleTextActive : styles.roleTextInactive,
            ]}
          >
            {t('auth.driver')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.noteContainer}>
        <Ionicons name="information-circle" size={16} color="#FF9800" />
        <Text style={styles.noteText}>{t('auth.approvalRequiredNote')}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, (!isLoaded || loading) && { opacity: 0.75 }]}
        onPress={handleStartSignUp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>{t('auth.register')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function RegisterScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setLocalRole] = useState<'passenger' | 'driver'>('passenger');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleRegister = async () => {
    setErrorMessage('');
    if (!email || !password || !fullName) {
      setErrorMessage(t('auth.fillNameEmailPassword'));
      return;
    }
    if (password.length < 6) {
      setErrorMessage(t('auth.weakPasswordMsg'));
      return;
    }
    setLoading(true);
    const { error } = await supabaseAuth.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { role, full_name: fullName.trim() } },
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      Alert.alert(
        'Registration Submitted',
        'Check your inbox and confirm your email to start using your account.',
        [{ text: 'OK' }]
      );
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.ink} />
        </TouchableOpacity>

        <View style={styles.logoContainer}>
          <ESakayLogo width={188} />
          <Text style={styles.title}>{t('auth.createAccount')}</Text>
          <Text style={styles.subtitle}>{t('auth.joinNetwork')}</Text>
        </View>

        {isClerkConfigured ? (
          <ClerkRegisterForm />
        ) : (
          <View style={styles.formCard}>
            {!!errorMessage && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={18} color="#B71C1C" />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            <Text style={{ fontSize: 14, color: Colors.ink, marginBottom: 8, fontWeight: '500' }}>Full name</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Full name"
              placeholder={t('auth.fullNamePlaceholder')}
              placeholderTextColor={Colors.subtleGray}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
            <Text style={{ fontSize: 14, color: Colors.ink, marginBottom: 8, fontWeight: '500' }}>Email address</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Email address"
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={Colors.subtleGray}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={{ fontSize: 14, color: Colors.ink, marginBottom: 8, fontWeight: '500' }}>Password</Text>
      <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
          accessibilityLabel="Password"
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={Colors.subtleGray}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>{t('auth.selectRole')}</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'passenger' ? styles.roleActivePassenger : styles.roleInactive,
                ]}
                onPress={() => setLocalRole('passenger')}
              >
                <Ionicons
                  name="people"
                  size={22}
                  color={role === 'passenger' ? Colors.white : Colors.darkText}
                />
                <Text
                  style={[
                    styles.roleText,
                    role === 'passenger' ? styles.roleTextActive : styles.roleTextInactive,
                  ]}
                >
                  {t('auth.passenger')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'driver' ? styles.roleActiveDriver : styles.roleInactive,
                ]}
                onPress={() => setLocalRole('driver')}
              >
                <Ionicons
                  name="car"
                  size={22}
                  color={role === 'driver' ? Colors.white : Colors.darkText}
                />
                <Text
                  style={[
                    styles.roleText,
                    role === 'driver' ? styles.roleTextActive : styles.roleTextInactive,
                  ]}
                >
                  {t('auth.driver')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.noteContainer}>
              <Ionicons name="information-circle" size={16} color="#FF9800" />
              <Text style={styles.noteText}>{t('auth.approvalRequiredNote')}</Text>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>{t('auth.register')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkButton}>
          <Text style={styles.linkText}>
            {t('auth.alreadyHaveAccount')} <Text style={styles.linkAction}>{t('auth.logIn')}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 36,
    width: '100%',
    maxWidth: 580,
    alignSelf: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 10,
    zIndex: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    color: Colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 6,
    fontWeight: '500',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#B71C1C',
    fontWeight: '600',
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1B5E20',
    fontWeight: '600',
    lineHeight: 18,
  },
  loadingAuthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  loadingAuthText: {
    fontSize: 12,
    color: Colors.navy,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 13,
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 16,
    color: Colors.darkText,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    marginBottom: 6,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    padding: 13,
    fontSize: 16,
    color: Colors.darkText,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  passwordHint: {
    fontSize: 12,
    color: '#777',
    marginBottom: 14,
    marginLeft: 2,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginBottom: 10,
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roleInactive: {
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleActivePassenger: {
    backgroundColor: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  roleActiveDriver: {
    backgroundColor: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  roleText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  roleTextInactive: {
    color: Colors.darkText,
  },
  roleTextActive: {
    color: Colors.white,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 11,
    borderRadius: 6,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  noteText: {
    fontSize: 12,
    color: '#795548',
    flex: 1,
    lineHeight: 16,
  },
  button: {
    backgroundColor: Colors.ink,
    padding: 15,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  verifyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  secondaryLinkBtn: {
    paddingVertical: 6,
  },
  secondaryLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  linkButton: {
    padding: 10,
  },
  linkText: {
    color: Colors.subtleGray,
    textAlign: 'center',
    fontSize: 15,
  },
  linkAction: {
    color: Colors.primaryRed,
    fontWeight: 'bold',
  },
});
