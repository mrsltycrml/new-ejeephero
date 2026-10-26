import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSignIn } from '@clerk/clerk-expo';
import { isSupabaseConfigured, supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AppDownloadModal from '../../components/AppDownloadModal';
import ESakayLogo from '../../components/ESakayLogo';

async function tryLegacySupabaseSignIn(normalizedEmail: string, password: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    return Boolean(!error && data?.session);
  } catch {
    return false;
  }
}

function ClerkSignInForm({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingFactor, setPendingFactor] = useState<'first' | 'second' | null>(null);
  const [code, setCode] = useState('');

  const handleClerkLogin = async () => {
    setErrorMessage('');
    setStatusMessage('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setErrorMessage(t('auth.fillEmailPassword'));
      return;
    }

    setLoading(true);
    try {
      if (!isLoaded || !signIn) {
        const legacyOk = await tryLegacySupabaseSignIn(normalizedEmail, password);
        if (legacyOk) return;
        setErrorMessage('Authentication service is still initializing. Please try again in a moment.');
        return;
      }

      const attempt = await signIn.create({
        identifier: normalizedEmail,
        password,
      });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        return;
      }

      // If Clerk requests new-device Device Trust verification, check if this is a verified legacy Supabase account first
      const legacyOk = await tryLegacySupabaseSignIn(normalizedEmail, password);
      if (legacyOk) return;

      if (attempt.status === 'needs_second_factor') {
        await signIn.prepareSecondFactor({ strategy: 'email_code' } as any);
        setPendingFactor('second');
        setStatusMessage(`Enter the 6-digit verification code sent to ${normalizedEmail} for this new device.`);
      } else if (attempt.status === 'needs_first_factor') {
        const emailFactor = (attempt.supportedFirstFactors as any[])?.find((f) => f.strategy === 'email_code');
        if (emailFactor?.emailAddressId) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          setPendingFactor('first');
          setStatusMessage(`Enter the 6-digit verification code sent to ${normalizedEmail}.`);
        } else {
          setErrorMessage(
            'Additional verification is required. Please use Forgot Password to verify your email with a 6-digit code.'
          );
        }
      } else {
        setErrorMessage(
          'Additional verification is required. Please use Forgot Password to verify your email with a 6-digit code.'
        );
      }
    } catch (err: any) {
      // Seamless fallback for past Supabase accounts (e.g. legacy passwords or pre-Clerk credentials)
      const legacyOk = await tryLegacySupabaseSignIn(normalizedEmail, password);
      if (legacyOk) return;

      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Unable to sign in. Check your email and password.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignInCode = async () => {
    setErrorMessage('');
    if (!isLoaded || !signIn) return;
    const cleanCode = code.replace(/\s+/g, '');
    if (!cleanCode) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      const result =
        pendingFactor === 'second'
          ? await signIn.attemptSecondFactor({ strategy: 'email_code', code: cleanCode } as any)
          : await signIn.attemptFirstFactor({ strategy: 'email_code', code: cleanCode });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        setErrorMessage('Verification incomplete. Please double-check the 6-digit code.');
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Invalid or expired verification code.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (pendingFactor) {
    return (
      <View style={styles.formCard}>
        {!!statusMessage && (
          <View style={[styles.errorBanner, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
            <Ionicons name="mail-unread-outline" size={18} color="#1B5E20" />
            <Text style={[styles.errorBannerText, { color: '#1B5E20' }]}>{statusMessage}</Text>
          </View>
        )}
        {!!errorMessage && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color="#B71C1C" />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}
        <TextInput
          style={[styles.input, { textAlign: 'center', letterSpacing: 6, fontSize: 20, fontWeight: '600' }]}
          placeholder="6-digit code"
          placeholderTextColor={Colors.subtleGray}
          value={code}
          onChangeText={(val) => {
            setCode(val);
            if (errorMessage) setErrorMessage('');
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
        <TouchableOpacity style={styles.button} onPress={handleVerifySignInCode} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.buttonText}>Verify & Log In</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setPendingFactor(null);
            setCode('');
            setErrorMessage('');
          }}
          style={[styles.forgotPasswordBtn, { alignSelf: 'center', marginTop: 10 }]}
        >
          <Text style={styles.forgotPasswordText}>Back to Sign In</Text>
        </TouchableOpacity>
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
          <Text style={styles.loadingAuthText}>Connecting to secure sign-in…</Text>
        </View>
      )}

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
          autoComplete="current-password"
          onSubmitEditing={handleClerkLogin}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((prev) => !prev)}
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.forgotPasswordBtn}
      >
        <Text style={styles.forgotPasswordText}>Forgot password?</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, (!isLoaded || loading) && { opacity: 0.75 }]}
        onPress={handleClerkLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>{t('auth.logIn')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function SupabaseSignInForm({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    setErrorMessage('');
    if (!email.trim() || !password) {
      setErrorMessage(t('auth.fillEmailPassword'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const message = error.message.toLowerCase();
        const guidance = message.includes('email not confirmed')
          ? 'Confirm your email using the link we sent, then try again.'
          : message.includes('invalid login credentials')
            ? 'Check your email and password. If you have not registered yet, create an account first.'
            : error.message;
        setErrorMessage(guidance);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.formCard}>
      {!!errorMessage && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color="#B71C1C" />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

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

      <TouchableOpacity
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.forgotPasswordBtn}
      >
        <Text style={styles.forgotPasswordText}>Forgot password?</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>{t('auth.logIn')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function LoginScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);

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
        <View style={styles.logoContainer}>
          <ESakayLogo width={220} />
        </View>

        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '600', color: Colors.ink, marginBottom: 24 }}>Sign in</Text>
        {isClerkConfigured ? (
          <ClerkSignInForm navigation={navigation} />
        ) : (
          <SupabaseSignInForm navigation={navigation} />
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkButton}>
          <Text style={styles.linkText}>
            {t('auth.noAccount')} <Text style={styles.linkAction}>{t('auth.registerNow')}</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setDownloadModalVisible(true)}
          style={styles.downloadBanner}
          activeOpacity={0.85}
        >
          <Ionicons name="phone-portrait-outline" size={18} color={Colors.primaryRed} />
          <Text style={styles.downloadBannerText}>
            Get the eSAKAY mobile app
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primaryRed} />
        </TouchableOpacity>

        <AppDownloadModal
          visible={downloadModalVisible}
          onClose={() => setDownloadModalVisible(false)}
        />
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
    padding: 24,
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 25,
    gap: 10,
  },
  jeepneyBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.navy,
    letterSpacing: 0.2,
  },
  titleHighlight: {
    color: Colors.primaryRed,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.subtleGray,
    marginTop: 6,
    fontWeight: '400',
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    padding: 26,
    marginBottom: 18,
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
    padding: 14,
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
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    padding: 14,
    fontSize: 16,
    color: Colors.darkText,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  forgotPasswordBtn: {
    alignSelf: 'flex-end',
    marginBottom: 10,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryRed,
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
  downloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  downloadBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink,
    flexShrink: 1,
  },
});
