import 'react-native-gesture-handler';
import './src/lib/webAlertPolyfill';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider } from '@clerk/clerk-expo';
import { AuthProvider } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { initDB } from './src/lib/database';
import { initializeLanguage } from './src/locales/i18n';
import { clerkPublishableKey, clerkTokenCache, isClerkConfigured } from './src/lib/clerk';

export default function App() {
  useEffect(() => {
    const init = async () => {
      await initDB();
      await initializeLanguage();
    };
    init().catch(console.error);
  }, []);

  const appTree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <LocationProvider>
              <NavigationContainer>
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
