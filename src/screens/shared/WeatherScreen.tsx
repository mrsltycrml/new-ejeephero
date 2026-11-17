import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ScreenSkeleton } from '../../components/AppUI';
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
    return <ScreenSkeleton preset="cards" />;
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

  const weatherIcon = weather.weather[0].main.toLowerCase().includes('rain') ? 'rainy' : weather.weather[0].main.toLowerCase().includes('cloud') ? 'cloudy' : 'partly-sunny';
  return <ScrollView style={styles.page} contentContainerStyle={styles.container}>
    <View style={styles.mainCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Makati Transit Weather</Text>
          <Text style={styles.title}>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}</Text>
        </View>
        <View style={styles.weatherIcon}><Ionicons name={weatherIcon} size={36} color={Colors.brandMintLight} /></View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
        <Text style={styles.temp}>{Math.round(weather.main.temp)}°C</Text>
        <Text style={styles.condition}>{weather.weather[0].description}</Text>
      </View>
    </View>
    {advisory && <View style={[styles.advisoryCard, { backgroundColor: ac.bg, borderColor: ac.border }]}><Ionicons name={advisory.severity === 'safe' ? 'checkmark-circle' : 'alert-circle'} size={22} color={ac.text} /><View style={{ flex: 1 }}><Text style={[styles.advisoryTitle, { color: ac.text }]}>{advisory.severity === 'danger' ? t('weather.travelAdvisory') : advisory.severity === 'caution' ? t('weather.caution') : t('weather.travelConditions')}</Text><Text style={[styles.advisoryText, { color: ac.text }]}>{advisory.message}</Text></View></View>}
    <View style={styles.detailsGrid}>
      {[
        { icon: 'water' as const, label: 'Humidity', value: reading(weather.main.humidity, '%') },
        { icon: 'speedometer' as const, label: 'Wind speed', value: reading(weather.wind?.speed, ' m/s') },
        { icon: 'thermometer' as const, label: 'Feels like', value: reading(weather.main.feels_like, '°C', true) },
        { icon: 'compass' as const, label: 'Pressure', value: reading(weather.main.pressure, ' hPa') },
        { icon: 'sunny' as const, label: 'Sunrise', value: sunLabel(weather.sys?.sunrise) },
        { icon: 'moon' as const, label: 'Sunset', value: sunLabel(weather.sys?.sunset) },
      ].map((item) => <View key={item.label} style={styles.detailCard}><View style={styles.detailIcon}><Ionicons name={item.icon} size={17} color={Colors.brandMintLight} /></View><Text style={styles.detailLabel}>{item.label}</Text><Text style={styles.detailValue}>{item.value}</Text></View>)}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.canvas },
  page: { flex: 1, backgroundColor: Colors.canvas },
  container: { width: '100%', maxWidth: 960, alignSelf: 'center', padding: 16, paddingBottom: 36, gap: 16 },
  header: { marginBottom: 2 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.brandMintLight, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: Colors.white },
  subtitle: { fontSize: 14, color: Colors.subtleGray, marginTop: 4 },
  mainCard: { backgroundColor: Colors.ink, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: Colors.brandSurfaceDark, gap: 6 },
  weatherIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.brandSurfaceDark, borderWidth: 1, borderColor: '#1E463E' },
  temp: { fontSize: 52, fontWeight: '900', color: Colors.brandMintLight, fontVariant: ['tabular-nums'] },
  condition: { fontSize: 16, color: '#A7F3D0', fontWeight: '700', textTransform: 'capitalize' },
  advisoryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 },
  advisoryTitle: { fontSize: 14, fontWeight: '800' },
  advisoryText: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailCard: { flexGrow: 1, flexBasis: 145, backgroundColor: Colors.paper, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 6 },
  detailIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  detailLabel: { fontSize: 12, color: Colors.subtleGray, fontWeight: '700' },
  detailValue: { fontSize: 20, color: Colors.ink, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
