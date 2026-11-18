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
        const temp = meteo?.current?.temperature_2m;
        const code = meteo?.current?.weather_code;
        if (!Number.isFinite(temp) || !Number.isFinite(code)) return;
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
      <Ionicons name="warning-outline" size={21} color={Colors.warning} />
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {t('weather.weatherAdvisoryBanner', { desc: weather.condition, temp: Math.round(weather.temp) })}
      </Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.dismiss')} onPress={() => setVisible(false)} style={styles.dismissBtn}>
        <Ionicons name="close" size={20} color={Colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 4, paddingLeft: 14, paddingRight: 4,
    marginHorizontal: 12, marginTop: 12, backgroundColor: Colors.warningBg,
    borderLeftWidth: 4, borderLeftColor: Colors.warning, borderRadius: 6,
  },
  text: { flex: 1, color: Colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  dismissBtn: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
