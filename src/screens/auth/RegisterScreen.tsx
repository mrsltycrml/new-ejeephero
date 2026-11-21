import React, { useId, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSignUp } from '@clerk/clerk-expo';
import { supabaseAuth } from '../../lib/supabase';
import { isClerkConfigured } from '../../lib/clerk';
import { Colors } from '../../constants/theme';
import { AuthAction, AuthField, AuthLink, AuthNotice, AuthPage, authStyles } from './AuthUI';

type Role = 'passenger' | 'driver';

function RoleChoice({ option, checked, group, onPress }: {
  option: Role; checked: boolean; group: string; onPress: () => void;
}) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const label = option === 'passenger' ? t('passenger.nav.passenger') : t('passenger.authSignup.driver');
  const style = [styles.choice, checked && styles.selected, focused && styles.choiceFocus];
  const content = (
    <>
      <Ionicons aria-hidden name={option === 'passenger' ? 'person-outline' : 'bus-outline'}
        size={20} color={checked ? Colors.onDark : Colors.ink} />
      <Text aria-hidden style={[styles.choiceText, checked && styles.selectedText]}>{label}</Text>
      {checked && <Ionicons aria-hidden name="checkmark" size={16} color={Colors.onDark} />}
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={style}>
        {content}
        <input type="radio" name={group} value={option} aria-label={label} checked={checked} onChange={onPress}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }} />
      </View>
    );
  }
  return (
    <TouchableOpacity accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked }}
      onPress={onPress} style={style}>{content}</TouchableOpacity>
  );
}

type RegistrationFieldsProps = {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onRole: (role: Role) => void;
};

function RegistrationFields({ fullName, email, password, role, onName, onEmail, onPassword, onRole }: RegistrationFieldsProps) {
  const { t } = useTranslation();
  const group = useId();
  return (
    <>
      <AuthField label={t('passenger.authSignup.fullName')} value={fullName} onChangeText={onName} autoCapitalize="words" autoComplete="name" />
      <AuthField label={t('passenger.authLogin.email')} placeholder="you@example.com" value={email} onChangeText={onEmail}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <AuthField label={t('passenger.authLogin.password')} passwordToggle value={password} onChangeText={onPassword}
        autoCapitalize="none" autoComplete="new-password" />
      {isClerkConfigured && (
        <Text style={[styles.hint, password.length >= 15 && styles.met]}>
          {password.length >= 15 ? t('passenger.authSignup.lengthMet', { length: password.length }) : t('passenger.authSignup.lengthHint', { length: password.length })}
        </Text>
      )}
      <View style={styles.roles}>
        <Text style={authStyles.label}>{t('passenger.authSignup.accountType')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('passenger.authSignup.accountType')} style={styles.choices}>
          {(['passenger', 'driver'] as const).map(option => (
            <RoleChoice key={option} option={option} group={group} checked={role === option} onPress={() => onRole(option)} />
          ))}
        </View>
        <Text style={styles.roleNote} accessibilityLiveRegion="polite">
          {role === 'driver' ? t('passenger.authSignup.approval')
            : t('passenger.authSignup.verifyFirst')}
        </Text>
      </View>
    </>
  );
}

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
      setErrorMessage(t('passenger.authSignup.invalidEmail'));
      return;
    }
    if (password.length < 15) {
      setErrorMessage(t('passenger.authSignup.passwordLength', { length: password.length }));
      return;
    }
    if (!isLoaded || !signUp) {
      setErrorMessage(t('passenger.authSignup.initializing'));
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
      setInfoMessage(t('passenger.authSignup.checkInbox', { email: trimmedEmail }));
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        t('passenger.authSignup.failed');
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
      setInfoMessage(t('passenger.authSignup.resent', { email: email.trim().toLowerCase() }));
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.message || t('passenger.authSignup.resendFailed');
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
      setErrorMessage(t('passenger.authSignup.codeRequired'));
      return;
    }
    if (!isLoaded || !signUp) {
      setErrorMessage(t('passenger.authSignup.loading'));
      return;
    }

    setLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: cleanCode });
      if (attempt.status === 'complete') {
        await finalizeClerkUser(attempt.createdUserId, attempt.createdSessionId);
      } else {
        setErrorMessage(
          t('passenger.authSignup.missing', { status: attempt.status, missing: (attempt.missingFields || []).join(', ') || 'none' })
        );
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || t('passenger.authSignup.verifyFailed');
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <View style={authStyles.form}>
        <AuthNotice message={errorMessage} error />
        <AuthNotice message={infoMessage || t('passenger.authSignup.enterCode', { email: email.trim().toLowerCase() })} />
        <AuthField label={t('passenger.authLogin.code')} style={authStyles.code} value={code} keyboardType="number-pad"
          maxLength={8} autoComplete="one-time-code" autoFocus onSubmitEditing={loading ? undefined : handleVerifyEmail}
          onChangeText={value => { setCode(value); if (errorMessage) setErrorMessage(''); }} />
        <AuthAction label={t('passenger.authSignup.verify')} loading={loading} onPress={handleVerifyEmail} />
        <View style={authStyles.links}>
          <AuthLink label={resending ? t('passenger.authSignup.sending') : t('passenger.authSignup.resend')} onPress={handleResendCode} disabled={resending} />
          <AuthLink label={t('passenger.authSignup.changeEmail')} onPress={() => {
            setPendingVerification(false);
            setCode('');
            setErrorMessage('');
            setInfoMessage('');
          }} />
        </View>
      </View>
    );
  }

  return (
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      {!isLoaded && (
        <View style={styles.connecting} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={Colors.action} />
          <Text style={authStyles.body}>{t('passenger.authSignup.connecting')}</Text>
        </View>
      )}
      <RegistrationFields fullName={fullName} email={email} password={password} role={role} onRole={setLocalRole}
        onName={value => { setFullName(value); if (errorMessage) setErrorMessage(''); }}
        onEmail={value => { setEmail(value); if (errorMessage) setErrorMessage(''); }}
        onPassword={value => { setPassword(value); if (errorMessage) setErrorMessage(''); }} />
      <AuthAction label={t('passenger.authLogin.create')} onPress={handleStartSignUp} loading={loading} />
    </View>
  );
}

function SupabaseRegisterForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    try {
      const { error } = await supabaseAuth.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { role, full_name: fullName.trim() } },
      });
      if (error) {
        setErrorMessage(error.message);
      } else {
        Alert.alert(
          t('passenger.authSignup.submitted'),
          t('passenger.authSignup.checkMail'),
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('passenger.authSignup.connection'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={authStyles.form}>
      <AuthNotice message={errorMessage} error />
      <RegistrationFields fullName={fullName} email={email} password={password} role={role}
        onName={setFullName} onEmail={setEmail} onPassword={setPassword} onRole={setLocalRole} />
      <AuthAction label={t('passenger.authLogin.create')} onPress={handleRegister} loading={loading} />
    </View>
  );
}

export default function RegisterScreen({ navigation }: any) {
  const { t } = useTranslation();
  return (
    <AuthPage title={t('passenger.authSignup.title')} onBack={() => navigation.goBack()}>
      {isClerkConfigured ? <ClerkRegisterForm /> : <SupabaseRegisterForm />}
      <View style={[authStyles.footer, authStyles.links]}>
        <Text style={authStyles.body}>{t('passenger.authSignup.alreadyRegistered')}</Text>
        <AuthLink label={t('passenger.authLogin.signIn')} onPress={() => navigation.goBack()} />
      </View>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  roles: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flexGrow: 1, flexBasis: 135, flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 50, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.subtleGray },
  selected: { backgroundColor: Colors.midnight, borderColor: Colors.midnight },
  choiceFocus: { outlineStyle: 'solid', outlineWidth: 2, outlineOffset: 2, outlineColor: Colors.action },
  choiceText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
  selectedText: { color: Colors.onDark },
  roleNote: { color: Colors.subtleGray, fontSize: 14, lineHeight: 20 },
  hint: { color: Colors.subtleGray, fontSize: 13, lineHeight: 19, marginTop: -10 },
  met: { color: Colors.success, fontWeight: '600' },
  connecting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
