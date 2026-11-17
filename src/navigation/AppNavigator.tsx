import { loadAdminOperations } from '../services/adminOperationsService';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenSkeleton } from '../components/AppUI';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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

const commonScreenOptions = {
  headerTitleAlign: 'left' as const,
  headerStatusBarHeight: Platform.OS === 'web' ? 0 : undefined,
  tabBarActiveTintColor: Colors.brandGreen,
  tabBarInactiveTintColor: Colors.tabInactive,
  tabBarStyle: {
    backgroundColor: Colors.paper,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
    paddingBottom: 8,
    height: 64,
    elevation: 0,
  },
  tabBarItemStyle: {
    paddingVertical: 2,
    height: 50,
  },
  tabBarLabelStyle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600' as const,
    marginTop: 2,
    paddingBottom: 2,
  },
  tabBarIconStyle: { marginTop: 0 },
  headerStyle: {
    backgroundColor: Colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerShadowVisible: false,
  headerTintColor: Colors.ink,
  headerTitleStyle: {
    fontWeight: '700' as const,
    fontSize: 18,
    color: Colors.ink,
  },
};

function ServiceHeaderActions({
  onAccount,
  onAlerts,
  alertsLabel = 'Open driver alerts',
  open,
}: {
  onAccount: () => void;
  onAlerts?: () => void;
  alertsLabel?: string;
  open: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 16 }}>
      {onAlerts && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={alertsLabel}
          onPress={onAlerts}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: Colors.paper,
            borderWidth: 1,
            borderColor: Colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="notifications-outline" size={19} color={Colors.ink} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open account menu"
        accessibilityState={{ expanded: open }}
        onPress={onAccount}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: open ? Colors.paleGreen : Colors.paper,
          borderWidth: 1,
          borderColor: open ? Colors.brandGreen : Colors.border,
        }}
      >
        <Ionicons name="person-outline" size={19} color={open ? Colors.brandGreen : Colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

const PassengerTabs = ({ navigation: stackNavigation }: any) => {
  const insets = useSafeAreaInsets();
  const [accountOpen, setAccountOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const tabBottom = Platform.OS === 'web' ? 8 : Math.max(10, insets.bottom);
  const tabHeight = Platform.OS === 'web' ? 64 : 56 + tabBottom;
  const webSafeInsets = Platform.OS === 'web' ? { top: 0, bottom: 0, left: 0, right: 0 } : { bottom: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Tab.Navigator
        safeAreaInsets={webSafeInsets}
        screenOptions={({ navigation, route }) => ({
          ...commonScreenOptions,
          tabBarStyle: { ...commonScreenOptions.tabBarStyle, paddingBottom: tabBottom, height: tabHeight },
          headerTitle: () => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to map" onPress={() => navigation.navigate('Map')}>
              <ESakayLogo compact color={route.name === 'Map' ? Colors.ink : Colors.brandGreen} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <ServiceHeaderActions
              open={accountOpen}
              onAccount={() => {
                setNoticesOpen(false);
                setAccountOpen((value) => !value);
              }}
            />
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
  const insets = useSafeAreaInsets();
  const [accountOpen, setAccountOpen] = useState(false);
  const tabBottom = Platform.OS === 'web' ? 8 : Math.max(10, insets.bottom);
  const tabHeight = Platform.OS === 'web' ? 64 : 56 + tabBottom;
  const webSafeInsets = Platform.OS === 'web' ? { top: 0, bottom: 0, left: 0, right: 0 } : { bottom: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Tab.Navigator
        safeAreaInsets={webSafeInsets}
        screenOptions={({ navigation }) => ({
          ...commonScreenOptions,
          tabBarStyle: { ...commonScreenOptions.tabBarStyle, paddingBottom: tabBottom, height: tabHeight },
          headerTitle: () => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to dashboard" onPress={() => navigation.navigate('Dashboard')}>
              <ESakayLogo compact roleLabel="Driver" roleSeparator="|" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <ServiceHeaderActions
              open={accountOpen}
              onAccount={() => setAccountOpen((value) => !value)}
            />
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
    </View>
  );
};

const stackScreenOptions = {
  headerStyle: { backgroundColor: Colors.paper },
  headerTintColor: Colors.ink,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 18, color: Colors.ink },
};

const PassengerStack = () => (
  <PassengerJourneyProvider>
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="PassengerTabs" component={PassengerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="PassengerProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="PassengerDirectory" component={DirectoryScreen} options={{ title: 'Routes & trip planner' }} />
      <Stack.Screen name="PassengerAbout" component={AboutScreen} options={{ title: 'About ejeephero' }} />
      <Stack.Screen name="PassengerWeather" component={WeatherScreen} options={{ title: 'Makati weather' }} />
      <Stack.Screen name="PassengerAssistant" component={HeroBotScreen} options={{ title: 'ejeepherobot' }} />
    </Stack.Navigator>
  </PassengerJourneyProvider>
);

const DriverStack = () => (
  <Stack.Navigator screenOptions={stackScreenOptions}>
    <Stack.Screen name="DriverTabs" component={DriverTabs} options={{ headerShown: false }} />
    <Stack.Screen name="DriverProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
  </Stack.Navigator>
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
  const { width } = useWindowDimensions();
  const compact = width < 520;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 10, marginRight: 16 }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Violation alerts${alertCount ? `, ${alertCount} recent` : ''}`}
        accessibilityState={{ expanded: activePanel === 'alerts' }}
        onPress={onAlerts}
        style={{
          width: 38,
          height: 38,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 19,
          backgroundColor: activePanel === 'alerts' ? Colors.paleGreen : Colors.paper,
          borderWidth: 1,
          borderColor: activePanel === 'alerts' ? Colors.brandGreen : Colors.border,
        }}
      >
        <Ionicons name="notifications-outline" size={18} color={activePanel === 'alerts' ? Colors.brandGreen : Colors.ink} />
        {alertCount > 0 && (
          <View
            style={{
              position: 'absolute',
              right: -2,
              top: -2,
              minWidth: 17,
              height: 17,
              borderRadius: 9,
              paddingHorizontal: 3,
              backgroundColor: Colors.primaryRed,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>{alertCount > 99 ? '99+' : alertCount}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open supervisor profile"
        accessibilityState={{ expanded: activePanel === 'profile' }}
        onPress={onProfile}
        style={{
          width: 38,
          height: 38,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 19,
          backgroundColor: activePanel === 'profile' ? Colors.paleGreen : Colors.paper,
          borderWidth: 1,
          borderColor: activePanel === 'profile' ? Colors.brandGreen : Colors.border,
        }}
      >
        <Ionicons name="person-outline" size={18} color={activePanel === 'profile' ? Colors.brandGreen : Colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

const AdminTabs = ({ navigation: stackNavigation }: any) => {
  const insets = useSafeAreaInsets();
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
  const tabBottom = Platform.OS === 'web' ? 8 : Math.max(10, insets.bottom);
  const tabHeight = Platform.OS === 'web' ? 64 : 56 + tabBottom;
  const webSafeInsets = Platform.OS === 'web' ? { top: 0, bottom: 0, left: 0, right: 0 } : { bottom: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Tab.Navigator
        safeAreaInsets={webSafeInsets}
        screenOptions={({ navigation }) => ({
          ...commonScreenOptions,
          tabBarStyle: { ...commonScreenOptions.tabBarStyle, paddingBottom: tabBottom, height: tabHeight },
          headerRight: () => (
            <AdminHeaderActions
              alertCount={alertCount}
              activePanel={activePanel}
              onAlerts={() => setActivePanel((open) => (open === 'alerts' ? null : 'alerts'))}
              onProfile={() => setActivePanel((open) => (open === 'profile' ? null : 'profile'))}
            />
          ),
          headerTitle: () => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to Fleet" onPress={() => navigation.navigate('Fleet')}>
              <ESakayLogo compact roleLabel="Supervisor" roleSeparator="/" />
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
      <AdminHeaderPopover panel={activePanel} onClose={() => setActivePanel(null)} onManageProfile={() => stackNavigation.navigate('AdminProfile')} />
    </View>
  );
};

const AdminStack = () => (
  <Stack.Navigator screenOptions={stackScreenOptions}>
    <Stack.Screen name="AdminTabs" component={AdminTabs} options={{ headerShown: false }} />
    <Stack.Screen name="AdminProfile" component={ProfileScreen} options={{ title: 'Profile' }} />
  </Stack.Navigator>
);

export const AppNavigator = () => {
  const { user, role, status, isAdmin, loading, authError, refreshProfile, signOut } = useAuth();

  if (authError)
    return (
      <View style={{ flex: 1, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: Colors.ink, fontSize: 24, fontWeight: '700' }}>
            Check your account
          </Text>
          <Text accessibilityRole="alert" style={{ color: Colors.ink, fontSize: 16, lineHeight: 24 }}>
            {authError}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              void refreshProfile();
            }}
            style={{ minHeight: 50, padding: 14, borderRadius: 12, backgroundColor: Colors.brandGreen, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              void signOut();
            }}
            style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ color: Colors.brandGreen, fontWeight: '700', fontSize: 16 }}>Return to sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

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
        <Stack.Screen name="AdminApp" component={AdminStack} />
      ) : role === 'driver' ? (
        <Stack.Screen name="DriverApp" component={DriverStack} />
      ) : (
        <Stack.Screen name="PassengerApp" component={PassengerStack} />
      )}
    </Stack.Navigator>
  );
};
