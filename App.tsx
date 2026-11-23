import 'react-native-gesture-handler';
import './src/lib/webAlertPolyfill';
import React, { useEffect } from 'react';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider } from '@clerk/clerk-expo';
import { AuthProvider } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initializeLanguage } from './src/locales/i18n';
import { clerkPublishableKey, clerkTokenCache, isClerkConfigured } from './src/lib/clerk';
import { Colors } from './src/constants/theme';

const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: Colors.action, background: Colors.canvas, card: Colors.paper, text: Colors.ink, border: Colors.border, notification: Colors.primaryRed },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    initializeLanguage().catch(console.error);
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const appTree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <LocationProvider>
              <NavigationContainer theme={navigationTheme} documentTitle={{ formatter: options => options?.title ?? 'eJeepHero' }}>
                <AppNavigator />
              </NavigationContainer>
            </LocationProvider>
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  if (isClerkConfigured) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={clerkTokenCache}>
        {appTree}
      </ClerkProvider>
    );
  }

  return appTree;
}
