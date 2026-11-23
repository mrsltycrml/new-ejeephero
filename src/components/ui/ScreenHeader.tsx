import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, tapTarget, type } from '../../constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inverted?: boolean;
};

export default function ScreenHeader({ title, subtitle, onBack, backLabel, trailing, style, inverted }: Props) {
  const titleColor = inverted ? color.onDark : color.ink;
  const subColor = inverted ? color.onDarkMuted : color.inkMuted;
  return (
    <View style={[styles.header, style]}>
      {(onBack || trailing) ? (
        <View style={styles.top}>
          {onBack ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={backLabel ?? title}
              onPress={onBack}
              style={styles.back}
            >
              <Ionicons aria-hidden name="arrow-back" size={20} color={titleColor} />
              {backLabel ? <Text style={[styles.backLabel, { color: titleColor }]}>{backLabel}</Text> : null}
            </TouchableOpacity>
          ) : <View />}
          {trailing}
        </View>
      ) : null}
      <View style={styles.heading}>
        <View style={styles.marker} />
        <Text accessibilityRole="header" style={[styles.title, { color: titleColor }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: subColor }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: tapTarget },
  back: { minHeight: tapTarget, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  backLabel: { fontSize: 15, fontWeight: '600' },
  heading: { alignItems: 'flex-start', gap: 8 },
  marker: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.volt },
  title: { ...type.display },
  subtitle: { fontSize: 16, lineHeight: 23, maxWidth: 320 },
});
