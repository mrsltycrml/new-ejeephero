import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, radius, tapTarget, type } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'signal';

const tones: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: color.sand, fg: color.ink, border: color.border },
  info: { bg: color.actionTint, fg: color.action, border: color.actionTint },
  success: { bg: color.successBg, fg: color.success, border: color.successBg },
  warning: { bg: color.warningBg, fg: color.warning, border: color.warningBorder },
  danger: { bg: color.dangerBg, fg: color.ember, border: color.dangerBg },
  signal: { bg: color.signal, fg: color.ink, border: color.signal },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const palette = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  accessibilityRole?: 'button' | 'radio';
  accessibilityState?: { checked?: boolean; selected?: boolean };
};

export function Chip({ label, selected, onPress, icon, accessibilityRole = 'button', accessibilityState }: ChipProps) {
  const content = (
    <>
      {icon ? <Ionicons aria-hidden name={icon} size={20} color={selected ? color.onDark : color.ink} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
      {selected ? <Ionicons aria-hidden name="checkmark" size={16} color={color.onDark} /> : null}
    </>
  );
  const style = [styles.chip, selected && styles.chipOn];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <TouchableOpacity
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={accessibilityState ?? { selected, checked: selected }}
      onPress={onPress}
      style={style}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeText: { ...type.meta, fontWeight: '700' },
  chip: {
    flexGrow: 1,
    flexBasis: 135,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: tapTarget,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.inkMuted,
    backgroundColor: color.paper,
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { flex: 1, fontSize: 15, fontWeight: '700', color: color.ink },
  chipTextOn: { color: color.onDark },
});
