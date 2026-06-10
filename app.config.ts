import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'EjeepHero',
  slug: 'ejeephero',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff'
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.ejeephero.app',
    infoPlist: {
      UIBackgroundModes: ['location', 'fetch'],
      NSLocationWhenInUseUsageDescription: 'We need your location for tracking the E-Jeepney route and your ETA.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'We need your location for continuous E-Jeepney tracking and anomaly detection.',
      NSMotionUsageDescription: 'We need access to your device motion sensors to detect potential crashes and anomalies.'
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#ffffff'
    },
    package: 'com.ejeephero.app',
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.VIBRATE'
    ]
  },
  web: {
    favicon: './assets/icon.png'
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'Allow $(PRODUCT_NAME) to use your location for continuous tracking.'
      }
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#ffffff'
      }
    ],
    'expo-sensors',
    'expo-sqlite'
  ]
});
