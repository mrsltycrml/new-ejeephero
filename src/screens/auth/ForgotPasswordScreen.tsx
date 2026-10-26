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
import { Ionicons } from '@expo/vector-icons';
import { useSignIn } from '@clerk/clerk-expo';
import { Colors } from '../../constants/theme';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';

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
    <View style={styles.formCard}>
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

      {step === 'request' ? (
        <>
          <Text style={styles.instructions}>
            Enter your account email. Clerk will send a 6-digit verification code to reset your password.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
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
              <Text style={styles.buttonText}>Send Reset Code</Text>
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
            placeholder="6-Digit Verification Code"
            placeholderTextColor={Colors.subtleGray}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="New Password (min 15 characters)"
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
              <Text style={styles.buttonText}>Verify & Reset Password</Text>
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
    <View style={styles.formCard}>
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
      <Text style={styles.instructions}>
        Enter the email address associated with your eSAKAY account and we will send a password reset link.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email Address"
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
          <Text style={styles.buttonText}>Send Password Reset Email</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function ForgotPasswordScreen({ navigation }: any) {
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

        <View style={styles.headerContainer}>
          <View style={styles.iconBadge}>
            <Ionicons name="key-outline" size={30} color={Colors.white} />
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Recover access to your eSAKAY account
          </Text>
        </View>

        {isClerkConfigured ? <ClerkForgotPasswordContent /> : <SupabaseForgotPasswordContent />}
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
    maxWidth: 540,
    alignSelf: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 10,
    zIndex: 10,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 6,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    padding: 24,
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
  instructions: {
    fontSize: 13,
    color: '#555',
    lineHeight: 19,
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 16,
    color: Colors.darkText,
  },
  button: {
    backgroundColor: Colors.ink,
    padding: 15,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: '700',
  },
});
