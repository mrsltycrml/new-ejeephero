import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function WeatherBanner() {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
        if (apiKey) {
          const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=14.5547&lon=121.0244&appid=${apiKey}&units=metric`);
          const data = await res.json();
          if (data?.main && data?.weather?.[0]) {
            const temp = data.main.temp;
            const condition = data.weather[0].main.toLowerCase();
            if (temp > 38 || condition.includes('rain') || condition.includes('thunderstorm') || condition.includes('cloud')) {
              setWeather({ temp, condition: data.weather[0].description });
              setVisible(true);
            }
            return;
          }
        }
        const meteoRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=14.5547&longitude=121.0244&current=temperature_2m,weather_code');
        const meteo = await meteoRes.json();
        const temp = Number(meteo?.current?.temperature_2m ?? 30);
        const code = Number(meteo?.current?.weather_code ?? 0);
        if (temp > 38 || code >= 51) {
          setWeather({ temp, condition: code >= 95 ? 'thunderstorm' : code >= 51 ? 'rain showers' : 'extreme heat' });
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
        {t('weather.weatherAdvisoryBanner', { condition: weather.condition, temp: Math.round(weather.temp) })}
      </Text>
      <TouchableOpacity onPress={() => setVisible(false)} style={styles.dismissBtn}>
        <Text style={styles.dismiss}>{t('common.dismiss')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FBF4E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
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
