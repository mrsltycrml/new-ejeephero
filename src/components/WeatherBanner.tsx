import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function WeatherBanner() {
  const [weather, setWeather] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fetchWeather = async () => {
      const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
      if (!apiKey) return;

      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=14.5547&lon=121.0244&appid=${apiKey}&units=metric`
        );
        const data = await res.json();

        if (!data || !data.main || !data.weather) return;

        const temp = data.main.temp;
        const mainCondition = (data.weather[0]?.main || '').toLowerCase();
        const description = (data.weather[0]?.description || '').toLowerCase();

        // ONLY trigger advisory on genuine severe weather hazards:
        // - Heavy Rain / Flood risks
        // - Thunderstorm / Lightning hazards
        // - Extreme Heat Index > 38°C
        // - Severe Gale / Typhoon
        // Note: Do NOT trigger on normal tropical clouds ("scattered clouds", "few clouds")
        const isHazard =
          temp > 38 ||
          mainCondition.includes('rain') ||
          mainCondition.includes('thunderstorm') ||
          mainCondition.includes('squall') ||
          mainCondition.includes('tornado') ||
          description.includes('heavy rain') ||
          description.includes('storm');

        if (isHazard) {
          setWeather({
            temp,
            condition: data.weather[0].description,
            isExtremeHeat: temp > 38,
          });
          setVisible(true);
        } else {
          setVisible(false);
        }
      } catch (error) {
        // Silent fail on network error
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000); // 15 mins
    return () => clearInterval(interval);
  }, []);

  if (!visible || !weather) return null;

  return (
    <View style={styles.banner}>
      <Ionicons
        name={weather.isExtremeHeat ? 'flame' : 'rainy'}
        size={20}
        color={Colors.primaryRed}
        style={{ marginRight: 8 }}
      />
      <Text style={styles.text}>
        Commuter Alert: {weather.condition} ({Math.round(weather.temp)}°C)
      </Text>
      <TouchableOpacity onPress={() => setVisible(false)} style={styles.dismissBtn}>
        <Text style={styles.dismiss}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFA000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    color: Colors.darkText,
    fontWeight: '700',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  dismissBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  dismiss: {
    color: Colors.primaryRed,
    fontWeight: 'bold',
    fontSize: 12,
  },
});
