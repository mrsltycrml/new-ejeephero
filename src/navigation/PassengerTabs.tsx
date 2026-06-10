import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/passenger/HomeScreen';
import HeroBotScreen from '../screens/passenger/HeroBotScreen';
import DirectoryScreen from '../screens/shared/DirectoryScreen';
import TripScreen from '../screens/passenger/TripScreen';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

export default function PassengerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Home') iconName = focused ? 'map' : 'map-outline';
          else if (route.name === 'HeroBot') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'Directory') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Trip') iconName = focused ? 'receipt' : 'receipt-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: true,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Live Map' }} />
      <Tab.Screen name="HeroBot" component={HeroBotScreen} options={{ title: 'Ask HeroBot' }} />
      <Tab.Screen name="Directory" component={DirectoryScreen} options={{ title: 'Routes' }} />
      <Tab.Screen name="Trip" component={TripScreen} options={{ title: 'My Trip' }} />
    </Tab.Navigator>
  );
}
