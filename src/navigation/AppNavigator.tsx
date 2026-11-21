import { loadAdminOperations } from '../services/adminOperationsService';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenSkeleton } from '../components/AppUI';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';
import { AuthAction, AuthLink, AuthNotice, AuthPage } from '../screens/auth/AuthUI';
import ESakayLogo from '../components/ESakayLogo';
import AdminHeaderPopover, { type AdminPanel } from '../components/AdminHeaderPopover';
import RouteWarningBanner from '../components/RouteWarningBanner';
import { RouteWarningsProvider, useRouteWarnings } from '../contexts/RouteWarningsContext';
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
import AboutScreen from '../screens/passenger/AboutScreen';
import PassengerNotices from '../components/PassengerNotices';
import MoreScreen from '../screens/passenger/MoreScreen';
import { PassengerJourneyProvider } from '../contexts/PassengerJourneyContext';

// Driver Screens
import DriverDashboardScreen from '../screens/driver/DashboardScreen';
import NotificationsScreen from '../screens/driver/NotificationsScreen';
import DriverRecordsScreen from '../screens/driver/RecordsScreen';

// Admin / Supervisor Screens
import SupervisorDashboardScreen from '../screens/admin/SupervisorDashboardScreen';
import { AdminDriversScreen, AdminUnitsScreen, AdminReportsScreen } from '../screens/admin/AdminOperationsScreens';

// Shared
import WeatherScreen from '../screens/shared/WeatherScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function useTabOptions(): BottomTabNavigationOptions {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rail = Platform.OS === 'web' && width >= 1100;
  const bottom = Platform.OS === 'web' ? 6 : Math.max(8, insets.bottom);
  return {
    headerTitleAlign: 'left',
    headerStatusBarHeight: Platform.OS === 'web' ? 0 : undefined,
    headerStyle: { backgroundColor: Colors.midnight },
    headerShadowVisible: false,
    headerTintColor: Colors.onDark,
    tabBarPosition: rail ? 'left' : 'bottom',
    tabBarLabelPosition: rail ? 'beside-icon' : 'below-icon',
    tabBarActiveTintColor: rail ? Colors.midnight : Colors.action,
    tabBarInactiveTintColor: rail ? Colors.onDarkMuted : Colors.subtleGray,
    tabBarActiveBackgroundColor: rail ? Colors.signal : Colors.actionTint,
    tabBarStyle: rail ? styles.rail : [styles.bottomBar, { height: 56 + bottom, paddingBottom: bottom }],
    tabBarItemStyle: rail ? styles.railItem : styles.bottomItem,
    tabBarLabelStyle: rail ? styles.railLabel : styles.bottomLabel,
    tabBarIconStyle: rail ? undefined : styles.bottomIcon,
    tabBarAllowFontScaling: true,
  };
}

const styles = StyleSheet.create({
  rail: { width: 160, minWidth: 160, maxWidth: 160, paddingTop: 20, backgroundColor: Colors.midnight, borderRightWidth: 0, elevation: 0 },
  railItem: { minHeight: 52, borderRadius: 8, marginVertical: 3 },
  railLabel: { fontSize: 14, fontWeight: '700' },
  bottomBar: { backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 4, paddingHorizontal: 4, elevation: 0 },
  bottomItem: { marginHorizontal: 2, borderRadius: 8, overflow: 'hidden' },
  bottomIcon: { height: 24, flexGrow: 0, flexShrink: 0 },
  bottomLabel: { fontSize: 12, lineHeight: 16, minHeight: 16, flexShrink: 0, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 12 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  headerButtonActive: { backgroundColor: Colors.signal },
  count: { position: 'absolute', right: 0, top: 1, borderRadius: 9, minWidth: 18, minHeight: 18, paddingHorizontal: 3, backgroundColor: Colors.primaryRed, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 10, fontWeight: '800', color: Colors.white },
});

function HeaderButton({ label, icon, expanded, onPress, count = 0 }: {
  label: string; icon: 'notifications-outline' | 'person-outline'; expanded?: boolean; onPress: () => void; count?: number;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }} onPress={onPress}
    style={[styles.headerButton, expanded && styles.headerButtonActive]}>
    <Ionicons name={icon} size={23} color={expanded ? Colors.midnight : Colors.onDark} />
    {count > 0 && <View style={styles.count}><Text style={styles.countText}>{count > 99 ? '99+' : count}</Text></View>}
  </TouchableOpacity>;
}

const PassengerTabs = ({ navigation: stackNavigation }: any) => {
  const tabOptions = useTabOptions();
  const [accountOpen, setAccountOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const webSafeInsets = Platform.OS === 'web' ? { top: 0, bottom: 0, left: 0, right: 0 } : { bottom: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Tab.Navigator
        safeAreaInsets={webSafeInsets}
        screenOptions={({ navigation }) => ({
          ...tabOptions,
          headerTitle: () => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to map" onPress={() => navigation.navigate('Map')}>
              <ESakayLogo compact roleLabel="Passenger" color={Colors.onDark} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton label="Boarding notices" icon="notifications-outline" expanded={noticesOpen}
                onPress={() => { setAccountOpen(false); setNoticesOpen(value => !value); }} />
              <HeaderButton label="Open account menu" icon="person-outline" expanded={accountOpen}
                onPress={() => { setNoticesOpen(false); setAccountOpen(value => !value); }} />
            </View>
          ),
        })}
      >
        <Tab.Screen
          name="Map"
          component={PassengerHomeScreen}
          options={{
            title: 'Map',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'location' : 'location-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="Fares"
          component={FareScreen}
          options={{
            title: 'Fare',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'ticket' : 'ticket-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="Safety"
          component={SafetyScreen}
          options={{
            title: 'Safety',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreScreen}
          options={{
            title: 'More',
            tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={21} color={color} />,
          }}
        />
      </Tab.Navigator>
      <ServiceAccountMenu
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onProfile={() => stackNavigation.navigate('PassengerProfile')}
        onAbout={() => stackNavigation.navigate('PassengerAbout')}
      />
      <PassengerNotices
        open={noticesOpen}
        onClose={() => setNoticesOpen(false)}
        onGuide={() => stackNavigation.navigate('PassengerTabs', { screen: 'Map', params: { showStopGuide: Date.now() } })}
      />
    </View>
  );
};

const DriverTabs = ({ navigation: stackNavigation }: any) => {
  const tabOptions = useTabOptions();
  const [accountOpen, setAccountOpen] = useState(false);
  const webSafeInsets = Platform.OS === 'web' ? { top: 0, bottom: 0, left: 0, right: 0 } : { bottom: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Tab.Navigator
        safeAreaInsets={webSafeInsets}
        screenOptions={({ navigation }) => ({
          ...tabOptions,
          headerTitle: () => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to dashboard" onPress={() => navigation.navigate('Dashboard')}>
              <ESakayLogo compact roleLabel="Driver" color={Colors.onDark} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton label="Open account menu" icon="person-outline" expanded={accountOpen} onPress={() => setAccountOpen(value => !value)} />
            </View>
          ),
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DriverDashboardScreen}
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={20} color={color} />,
          }}
        />
        <Tab.Screen
          name="Alerts"
          component={NotificationsScreen}
          options={{
            title: 'Alerts',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="Records"
          component={DriverRecordsScreen}
          options={{
            title: 'Records',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={21} color={color} />,
          }}
        />
      </Tab.Navigator>
      <ServiceAccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} onProfile={() => stackNavigation.navigate('DriverProfile')} />
      {!accountOpen && <RouteWarningBanner onOpen={() => stackNavigation.navigate('DriverTabs', { screen: 'Alerts' })} />}
    </View>
  );
};

const stackScreenOptions = {
  headerStyle: { backgroundColor: Colors.midnight },
  headerTintColor: Colors.onDark,
  statusBarStyle: 'light' as const,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 18, color: Colors.onDark },
};

const PassengerStack = () => (
  <PassengerJourneyProvider>
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="PassengerTabs" component={PassengerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="PassengerProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="PassengerDirectory" component={DirectoryScreen} options={{ title: 'Route directory' }} />
      <Stack.Screen name="PassengerAbout" component={AboutScreen} options={{ title: 'About eSAKAY' }} />
      <Stack.Screen name="PassengerWeather" component={WeatherScreen} options={{ title: 'Makati weather' }} />
      <Stack.Screen name="PassengerAssistant" component={HeroBotScreen} options={{ title: 'Commuter assistant' }} />
    </Stack.Navigator>
  </PassengerJourneyProvider>
);

const DriverStack = () => (
  <RouteWarningsProvider driverOnly>
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DriverTabs" component={DriverTabs} options={{ headerShown: false }} />
      <Stack.Screen name="DriverProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  </RouteWarningsProvider>
);

function AdminHeaderActions({
  onAlerts,
  onProfile,
  alertCount,
  activePanel,
}: {
  onAlerts: () => void;
  onProfile: () => void;
  alertCount: number;
  activePanel: AdminPanel;
}) {
  return <View style={styles.headerActions}>
    <HeaderButton label={`Violation alerts${alertCount ? `, ${alertCount} recent` : ''}`} icon="notifications-outline"
      expanded={activePanel === 'alerts'} count={alertCount} onPress={onAlerts} />
    <HeaderButton label="Open supervisor profile" icon="person-outline" expanded={activePanel === 'profile'} onPress={onProfile} />
  </View>;
}

const AdminTabs = ({ navigation: stackNavigation }: any) => {
  const tabOptions = useTabOptions();
  const { warnings } = useRouteWarnings();
  const recentRouteWarnings = warnings.filter(warning => Date.now() - Date.parse(warning.created_at) <= 86400000).length;
  const [alertCount, setAlertCount] = useState(0);
  const [notice, setNotice] = useState('');
  const [activePanel, setActivePanel] = useState<AdminPanel>(null);
  const previousCount = useRef<number | null>(null);
  const loadAlertCount = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let operations;
    try { operations = await loadAdminOperations(); }
    catch { setNotice('Alert count unavailable.'); return; }
    if (!operations.speedEvents || !operations.tripViolations) { setNotice('Alert count unavailable.'); return; }
    const total = operations.speedEvents.filter(event => event.created_at >= since).length
      + operations.tripViolations.filter(event => event.created_at >= since && event.status !== 'dismissed').length;
    if (previousCount.current !== null && total > previousCount.current)
      setNotice(`${total - previousCount.current} new driver violation${total - previousCount.current === 1 ? '' : 's'} recorded`);
    previousCount.current = total;
    setAlertCount(total);
  }, []);
  useEffect(() => {
    void loadAlertCount();
    const timer = setInterval(() => {
      void loadAlertCount();
    }, 15000);
    const channel = supabase
      .channel('admin-header-violations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'speed_events' }, () => {
        void loadAlertCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_violations' }, () => {
        void loadAlertCount();
      })
      .subscribe();
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadAlertCount]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const webSafeInsets = Platform.OS === 'web' ? { top: 0, bottom: 0, left: 0, right: 0 } : { bottom: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Tab.Navigator
        safeAreaInsets={webSafeInsets}
        screenOptions={({ navigation }) => ({
          ...tabOptions,
          headerRight: () => (
            <AdminHeaderActions
              alertCount={alertCount + recentRouteWarnings}
              activePanel={activePanel}
              onAlerts={() => setActivePanel((open) => (open === 'alerts' ? null : 'alerts'))}
              onProfile={() => setActivePanel((open) => (open === 'profile' ? null : 'profile'))}
            />
          ),
          headerTitle: () => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to Fleet" onPress={() => navigation.navigate('Fleet')}>
              <ESakayLogo compact roleLabel="Supervisor" color={Colors.onDark} />
            </TouchableOpacity>
          ),
        })}
      >
        <Tab.Screen
          name="Fleet"
          component={SupervisorDashboardScreen}
          options={{
            title: 'Fleet',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'location' : 'location-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="Drivers"
          component={AdminDriversScreen}
          options={{
            title: 'Drivers',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="Units"
          component={AdminUnitsScreen}
          options={{
            title: 'Units',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'bus' : 'bus-outline'} size={21} color={color} />,
          }}
        />
        <Tab.Screen
          name="Reports"
          component={AdminReportsScreen}
          options={{
            title: 'Reports',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={21} color={color} />,
          }}
        />
      </Tab.Navigator>
      {!!notice && !activePanel && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${notice}. Open violation alerts`}
          onPress={() => {
            setNotice('');
            setActivePanel('alerts');
          }}
          style={{
            position: 'absolute',
            top: 68,
            right: 16,
            maxWidth: 320,
            zIndex: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            backgroundColor: Colors.primaryRed,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            elevation: 5,
          }}
        >
          <Ionicons name="alert-circle" size={19} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', flex: 1 }}>{notice}</Text>
        </TouchableOpacity>
      )}
      {!activePanel && <RouteWarningBanner onOpen={() => setActivePanel('alerts')} />}
      <AdminHeaderPopover panel={activePanel} onClose={() => setActivePanel(null)} onManageProfile={() => stackNavigation.navigate('AdminProfile')} />
    </View>
  );
};

const AdminStack = () => (
  <RouteWarningsProvider>
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} options={{ headerShown: false }} />
      <Stack.Screen name="AdminProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Stack.Navigator>
  </RouteWarningsProvider>
);

export const AppNavigator = () => {
  const { user, role, status, isAdmin, loading, authError, refreshProfile, signOut } = useAuth();

  if (authError) {
    return (
      <AuthPage title="Check your account">
        <AuthNotice message={authError} error />
        <AuthAction label="Retry" onPress={() => { void refreshProfile(); }} />
        <AuthLink label="Return to sign in" onPress={() => { void signOut(); }} />
      </AuthPage>
    );
  }

  if (loading) {
    return <ScreenSkeleton preset="dashboard" />;
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
        <Stack.Screen navigationKey={user.id} name="AdminApp" component={AdminStack} />
      ) : role === 'driver' ? (
        <Stack.Screen navigationKey={user.id} name="DriverApp" component={DriverStack} />
      ) : (
        <Stack.Screen name="PassengerApp" component={PassengerStack} />
      )}
    </Stack.Navigator>
  );
};
