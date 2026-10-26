import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, FlatList, ActivityIndicator, Keyboard
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import {
  MAKATI_OFFICIAL_TERMINALS,
  MAKATI_PRIMARY_ROUTE,
  MAKATI_ROUTE_2_COMING_SOON,
  OFFICIAL_TWO_ROUTES,
} from '../../services/offlineTransitService';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';

type Route = {
  id: string;
  name: string;
  description: string;
  color_code: string;
  operating_hours: string;
  base_fare: number;
  per_km_rate: number;
  is_coming_soon?: boolean;
};

type Terminal = {
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
  regular_fare?: number;
  student_fare?: number;
  elderly_fare?: number;
  disabled_fare?: number;
  routes?: Route;
};

type PassengerType = 'regular' | 'student' | 'elderly' | 'disabled';

const normalizeConfiguredRouteFare = (route: Route): Route => (
  route.id === MAKATI_PRIMARY_ROUTE.id
    ? { ...route, operating_hours: ESAKAY_OPERATIONS.serviceHours, base_fare: ESAKAY_OPERATIONS.regularBaseFare, per_km_rate: ESAKAY_OPERATIONS.additionalFarePerKm }
    : route
);

export default function DirectoryScreen({ driverMode = false }: { driverMode?: boolean }) {
  const { t } = useTranslation();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'browse' | 'planner'>('browse');
  const [passengerType, setPassengerType] = useState<PassengerType>('regular');

  // Browse Routes state
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

  // Trip Planner state
  const [fromSelection, setFromSelection] = useState<string | 'gps'>('gps'); // 'gps' or terminal ID
  const [toSelection, setToSelection] = useState<string | null>(null); // terminal ID
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'from' | 'to'>('from');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: routesData } = await supabase.from('routes').select('*').order('is_coming_soon', { ascending: true });
        const { data: terminalsData } = await supabase.from('terminals').select('*, routes(*)').order('sequence_order');

        const fallbackRoute: Route = { ...MAKATI_PRIMARY_ROUTE, is_coming_soon: false };
        const fallbackRoutes: Route[] = OFFICIAL_TWO_ROUTES;
        const fallbackTerminals: Terminal[] = MAKATI_OFFICIAL_TERMINALS.map((terminal) => ({
          ...terminal,
          routes: fallbackRoute,
        }));

        // Ensure Route 1 (Active) and Route 2 (Coming Soon) are both present
        const resolvedRoutes: Route[] = routesData?.length
          ? routesData.map(normalizeConfiguredRouteFare)
          : fallbackRoutes;
        setRoutes([...resolvedRoutes.filter((route) => !route.is_coming_soon && route.id !== MAKATI_ROUTE_2_COMING_SOON.id && !/ayala\s*[-–]?\s*circuit/i.test(route.name)), MAKATI_ROUTE_2_COMING_SOON]);
        setTerminals(terminalsData?.length
          ? terminalsData
              .filter((terminal: Terminal) => terminal.route_id === MAKATI_PRIMARY_ROUTE.id)
              .map((terminal: Terminal) => ({
                ...terminal,
                routes: terminal.routes ? normalizeConfiguredRouteFare(terminal.routes) : fallbackRoute,
              }))
          : fallbackTerminals);
      } catch (err) {
        console.error('Error fetching directory data:', err);
        const fallbackRoute: Route = { ...MAKATI_PRIMARY_ROUTE, is_coming_soon: false };
        setRoutes(OFFICIAL_TWO_ROUTES);
        setTerminals(MAKATI_OFFICIAL_TERMINALS.map((terminal) => ({ ...terminal, routes: fallbackRoute })));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getFromText = () => {
    if (fromSelection === 'gps') return t('directory.currentLocation');
    return terminals.find((terminal) => terminal.id === fromSelection)?.name || t('directory.selectOrigin');
  };

  const getToText = () =>
    terminals.find((terminal) => terminal.id === toSelection)?.name || t('directory.selectDestination');

  const getRouteTerminals = (routeId: string) =>
    terminals.filter((terminal) => terminal.route_id === routeId);

  // Picker Modal list rendering
  const handleOpenPicker = (type: 'from' | 'to') => {
    setModalType(type);
    setSearchQuery('');
    setModalVisible(true);
  };

  const selectItem = (id: string | 'gps') => {
    if (modalType === 'from') {
      setFromSelection(id);
    } else {
      setToSelection(id === 'gps' ? null : id);
    }
    setModalVisible(false);
  };

  // Filter terminals for search inside picker
  const filteredTerminals = terminals.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.routes?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.subtleGray} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      {!driverMode && <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'browse' && styles.tabButtonActive]}
          onPress={() => setActiveTab('browse')}
        >
          <Ionicons name="list" size={18} color={activeTab === 'browse' ? Colors.white : Colors.darkText} />
          <Text style={[styles.tabButtonText, activeTab === 'browse' && styles.tabButtonTextActive]}>{t('directory.browseRoutes')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'planner' && styles.tabButtonActive]}
          onPress={() => setActiveTab('planner')}
        >
          <Ionicons name="navigate" size={18} color={activeTab === 'planner' ? Colors.white : Colors.darkText} />
          <Text style={[styles.tabButtonText, activeTab === 'planner' && styles.tabButtonTextActive]}>{t('directory.tripPlanner')}</Text>
        </TouchableOpacity>
      </View>}

      {driverMode || activeTab === 'browse' ? (
        /* ─── BROWSE ROUTES TAB ─── */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Routes & fares</Text>
          <Text style={styles.sectionDesc}>Service details and fares for available routes.</Text>

          {routes.map(route => {
            const isComingSoon = Boolean(route.is_coming_soon || route.id === MAKATI_ROUTE_2_COMING_SOON.id);
            const isExpanded = expandedRoute === route.id;
            const routeTerminals = getRouteTerminals(route.id);

            return (
              <View key={route.id} style={styles.routeCard}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.routeHeader}
                  disabled={isComingSoon}
                  onPress={() => {
                    setExpandedRoute(isExpanded ? null : route.id);
                  }}
                >
                  <View style={styles.routeIcon}><Ionicons name="bus-outline" size={21} color={Colors.subtleGray} /></View>
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeName}>{route.name}</Text>
                    <View style={styles.routeMeta}>
                      {isComingSoon ? (
                        <View style={styles.metaBadge}>
                          <Text style={styles.metaText}>Coming soon</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.metaBadge}>
                            <Ionicons name="time-outline" size={12} color="#666" />
                            <Text style={styles.metaText}>{route.operating_hours}</Text>
                          </View>
                          <View style={[styles.metaBadge, { backgroundColor: '#FFEBEE' }]}>
                            <Text style={styles.fareText}>₱15 regular · ₱12 discounted</Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                  <Ionicons
                    name={isComingSoon ? "time-outline" : isExpanded ? "chevron-up" : "chevron-down"}
                    size={22}
                    color={Colors.subtleGray}
                  />
                </TouchableOpacity>

                {!isComingSoon && isExpanded && (
                  <View style={styles.expandedContent}>
                    <Text style={styles.routeDesc}>{route.description}</Text>
                    <Text style={styles.routeDesc}>Landmarks are listed in the supplied order. Boarding positions and road access are under review.</Text>

                    <Text style={styles.stopsHeader}>{t('directory.sequenceOfStops')}</Text>
                    {routeTerminals.map((stop, idx) => (
                      <View key={stop.id} style={styles.stopRow}>
                        <View style={styles.stopTimeline}>
                          <View style={[styles.stopNode, { borderColor: route.color_code }]} />
                          {idx !== routeTerminals.length - 1 && (
                            <View style={[styles.stopLine, { backgroundColor: route.color_code }]} />
                          )}
                        </View>
                        <Text style={[styles.stopName, { flex: 1 }]}>{stop.name}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.subtleGray }}>Point unverified</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        /* ─── TRIP PLANNER TAB ─── */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>{t('directory.planYourTrip')}</Text>
          <Text style={styles.sectionDesc}>{t('directory.planTripDesc')}</Text>
          <View style={{ backgroundColor: '#FFF8E7', borderColor: '#F3D58A', borderWidth: 1, borderRadius: 8, padding: 11, marginBottom: 12 }}>
            <Text style={{ color: '#684B05', fontSize: 12, lineHeight: 17 }}>
              Operator-reported fare: ₱15 regular or ₱12 for students, PWDs, and seniors for the first 4 km, then ₱1 for each additional km for everyone. Trip estimates are paused until road distances and the posted fare matrix are verified.
            </Text>
          </View>

          {/* Passenger Type Selector */}
          <View style={styles.passengerTypeCard}>
            <Text style={styles.passengerTypeLabel}>{t('directory.passengerType')}</Text>
            <View style={styles.passengerTypeButtons}>
              {(['regular', 'student', 'elderly', 'disabled'] as PassengerType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.passengerTypeButton,
                    passengerType === type && styles.passengerTypeButtonActive
                  ]}
                  onPress={() => setPassengerType(type)}
                >
                  <Text style={[
                    styles.passengerTypeButtonText,
                    passengerType === type && styles.passengerTypeButtonTextActive
                  ]}>
                    {t(`directory.${type}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.plannerCard}>
            {/* Origin Select */}
            <Text style={styles.pickerLabel}>{t('directory.from')}</Text>
            <TouchableOpacity
              style={styles.pickerSelector}
              onPress={() => handleOpenPicker('from')}
            >
              <Ionicons
                name={fromSelection === 'gps' ? "location" : "bus"}
                size={18}
                color={fromSelection === 'gps' ? Colors.ink : Colors.subtleGray}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.pickerSelectorText, fromSelection === 'gps' && { color: Colors.ink, fontWeight: '700' }]}>
                {getFromText()}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            <View style={styles.plannerConnector}>
              <View style={styles.connectorDot} />
              <View style={styles.connectorLine} />
              <View style={[styles.connectorDot, { backgroundColor: Colors.ink }]} />
            </View>

            {/* Destination Select */}
            <Text style={styles.pickerLabel}>{t('directory.toDestination')}</Text>
            <TouchableOpacity
              style={styles.pickerSelector}
              onPress={() => handleOpenPicker('to')}
            >
              <Ionicons name="flag" size={18} color={Colors.subtleGray} style={{ marginRight: 8 }} />
              <Text style={[styles.pickerSelectorText, toSelection && { color: Colors.darkText, fontWeight: '700' }]}>
                {getToText()}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>

          {toSelection && (
            <View style={styles.errorCard}>
              <Ionicons name="map-outline" size={24} color={Colors.subtleGray} style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>Road-following trip distance, travel time, and fare estimates are unavailable while the boarding points and route are being checked.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* CUSTOM DROPDOWN PICKER MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalType === 'from' ? t('directory.selectDeparturePoint') : t('directory.selectDestinationPoint')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={Colors.darkText} />
              </TouchableOpacity>
            </View>

            {/* Search Input inside Picker */}
            <View style={styles.modalSearchWrapper}>
              <Ionicons name="search" size={20} color={Colors.subtleGray} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder={t('directory.searchTerminals')}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#999"
              />
            </View>

            <FlatList
              data={filteredTerminals}
              keyExtractor={item => item.id}
              ListHeaderComponent={
                modalType === 'from' ? (
                  <TouchableOpacity
                    style={styles.gpsOption}
                    onPress={() => selectItem('gps')}
                  >
                    <View style={styles.gpsOptionIconBg}>
                      <Ionicons name="location" size={20} color={Colors.white} />
                    </View>
                    <View style={{ marginLeft: 14 }}>
                      <Text style={styles.gpsOptionTitle}>{t('directory.currentGpsLocation')}</Text>
                      <Text style={styles.gpsOptionSub}>{t('directory.autoLocateNearest')}</Text>
                    </View>
                  </TouchableOpacity>
                ) : undefined
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => selectItem(item.id)}
                >
                  <View style={[styles.modalItemColorBar, { backgroundColor: item.routes?.color_code || Colors.primaryRed }]} />
                  <View style={{ flex: 1, paddingLeft: 12 }}>
                    <Text style={styles.modalItemName}>{item.name}</Text>
                    <Text style={styles.modalItemSub}>{item.routes?.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CCC" />
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.canvas
  },
  container: {
    flex: 1,
    backgroundColor: Colors.canvas
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: 8,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.ink,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  tabButtonTextActive: {
    color: Colors.white,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#53666A',
    lineHeight: 18,
    marginBottom: 20,
  },

  // ── Route Directory Styling ──
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  routeIcon: { width: 42, height: 42, borderRadius: 6, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  routeInfo: {
    flex: 1,
  },
  routeName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginBottom: 6,
  },
  routeMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: '100%',
    gap: 8,
  },
  metaBadge: {
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  fareText: {
    fontSize: 12,
    color: Colors.ink,
    fontWeight: 'bold',
  },
  expandedContent: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#F0E6D8',
    backgroundColor: '#FAF5EE',
  },
  routeDesc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    marginBottom: 16,
  },
  stopsHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  stopTimeline: {
    width: 24,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
  },
  stopNode: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.white,
    borderWidth: 2.5,
    zIndex: 2,
  },
  stopLine: {
    width: 2,
    position: 'absolute',
    top: 18,
    bottom: -18,
    zIndex: 1,
  },
  stopName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.darkText,
    marginLeft: 8,
  },

  // ── Trip Planner Styling ──
  plannerCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.subtleGray,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pickerSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  pickerSelectorText: {
    fontSize: 14,
    color: '#888',
  },
  plannerConnector: {
    height: 40,
    paddingLeft: 20,
    marginVertical: 4,
    justifyContent: 'center',
  },
  connectorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.subtleGray,
  },
  connectorLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E8DFD3',
    marginLeft: 2,
    marginVertical: 2,
  },

  // ── Results Display ──
  errorCard: {
    flexDirection: 'row',
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.ink,
    fontWeight: 'bold',
    flex: 1,
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  routeBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  resultRouteName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0E6D8',
    marginVertical: 16,
  },
  boardingSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boardingDetails: {
    marginLeft: 12,
    flex: 1,
  },
  boardingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryYellow,
    letterSpacing: 0.8,
  },
  boardingTerminalName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginTop: 2,
  },
  boardingDistance: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  metricItem: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.ink,
  },
  metricSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  guidanceFlow: {
    marginTop: 20,
    backgroundColor: Colors.offWhite,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guidanceStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guidanceText: {
    fontSize: 13,
    color: Colors.darkText,
  },
  guidanceConnector: {
    width: 1.5,
    height: 12,
    backgroundColor: '#DDD',
    marginLeft: 7,
    marginVertical: 2,
  },

  // ── Custom Modal Picker ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '75%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.darkText,
  },
  gpsOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#FFF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: 16,
  },
  gpsOptionIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsOptionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.ink,
  },
  gpsOptionSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F0E6D8',
  },
  modalItemColorBar: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  modalItemSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },

  // ── Passenger Type Selector ──
  passengerTypeCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passengerTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.subtleGray,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  passengerTypeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  passengerTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.offWhite,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  passengerTypeButtonActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  passengerTypeButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.subtleGray,
  },
  passengerTypeButtonTextActive: {
    color: Colors.white,
  },
});
