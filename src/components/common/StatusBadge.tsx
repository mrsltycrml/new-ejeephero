import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface StatusBadgeProps {
  status: 'Live' | 'Cached';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const isLive = status === 'Live';
  
  return (
    <View style={[styles.container, { backgroundColor: isLive ? colors.active : colors.warning }]}>
      <View style={[styles.dot, { backgroundColor: isLive ? colors.textInverse : colors.textInverse }]} />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: 'bold',
  },
});
