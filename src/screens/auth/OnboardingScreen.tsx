import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

export default function OnboardingScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to EjeepHero</Text>
      <Text style={styles.subtitle}>Makati's AI-Assisted E-Jeepney Guide</Text>

      <View style={styles.optionsContainer}>
        <TouchableOpacity 
          style={styles.card}
          onPress={() => navigation.navigate('Login', { role: 'passenger' })}
        >
          <Text style={styles.cardTitle}>I am a Passenger</Text>
          <Text style={styles.cardBody}>Find rides, check ETAs, and chat with HeroBot.</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.card}
          onPress={() => navigation.navigate('Login', { role: 'driver' })}
        >
          <Text style={styles.cardTitle}>I am a Driver</Text>
          <Text style={styles.cardBody}>Broadcast location, receive alerts, and start shifts.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  optionsContainer: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: 'white',
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },
  cardTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cardBody: {
    ...typography.body,
    color: colors.textSecondary,
  }
});
