import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import RatingStars from '../../components/common/RatingStars';

export default function RatingScreen({ route, navigation }: any) {
  const { tripId } = route.params;
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Get driver_id from trip
    const { data: trip } = await supabase
      .from('trips')
      .select('vehicle_id, vehicles(driver_id)')
      .eq('id', tripId)
      .single();

    if (!trip) {
      Alert.alert('Error', 'Hindi mahanap ang trip details.');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('ratings').insert({
      trip_id: tripId,
      passenger_id: user?.id,
      driver_id: (trip.vehicles as any).driver_id,
      stars,
      comment
    });

    if (!error) {
      Alert.alert('Salamat!', 'Naipadala na ang iyong rating.');
      navigation.popToTop();
      navigation.navigate('Home');
    } else {
      Alert.alert('Error', 'Hindi maipadala ang rating. Pakisubukang muli.');
      console.error(error);
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Kamusta ang iyong pasada?</Text>
        <Text style={styles.subtitle}>I-rate ang iyong biyahe para matulungan kaming mapabuti ang aming serbisyo.</Text>

        <View style={styles.starsContainer}>
          <RatingStars rating={stars} maxStars={5} onRatingChange={setStars} size={40} />
          <Text style={styles.ratingText}>
            {stars === 5 ? 'Napakaganda!' : stars === 4 ? 'Maganda' : stars === 3 ? 'Ayos lang' : stars === 2 ? 'Kulang' : 'Hindi maganda'}
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Mag-iwan ng komento (optional)"
          multiline
          numberOfLines={4}
          value={comment}
          onChangeText={setComment}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>Isumite ang Rating</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={() => navigation.popToTop()}>
          <Text style={styles.skipText}>Laktawan muna</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
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
  ratingText: {
    ...typography.bodyBold,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    ...typography.body,
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary,
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonDisabled: {
    backgroundColor: colors.textSecondary,
  },
  buttonText: {
    ...typography.bodyBold,
    color: 'white',
  },
  skipButton: {
    padding: spacing.md,
  },
  skipText: {
    ...typography.body,
    color: colors.textSecondary,
  }
});
