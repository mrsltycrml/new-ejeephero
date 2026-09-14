import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, FlatList, ActivityIndicator, Image
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '../../contexts/LocationContext';
import { changeLanguage } from '../../locales/i18n';
import {
  offlineTransit,
  RouteData,
  TerminalData,
  MAKATI_PRIMARY_ROUTE,
  MAKATI_OFFICIAL_TERMINALS,
} from '../../services/offlineTransitService';

export type PassengerTier = 'regular' | 'student' | 'senior' | 'pwd';

export default function DirectoryScreen() {
  const { t, i18n } = useTranslation();
  const { location } = useLocation();

  const [routes, setRoutes] = useState<RouteData[]>([MAKATI_PRIMARY_ROUTE]);
  const [terminals, setTerminals] = useState<TerminalData[]>(MAKATI_OFFICIAL_TERMINALS);
  const [loading, setLoading] = useState(true);

  // Tabs: 'browse' | 'calculator' | 'matrix' | 'esakay'
  const [activeTab, setActiveTab] = useState<'browse' | 'calculator' | 'matrix' | 'esakay'>('calculator');
  const [expandedRoute, setExpandedRoute] = useState<string | null>(MAKATI_PRIMARY_ROUTE.id);

  // SO3 Fare Calculator State
  const [passengerTier, setPassengerTier] = useState<PassengerTier>('regular');
  const [originTerminalId, setOriginTerminalId] = useState<string | 'gps'>('gps');
  const [destTerminalId, setDestTerminalId] = useState<string>(MAKATI_OFFICIAL_TERMINALS[MAKATI_OFFICIAL_TERMINALS.length - 1].id);

  // Picker Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'origin' | 'dest'>('origin');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── 1. Load Data (Cache-First) ───
  useEffect(() => {
    const initData = async () => {
      try {
        const data = await offlineTransit.getTransitData();
        setRoutes(data.routes);
        setTerminals(data.terminals);
      } catch (e) {
        console.warn('Directory data error, using static fallback:', e);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // ─── 2. SO3: Haversine Formula Distance Engine ───
  const computeHaversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  };

  // ─── 3. SO3: Rule-Based LTFRB Fare Calculation Engine ───
  // LTFRB 2023 Non-Aircon Modernized Jeepney Fare Structure:
  // First 4.0 km Base Fare: ₱14.00
  // Succeeding Rate: ₱1.50 per succeeding km
  // Mandatory 20% statutory discount for Student, Senior Citizen, PWD:
  // Base: ₱11.25, succeeding: ₱1.20/km
  const calculateFareBreakdown = () => {
    let originLat = 0;
    let originLon = 0;
    let originName = '';
    let isCurrentGPS = false;

    if (originTerminalId === 'gps') {
      if (!location) {
        return { error: 'GPS location is acquiring or unavailable. Please select an origin stop from the list.' };
      }
      originLat = location.coords.latitude;
      originLon = location.coords.longitude;
      originName = 'Current GPS Location';
      isCurrentGPS = true;
    } else {
      const term = terminals.find(t => t.id === originTerminalId);
      if (!term) return null;
      originLat = term.latitude;
      originLon = term.longitude;
      originName = term.name;
    }

    const dest = terminals.find(t => t.id === destTerminalId);
    if (!dest) return null;

    // Direct Haversine distance
    const directKm = computeHaversineKm(originLat, originLon, dest.latitude, dest.longitude);
    // Apply road network winding factor (1.35x)
    const roadDistanceKm = Number((directKm * 1.35).toFixed(2));

    const BASE_KM = 4.0;
    const BASE_FARE_REGULAR = 14.00;
    const PER_KM_REGULAR = 1.50;

    const succeedingKm = Math.max(0, roadDistanceKm - BASE_KM);
    const regularGrossFare = BASE_FARE_REGULAR + (succeedingKm * PER_KM_REGULAR);

    const isDiscounted = passengerTier !== 'regular';
    const discountFactor = isDiscounted ? 0.20 : 0.00;
    const discountAmount = Number((regularGrossFare * discountFactor).toFixed(2));
    const netFare = Number((regularGrossFare - discountAmount).toFixed(2));

    return {
      isCurrentGPS,
      originName,
      destName: dest.name,
      straightDistanceKm: directKm,
      roadDistanceKm,
      baseFare: BASE_FARE_REGULAR,
      baseKm: BASE_KM,
      succeedingKm: Number(succeedingKm.toFixed(2)),
      perKmRate: PER_KM_REGULAR,
      grossFare: Number(regularGrossFare.toFixed(2)),
      isDiscounted,
      discountAmount,
      netFare: Math.max(isDiscounted ? 11.25 : 14.00, netFare),
      passengerTier,
    };
  };

  const fareResult = calculateFareBreakdown();

  // Quick Language Toggle
  const toggleLanguage = async () => {
    const newLang = i18n.language === 'en' ? 'fil' : 'en';
    await changeLanguage(newLang);
  };

  const getTierLabel = (tier: PassengerTier) => {
    const isTagalog = i18n.language === 'fil';
    switch (tier) {
      case 'student': return isTagalog ? 'Estudyante (20% Off)' : 'Student (20% Off)';
      case 'senior': return isTagalog ? 'Senior Citizen (20% Off)' : 'Senior (20% Off)';
      case 'pwd': return isTagalog ? 'PWD (20% Off)' : 'PWD (20% Off)';
      default: return isTagalog ? 'Regular' : 'Regular';
    }
  };

  const handleOpenPicker = (type: 'origin' | 'dest') => {
    setModalType(type);
    setSearchQuery('');
    setModalVisible(true);
  };

  const selectTerminalItem = (id: string | 'gps') => {
    if (modalType === 'origin') {
      setOriginTerminalId(id);
    } else {
      if (id !== 'gps') setDestTerminalId(id);
    }
    setModalVisible(false);
  };

  const filteredTerminals = terminals.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primaryRed} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── HEADER WITH MULTILINGUAL TOGGLE (SO3) ─── */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>Transit Directory</Text>
          <Text style={styles.headerSub}>Makati Modernized E-Jeepney Transit</Text>
        </View>

        {/* Quick Language Switcher Button (English / Tagalog) */}
        <TouchableOpacity style={styles.langToggleBtn} onPress={toggleLanguage}>
          <Ionicons name="globe-outline" size={16} color={Colors.white} />
          <Text style={styles.langToggleText}>
            {i18n.language === 'en' ? 'TAGALOG' : 'ENGLISH'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── NAVIGATION TABS ─── */}
      <View style={styles.navTabs}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'calculator' && styles.tabItemActive]}
          onPress={() => setActiveTab('calculator')}
        >
          <Ionicons
            name="calculator"
            size={16}
            color={activeTab === 'calculator' ? Colors.white : Colors.darkText}
          />
          <Text style={[styles.tabText, activeTab === 'calculator' && styles.tabTextActive]}>
            {i18n.language === 'fil' ? 'Pamasahe' : 'Fare Calc'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'matrix' && styles.tabItemActive]}
          onPress={() => setActiveTab('matrix')}
        >
          <Ionicons
            name="grid"
            size={16}
            color={activeTab === 'matrix' ? Colors.white : Colors.darkText}
          />
          <Text style={[styles.tabText, activeTab === 'matrix' && styles.tabTextActive]}>
            {i18n.language === 'fil' ? 'Talaan' : 'Fare Matrix'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'browse' && styles.tabItemActive]}
          onPress={() => setActiveTab('browse')}
        >
          <Ionicons
            name="git-branch"
            size={16}
            color={activeTab === 'browse' ? Colors.white : Colors.darkText}
          />
          <Text style={[styles.tabText, activeTab === 'browse' && styles.tabTextActive]}>
            {i18n.language === 'fil' ? 'Mga Ruta' : 'Routes'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'esakay' && styles.tabItemActive]}
          onPress={() => setActiveTab('esakay')}
        >
          <Ionicons
            name="flash"
            size={16}
            color={activeTab === 'esakay' ? Colors.white : Colors.darkText}
          />
          <Text style={[styles.tabText, activeTab === 'esakay' && styles.tabTextActive]}>
            e-Sakay
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1: SO3 FARE CALCULATOR WITH STATUTORY BREAKDOWN
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'calculator' && (
          <View>
            <Text style={styles.sectionHeader}>
              {i18n.language === 'fil'
                ? 'Kalkulasyon ng Pamasahe (LTFRB 2023)'
                : 'Dynamic LTFRB Fare Computation'}
            </Text>
            <Text style={styles.sectionSub}>
              {i18n.language === 'fil'
                ? 'Rule-based algorithmic calculation gamit ang Haversine formula at 20% statutory discount.'
                : 'Rule-based computation applying distance increments and 20% mandatory discount tiers.'}
            </Text>

            {/* Passenger Type Tier Selector */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>
                {i18n.language === 'fil' ? 'URI NG PASAHERO (PASSENGER TIER)' : 'SELECT PASSENGER TIER'}
              </Text>
              <View style={styles.tierGrid}>
                {(['regular', 'student', 'senior', 'pwd'] as PassengerTier[]).map(tier => (
                  <TouchableOpacity
                    key={tier}
                    style={[styles.tierButton, passengerTier === tier && styles.tierButtonActive]}
                    onPress={() => setPassengerTier(tier)}
                  >
                    <Text style={[styles.tierButtonText, passengerTier === tier && styles.tierButtonTextActive]}>
                      {getTierLabel(tier)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Route Selection Origin -> Destination */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{i18n.language === 'fil' ? 'SAKAYAN (ORIGIN)' : 'FROM (BOARDING BAY)'}</Text>
              <TouchableOpacity style={styles.selectRow} onPress={() => handleOpenPicker('origin')}>
                <Ionicons
                  name={originTerminalId === 'gps' ? 'navigate' : 'bus'}
                  size={18}
                  color={originTerminalId === 'gps' ? Colors.primaryRed : '#555'}
                />
                <Text style={styles.selectText} numberOfLines={1}>
                  {originTerminalId === 'gps'
                    ? '📍 ' + (i18n.language === 'fil' ? 'Kasalukuyang Lokasyon (GPS)' : 'Current GPS Location')
                    : terminals.find(t => t.id === originTerminalId)?.name}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} />
              </TouchableOpacity>

              <View style={styles.connectorContainer}>
                <View style={styles.connectorDot} />
                <View style={styles.connectorLine} />
                <View style={[styles.connectorDot, { backgroundColor: Colors.primaryRed }]} />
              </View>

              <Text style={styles.cardLabel}>{i18n.language === 'fil' ? 'BABAAN (DESTINATION)' : 'TO (ALIGHTING BAY)'}</Text>
              <TouchableOpacity style={styles.selectRow} onPress={() => handleOpenPicker('dest')}>
                <Ionicons name="flag" size={18} color={Colors.primaryRed} />
                <Text style={styles.selectText} numberOfLines={1}>
                  {terminals.find(t => t.id === destTerminalId)?.name}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} />
              </TouchableOpacity>
            </View>

            {/* Fare Breakdown Result Card (SO3) */}
            {fareResult && ('error' in fareResult ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle" size={22} color={Colors.primaryRed} style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{fareResult.error}</Text>
              </View>
            ) : (
              <View style={styles.breakdownCard}>
                <View style={styles.breakdownHeader}>
                  <View>
                    <Text style={styles.breakdownTitle}>
                      {i18n.language === 'fil' ? 'KABUUANG PAMASAHE' : 'TOTAL COMPUTED FARE'}
                    </Text>
                    <Text style={styles.breakdownTierBadge}>
                      {getTierLabel(fareResult.passengerTier).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.netFareValue}>₱{fareResult.netFare.toFixed(2)}</Text>
                </View>

                <View style={styles.divider} />

                {/* Mathematical Formula Breakdown */}
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownKey}>
                    {i18n.language === 'fil' ? 'Distansya (Haversine + Network)' : 'Distance (Haversine + Network)'}
                  </Text>
                  <Text style={styles.breakdownVal}>{fareResult.roadDistanceKm} km</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownKey}>Base Fare (First 4.0 km)</Text>
                  <Text style={styles.breakdownVal}>₱{fareResult.baseFare.toFixed(2)}</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownKey}>
                    Succeeding ({fareResult.succeedingKm} km × ₱{fareResult.perKmRate}/km)
                  </Text>
                  <Text style={styles.breakdownVal}>
                    +₱{(fareResult.succeedingKm * fareResult.perKmRate).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownKey}>Gross Regular Total</Text>
                  <Text style={styles.breakdownVal}>₱{fareResult.grossFare.toFixed(2)}</Text>
                </View>

                {fareResult.isDiscounted && (
                  <View style={[styles.breakdownRow, { backgroundColor: '#E8F5E9', padding: 6, borderRadius: 6 }]}>
                    <Text style={[styles.breakdownKey, { color: '#2E7D32', fontWeight: 'bold' }]}>
                      Mandatory 20% Statutory Discount
                    </Text>
                    <Text style={[styles.breakdownVal, { color: '#2E7D32', fontWeight: 'bold' }]}>
                      -₱{fareResult.discountAmount.toFixed(2)}
                    </Text>
                  </View>
                )}

                <View style={styles.legalNotice}>
                  <Ionicons name="information-circle-outline" size={14} color="#777" />
                  <Text style={styles.legalNoticeText}>
                    In compliance with LTFRB MC on 20% Mandatory Discount for Students, PWDs, and Senior Citizens.
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2: SO3 FULL FARE MATRIX GRID TABLE
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'matrix' && (
          <View>
            <Text style={styles.sectionHeader}>
              {i18n.language === 'fil' ? 'Talaan ng Pamasahe (Fare Matrix)' : 'Official LTFRB Fare Matrix'}
            </Text>
            <Text style={styles.sectionSub}>
              MRT Buendia - Mandaluyong City Hall Route Stops & Fares
            </Text>

            {/* Matrix Table */}
            <View style={styles.matrixTable}>
              <View style={styles.matrixHeaderRow}>
                <Text style={[styles.matrixHeaderCell, { flex: 2 }]}>Stop / Landmark</Text>
                <Text style={styles.matrixHeaderCell}>Regular</Text>
                <Text style={styles.matrixHeaderCell}>Discounted</Text>
              </View>

              {terminals.map((term, index) => (
                <View
                  key={term.id}
                  style={[styles.matrixRow, index % 2 === 1 && { backgroundColor: '#FAFAFA' }]}
                >
                  <View style={{ flex: 2 }}>
                    <Text style={styles.matrixStopName}>{term.name}</Text>
                    <Text style={styles.matrixStopSub}>Stop #{term.sequence_order + 1}</Text>
                  </View>
                  <Text style={styles.matrixCellRegular}>
                    {term.regular_fare === 0 ? 'Origin' : `₱${term.regular_fare.toFixed(2)}`}
                  </Text>
                  <Text style={styles.matrixCellDiscount}>
                    {term.student_fare === 0 ? 'Origin' : `₱${term.student_fare.toFixed(2)}`}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.matrixFooterCard}>
              <Text style={styles.matrixFooterTitle}>Fare Matrix Regulatory Notes:</Text>
              <Text style={styles.matrixFooterText}>• Modernized e-Jeepney Non-Aircon base rate: ₱14.00 (First 4 km).</Text>
              <Text style={styles.matrixFooterText}>• Succeeding kilometer increment: ₱1.50/km.</Text>
              <Text style={styles.matrixFooterText}>• 20% Discount applies to bona fide Students, Senior Citizens, and PWDs upon valid ID presentation.</Text>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 3: BROWSE ROUTES & SEQUENCE OF STOPS
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'browse' && (
          <View>
            <Text style={styles.sectionHeader}>Active Modernized Routes</Text>
            <Text style={styles.sectionSub}>Verified e-Jeepney routes operating across Makati City</Text>

            {routes.map(route => {
              const isExpanded = expandedRoute === route.id;
              return (
                <View key={route.id} style={styles.routeCard}>
                  <TouchableOpacity
                    style={styles.routeHeader}
                    onPress={() => setExpandedRoute(isExpanded ? null : route.id)}
                  >
                    <View style={[styles.routeColorPill, { backgroundColor: route.color_code || Colors.primaryRed }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeName}>{route.name}</Text>
                      <Text style={styles.routeHours}>Operating: {route.operating_hours}</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={Colors.subtleGray}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.routeDetails}>
                      <Text style={styles.routeDesc}>{route.description}</Text>
                      <Text style={styles.timelineHeader}>SEQUENCE OF DESIGNATED STOPS:</Text>

                      {terminals.map((stop, idx) => (
                        <View key={stop.id} style={styles.timelineRow}>
                          <View style={styles.timelineGraphic}>
                            <View style={[styles.timelineNode, { borderColor: route.color_code }]} />
                            {idx !== terminals.length - 1 && <View style={styles.timelineConnector} />}
                          </View>
                          <View style={{ flex: 1, paddingBottom: 16 }}>
                            <Text style={styles.timelineStopTitle}>{stop.name}</Text>
                            <Text style={styles.timelineStopFare}>
                              Regular: ₱{stop.regular_fare.toFixed(2)} • Discounted: ₱{stop.student_fare.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 4: "E-SAKAY" HUB VISIBILITY DIRECTORY (PDF Page 18)
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'esakay' && (
          <View>
            <Text style={styles.sectionHeader}>"e-Sakay" Hub Visibility Directory</Text>
            <Text style={styles.sectionSub}>
              Specialized official electric jeepney terminals equipped with charging stations, CCTV, and covered boarding bays.
            </Text>

            {terminals.filter(t => t.is_esakay_hub || t.sequence_order === 0 || t.sequence_order === 5).map(hub => (
              <View key={`hub-${hub.id}`} style={styles.hubCard}>
                {hub.landmark_photo && (
                  <Image source={{ uri: hub.landmark_photo }} style={styles.hubImage} resizeMode="cover" />
                )}
                <View style={styles.hubContent}>
                  <View style={styles.hubBadgeRow}>
                    <View style={styles.esakayTag}>
                      <Ionicons name="flash" size={12} color={Colors.white} />
                      <Text style={styles.esakayTagText}>OFFICIAL E-SAKAY HUB</Text>
                    </View>
                    {hub.cctv_monitored && (
                      <View style={styles.cctvTag}>
                        <Ionicons name="videocam" size={12} color="#2E7D32" />
                        <Text style={styles.cctvTagText}>CCTV 24/7</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.hubTitle}>{hub.name}</Text>
                  <Text style={styles.hubDesc}>{hub.landmark_desc}</Text>

                  <View style={styles.hubSafetyFeatures}>
                    <View style={styles.safetyItem}>
                      <Ionicons name="bulb" size={14} color="#FF9800" />
                      <Text style={styles.safetyItemText}>Illuminated Waiting Shed</Text>
                    </View>
                    <View style={styles.safetyItem}>
                      <Ionicons name="shield-checkmark" size={14} color="#4CAF50" />
                      <Text style={styles.safetyItemText}>Designated Legal Boarding Bay</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ─── MODAL PICKER (ORIGIN / DESTINATION) ─── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalType === 'origin' ? 'Select Boarding Point' : 'Select Alighting Point'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.darkText} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={18} color={Colors.subtleGray} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search designated terminals..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#999"
              />
            </View>

            <FlatList
              data={filteredTerminals}
              keyExtractor={item => item.id}
              ListHeaderComponent={
                modalType === 'origin' ? (
                  <TouchableOpacity
                    style={styles.gpsOptionItem}
                    onPress={() => selectTerminalItem('gps')}
                  >
                    <View style={styles.gpsIconBg}>
                      <Ionicons name="location" size={20} color={Colors.white} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.gpsOptionTitle}>Current GPS Location</Text>
                      <Text style={styles.gpsOptionSub}>Automatically computes from your live position</Text>
                    </View>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalListItem}
                  onPress={() => selectTerminalItem(item.id)}
                >
                  <View style={[styles.modalItemBar, { backgroundColor: Colors.primaryRed }]} />
                  <View style={{ flex: 1, paddingLeft: 10 }}>
                    <Text style={styles.modalItemName}>{item.name}</Text>
                    <Text style={styles.modalItemSub}>Stop #{item.sequence_order + 1}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CCC" />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header Bar
  headerBar: {
    backgroundColor: Colors.primaryRed,
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  langToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  langToggleText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Tabs
  navTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: 6,
    borderBottomWidth: 1,
    borderColor: '#E8DFD3',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 5,
  },
  tabItemActive: {
    backgroundColor: Colors.primaryRed,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.darkText,
  },
  tabTextActive: {
    color: Colors.white,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 19,
    fontWeight: '900',
    color: Colors.darkText,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 16,
  },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.subtleGray,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  tierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tierButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.offWhite,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8DFD3',
    alignItems: 'center',
  },
  tierButtonActive: {
    backgroundColor: '#FFF2F2',
    borderColor: Colors.primaryRed,
  },
  tierButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  tierButtonTextActive: {
    color: Colors.primaryRed,
  },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  selectText: {
    flex: 1,
    fontSize: 14,
    color: Colors.darkText,
    fontWeight: '600',
  },
  connectorContainer: {
    height: 32,
    paddingLeft: 20,
    justifyContent: 'center',
    marginVertical: 4,
  },
  connectorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.subtleGray,
  },
  connectorLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E8DFD3',
    marginLeft: 2,
    marginVertical: 2,
  },

  // Breakdown Card
  breakdownCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: Colors.primaryYellow,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.subtleGray,
    letterSpacing: 0.8,
  },
  breakdownTierBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.primaryRed,
    marginTop: 2,
  },
  netFareValue: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8DFD3',
    marginVertical: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownKey: {
    fontSize: 13,
    color: '#555',
  },
  breakdownVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  legalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0E6D8',
    gap: 6,
  },
  legalNoticeText: {
    fontSize: 11,
    color: '#777',
    flex: 1,
    lineHeight: 15,
  },
  errorCard: {
    flexDirection: 'row',
    backgroundColor: '#FFEBEE',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Matrix Table
  matrixTable: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8DFD3',
    marginBottom: 16,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryRed,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  matrixHeaderCell: {
    flex: 1,
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  matrixRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderColor: '#F0E6D8',
    alignItems: 'center',
  },
  matrixStopName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  matrixStopSub: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  matrixCellRegular: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  matrixCellDiscount: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  matrixFooterCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  matrixFooterTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginBottom: 6,
  },
  matrixFooterText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },

  // Route Directory
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    marginBottom: 14,
    overflow: 'hidden',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  routeColorPill: {
    width: 6,
    height: 40,
    borderRadius: 3,
  },
  routeName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  routeHours: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  routeDetails: {
    padding: 16,
    backgroundColor: '#FAF5EE',
    borderTopWidth: 1,
    borderColor: '#F0E6D8',
  },
  routeDesc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    marginBottom: 16,
  },
  timelineHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineGraphic: {
    width: 20,
    alignItems: 'center',
    marginRight: 10,
  },
  timelineNode: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.white,
    borderWidth: 2.5,
  },
  timelineConnector: {
    width: 2,
    height: 32,
    backgroundColor: '#DDD',
  },
  timelineStopTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  timelineStopFare: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },

  // e-Sakay Hub Cards
  hubCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  hubImage: {
    width: '100%',
    height: 140,
  },
  hubContent: {
    padding: 16,
  },
  hubBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  esakayTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  esakayTagText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  cctvTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  cctvTagText: {
    color: '#2E7D32',
    fontSize: 10,
    fontWeight: 'bold',
  },
  hubTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginBottom: 4,
  },
  hubDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  hubSafetyFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0E6D8',
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  safetyItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
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
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.darkText,
  },
  gpsOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: 10,
  },
  gpsIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsOptionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.primaryRed,
  },
  gpsOptionSub: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F0E6D8',
  },
  modalItemBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  modalItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  modalItemSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
});
