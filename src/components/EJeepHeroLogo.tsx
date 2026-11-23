import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { color as tokens, type } from '../constants/theme';

type Props = {
  width?: number;
  compact?: boolean;
  roleLabel?: string;
  roleSeparator?: '|' | '/';
  showIcon?: boolean;
  color?: string;
};

const WORDMARK_RATIO = 312 / 1028;

function usesOnDarkWordmark(colorValue: string) {
  const normalized = colorValue.trim().toLowerCase();
  if (normalized === 'white' || normalized === '#fff' || normalized === '#ffffff' || normalized === tokens.onDark.toLowerCase()) {
    return true;
  }
  const hex = normalized.startsWith('#') ? normalized.slice(1) : '';
  if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

export default function EJeepHeroLogo({ compact, roleLabel, showIcon, width, color = tokens.ink }: Props) {
  const logoWidth = width ?? (compact ? 100 : showIcon ? 200 : 186);
  const onDark = usesOnDarkWordmark(color);
  const source = onDark
    ? require('../../assets/brand/ejeephero-wordmark-on-dark.png')
    : require('../../assets/brand/ejeephero-wordmark-on-light.png');
  return (
    <View accessible accessibilityLabel={roleLabel ? `eJeepHero, ${roleLabel}` : 'eJeepHero'} style={styles.identity}>
      <Image
        source={source}
        accessible={false}
        resizeMode="contain"
        style={{ width: logoWidth, height: logoWidth * WORDMARK_RATIO }}
      />
      {roleLabel ? <Text style={[styles.role, { color }]}>{roleLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  role: { ...type.meta, fontWeight: '700', letterSpacing: 0.1, flexShrink: 1 },
});
