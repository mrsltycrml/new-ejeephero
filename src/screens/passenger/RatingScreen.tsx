import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { RatingStars } from '../../components/common/RatingStars';
import { supabase } from '../../lib/supabase';

export default function RatingScreen({ route, navigation }: any) {
  const tripId = route?.params?.tripId;
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (stars === 0) {
      Alert.alert('Required', 'Please select a star rating.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // In a real flow, driver_id is fetched from the trip record
      const mockDriverId = '00000000-0000-0000-0000-000000000000';

      const { error } = await supabase.from('ratings').insert({
        trip_id: tripId || null, // remove null in prod
        passenger_id: userData?.user?.id || mockDriverId,
        driver_id: mockDriverId,
        stars,
        comment
      });

      if (error) throw error;

      Alert.alert('Success', 'Thank you for your feedback!', [
        { text: 'OK', onPress: () => navigation.navigate('Home') }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not submit rating. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How was your ride?</Text>
      <Text style={styles.subtitle}>Your feedback helps improve e-Sakay services.</Text>

      <View style={styles.starsContainer}>
        <RatingStars initialRating={stars} onRatingChange={setStars} size={40} />
      </View>

      <TextInput
        style={styles.input}
        placeholder="Add a comment (optional)..."
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={4}
        value={comment}
        onChangeText={setComment}
        textAlignVertical="top"
      />

      <TouchableOpacity 
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.skipButton} 
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.skipButtonText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  starsContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...typography.bodyBold,
    color: colors.textInverse,
  },
  skipButton: {
    padding: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  }
});
