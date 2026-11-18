import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
  useWindowDimensions, type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScrollView } from '../../components/AppUI';
import ESakayLogo from '../../components/ESakayLogo';
import { Colors } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type AuthPageProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
};

export function AuthPage({ title, subtitle, onBack, children }: AuthPageProps) {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 800 && width / Math.max(fontScale, 1) >= 660;
  const insets = useSafeAreaInsets();

  return (
    <FormScrollView
      containerStyle={styles.screen}
      keyboardVerticalOffset={0}
      contentContainerStyle={[
        styles.canvas, wide && styles.wideCanvas,
        { paddingTop: insets.top + (wide ? 32 : 0), paddingBottom: insets.bottom + (wide ? 32 : 16),
          paddingLeft: insets.left + (wide ? 32 : 0), paddingRight: insets.right + (wide ? 32 : 0) },
      ]}
    >
      <View style={[styles.page, wide && styles.widePage]}>
        <View style={[styles.masthead, wide && styles.wideMasthead]}>
          <View style={styles.mastheadTop}>
            <ESakayLogo width={134} />
            {onBack && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to sign in"
                onPress={onBack} style={styles.back}>
                <Ionicons name="arrow-back" size={22} color={Colors.onDark} />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.heading, wide && styles.wideHeading]}>
            <View style={styles.marker} />
            <Text accessibilityRole="header" style={[styles.title, wide && styles.wideTitle]}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {wide && (
            <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.diagram}>
              <View style={styles.secondaryTrack} />
              <View style={styles.lowerTrack} />
              <View style={styles.turnUp} />
              <View style={styles.upperTrack} />
              <View style={[styles.stop, styles.firstStop]} />
              <View style={[styles.stop, styles.lastStop]} />
            </View>
          )}
        </View>
        <View style={[styles.panel, wide && styles.widePanel]}>
          {children}
        </View>
      </View>
    </FormScrollView>
  );
}

type FieldProps = TextInputProps & { label: string; passwordToggle?: boolean };

export function AuthField({ label, passwordToggle, secureTextEntry, style, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={authStyles.label}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.focused]}>
        <TextInput {...input} accessibilityLabel={label} placeholderTextColor={Colors.subtleGray}
          secureTextEntry={passwordToggle ? !visible : secureTextEntry}
          style={[styles.input, style]}
          onFocus={event => { setFocused(true); onFocus?.(event); }}
          onBlur={event => { setFocused(false); onBlur?.(event); }} />
        {passwordToggle && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible(!visible)} style={styles.eye}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.subtleGray} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function AuthAction({ label, onPress, loading, icon = 'arrow-forward' }: {
  label: string; onPress: () => void; loading?: boolean; icon?: IconName;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
      aria-busy={!!loading} disabled={loading}
      onPress={onPress} style={[styles.action, loading && styles.busy]}>
      <Text style={styles.actionText}>{label}</Text>
      {loading ? <ActivityIndicator size="small" color={Colors.onDark} />
        : <Ionicons aria-hidden name={icon} size={20} color={Colors.onDark} />}
    </TouchableOpacity>
  );
}

export function AuthLink({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled}
      onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function AuthNotice({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null;
  return (
    <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={[styles.notice, error ? styles.error : styles.info]}>
      <Ionicons aria-hidden name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={20} color={error ? Colors.primaryRed : Colors.success} />
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  );
}

export const authStyles = StyleSheet.create({
  form: { gap: 16 },
  label: { color: Colors.ink, fontSize: 14, fontWeight: '700' },
  body: { color: Colors.subtleGray, fontSize: 15, lineHeight: 22 },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 16 },
  footer: { borderTopWidth: 1, borderColor: Colors.border, paddingTop: 10, marginTop: 22 },
  code: { letterSpacing: 4, fontSize: 20, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.canvas },
  canvas: { flexGrow: 1, alignItems: 'center' },
  wideCanvas: { justifyContent: 'center' },
  page: { width: '100%', maxWidth: 600, backgroundColor: Colors.paper },
  widePage: { flexDirection: 'row', maxWidth: 980, minHeight: 480, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border },
  masthead: { backgroundColor: Colors.midnight, paddingHorizontal: 24, paddingVertical: 20, gap: 18 },
  wideMasthead: { flex: 4, minWidth: 0, paddingHorizontal: 32, paddingVertical: 32, justifyContent: 'space-between' },
  mastheadTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  heading: { alignItems: 'flex-start', gap: 6 },
  wideHeading: { paddingVertical: 22, gap: 12 },
  marker: { width: 32, height: 4, borderRadius: 2, backgroundColor: Colors.signal, marginBottom: 4 },
  title: { fontSize: 32, lineHeight: 37, fontWeight: '800', letterSpacing: -1, color: Colors.onDark },
  wideTitle: { fontSize: 46, lineHeight: 50, letterSpacing: -1.6 },
  subtitle: { color: Colors.onDarkMuted, fontSize: 16, lineHeight: 23, maxWidth: 300 },
  diagram: { height: 88, marginHorizontal: -32, overflow: 'hidden' },
  secondaryTrack: { position: 'absolute', bottom: 6, left: 0, right: 0, height: 3, backgroundColor: Colors.onDark, opacity: 0.28 },
  lowerTrack: { position: 'absolute', left: 0, width: '45%', bottom: 24, height: 4, backgroundColor: Colors.signal },
  turnUp: { position: 'absolute', left: '44%', bottom: 24, height: 34, width: 40, borderBottomWidth: 4,
    borderRightWidth: 4, borderBottomRightRadius: 22, borderColor: Colors.signal },
  upperTrack: { position: 'absolute', left: '44%', marginLeft: 36, right: 0, top: 9, height: 23,
    borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16, borderColor: Colors.signal },
  stop: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 4,
    borderColor: Colors.signal, backgroundColor: Colors.midnight },
  firstStop: { left: '23%', bottom: 18 },
  lastStop: { right: '17%', top: 3 },
  panel: { paddingHorizontal: 24, paddingVertical: 24, minWidth: 0 },
  widePanel: { flex: 5, paddingHorizontal: 40, paddingVertical: 36, justifyContent: 'center' },
  field: { gap: 7 },
  inputRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: 8,
    borderWidth: 1, borderColor: Colors.subtleGray, backgroundColor: Colors.paper },
  focused: { borderColor: Colors.action, outlineStyle: 'solid', outlineColor: Colors.action, outlineWidth: 1 },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: Colors.ink },
  eye: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 50, paddingVertical: 14, paddingHorizontal: 18, gap: 12, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, backgroundColor: Colors.action },
  actionText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: Colors.onDark },
  busy: { opacity: 0.75 },
  link: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  linkText: { color: Colors.action, fontSize: 15, fontWeight: '700' },
  notice: { padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  error: { backgroundColor: Colors.dangerBg },
  info: { backgroundColor: Colors.successBg },
  noticeText: { flex: 1, color: Colors.ink, fontSize: 14, lineHeight: 20 },
});
