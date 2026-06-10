import { supabase } from '../lib/supabase';

const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || '';
const MAKATI_LAT = 14.5547;
const MAKATI_LON = 121.0244;

export interface WeatherData {
  temp: number;
  condition: string;
  description: string;
  icon: string;
  isAdverse: boolean;
  alertMessage?: string;
}

export const fetchMakatiWeather = async (): Promise<WeatherData> => {
  try {
    // 1. Check cache first (poll every 15 mins)
    const { data: cached } = await supabase
      .from('weather_cache')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      const updatedAt = new Date(cached.updated_at).getTime();
      const now = new Date().getTime();
      if (now - updatedAt < 15 * 60 * 1000) {
        return {
          temp: cached.temp,
          condition: cached.condition,
          description: cached.description,
          icon: cached.icon,
          isAdverse: cached.is_adverse,
          alertMessage: cached.is_adverse ? getAlertMessage(cached.condition, cached.temp) : undefined
        };
      }
    }

    // 2. Poll API if no fresh cache
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${MAKATI_LAT}&lon=${MAKATI_LON}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );
    const data = await response.json();
    
    const condition = data.weather[0].main;
    const description = data.weather[0].description;
    const temp = data.main.temp;
    const icon = data.weather[0].icon;
    
    const isAdverse =
      condition.toLowerCase().includes('rain') ||
      condition.toLowerCase().includes('thunderstorm') ||
      temp > 38;

    const weatherData: WeatherData = {
      temp,
      condition,
      description,
      icon,
      isAdverse
    };

    // 3. Update Cache
    await supabase.from('weather_cache').insert({
      condition,
      description,
      temp,
      icon,
      is_adverse: isAdverse,
      updated_at: new Date().toISOString()
    });

    return {
      ...weatherData,
      alertMessage: isAdverse ? getAlertMessage(condition, temp) : undefined
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
    return {
      temp: 28,
      condition: 'Clear',
      description: 'clear sky',
      icon: '01d',
      isAdverse: false
    };
  }
};

const getAlertMessage = (condition: string, temp: number) => {
  if (condition.toLowerCase().includes('rain') || condition.toLowerCase().includes('thunderstorm')) {
    return "Maulan o may bagyo ngayon. Mag-ingat sa pagbiyahe at asahan ang traffic.";
  }
  if (temp > 38) {
    return "Napakainit ng panahon. Uminom ng maraming tubig habang naghihintay ng sasakyan.";
  }
  return "Adverse weather condition detected.";
};
