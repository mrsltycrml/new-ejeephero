import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/clerk-expo';
import { Colors } from '../../constants/theme';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import ESakayLogo from '../../components/ESakayLogo';
import { FormScrollView } from '../../components/AppUI';

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
    <View style={styles.formSection}>
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

      {step === 'request' ? (
        <>
          <Text style={styles.instructions}>
            Enter your account email. We will send a 6-digit verification code to reset your password.
          </Text>
          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.subtleGray}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.button} onPress={handleRequestReset} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Send reset code</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.instructions}>
            Enter the 6-digit code sent to <Text style={{ fontWeight: '700' }}>{email}</Text> and choose a new password.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit verification code"
            placeholderTextColor={Colors.subtleGray}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="New password (min 15 characters)"
            placeholderTextColor={Colors.subtleGray}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.button} onPress={handleVerifyReset} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Verify & reset password</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              setStep('request');
              setErrorMessage('');
              setInfoMessage('');
            }}
          >
            <Text style={styles.secondaryBtnText}>Resend code / change email</Text>
          </TouchableOpacity>
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
    <View style={styles.formSection}>
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
      <Text style={styles.instructions}>
        Enter the email address associated with your ejeephero account and we will send a password reset link.
      </Text>
      <Text style={styles.fieldLabel}>Email address</Text>
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        placeholderTextColor={Colors.subtleGray}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TouchableOpacity style={styles.button} onPress={handleReset} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>Send password reset email</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function ForgotPasswordScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
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

      <View style={styles.headerContainer}>
        <ESakayLogo showIcon />
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Recover access to your ejeephero account.
        </Text>
      </View>

      {isClerkConfigured ? <ClerkForgotPasswordContent /> : <SupabaseForgotPasswordContent />}
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
  headerContainer: {
    alignItems: 'center',
    marginBottom: 22,
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Colors.ink,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.subtleGray,
    textAlign: 'center',
  },
  formSection: {
    marginTop: 4,
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
  instructions: {
    fontSize: 14,
    color: Colors.subtleGray,
    lineHeight: 20,
    marginBottom: 16,
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
  secondaryBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.brandGreen,
    fontSize: 14,
    fontWeight: '700',
  },
});
