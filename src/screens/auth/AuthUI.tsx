import React from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScrollView } from '../../components/AppUI';
import EJeepHeroLogo from '../../components/EJeepHeroLogo';
import LanguageSwitch from '../../components/LanguageSwitch';
import { Button, ScreenHeader, TextField } from '../../components/ui';
import { useTranslation } from 'react-i18next';
import { color, radius, space, type } from '../../constants/theme';
import type { TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type AuthPageProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
};

export function AuthPage({ title, subtitle, onBack, children }: AuthPageProps) {
  const { t } = useTranslation();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 800 && width / Math.max(fontScale, 1) >= 660;
  const phoneWeb = Platform.OS === 'web' && !wide;
  const insets = useSafeAreaInsets();

  return (
    <FormScrollView
      containerStyle={styles.screen}
      keyboardVerticalOffset={0}
      contentContainerStyle={[
        styles.canvas, wide && styles.wideCanvas,
        { paddingTop: insets.top + (wide ? 32 : 0), paddingBottom: phoneWeb ? 0 : insets.bottom + (wide ? 32 : 16),
          paddingLeft: insets.left + (wide ? 32 : 0), paddingRight: insets.right + (wide ? 32 : 0) },
      ]}
    >
      <View style={[styles.page, wide && styles.widePage, phoneWeb && styles.phonePage]}>
        <View style={[styles.masthead, wide && styles.wideMasthead]}>
          <View style={styles.mastheadTop}>
            <EJeepHeroLogo compact width={wide ? 196 : 168} />
            <LanguageSwitch />
          </View>
          <ScreenHeader
            title={title}
            subtitle={subtitle}
            onBack={onBack}
            backLabel={onBack ? t('passenger.authLogin.back') : undefined}
          />
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
        <View style={[styles.panel, wide && styles.widePanel, phoneWeb && styles.phonePanel,
          phoneWeb && { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
          {children}
        </View>
      </View>
    </FormScrollView>
  );
}

type FieldProps = TextInputProps & { label: string; passwordToggle?: boolean };

export function AuthField({ label, passwordToggle, secureTextEntry, style, ...input }: FieldProps) {
  return (
    <TextField
      label={label}
      passwordToggle={passwordToggle}
      secureTextEntry={secureTextEntry}
      inputStyle={style}
      {...input}
    />
  );
}

export function AuthAction({ label, onPress, loading, icon = 'arrow-forward' }: {
  label: string; onPress: () => void; loading?: boolean; icon?: IconName;
}) {
  return <Button label={label} onPress={onPress} loading={loading} icon={icon} />;
}

export function AuthLink({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Button label={label} onPress={onPress} disabled={disabled} variant="ghost" style={styles.link} />;
}

export function AuthNotice({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null;
  return (
    <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={[styles.notice, error ? styles.error : styles.info]}>
      <Ionicons aria-hidden name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={20} color={error ? color.ember : color.success} />
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  );
}

export const authStyles = StyleSheet.create({
  form: { gap: space.md },
  label: { color: color.ink, ...type.label },
  body: { color: color.inkMuted, fontSize: 15, lineHeight: 22 },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 16 },
  footer: { borderTopWidth: 1, borderColor: color.border, paddingTop: 12, marginTop: 22 },
  code: { letterSpacing: 4, fontSize: 20, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  canvas: { flexGrow: 1, alignItems: 'center' },
  wideCanvas: { justifyContent: 'center' },
  page: { width: '100%', maxWidth: 600, backgroundColor: color.canvas },
  phonePage: { flexGrow: 1 },
  widePage: { flexDirection: 'row', maxWidth: 980, minHeight: 480, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: color.border },
  masthead: { backgroundColor: color.canvas, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xl, gap: 8 },
  wideMasthead: { flex: 4, minWidth: 0, paddingHorizontal: space.xxl, paddingVertical: space.xxl, justifyContent: 'space-between' },
  mastheadTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  diagram: { height: 88, marginHorizontal: -32, overflow: 'hidden', marginTop: 8 },
  secondaryTrack: { position: 'absolute', bottom: 6, left: 0, right: 0, height: 3, backgroundColor: color.action, opacity: 0.22 },
  lowerTrack: { position: 'absolute', left: 0, width: '45%', bottom: 24, height: 4, backgroundColor: color.action },
  turnUp: { position: 'absolute', left: '44%', bottom: 24, height: 34, width: 40, borderBottomWidth: 4,
    borderRightWidth: 4, borderBottomRightRadius: 22, borderColor: color.action },
  upperTrack: { position: 'absolute', left: '44%', marginLeft: 36, right: 0, top: 9, height: 23,
    borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16, borderColor: color.action },
  stop: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 4,
    borderColor: color.volt, backgroundColor: color.ink },
  firstStop: { left: '23%', bottom: 18 },
  lastStop: { right: '17%', top: 3 },
  panel: { paddingHorizontal: space.xl, paddingVertical: space.xl, minWidth: 0 },
  phonePanel: { flexGrow: 1, justifyContent: 'space-between' },
  widePanel: { flex: 5, paddingHorizontal: space.xxxl, paddingVertical: 36, justifyContent: 'center' },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0, justifyContent: 'center' },
  notice: { padding: 14, borderRadius: radius.md, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  error: { backgroundColor: color.dangerBg },
  info: { backgroundColor: color.successBg },
  noticeText: { flex: 1, color: color.ink, fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
