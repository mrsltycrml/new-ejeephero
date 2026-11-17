import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSignUp } from '@clerk/clerk-expo';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ESakayLogo from '../../components/ESakayLogo';
import { FormScrollView } from '../../components/AppUI';

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
      setErrorMessage('Authentication service is still initializing. Please wait a moment and tap Create account again.');
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
      <View style={styles.formSection}>
        <Text style={styles.sectionLabel}>Enter verification code</Text>
        <Text style={[styles.noteText, { marginBottom: 14, flex: 0 }]}>
          Enter the 6-digit code sent to <Text style={{ fontWeight: '700' }}>{email.trim().toLowerCase()}</Text>.
        </Text>

        {!!errorMessage && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={Colors.primaryRed} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {!!infoMessage && (
          <View style={styles.infoBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />
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
            <Text style={styles.buttonText}>Verify email & continue</Text>
          )}
        </TouchableOpacity>

        <View style={styles.verifyActionsRow}>
          <TouchableOpacity onPress={handleResendCode} disabled={resending} style={styles.secondaryLinkBtn}>
            <Text style={styles.secondaryLinkText}>{resending ? 'Sending…' : 'Resend code'}</Text>
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
            <Text style={[styles.secondaryLinkText, { color: Colors.subtleGray }]}>Change email</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.formSection}>
      {!!errorMessage && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={Colors.primaryRed} />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {!isLoaded && (
        <View style={styles.loadingAuthRow}>
          <ActivityIndicator size="small" color={Colors.brandGreen} />
          <Text style={styles.loadingAuthText}>Connecting to secure sign-up…</Text>
        </View>
      )}

      <Text style={styles.fieldLabel}>Full name</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Full name"
        placeholder="Juan Dela Cruz"
        placeholderTextColor={Colors.subtleGray}
        value={fullName}
        onChangeText={(val) => {
          setFullName(val);
          if (errorMessage) setErrorMessage('');
        }}
        autoCapitalize="words"
        autoComplete="name"
      />
      <Text style={styles.fieldLabel}>Email address</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Email address"
        placeholder="you@example.com"
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
      <Text style={styles.fieldLabel}>Password</Text>
      <View style={styles.passwordWrapper}>
        <TextInput
          style={styles.passwordInput}
          accessibilityLabel="Password"
          placeholder="Minimum 15 characters"
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
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.subtleGray} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.passwordHint, password.length >= 15 && { color: Colors.brandGreen, fontWeight: '700' }]}>
        {password.length >= 15
          ? `Strong passphrase length (${password.length} characters)`
          : `Minimum 15 characters required (${password.length}/15) — e.g. MakatiCommute2026!`}
      </Text>

      <Text style={styles.sectionLabel}>Role</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[
            styles.roleButton,
            role === 'passenger' ? styles.roleActive : styles.roleInactive,
          ]}
          onPress={() => setLocalRole('passenger')}
        >
          <Ionicons
            name="person-outline"
            size={18}
            color={role === 'passenger' ? Colors.brandGreen : Colors.ink}
          />
          <Text
            style={[
              styles.roleText,
              role === 'passenger' ? styles.roleTextActive : styles.roleTextInactive,
            ]}
          >
            Passenger
          </Text>
          {role === 'passenger' && <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.roleButton,
            role === 'driver' ? styles.roleActive : styles.roleInactive,
          ]}
          onPress={() => setLocalRole('driver')}
        >
          <Ionicons
            name="bus-outline"
            size={18}
            color={role === 'driver' ? Colors.brandGreen : Colors.ink}
          />
          <Text
            style={[
              styles.roleText,
              role === 'driver' ? styles.roleTextActive : styles.roleTextInactive,
            ]}
          >
            Driver
          </Text>
          {role === 'driver' && <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />}
        </TouchableOpacity>
      </View>

      <View style={styles.noteContainer}>
        <Ionicons name="information-circle-outline" size={17} color={Colors.subtleGray} />
        <Text style={styles.noteText}>
          Passenger accounts are ready immediately. Driver accounts require supervisor approval.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, (!isLoaded || loading) && { opacity: 0.75 }]}
        onPress={handleStartSignUp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>Create account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function RegisterScreen({ navigation }: any) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
        'Registration submitted',
        'Check your inbox and confirm your email to start using your account.',
        [{ text: 'OK' }]
      );
    }
    setLoading(false);
  };

  return (
    <FormScrollView
      containerStyle={styles.outer}
      keyboardVerticalOffset={0}
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={[styles.backButton, { top: 12 + insets.top }]} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={Colors.ink} />
      </TouchableOpacity>

      <View style={styles.logoHeader}>
        <ESakayLogo showIcon />
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join the ejeephero transit network.</Text>
      </View>

      {isClerkConfigured ? (
        <ClerkRegisterForm />
      ) : (
        <View style={styles.formSection}>
          {!!errorMessage && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={Colors.primaryRed} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Full name"
            placeholder="Juan Dela Cruz"
            placeholderTextColor={Colors.subtleGray}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Email address"
            placeholder="you@example.com"
            placeholderTextColor={Colors.subtleGray}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              accessibilityLabel="Password"
              placeholder="Enter password"
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
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.subtleGray} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Role</Text>
          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[
                styles.roleButton,
                role === 'passenger' ? styles.roleActive : styles.roleInactive,
              ]}
              onPress={() => setLocalRole('passenger')}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={role === 'passenger' ? Colors.brandGreen : Colors.ink}
              />
              <Text
                style={[
                  styles.roleText,
                  role === 'passenger' ? styles.roleTextActive : styles.roleTextInactive,
                ]}
              >
                Passenger
              </Text>
              {role === 'passenger' && <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleButton,
                role === 'driver' ? styles.roleActive : styles.roleInactive,
              ]}
              onPress={() => setLocalRole('driver')}
            >
              <Ionicons
                name="bus-outline"
                size={18}
                color={role === 'driver' ? Colors.brandGreen : Colors.ink}
              />
              <Text
                style={[
                  styles.roleText,
                  role === 'driver' ? styles.roleTextActive : styles.roleTextInactive,
                ]}
              >
                Driver
              </Text>
              {role === 'driver' && <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />}
            </TouchableOpacity>
          </View>

          <View style={styles.noteContainer}>
            <Ionicons name="information-circle-outline" size={17} color={Colors.subtleGray} />
            <Text style={styles.noteText}>
              Passenger accounts are ready immediately. Driver accounts require supervisor approval.
            </Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkButton}>
        <Text style={styles.linkText}>
          Already have an account? <Text style={styles.linkAction}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  logoHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  headingBlock: {
    marginBottom: 18,
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.subtleGray,
    lineHeight: 21,
  },
  formSection: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.dangerBg,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primaryRed,
    fontWeight: '600',
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.ink,
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
    fontSize: 13,
    color: Colors.ink,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    borderRadius: 12,
    marginBottom: 14,
    fontSize: 16,
    color: Colors.ink,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    minHeight: 52,
    marginBottom: 6,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.ink,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  passwordHint: {
    fontSize: 12,
    color: Colors.subtleGray,
    marginBottom: 14,
    marginLeft: 2,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 8,
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  roleInactive: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleActive: {
    backgroundColor: Colors.paleGreen,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen,
  },
  roleText: {
    fontSize: 15,
    fontWeight: '700',
  },
  roleTextInactive: {
    color: Colors.ink,
  },
  roleTextActive: {
    color: Colors.ink,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.canvas,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  noteText: {
    fontSize: 13,
    color: Colors.subtleGray,
    flex: 1,
    lineHeight: 18,
  },
  button: {
    backgroundColor: Colors.brandGreen,
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  linkButton: {
    paddingVertical: 10,
  },
  linkText: {
    color: Colors.ink,
    textAlign: 'center',
    fontSize: 15,
  },
  linkAction: {
    color: Colors.brandGreen,
    fontWeight: '700',
  },
});
