import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, radius, tapTarget, type } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sos';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  icon?: IconName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const tones: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.action, fg: color.onDark },
  secondary: { bg: color.paper, fg: color.ink, border: color.border },
  ghost: { bg: 'transparent', fg: color.action },
  danger: { bg: color.ember, fg: color.onDark },
  sos: { bg: color.ember, fg: color.onDark },
};

export default function Button({
  label, onPress, loading, disabled, variant = 'primary', icon, accessibilityLabel, style,
}: Props) {
  const tone = tones[variant];
  const idle = disabled || loading;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: idle, busy: !!loading }}
      aria-busy={!!loading}
      disabled={idle}
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: tone.bg, borderColor: tone.border ?? 'transparent', borderWidth: tone.border ? 1 : 0 },
        idle && styles.busy,
        style,
      ]}
    >
      <Text style={[styles.label, { color: tone.fg }]}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={tone.fg} />
        : icon ? <Ionicons aria-hidden name={icon} size={20} color={tone.fg} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tapTarget,
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
  },
  label: { flexShrink: 1, ...type.button },
  busy: { opacity: 0.7 },
});
