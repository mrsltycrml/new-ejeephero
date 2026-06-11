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
      <Ionicons name="warning" size={20} color={Colors.primaryRed} style={{ marginRight: 8 }} />
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
    backgroundColor: Colors.primaryYellow,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
    marginHorizontal: 12,
    marginTop: 12,
  },
  text: {
    color: Colors.darkText,
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
    color: Colors.primaryRed,
    fontWeight: 'bold',
    fontSize: 13,
    textDecorationLine: 'underline',
  }
});
