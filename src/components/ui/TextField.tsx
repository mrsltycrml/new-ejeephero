import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { color, radius, tapTarget, type } from '../../constants/theme';

type Props = TextInputProps & {
  label: string;
  passwordToggle?: boolean;
  error?: string;
  inputStyle?: StyleProp<TextStyle>;
};

export default function TextField({
  label, passwordToggle, error, style, inputStyle, secureTextEntry, onFocus, onBlur, ...input
}: Props) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, focused && styles.focused, !!error && styles.invalid]}>
        <TextInput
          {...input}
          accessibilityLabel={label}
          placeholderTextColor={color.inkMuted}
          secureTextEntry={passwordToggle ? !visible : secureTextEntry}
          style={[styles.input, style, inputStyle]}
          onFocus={event => { setFocused(true); onFocus?.(event); }}
          onBlur={event => { setFocused(false); onBlur?.(event); }}
        />
        {passwordToggle && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t(visible ? 'passenger.authLogin.hidePassword' : 'passenger.authLogin.showPassword')}
            onPress={() => setVisible(!visible)}
            style={styles.eye}
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={color.inkMuted} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { color: color.ink, ...type.label },
  row: {
    minHeight: tapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.inkMuted,
    backgroundColor: color.paper,
  },
  focused: {
    borderColor: color.action,
    outlineStyle: 'solid',
    outlineColor: color.action,
    outlineWidth: 2,
  },
  invalid: { borderColor: color.ember },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: color.ink },
  eye: { width: tapTarget, minHeight: tapTarget, alignItems: 'center', justifyContent: 'center' },
  error: { color: color.ember, ...type.meta },
});
