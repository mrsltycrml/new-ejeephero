import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ScreenSkeleton } from '../../components/AppUI';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { transitStyles } from '../../constants/transitStyles';

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
        <Ionicons name="cloud-offline-outline" size={32} color={Colors.subtleGray} />
        <Text accessibilityRole="alert" style={styles.detailValue}>{t('weather.couldNotLoad')}</Text>
      </View>
    );
  }

  const advisory = getWeatherAdvisory(weather);
  const advisoryColors = {
    safe: { background: Colors.successBg, ink: Colors.success },
    caution: { background: Colors.warningBg, ink: Colors.warning },
    danger: { background: Colors.dangerBg, ink: Colors.primaryRed },
  };
  const tone = advisory && advisoryColors[advisory.severity];
  const condition = weather.weather[0];
  const icon = condition.id < 300 ? 'thunderstorm-outline' : condition.id < 600 ? 'rainy-outline'
    : condition.id === 800 ? 'sunny-outline' : 'cloud-outline';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.masthead}>
        <View style={styles.locationRow}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={styles.title}>Makati City</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}
            </Text>
          </View>
          <Ionicons aria-hidden name={icon} size={38} color={Colors.signal} />
        </View>
        <View style={styles.observation}>
          <Text style={styles.temp}>{Math.round(weather.main.temp)}°C</Text>
          <Text style={styles.condition}>{condition.description}</Text>
        </View>
      </View>

      {advisory && tone && (
        <View style={[styles.advisoryCard, { backgroundColor: tone.background, borderLeftColor: tone.ink }]}>
          <Ionicons name={advisory.severity === 'safe' ? 'checkmark-circle' : 'alert-circle'} size={22} color={tone.ink} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[styles.advisoryTitle, { color: tone.ink }]}>
              {advisory.severity === 'danger' ? t('weather.travelAdvisory') : advisory.severity === 'caution' ? t('weather.caution') : t('weather.travelConditions')}
            </Text>
            <Text style={styles.advisoryText}>{advisory.message}</Text>
          </View>
        </View>
      )}

      <View style={styles.measurements}>
        {[
          { label: t('passenger.weather.feelsLike'), value: reading(weather.main.feels_like, '°C', true) },
          { label: t('weather.windSpeed'), value: reading(weather.wind?.speed, ' m/s') },
          { label: t('weather.humidity'), value: reading(weather.main.humidity, '%') },
          { label: t('weather.pressure'), value: reading(weather.main.pressure, ' hPa') },
          { label: t('weather.sunrise'), value: sunLabel(weather.sys?.sunrise) },
          { label: t('weather.sunset'), value: sunLabel(weather.sys?.sunset) },
        ].map(({ label, value }) => (
          <View key={label} style={styles.readingRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, gap: 10, backgroundColor: Colors.canvas },
  page: transitStyles.page,
  container: transitStyles.content,
  masthead: { ...transitStyles.masthead, gap: 16 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: Colors.onDark, fontSize: 22, fontWeight: '700' },
  date: { color: Colors.onDark, fontSize: 14, marginTop: 3 },
  observation: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14, rowGap: 4 },
  temp: { fontVariant: ['tabular-nums'], fontSize: 44, color: Colors.onDark, fontWeight: '800', letterSpacing: -1.2 },
  condition: { fontSize: 18, fontWeight: '600', color: Colors.onDark, textTransform: 'capitalize' },
  advisoryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 8, borderLeftWidth: 4 },
  advisoryTitle: { fontSize: 14, fontWeight: '700' },
  advisoryText: { color: Colors.ink, fontSize: 14, lineHeight: 20, marginTop: 4 },
  measurements: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.paper, overflow: 'hidden' },
  readingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  detailLabel: { flexShrink: 1, fontSize: 14, color: Colors.subtleGray },
  detailValue: { fontSize: 16, color: Colors.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
