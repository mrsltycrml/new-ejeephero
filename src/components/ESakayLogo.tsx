import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/theme';

type Props = {
  width?: number;
  compact?: boolean;
  roleLabel?: string;
  roleSeparator?: '|' | '/';
  showIcon?: boolean;
  color?: string;
};

export default function ESakayLogo({ compact, roleLabel, showIcon, width, color = Colors.ink }: Props) {
  const logoWidth = width ?? (compact ? 100 : showIcon ? 172 : 146);
  return (
    <View accessible accessibilityLabel={roleLabel ? `eSAKAY, ${roleLabel}` : 'eSAKAY'} style={styles.identity}>
      <View style={styles.plate}>
        <Image source={require('../../assets/esakay-official-logo.jpeg')} accessible={false}
          resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 156 / 514 }} />
      </View>
      {roleLabel && <Text style={[styles.role, { color }]}>{roleLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  plate: { backgroundColor: Colors.white, borderRadius: 4, padding: 2 },
  role: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1, flexShrink: 1 },
});
