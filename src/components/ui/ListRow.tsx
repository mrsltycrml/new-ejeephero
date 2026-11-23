import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, font, radius, tapTarget } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function ListRow({ label, onPress, icon, trailing, style, accessibilityLabel }: Props) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[styles.row, style]}
    >
      {icon ? <Ionicons aria-hidden name={icon} size={22} color={color.ink} /> : null}
      <Text style={styles.label}>{label}</Text>
      {trailing ?? <Ionicons aria-hidden name="chevron-forward" size={18} color={color.inkMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: tapTarget,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: color.paper,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: { flex: 1, color: color.ink, fontFamily: font.semibold, fontSize: 15, fontWeight: '600', lineHeight: 20 },
});

