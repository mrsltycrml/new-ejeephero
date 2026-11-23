import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../locales/i18n';
import { color, tapTarget } from '../constants/theme';

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const next = i18n.language === 'fil' ? 'en' : 'fil';
  return (
    <TouchableOpacity accessibilityRole="button"
      accessibilityLabel={next === 'fil' ? 'Gamitin ang Tagalog' : 'Use English'}
      onPress={() => void changeLanguage(next).catch(() => Alert.alert(t('passenger.profile.languageError')))} style={styles.button}>
      <Ionicons aria-hidden name="language-outline" size={17} color={color.signal} />
      <Text style={styles.label}>{next === 'fil' ? 'Tagalog' : 'English'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: tapTarget, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  label: { fontSize: 13, fontWeight: '700', color: color.onDark },
});
