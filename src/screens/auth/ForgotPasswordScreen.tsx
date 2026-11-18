import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { AuthAction, AuthField, AuthLink, AuthNotice, AuthPage, authStyles } from './AuthUI';

function ClerkForgotPasswordContent() {
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
      setErrorMessage('Please enter your registered email address.');
      return;
    }
    if (!isLoaded || !signIn) {
      setErrorMessage('Authentication service is still initializing. Please try again in a moment.');
      return;
    }

    setLoading(true);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: trimmedEmail,
      });
      setStep('verify');
      setInfoMessage(`Sent a 6-digit password reset code to ${trimmedEmail}.`);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || 'Unable to send reset code.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async () => {
    setErrorMessage('');
    setInfoMessage('');
    if (!code.trim() || !newPassword) {
      setErrorMessage('Please enter both the 6-digit verification code and your new password.');
      return;
    }
    if (newPassword.length < 15) {
      setErrorMessage(`Please choose a password with at least 15 characters (currently ${newPassword.length}/15).`);
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
        setErrorMessage('Additional verification step required. Check your email and try again.');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || 'Invalid code or password.';
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
          <Text style={authStyles.body}>Enter your account email to receive a six-digit reset code.</Text>
          <AuthField label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail}
            autoCapitalize="none" autoComplete="email" keyboardType="email-address"
            onSubmitEditing={loading ? undefined : handleRequestReset} />
          <AuthAction label="Send reset code" onPress={handleRequestReset} loading={loading} />
        </>
      ) : (
        <>
          {!infoMessage && <Text style={authStyles.body}>Enter the code sent to {email.trim().toLowerCase()}.</Text>}
          <AuthField key="reset-code" label="Verification code" style={authStyles.code} value={code}
            onChangeText={setCode} autoComplete="one-time-code" keyboardType="number-pad" autoFocus />
          <AuthField label="New password" value={newPassword} onChangeText={setNewPassword}
            passwordToggle autoComplete="new-password" autoCapitalize="none" placeholder="At least 15 characters"
            onSubmitEditing={loading ? undefined : handleVerifyReset} />
          <AuthAction label="Verify & reset password" loading={loading} onPress={handleVerifyReset} />
          <AuthLink label="Resend code or change email" onPress={() => {
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
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleReset = async () => {
    setErrorMessage('');
    setInfoMessage('');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(trimmedEmail);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setInfoMessage(`Check ${trimmedEmail} for a password recovery link.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      <AuthNotice message={infoMessage} />
      <Text style={authStyles.body}>Enter your account email to receive a password reset link.</Text>
      <AuthField label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={loading ? undefined : handleReset} />
      <AuthAction label="Send password reset email" onPress={handleReset} loading={loading} />
    </View>
  );
}

export default function ForgotPasswordScreen({ navigation }: any) {
  return (
    <AuthPage title="Reset your password" onBack={() => navigation.goBack()}>
      {isClerkConfigured ? <ClerkForgotPasswordContent /> : <SupabaseForgotPasswordContent />}
    </AuthPage>
  );
}
