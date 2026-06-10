import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { fetchMakatiWeather, WeatherData } from '../../services/weather';
import { Ionicons } from '@expo/vector-icons';

export default function WeatherBanner() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkWeather();
    const interval = setInterval(checkWeather, 15 * 60 * 1000); // Check every 15 mins
    return () => clearInterval(interval);
  }, []);

  const checkWeather = async () => {
    const data = await fetchMakatiWeather();
    setWeather(data);
    if (data.isAdverse) {
      setIsVisible(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    } else if (isVisible) {
      dismiss();
    }
  };

  const dismiss = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
      setIsVisible(false);
    });
  };

  if (!isVisible || !weather || !weather.alertMessage) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        <Ionicons name="warning" size={24} color="white" />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Weather Advisory</Text>
          <Text style={styles.body}>{weather.alertMessage}</Text>
        </View>
        <TouchableOpacity onPress={dismiss}>
          <Ionicons name="close-circle" size={24} color="white" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning,
    margin: spacing.md,
    borderRadius: 12,
    padding: spacing.md,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  title: {
    ...typography.bodyBold,
    color: 'white',
  },
  body: {
    ...typography.caption,
    color: 'white',
    fontSize: 12,
  }
});
