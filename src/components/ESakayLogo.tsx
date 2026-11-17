import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

type Props = { width?: number; compact?: boolean };

/** Keep the supplied wordmark intact and legible on every app surface. */
export default function ESakayLogo({ width = 238, compact = false }: Props) {
  const height = Math.round((width * 156) / 532);
  return (
    <View
      style={[
        styles.frame,
        {
          width: width + (compact ? 14 : 20),
          height: height + (compact ? 8 : 12),
          borderRadius: compact ? 10 : 14,
        },
      ]}
    >
      <Image
        source={require('../../assets/esakay-official-logo.jpeg')}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityLabel="eSAKAY, a Meralco company"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
});
