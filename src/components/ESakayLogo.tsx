import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

type Props = {
  width?: number;
  compact?: boolean;
  roleLabel?: string;
  roleSeparator?: '|' | '/';
  showIcon?: boolean;
  color?: string;
};

/** Renders the clean lowercase `ejeephero` wordmark and optional role badge or e-jeep outline icon. */
export default function ESakayLogo({
  compact = false,
  roleLabel,
  roleSeparator = '|',
  showIcon = false,
  color = Colors.ink,
}: Props) {
  if (showIcon) {
    return (
      <View style={styles.stacked} accessibilityLabel="ejeephero">
        <View style={styles.iconBox}>
          <Ionicons name="bus-outline" size={34} color={Colors.brandGreen} />
        </View>
        <Text style={[styles.wordmarkLarge, { color }]}>ejeephero</Text>
      </View>
    );
  }

  return (
    <View style={styles.inlineRow} accessibilityLabel={roleLabel ? `ejeephero ${roleLabel}` : 'ejeephero'}>
      <Text style={[compact ? styles.wordmarkCompact : styles.wordmark, { color }]}>ejeephero</Text>
      {roleLabel ? (
        <>
          <Text style={styles.separator}>{roleSeparator}</Text>
          <Text style={styles.roleText}>{roleLabel}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stacked: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconBox: {
    width: 56,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkLarge: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  wordmarkCompact: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  separator: {
    fontSize: 15,
    color: Colors.border,
    fontWeight: '500',
  },
  roleText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.subtleGray,
  },
});
