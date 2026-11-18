import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSignIn } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import AppDownloadModal from '../../components/AppDownloadModal';
import { AuthAction, AuthField, AuthLink, AuthNotice, AuthPage, authStyles } from './AuthUI';

type CredentialsProps = {
  email: string;
  password: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onForgot: () => void;
  loading: boolean;
};

function Credentials({ email, password, onEmail, onPassword, onSubmit, onForgot, loading }: CredentialsProps) {
  return (
    <>
      <AuthField label="Email address" placeholder="you@example.com" value={email} onChangeText={onEmail}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <AuthField label="Password" passwordToggle value={password} onChangeText={onPassword}
        autoCapitalize="none" autoComplete="current-password" onSubmitEditing={loading ? undefined : onSubmit} />
      <View style={styles.forgot}><AuthLink label="Forgot password?" onPress={onForgot} /></View>
      <AuthAction label="Sign in" loading={loading} onPress={onSubmit} />
    </>
  );
}

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
      <View style={authStyles.form}>
        <AuthNotice message={statusMessage} />
        <AuthNotice message={errorMessage} error />
        <AuthField label="Verification code" style={authStyles.code} keyboardType="number-pad"
          autoComplete="one-time-code" maxLength={6} autoFocus value={code}
          onSubmitEditing={loading ? undefined : handleVerifySignInCode}
          onChangeText={value => { setCode(value); if (errorMessage) setErrorMessage(''); }} />
        <AuthAction label="Verify & sign in" onPress={handleVerifySignInCode} loading={loading} />
        <AuthLink label="Back to sign in" onPress={() => {
          setPendingFactor(null);
          setCode('');
          setErrorMessage('');
        }} />
      </View>
    );
  }

  return (
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      {!isLoaded && (
        <View style={styles.connecting} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={Colors.action} />
          <Text style={authStyles.body}>Connecting to secure sign-in…</Text>
        </View>
      )}
      <Credentials email={email} password={password} loading={loading}
        onEmail={value => { setEmail(value); if (errorMessage) setErrorMessage(''); }}
        onPassword={value => { setPassword(value); if (errorMessage) setErrorMessage(''); }}
        onForgot={() => navigation.navigate('ForgotPassword')} onSubmit={handleClerkLogin} />
    </View>
  );
}

function SupabaseSignInForm({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      <Credentials email={email} password={password} onEmail={setEmail} onPassword={setPassword}
        loading={loading} onSubmit={handleLogin} onForgot={() => navigation.navigate('ForgotPassword')} />
    </View>
  );
}

export default function LoginScreen({ navigation }: any) {
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  return (
    <AuthPage title="Welcome back" subtitle="Sign in to your eSAKAY account.">
      {isClerkConfigured ? <ClerkSignInForm navigation={navigation} /> : <SupabaseSignInForm navigation={navigation} />}
      <View style={authStyles.footer}>
        <View style={authStyles.links}>
          <Text style={authStyles.body}>New to eSAKAY?</Text>
          <AuthLink label="Create account" onPress={() => navigation.navigate('Register')} />
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => setDownloadModalVisible(true)} style={styles.install}>
          <Ionicons aria-hidden name="phone-portrait-outline" size={20} color={Colors.ink} />
          <Text style={styles.installText}>Install eSAKAY on your phone</Text>
          <Ionicons aria-hidden name="chevron-forward" size={18} color={Colors.subtleGray} />
        </TouchableOpacity>
      </View>
      <AppDownloadModal visible={downloadModalVisible} onClose={() => setDownloadModalVisible(false)} />
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginVertical: -10 },
  connecting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  install: { marginTop: 10, minHeight: 48, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: Colors.canvas, flexDirection: 'row', alignItems: 'center', gap: 10 },
  installText: { flex: 1, color: Colors.ink, fontSize: 14, fontWeight: '600' },
});
