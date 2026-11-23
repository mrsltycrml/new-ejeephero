import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSignIn } from '@clerk/clerk-expo';
import { isSupabaseConfigured, supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { color } from '../../constants/theme';
import AppDownloadModal from '../../components/AppDownloadModal';
import { ListRow } from '../../components/ui';
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
  const { t } = useTranslation();
  return (
    <>
      <AuthField label={t('passenger.authLogin.email')} placeholder="you@example.com" value={email} onChangeText={onEmail}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <AuthField label={t('passenger.authLogin.password')} passwordToggle value={password} onChangeText={onPassword}
        autoCapitalize="none" autoComplete="current-password" onSubmitEditing={loading ? undefined : onSubmit} />
      <View style={styles.forgot}><AuthLink label={t('passenger.authLogin.forgot')} onPress={onForgot} /></View>
      <AuthAction label={t('passenger.authLogin.signIn')} loading={loading} onPress={onSubmit} />
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
        setErrorMessage(t('passenger.authLogin.initializing'));
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
        setStatusMessage(t('passenger.authLogin.newDeviceCode', { email: normalizedEmail }));
      } else if (attempt.status === 'needs_first_factor') {
        const emailFactor = (attempt.supportedFirstFactors as any[])?.find((f) => f.strategy === 'email_code');
        if (emailFactor?.emailAddressId) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          setPendingFactor('first');
          setStatusMessage(t('passenger.authLogin.enterCode', { email: normalizedEmail }));
        } else {
          setErrorMessage(
            t('passenger.authLogin.verifyReset')
          );
        }
      } else {
        setErrorMessage(
          t('passenger.authLogin.verifyReset')
        );
      }
    } catch (err: any) {
      const legacyOk = await tryLegacySupabaseSignIn(normalizedEmail, password);
      if (legacyOk) return;

      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        t('passenger.authLogin.failed');
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
      setErrorMessage(t('passenger.authLogin.codeRequired'));
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
        setErrorMessage(t('passenger.authLogin.incomplete'));
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        t('passenger.authLogin.codeInvalid');
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
        <AuthField label={t('passenger.authLogin.code')} style={authStyles.code} keyboardType="number-pad"
          autoComplete="one-time-code" maxLength={6} autoFocus value={code}
          onSubmitEditing={loading ? undefined : handleVerifySignInCode}
          onChangeText={value => { setCode(value); if (errorMessage) setErrorMessage(''); }} />
        <AuthAction label={t('passenger.authLogin.verify')} onPress={handleVerifySignInCode} loading={loading} />
        <AuthLink label={t('passenger.authLogin.back')} onPress={() => {
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
          <ActivityIndicator size="small" color={color.action} />
          <Text style={authStyles.body}>{t('passenger.authLogin.connecting')}</Text>
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
          ? t('passenger.authLogin.confirmEmail')
          : message.includes('invalid login credentials')
            ? t('passenger.authLogin.checkCredentials')
            : error.message;
        setErrorMessage(guidance);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('passenger.authLogin.connection'));
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
  const { t } = useTranslation();
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  return (
    <AuthPage title={t('passenger.authLogin.welcome')} subtitle={t('passenger.authLogin.subtitle')}>
      {isClerkConfigured ? <ClerkSignInForm navigation={navigation} /> : <SupabaseSignInForm navigation={navigation} />}
      <View style={authStyles.footer}>
        <View style={authStyles.links}>
          <Text style={authStyles.body}>{t('passenger.authLogin.newHere')}</Text>
          <AuthLink label={t('passenger.authLogin.create')} onPress={() => navigation.navigate('Register')} />
        </View>
        <ListRow
          label={t('passenger.authLogin.install')}
          icon="phone-portrait-outline"
          onPress={() => setDownloadModalVisible(true)}
          style={{ marginTop: 10 }}
        />
      </View>
      <AppDownloadModal visible={downloadModalVisible} onClose={() => setDownloadModalVisible(false)} />
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginVertical: -10 },
  connecting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
