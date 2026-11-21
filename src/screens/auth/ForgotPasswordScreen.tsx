import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { AuthAction, AuthField, AuthLink, AuthNotice, AuthPage, authStyles } from './AuthUI';

function ClerkForgotPasswordContent() {
  const { t } = useTranslation();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleRequestReset = async () => {
    setErrorMessage('');
    setInfoMessage('');
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage(t('passenger.authReset.registeredEmail'));
      return;
    }
    if (!isLoaded || !signIn) {
      setErrorMessage(t('passenger.authLogin.initializing'));
      return;
    }

    setLoading(true);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: trimmedEmail,
      });
      setStep('verify');
      setInfoMessage(t('passenger.authReset.sent', { email: trimmedEmail }));
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || t('passenger.authReset.failed');
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async () => {
    setErrorMessage('');
    setInfoMessage('');
    if (!code.trim() || !newPassword) {
      setErrorMessage(t('passenger.authReset.bothRequired'));
      return;
    }
    if (newPassword.length < 15) {
      setErrorMessage(t('passenger.authReset.length', { length: newPassword.length }));
      return;
    }
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        setErrorMessage(t('passenger.authReset.moreVerification'));
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || t('passenger.authReset.invalid');
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      <AuthNotice message={infoMessage} />
      {step === 'request' ? (
        <>
          <Text style={authStyles.body}>{t('passenger.authReset.requestCode')}</Text>
          <AuthField label={t('passenger.authLogin.email')} placeholder="you@example.com" value={email} onChangeText={setEmail}
            autoCapitalize="none" autoComplete="email" keyboardType="email-address"
            onSubmitEditing={loading ? undefined : handleRequestReset} />
          <AuthAction label={t('passenger.authReset.sendCode')} onPress={handleRequestReset} loading={loading} />
        </>
      ) : (
        <>
          {!infoMessage && <Text style={authStyles.body}>{t('passenger.authSignup.enterCode', { email: email.trim().toLowerCase() })}</Text>}
          <AuthField key="reset-code" label={t('passenger.authLogin.code')} style={authStyles.code} value={code}
            onChangeText={setCode} autoComplete="one-time-code" keyboardType="number-pad" autoFocus />
          <AuthField label={t('passenger.authReset.newPassword')} value={newPassword} onChangeText={setNewPassword}
            passwordToggle autoComplete="new-password" autoCapitalize="none" placeholder={t('passenger.authReset.minimum')}
            onSubmitEditing={loading ? undefined : handleVerifyReset} />
          <AuthAction label={t('passenger.authReset.verify')} loading={loading} onPress={handleVerifyReset} />
          <AuthLink label={t('passenger.authReset.retryEmail')} onPress={() => {
            setStep('request');
            setErrorMessage('');
            setInfoMessage('');
          }} />
        </>
      )}
    </View>
  );
}

function SupabaseForgotPasswordContent() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleReset = async () => {
    setErrorMessage('');
    setInfoMessage('');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage(t('passenger.authReset.registeredEmail'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(trimmedEmail);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setInfoMessage(t('passenger.authReset.checkEmail', { email: trimmedEmail }));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || t('passenger.authReset.unable'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      <AuthNotice message={infoMessage} />
      <Text style={authStyles.body}>{t('passenger.authReset.requestLink')}</Text>
      <AuthField label={t('passenger.authLogin.email')} placeholder="you@example.com" value={email} onChangeText={setEmail}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={loading ? undefined : handleReset} />
      <AuthAction label={t('passenger.authReset.sendLink')} onPress={handleReset} loading={loading} />
    </View>
  );
}

export default function ForgotPasswordScreen({ navigation }: any) {
  const { t } = useTranslation();
  return (
    <AuthPage title={t('passenger.authReset.title')} onBack={() => navigation.goBack()}>
      {isClerkConfigured ? <ClerkForgotPasswordContent /> : <SupabaseForgotPasswordContent />}
    </AuthPage>
  );
}
