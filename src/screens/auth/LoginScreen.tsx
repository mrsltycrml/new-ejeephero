import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSignIn } from '@clerk/clerk-expo';
import { isSupabaseConfigured, supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AppDownloadModal from '../../components/AppDownloadModal';
import ESakayLogo from '../../components/ESakayLogo';
import { FormScrollView } from '../../components/AppUI';

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
            'Additional verification is required. Please use Forgot password to verify your email with a 6-digit code.'
          );
        }
      } else {
        setErrorMessage(
          'Additional verification is required. Please use Forgot password to verify your email with a 6-digit code.'
        );
      }
    } catch (err: any) {
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
      <View style={styles.formSection}>
        {!!statusMessage && (
          <View style={[styles.errorBanner, { backgroundColor: Colors.paleGreen, borderColor: Colors.brandGreen }]}>
            <Ionicons name="mail-unread-outline" size={18} color={Colors.brandGreen} />
            <Text style={[styles.errorBannerText, { color: Colors.ink }]}>{statusMessage}</Text>
          </View>
        )}
        {!!errorMessage && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={Colors.primaryRed} />
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
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.buttonText}>Verify & sign in</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setPendingFactor(null);
            setCode('');
            setErrorMessage('');
          }}
          style={[styles.forgotPasswordBtn, { alignSelf: 'center', marginTop: 10 }]}
        >
          <Text style={styles.forgotPasswordText}>Back to sign in</Text>
        </TouchableOpacity>
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
          <Text style={styles.loadingAuthText}>Connecting to secure sign-in…</Text>
        </View>
      )}

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
          placeholder="Enter password"
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
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.subtleGray} />
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
          <Text style={styles.buttonText}>Sign in</Text>
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
    <View style={styles.formSection}>
      {!!errorMessage && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={Colors.primaryRed} />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

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
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function LoginScreen({ navigation }: any) {
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);

  return (
    <FormScrollView
      containerStyle={styles.outer}
      keyboardVerticalOffset={0}
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.logoHeader}>
        <ESakayLogo showIcon />
      </View>

      <View style={styles.headingBlock}>
        <Text accessibilityRole="header" style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to plan your ride.</Text>
      </View>

      {isClerkConfigured ? (
        <ClerkSignInForm navigation={navigation} />
      ) : (
        <SupabaseSignInForm navigation={navigation} />
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkButton}>
        <Text style={styles.linkText}>
          New to ejeephero? <Text style={styles.linkAction}>Create account</Text>
        </Text>
      </TouchableOpacity>

      <Text style={styles.footerCaption}>
        Passenger accounts are ready after registration.
      </Text>

      <TouchableOpacity
        onPress={() => setDownloadModalVisible(true)}
        style={styles.downloadBanner}
        activeOpacity={0.85}
      >
        <Ionicons name="phone-portrait-outline" size={16} color={Colors.subtleGray} />
        <Text style={styles.downloadBannerText}>Install ejeephero on your phone</Text>
        <Ionicons name="chevron-forward" size={15} color={Colors.subtleGray} />
      </TouchableOpacity>

      <AppDownloadModal
        visible={downloadModalVisible}
        onClose={() => setDownloadModalVisible(false)}
      />
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
    paddingVertical: 28,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  logoHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  headingBlock: {
    marginBottom: 20,
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.subtleGray,
    lineHeight: 21,
  },
  formSection: {
    marginBottom: 16,
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
    marginBottom: 16,
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
    marginBottom: 12,
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
  forgotPasswordBtn: {
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brandGreen,
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
  linkButton: {
    paddingVertical: 12,
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
  footerCaption: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.subtleGray,
    textAlign: 'center',
    lineHeight: 18,
  },
  downloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  downloadBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
});
