import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function WeatherBanner() {
  const [weather, setWeather] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=14.5547&lon=121.0244&appid=${process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY}&units=metric`);
        const data = await res.json();
        
        const temp = data.main.temp;
        const condition = data.weather[0].main.toLowerCase();

        // Trigger advisory on rain, storm, clouds, or extreme heat
        if (temp > 38 || condition.includes('rain') || condition.includes('thunderstorm') || condition.includes('cloud')) {
          setWeather({ temp, condition: data.weather[0].description });
          setVisible(true);
        }
      } catch (error) {
        console.error('Weather fetch error:', error);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000); // 15 mins
    return () => clearInterval(interval);
  }, []);

  if (!visible || !weather) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="warning-outline" size={19} color="#745B1D" style={{ marginRight: 8 }} />
      <Text style={styles.text}>
        Weather Advisory: {weather.condition} ({Math.round(weather.temp)}°C)
      </Text>
      <TouchableOpacity onPress={() => setVisible(false)} style={styles.dismissBtn}>
        <Text style={styles.dismiss}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FBF4E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8C38F',
    marginHorizontal: 12,
    marginTop: 12,
  },
  text: {
    color: '#5E4D27',
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  dismissBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dismiss: {
    color: '#745B1D',
    fontWeight: 'bold',
    fontSize: 13,
  }
});
