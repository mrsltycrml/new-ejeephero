import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

interface RatingStarsProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
}

const RatingStars: React.FC<RatingStarsProps> = ({ rating, onRatingChange, readOnly = false, size = 24 }) => {
  const renderStar = (index: number) => {
    const isFilled = index <= rating;
    return (
      <TouchableOpacity
        key={index}
        disabled={readOnly}
        onPress={() => onRatingChange?.(index)}
        style={styles.starContainer}
      >
        <Text style={[styles.star, { color: isFilled ? colors.warning : colors.border, fontSize: size }]}>
          ★
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map(index => renderStar(index))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starContainer: {
    padding: spacing.xs,
  },
  star: {
    fontSize: 24,
  },
});

export default RatingStars;
