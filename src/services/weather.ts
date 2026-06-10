const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || '';
const MAKATI_LAT = 14.5547;
const MAKATI_LON = 121.0244;

export interface WeatherData {
  temp: number;
  condition: string;
  isRaining: boolean;
  alertMessage?: string;
}

export const fetchMakatiWeather = async (): Promise<WeatherData> => {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${MAKATI_LAT}&lon=${MAKATI_LON}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );
    const data = await response.json();
    
    const condition = data.weather[0].main.toLowerCase();
    const isRaining = condition.includes('rain') || condition.includes('thunderstorm') || condition.includes('drizzle');
    
    let alertMessage;
    if (isRaining) {
      alertMessage = "Maulan ngayon. Expect heavy traffic and longer waiting times for e-jeepneys.";
    } else if (data.main.temp > 35) {
      alertMessage = "High heat index. Stay hydrated while waiting for your ride.";
    }

    return {
      temp: data.main.temp,
      condition: data.weather[0].main,
      isRaining,
      alertMessage
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
    return {
      temp: 28,
      condition: 'Unknown',
      isRaining: false
    };
  }
};
