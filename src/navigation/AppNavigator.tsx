import React, { useState, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import PassengerTabs from './PassengerTabs';
import DriverTabs from './DriverTabs';
import RouteDetailScreen from '../screens/shared/RouteDetailScreen';
import RatingScreen from '../screens/passenger/RatingScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'passenger' | 'driver' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.user_metadata?.role) {
        setRole(session.user.user_metadata.role);
      }
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.user_metadata?.role) {
        setRole(session.user.user_metadata.role);
      }
    });
  }, []);

  if (loading) {
    return null; // Or a splash screen
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        // Auth Stack
        <>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: true, title: '' }} />
        </>
      ) : role === 'driver' ? (
        // Driver Stack
        <>
          <Stack.Screen name="DriverTabs" component={DriverTabs} />
          <Stack.Screen name="RouteDetail" component={RouteDetailScreen} options={{ headerShown: true, title: 'Route Details' }} />
        </>
      ) : (
        // Passenger Stack
        <>
          <Stack.Screen name="PassengerTabs" component={PassengerTabs} />
          <Stack.Screen name="RouteDetail" component={RouteDetailScreen} options={{ headerShown: true, title: 'Route Details' }} />
          <Stack.Screen name="RatingScreen" component={RatingScreen} options={{ presentation: 'modal' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
