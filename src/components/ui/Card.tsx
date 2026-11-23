import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, elevation, radius, space } from '../../constants/theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
};

export default function Card({ children, style, padded = true, elevated = true }: Props) {
  return (
    <View style={[styles.card, padded && styles.padded, elevated && elevation.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  padded: { padding: space.lg },
});
