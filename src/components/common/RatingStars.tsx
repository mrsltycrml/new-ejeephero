import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

interface RatingStarsProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
  maxStars?: number;
}

const RatingStars: React.FC<RatingStarsProps> = ({
  rating,
  onRatingChange,
  readOnly = false,
  size = 24,
  maxStars = 5
}) => {
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

  const stars = Array.from({ length: maxStars }, (_, i) => i + 1);

  return (
    <View style={styles.container}>
      {stars.map(index => renderStar(index))}
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
