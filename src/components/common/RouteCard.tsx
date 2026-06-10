import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface RouteCardProps {
  routeName: string;
  destination: string;
  routeColor: string;
  onPress?: () => void;
}

const RouteCard: React.FC<RouteCardProps> = ({ routeName, destination, routeColor, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.container, { borderLeftColor: routeColor }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{routeName}</Text>
        <Text style={styles.subtitle}>{destination}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderLeftWidth: 6,
    padding: spacing.md,
    marginVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'column',
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

export default RouteCard;
