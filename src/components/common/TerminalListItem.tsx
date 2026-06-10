import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface TerminalListItemProps {
  terminalName: string;
  distance: string; // e.g. "500m", "1.2km"
  onPress?: () => void;
}

export const TerminalListItem: React.FC<TerminalListItemProps> = ({ terminalName, distance, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📍</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{terminalName}</Text>
        <Text style={styles.distance}>{distance}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight + '20', // light tint
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
  },
  distance: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
