import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import PendingApprovalScreen from '../screens/auth/PendingApprovalScreen';

// Passenger Screens
import PassengerHomeScreen from '../screens/passenger/HomeScreen';
import HeroBotScreen from '../screens/passenger/HeroBotScreen';
import DirectoryScreen from '../screens/passenger/DirectoryScreen';

// Driver Screens
import DriverDashboardScreen from '../screens/driver/DashboardScreen';
import NotificationsScreen from '../screens/driver/NotificationsScreen';

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import SupervisorDashboardScreen from '../screens/admin/SupervisorDashboardScreen';

// Shared
import WeatherScreen from '../screens/shared/WeatherScreen';
import ContactsScreen from '../screens/shared/ContactsScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const commonScreenOptions = {
  tabBarActiveTintColor: Colors.navy,
  tabBarInactiveTintColor: Colors.tabInactive,
  tabBarStyle: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 7,
    paddingBottom: 6,
    height: 68,
    elevation: 0,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  tabBarIconStyle: { marginTop: 0 },
  headerStyle: {
    backgroundColor: Colors.navy,
  },
  headerTintColor: Colors.white,
  headerTitleStyle: {
    fontWeight: '700' as const,
    fontSize: 18,
  },
};

const PassengerTabs = () => (
  <Tab.Navigator screenOptions={commonScreenOptions}>
    <Tab.Screen 
      name="Map" 
      component={PassengerHomeScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="map" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="HeroBot" 
      component={HeroBotScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Directory" 
      component={DirectoryScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Weather" 
      component={WeatherScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="partly-sunny" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Contacts" 
      component={ContactsScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Profile" 
      component={ProfileScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={24} color={color} /> }} 
    />
  </Tab.Navigator>
);

const DriverTabs = () => (
  <Tab.Navigator screenOptions={commonScreenOptions}>
    <Tab.Screen 
      name="Dashboard" 
      component={DriverDashboardScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="car" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Alerts" 
      component={NotificationsScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="notifications" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Directory" 
      component={DirectoryScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Weather" 
      component={WeatherScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="partly-sunny" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Contacts" 
      component={ContactsScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Profile" 
      component={ProfileScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={24} color={color} /> }} 
    />
  </Tab.Navigator>
);

const AdminTabs = () => (
  <Tab.Navigator screenOptions={commonScreenOptions}>
    <Tab.Screen
      name="Fleet"
      component={SupervisorDashboardScreen}
      options={{ tabBarIcon: ({ color }) => <Ionicons name="speedometer" size={24} color={color} /> }}
    />
    <Tab.Screen 
      name="Users" 
      component={AdminDashboardScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Directory" 
      component={DirectoryScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Weather" 
      component={WeatherScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="partly-sunny" size={24} color={color} /> }} 
    />
    <Tab.Screen 
      name="Profile" 
      component={ProfileScreen} 
      options={{ tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={24} color={color} /> }} 
    />
  </Tab.Navigator>
);

export const AppNavigator = () => {
  const { user, role, status, isAdmin, loading } = useAuth();

  if (loading) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : status !== 'approved' ? (
        <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      ) : isAdmin ? (
        <Stack.Screen name="AdminApp" component={AdminTabs} />
      ) : role === 'driver' ? (
        <Stack.Screen name="DriverApp" component={DriverTabs} />
      ) : (
        <Stack.Screen name="PassengerApp" component={PassengerTabs} />
      )}
    </Stack.Navigator>
  );
};
