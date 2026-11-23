import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../locales/i18n';
import { color, font, radius, tapTarget } from '../constants/theme';

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const next = i18n.language === 'fil' ? 'en' : 'fil';
  return (
    <TouchableOpacity accessibilityRole="button"
      accessibilityLabel={next === 'fil' ? 'Gamitin ang Tagalog' : 'Use English'}
      onPress={() => void changeLanguage(next).catch(() => Alert.alert(t('passenger.profile.languageError')))} style={styles.button}>
      <Ionicons aria-hidden name="language-outline" size={17} color={color.actionPressed} />
      <Text style={styles.label}>{next === 'fil' ? 'Tagalog' : 'English'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.paper,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  label: { fontFamily: font.bold, fontSize: 13, fontWeight: '700', color: color.ink },
});
