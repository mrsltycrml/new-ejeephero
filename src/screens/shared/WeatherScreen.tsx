import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const getWeatherAdvisory = (weather: any): { message: string; severity: 'safe' | 'caution' | 'danger' } | null => {
  if (!weather) return null;
  const id = weather.weather?.[0]?.id;
  const wind = weather.wind?.speed;
  const temp = weather.main?.temp;

  if (id >= 200 && id < 300) return { message: '⛈ Thunderstorm warning. Avoid open areas & seek shelter.', severity: 'danger' };
  if (id >= 500 && id < 600) return { message: '🌧 Heavy rain detected. Roads may be flooded — drive carefully.', severity: 'caution' };
  if (id >= 700 && id < 800) return { message: '🌫 Poor visibility (fog/haze). Drive slowly and keep headlights on.', severity: 'caution' };
  if (wind > 15) return { message: `💨 Strong winds (${wind} m/s). Hold onto loose items while commuting.`, severity: 'caution' };
  if (temp > 38) return { message: `🔥 Extreme heat (${Math.round(temp)}°C). Stay hydrated and avoid prolonged sun exposure.`, severity: 'danger' };
  return { message: '✅ Weather conditions are safe for travel.', severity: 'safe' };
};

export default function WeatherScreen() {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=14.5547&lon=121.0244&appid=${process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY}&units=metric`
        );
        const data = await res.json();
        setWeather(data);
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
        <ActivityIndicator size="large" color="#1F4E79" />
      </View>
    );
  }

  if (!weather) {
    return (
      <View style={styles.center}>
        <Text>Could not load weather data.</Text>
      </View>
    );
  }

  const advisory = getWeatherAdvisory(weather);
  const advisoryColors: Record<string, { bg: string; border: string; text: string }> = {
    safe: { bg: '#e6f9ee', border: '#00B050', text: '#1a6e35' },
    caution: { bg: '#fff8e1', border: '#FFA000', text: '#7a5900' },
    danger: { bg: '#fdecea', border: '#C00000', text: '#8b0000' },
  };
  const ac = advisory ? advisoryColors[advisory.severity] : advisoryColors.safe;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Makati City Weather</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* ─── Weather Advisory ─── */}
      {advisory && (
        <View style={[styles.advisoryCard, { backgroundColor: ac.bg, borderColor: ac.border }]}>
          <Text style={styles.advisoryTitle}>
            {advisory.severity === 'danger' ? '⚠️ TRAVEL ADVISORY' : advisory.severity === 'caution' ? '⚠️ CAUTION' : '✅ ALL CLEAR'}
          </Text>
          <Text style={[styles.advisoryText, { color: ac.text }]}>{advisory.message}</Text>
        </View>
      )}

      <View style={styles.mainCard}>
        <Ionicons
          name={
            weather.weather[0].main.toLowerCase().includes('rain')
              ? 'rainy'
              : weather.weather[0].main.toLowerCase().includes('cloud')
                ? 'cloudy'
                : 'partly-sunny'
          }
          size={80}
          color="#1F4E79"
        />
        <Text style={styles.temp}>{Math.round(weather.main.temp)}°C</Text>
        <Text style={styles.condition}>
          {weather.weather[0].description.toUpperCase()}
        </Text>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailBox}>
          <Ionicons name="water" size={24} color="#666" />
          <Text style={styles.detailLabel}>Humidity</Text>
          <Text style={styles.detailValue}>{weather.main.humidity}%</Text>
        </View>
        <View style={styles.detailBox}>
          <Ionicons name="leaf" size={24} color="#666" />
          <Text style={styles.detailLabel}>Wind</Text>
          <Text style={styles.detailValue}>{weather.wind.speed} m/s</Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailBox}>
          <Ionicons name="thermometer" size={24} color="#666" />
          <Text style={styles.detailLabel}>Feels Like</Text>
          <Text style={styles.detailValue}>
            {Math.round(weather.main.feels_like)}°C
          </Text>
        </View>
        <View style={styles.detailBox}>
          <Ionicons name="speedometer" size={24} color="#666" />
          <Text style={styles.detailLabel}>Pressure</Text>
          <Text style={styles.detailValue}>{weather.main.pressure} hPa</Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailBox}>
          <Ionicons name="sunny" size={24} color="#666" />
          <Text style={styles.detailLabel}>Sunrise</Text>
          <Text style={styles.detailValue}>
            {new Date(weather.sys.sunrise * 1000).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={styles.detailBox}>
          <Ionicons name="moon" size={24} color="#666" />
          <Text style={styles.detailLabel}>Sunset</Text>
          <Text style={styles.detailValue}>
            {new Date(weather.sys.sunset * 1000).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 20, paddingTop: 50, backgroundColor: '#f5f5f5', flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 5 },
  // ── Advisory ──
  advisoryCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  advisoryTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  advisoryText: { fontSize: 15, lineHeight: 22 },
  // ── Main ──
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
  },
  temp: { fontSize: 48, fontWeight: 'bold', color: '#1F4E79', marginVertical: 10 },
  condition: { fontSize: 18, color: '#666', fontWeight: '500' },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  detailBox: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  detailLabel: { fontSize: 14, color: '#666', marginTop: 8 },
  detailValue: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 4 },
});
