import { useState, useEffect } from 'react';
import { fetchMakatiWeather, WeatherData } from '../services/weather';

export const useWeather = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const getWeatherData = async () => {
      const data = await fetchMakatiWeather();
      setWeather(data);
    };

    getWeatherData();
    // Refresh weather every 30 minutes
    const interval = setInterval(getWeatherData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return weather;
};
