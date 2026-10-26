import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

const observed = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const reading = (value: unknown, unit: string, round = false) => observed(value) ? `${round ? Math.round(value) : value}${unit}` : 'Unavailable';
const localSunTime = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const time = Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}+08:00`);
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
};
const sunLabel = (value: unknown) => observed(value) ? new Date(value * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' }) : 'Unavailable';

export default function WeatherScreen() {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const getWeatherAdvisory = (w: any): { message: string; severity: 'safe' | 'caution' | 'danger' } | null => {
    if (!w) return null;
    const id = w.weather?.[0]?.id;
    const wind = w.wind?.speed;
    const temp = w.main?.temp;
    if (![id, wind, temp].every(observed)) return null;

    if (id >= 200 && id < 300) return { message: t('weather.thunderstormWarning'), severity: 'danger' };
    if (id >= 500 && id < 600) return { message: t('weather.heavyRainDetected'), severity: 'caution' };
    if (id >= 700 && id < 800) return { message: t('weather.poorVisibility'), severity: 'caution' };
    if (wind > 15) return { message: t('weather.strongWinds', { speed: wind }), severity: 'caution' };
    if (temp > 38) return { message: t('weather.extremeHeat', { temp: Math.round(temp) }), severity: 'danger' };
    return { message: t('weather.suitableForTravel'), severity: 'safe' };
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
        if (apiKey) {
          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=14.5547&lon=121.0244&appid=${apiKey}&units=metric`
          );
          const data = await res.json();
          if (res.ok && [data?.weather?.[0]?.id, data?.main?.temp, data?.wind?.speed].every(observed)) {
            setWeather(data);
            return;
          }
        }

        // Open-Meteo fallback (keyless) for Makati City
        const meteoRes = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=14.5547&longitude=121.0244&current=temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,wind_speed_10m,weather_code&daily=sunrise,sunset&timezone=Asia%2FManila'
        );
        const meteo = await meteoRes.json();
        const current = meteo?.current;
        if (!meteoRes.ok || ![current?.weather_code, current?.temperature_2m, current?.wind_speed_10m].every(observed)) throw new Error('Weather readings unavailable');
        const code = current.weather_code;
        const isThunder = code >= 95;
        const isRain = code >= 51 && code < 95;
        const isCloudy = code >= 1 && code <= 3;
        const isFog = code === 45 || code === 48;
        setWeather({
          weather: [
            {
              id: isThunder ? 211 : isRain ? 501 : isFog ? 741 : isCloudy ? 801 : 800,
              main: isThunder ? 'Thunderstorm' : isRain ? 'Rain' : isFog ? 'Fog' : isCloudy ? 'Clouds' : 'Clear',
              description: isThunder ? 'thunderstorm' : isRain ? 'rain showers' : isFog ? 'fog' : isCloudy ? 'partly cloudy' : 'clear sky',
            },
          ],
          main: {
            temp: current.temperature_2m,
            feels_like: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            pressure: observed(current.surface_pressure) ? Math.round(current.surface_pressure) : null,
          },
          wind: {
            speed: Math.round((current.wind_speed_10m / 3.6) * 10) / 10,
          },
          sys: {
            sunrise: localSunTime(meteo?.daily?.sunrise?.[0]),
            sunset: localSunTime(meteo?.daily?.sunset?.[0]),
          },
        });
      } catch (error) {
        console.error('Failed to fetch weather', error);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primaryRed} />
      </View>
    );
  }

  if (!weather?.weather?.[0] || !weather?.main) {
    return (
      <View style={styles.center}>
        <Text>{t('weather.couldNotLoad')}</Text>
      </View>
    );
  }

  const advisory = getWeatherAdvisory(weather);
  const advisoryColors: Record<string, { bg: string; border: string; text: string }> = {
    safe: { bg: '#EDF5F0', border: '#A9C9B4', text: '#285C3A' },
    caution: { bg: '#FBF4E5', border: '#D8C38F', text: '#745B1D' },
    danger: { bg: '#F8ECEE', border: '#D8AEB4', text: '#812D38' },
  };
  const ac = advisory ? advisoryColors[advisory.severity] : advisoryColors.safe;

  const weatherIcon = weather.weather[0].main.toLowerCase().includes('rain') ? 'rainy-outline' : weather.weather[0].main.toLowerCase().includes('cloud') ? 'cloudy-outline' : 'partly-sunny-outline';
  return <ScrollView style={styles.page} contentContainerStyle={styles.container}>
    <View style={styles.header}><Text style={styles.title}>Weather in Makati</Text><Text style={styles.subtitle}>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })}</Text></View>
    <View style={styles.mainCard}><View style={styles.weatherIcon}><Ionicons name={weatherIcon} size={48} color={Colors.ink} /></View><View><Text style={styles.temp}>{Math.round(weather.main.temp)}°C</Text><Text style={styles.condition}>{weather.weather[0].description}</Text></View></View>
    {advisory && <View style={[styles.advisoryCard, { backgroundColor: ac.bg, borderColor: ac.border }]}><Ionicons name={advisory.severity === 'safe' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={20} color={ac.text} /><View style={{ flex: 1 }}><Text style={[styles.advisoryTitle, { color: ac.text }]}>{advisory.severity === 'danger' ? t('weather.travelAdvisory') : advisory.severity === 'caution' ? t('weather.caution') : t('weather.travelConditions')}</Text><Text style={[styles.advisoryText, { color: ac.text }]}>{advisory.message}</Text></View></View>}
    <View style={styles.detailsGrid}>
      {[
        { icon: 'water-outline' as const, label: 'Humidity', value: reading(weather.main.humidity, '%') },
        { icon: 'leaf-outline' as const, label: 'Wind speed', value: reading(weather.wind?.speed, ' m/s') },
        { icon: 'thermometer-outline' as const, label: 'Feels like', value: reading(weather.main.feels_like, '°C', true) },
        { icon: 'speedometer-outline' as const, label: 'Pressure', value: reading(weather.main.pressure, ' hPa') },
        { icon: 'sunny-outline' as const, label: 'Sunrise', value: sunLabel(weather.sys?.sunrise) },
        { icon: 'moon-outline' as const, label: 'Sunset', value: sunLabel(weather.sys?.sunset) },
      ].map((item) => <View key={item.label} style={styles.detailBox}><Text style={styles.detailLabel}>{item.label}</Text><Text style={styles.detailValue}>{item.value}</Text></View>)}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.canvas },
  page: { flex: 1, backgroundColor: Colors.canvas },
  container: { width: '100%', maxWidth: 960, alignSelf: 'center', padding: 18, paddingBottom: 36, gap: 12 },
  header: { marginBottom: 2 },
  title: { fontSize: 23, fontWeight: '600', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.subtleGray, marginTop: 4 },
  mainCard: { flexDirection: 'row', alignItems: 'center', gap: 20, backgroundColor: Colors.paper, borderRadius: 8, padding: 22, borderWidth: 1, borderColor: Colors.border },
  weatherIcon: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.paper },
  temp: { fontSize: 40, fontWeight: '600', color: Colors.ink },
  condition: { fontSize: 14, color: Colors.subtleGray, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
  advisoryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderRadius: 6, padding: 14 },
  advisoryTitle: { fontSize: 13, fontWeight: '600' },
  advisoryText: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  detailsGrid: { backgroundColor: Colors.paper, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16 },
  detailBox: { minHeight: 46, flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  detailLabel: { fontSize: 14, color: Colors.subtleGray },
  detailValue: { fontSize: 14, fontWeight: '500', color: Colors.ink, fontVariant: ['tabular-nums'] },
});
