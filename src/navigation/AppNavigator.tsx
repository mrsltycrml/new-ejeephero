import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';
import ESakayLogo from '../components/ESakayLogo';
import AdminHeaderPopover, { type AdminPanel } from '../components/AdminHeaderPopover';
import ServiceAccountMenu from '../components/ServiceAccountMenu';
import { supabase } from '../lib/supabase';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import PendingApprovalScreen from '../screens/auth/PendingApprovalScreen';

// Passenger Screens
import PassengerHomeScreen from '../screens/passenger/HomeScreen';
import HeroBotScreen from '../screens/passenger/HeroBotScreen';
import DirectoryScreen from '../screens/passenger/DirectoryScreen';
import FareScreen from '../screens/passenger/FareScreen';
import SafetyScreen from '../screens/passenger/SafetyScreen';
import AboutScreen from "../screens/passenger/AboutScreen";
import PassengerNotices from "../components/PassengerNotices";
import MoreScreen from '../screens/passenger/MoreScreen';
import { PassengerJourneyProvider } from '../contexts/PassengerJourneyContext';

// Driver Screens
import DriverDashboardScreen from '../screens/driver/DashboardScreen';
import NotificationsScreen from '../screens/driver/NotificationsScreen';
import DriverRecordsScreen from '../screens/driver/RecordsScreen';

// Admin Screens
import SupervisorDashboardScreen from '../screens/admin/SupervisorDashboardScreen';
import { AdminDriversScreen, AdminUnitsScreen } from '../screens/admin/AdminOperationsScreens';

// Shared
import WeatherScreen from '../screens/shared/WeatherScreen';
import ContactsScreen from '../screens/shared/ContactsScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const commonScreenOptions = {
  headerTitleAlign: 'left' as const,
  tabBarActiveTintColor: Colors.ink,
  tabBarInactiveTintColor: Colors.subtleGray,
  tabBarStyle: {
    backgroundColor: Colors.paper,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
    paddingBottom: 5,
    height: 62,
    elevation: 0,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const },
  tabBarIconStyle: { marginTop: 0 },
  headerStyle: {
    backgroundColor: Colors.paper,
  },
  headerTintColor: Colors.ink,
  headerTitleStyle: {
    fontWeight: '800' as const,
    fontSize: 18,
  },
};

function ServiceHeaderActions({ onAccount, onAlerts, onBot, alertsLabel = "Open driver alerts", open }: { onAccount: () => void; onAlerts?: () => void; onBot?: () => void; alertsLabel?: string; open: boolean }) {
  const { width } = useWindowDimensions();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 10 }}>
    {onBot && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open esakaybot" onPress={onBot} style={{ minWidth: 44, height: 44, paddingHorizontal: 10, justifyContent: 'center', flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 10, backgroundColor: 'transparent' }}><Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.ink} />{width >= 380 && <Text style={{ color: Colors.ink, fontWeight: "700", fontSize: 12 }}>esakaybot</Text>}</TouchableOpacity>}
    {onAlerts && <TouchableOpacity accessibilityRole="button" accessibilityLabel={alertsLabel} onPress={onAlerts} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="notifications-outline" size={19} color={Colors.ink} /></TouchableOpacity>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open account menu" accessibilityState={{ expanded: open }} onPress={onAccount} style={{ height: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: open ? Colors.sand : Colors.sand }}><Ionicons name="person-circle-outline" size={20} color={Colors.ink} />{width >= 520 && <Text style={{ color: Colors.ink, fontWeight: '800', fontSize: 12 }}>Account</Text>}<Ionicons name="chevron-down" size={13} color={Colors.ink} /></TouchableOpacity>
  </View>;
}

const PassengerTabs = ({ navigation: stackNavigation }: any) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [accountOpen, setAccountOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}><Tab.Navigator screenOptions={({ navigation }) => ({ ...commonScreenOptions, headerTitle: () => <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to map" onPress={() => navigation.navigate('Map')}><ESakayLogo width={width < 520 ? 100 : 132} compact /></TouchableOpacity>, headerRight: () => <ServiceHeaderActions open={accountOpen} onAccount={() => { setNoticesOpen(false); setAccountOpen((value) => !value); }} onAlerts={() => { setAccountOpen(false); setNoticesOpen(value => !value); }} alertsLabel="Boarding notices" onBot={() => { setAccountOpen(false); setNoticesOpen(false); stackNavigation.navigate('PassengerAssistant'); }} /> })}>
      <Tab.Screen
        name="Map"
        component={PassengerHomeScreen}
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <Ionicons name="map" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Fares"
        component={FareScreen}
        options={{ title: 'Fares', tabBarIcon: ({ color }) => <Ionicons name="calculator-outline" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Safety"
        component={SafetyScreen}
        options={{ title: 'Safety', tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark-outline" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: 'More', tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={21} color={color} /> }}
      />
    </Tab.Navigator>
    <ServiceAccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} onProfile={() => stackNavigation.navigate('PassengerProfile')} onAbout={() => stackNavigation.navigate('PassengerAbout')} />
    <PassengerNotices open={noticesOpen} onClose={() => setNoticesOpen(false)} onGuide={() => stackNavigation.navigate('PassengerTabs', { screen: 'Map', params: { showStopGuide: Date.now() } })} />
    </View>
  );
};

const DriverTabs = ({ navigation: stackNavigation }: any) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}><Tab.Navigator screenOptions={({ navigation }) => ({ ...commonScreenOptions, headerTitle: () => <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to dashboard" onPress={() => navigation.navigate('Dashboard')}><ESakayLogo width={width < 520 ? 100 : 132} compact /></TouchableOpacity>, headerRight: () => <ServiceHeaderActions open={accountOpen} onAccount={() => setAccountOpen((value) => !value)} onAlerts={() => navigation.navigate('Alerts')} /> })}>
      <Tab.Screen
        name="Dashboard"
        component={DriverDashboardScreen}
        options={{ title: t('navigation.dashboard'), tabBarIcon: ({ color }) => <Ionicons name="car" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{ title: t('navigation.alerts'), tabBarIcon: ({ color }) => <Ionicons name="notifications" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Records"
        component={DriverRecordsScreen}
        options={{ title: 'Records', tabBarIcon: ({ color }) => <Ionicons name="document-text-outline" size={21} color={color} /> }}
      />
    </Tab.Navigator>
    <ServiceAccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} onProfile={() => stackNavigation.navigate('DriverProfile')} />
    </View>
  );
};

const PassengerStack = () => <PassengerJourneyProvider><Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: Colors.paper }, headerTintColor: Colors.ink }}><Stack.Screen name="PassengerTabs" component={PassengerTabs} options={{ headerShown: false }} /><Stack.Screen name="PassengerProfile" component={ProfileScreen} options={{ title: 'Account settings' }} /><Stack.Screen name="PassengerDirectory" component={DirectoryScreen} options={{ title: 'Route information' }} /><Stack.Screen name="PassengerAbout" component={AboutScreen} options={{ title: 'About eSAKAY' }} /><Stack.Screen name="PassengerWeather" component={WeatherScreen} options={{ title: 'Weather' }} /><Stack.Screen name="PassengerAssistant" component={HeroBotScreen} options={{ title: 'esakaybot' }} /></Stack.Navigator></PassengerJourneyProvider>;
const DriverStack = () => <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: Colors.paper }, headerTintColor: Colors.ink }}><Stack.Screen name="DriverTabs" component={DriverTabs} options={{ headerShown: false }} /><Stack.Screen name="DriverProfile" component={ProfileScreen} options={{ title: 'Account settings' }} /></Stack.Navigator>;

function AdminHeaderActions({ onAlerts, onProfile, alertCount, activePanel }: { onAlerts: () => void; onProfile: () => void; alertCount: number; activePanel: AdminPanel }) {
  const { width } = useWindowDimensions();
  const compact = width < 520;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 5 : 10, marginRight: 10 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Violation alerts${alertCount ? `, ${alertCount} recent` : ''}`} accessibilityState={{ expanded: activePanel === 'alerts' }} onPress={onAlerts} style={{ minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: activePanel === 'alerts' ? Colors.sand : Colors.sand }}>
      <Ionicons name="notifications-outline" size={19} color={Colors.ink} />
      {alertCount > 0 && <View style={{ position: 'absolute', right: 0, top: 0, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 2, backgroundColor: Colors.primaryRed, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>{alertCount > 99 ? '99+' : alertCount}</Text></View>}
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open admin profile" accessibilityState={{ expanded: activePanel === 'profile' }} onPress={onProfile} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 44, height: 44, paddingHorizontal: compact ? 8 : 11, borderRadius: 10, backgroundColor: activePanel === 'profile' ? Colors.sand : Colors.sand }}>
      <Ionicons name="person-circle-outline" size={20} color={Colors.navy} />{!compact && <Text style={{ color: Colors.navy, fontWeight: '800', fontSize: 12 }}>Account</Text>}<Ionicons name="chevron-down" size={13} color={Colors.navy} />
    </TouchableOpacity>
  </View>;
}

const AdminTabs = ({ navigation: stackNavigation }: any) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [alertCount, setAlertCount] = useState(0);
  const [notice, setNotice] = useState('');
  const [activePanel, setActivePanel] = useState<AdminPanel>(null);
  const previousCount = useRef<number | null>(null);
  const loadAlertCount = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [speed, routes] = await Promise.all([
      supabase.from('speed_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('trip_violations').select('id', { count: 'exact', head: true }).gte('created_at', since).neq('status', 'dismissed'),
    ]);
    if (speed.error || routes.error) return;
    const total = (speed.count ?? 0) + (routes.count ?? 0);
    if (previousCount.current !== null && total > previousCount.current) setNotice(`${total - previousCount.current} new driver violation${total - previousCount.current === 1 ? '' : 's'} recorded`);
    previousCount.current = total;
    setAlertCount(total);
  }, []);
  useEffect(() => {
    void loadAlertCount();
    const timer = setInterval(() => { void loadAlertCount(); }, 15000);
    const channel = supabase.channel('admin-header-violations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'speed_events' }, () => { void loadAlertCount(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_violations' }, () => { void loadAlertCount(); })
      .subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [loadAlertCount]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <View style={{ flex: 1 }}><Tab.Navigator screenOptions={({ navigation }) => ({
      ...commonScreenOptions,
      tabBarActiveTintColor: Colors.ink,
      tabBarInactiveTintColor: Colors.subtleGray,
      tabBarStyle: { backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6, paddingBottom: 5, height: 62, elevation: 0 },
      headerStyle: { backgroundColor: Colors.paper },
      headerTintColor: Colors.navy,
      headerRight: () => <AdminHeaderActions alertCount={alertCount} activePanel={activePanel} onAlerts={() => setActivePanel((open) => open === 'alerts' ? null : 'alerts')} onProfile={() => setActivePanel((open) => open === 'profile' ? null : 'profile')} />,
      headerTitle: () => <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Go to Monitor"
        onPress={() => navigation.navigate('Fleet')}
      ><ESakayLogo width={width < 520 ? 100 : 132} compact /></TouchableOpacity>,
    })}>
      <Tab.Screen
        name="Fleet"
        component={SupervisorDashboardScreen}
        options={{ title: 'Monitor', tabBarIcon: ({ color }) => <Ionicons name="speedometer" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Units"
        component={AdminUnitsScreen}
        options={{ title: t('navigation.units'), tabBarIcon: ({ color }) => <Ionicons name="bus" size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Drivers"
        component={AdminDriversScreen}
        options={{ title: t('navigation.drivers'), tabBarIcon: ({ color }) => <Ionicons name="people" size={21} color={color} /> }}
      />
    </Tab.Navigator>
    {!!notice && !activePanel && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${notice}. Open violation alerts`} onPress={() => { setNotice(''); setActivePanel('alerts'); }} style={{ position: 'absolute', top: 68, right: 16, maxWidth: 320, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.primaryRed, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, elevation: 5 }}>
      <Ionicons name="alert-circle" size={19} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', flex: 1 }}>{notice}</Text>
    </TouchableOpacity>}
    <AdminHeaderPopover panel={activePanel} onClose={() => setActivePanel(null)} onManageProfile={() => stackNavigation.navigate('AdminProfile')} />
    </View>
  );
};

const AdminStack = () => <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: Colors.paper }, headerTintColor: Colors.navy, headerTitleStyle: { fontWeight: '700', fontSize: 18 } }}>
  <Stack.Screen name="AdminTabs" component={AdminTabs} options={{ headerShown: false }} />
  <Stack.Screen name="AdminProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
</Stack.Navigator>;

export const AppNavigator = () => {
  const { user, role, status, isAdmin, loading, authError, refreshProfile, signOut } = useAuth();

  if (authError) return <View style={{ flex: 1, backgroundColor: Colors.offWhite, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: Colors.ink, fontSize: 24, fontWeight: '700' }}>Check your account</Text>
      <Text accessibilityRole="alert" style={{ color: Colors.ink, fontSize: 16, lineHeight: 24 }}>{authError}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => { void refreshProfile(); }} style={{ minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: Colors.primaryRed, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Retry</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => { void signOut(); }} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: Colors.primaryRed, fontSize: 16 }}>Return to sign in</Text></TouchableOpacity>
    </View>
  </View>;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: Colors.offWhite,
          gap: 12,
        }}
      >
        <ESakayLogo width={160} />
        <ActivityIndicator size="large" color={Colors.ink} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.darkText }}>
          Loading eSAKAY…
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : status !== 'approved' ? (
        <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      ) : isAdmin ? (
        <Stack.Screen name="AdminApp" component={AdminStack} />
      ) : role === 'driver' ? (
        <Stack.Screen name="DriverApp" component={DriverStack} />
      ) : (
        <Stack.Screen name="PassengerApp" component={PassengerStack} />
      )}
    </Stack.Navigator>
  );
};
