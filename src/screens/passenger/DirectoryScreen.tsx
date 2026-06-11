import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, FlatList, ActivityIndicator, Keyboard
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useLocation } from '../../contexts/LocationContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Route = {
  id: string;
  name: string;
  description: string;
  color_code: string;
  operating_hours: string;
  base_fare: number;
  per_km_rate: number;
};

type Terminal = {
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
  routes?: Route;
};

export default function DirectoryScreen() {
  const { location } = useLocation();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'browse' | 'planner'>('browse');

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
        const { data: routesData } = await supabase.from('routes').select('*').order('name');
        const { data: terminalsData } = await supabase.from('terminals').select('*, routes(*)').order('sequence_order');
        
        if (routesData) setRoutes(routesData);
        if (terminalsData) setTerminals(terminalsData);
      } catch (err) {
        console.error('Error fetching directory data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Haversine Distance helper (returns km)
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getFromText = () => {
    if (fromSelection === 'gps') {
      return '📍 Current GPS Location';
    }
    const term = terminals.find(t => t.id === fromSelection);
    return term ? term.name : 'Select origin point...';
  };

  const getToText = () => {
    if (!toSelection) return 'Select destination point...';
    const term = terminals.find(t => t.id === toSelection);
    return term ? term.name : 'Select destination point...';
  };

  const getRouteTerminals = (routeId: string) => {
    return terminals.filter(t => t.route_id === routeId);
  };

  // ─── Plan Trip Calculations ───
  const calculateTrip = () => {
    if (!toSelection) return null;

    let originLat = 0;
    let originLon = 0;
    let originName = '';
    let isCurrentGPS = false;

    // Get origin coordinates
    if (fromSelection === 'gps') {
      if (!location) {
        return { error: 'GPS coordinates not available yet. Please select a terminal or enable location.' };
      }
      originLat = location.coords.latitude;
      originLon = location.coords.longitude;
      originName = 'Current Location';
      isCurrentGPS = true;
    } else {
      const term = terminals.find(t => t.id === fromSelection);
      if (!term) return null;
      originLat = term.latitude;
      originLon = term.longitude;
      originName = term.name;
    }

    // Get destination coordinates
    const destTerminal = terminals.find(t => t.id === toSelection);
    if (!destTerminal) return null;

    const destLat = destTerminal.latitude;
    const destLon = destTerminal.longitude;
    const destRoute = destTerminal.routes;

    if (!destRoute) return null;

    // Find nearest boarding terminal on the destination's route
    const routeTerminals = getRouteTerminals(destRoute.id);
    let nearestBoardingTerminal = routeTerminals[0];
    let minDistanceToBoarding = haversine(
      originLat,
      originLon,
      nearestBoardingTerminal.latitude,
      nearestBoardingTerminal.longitude
    );

    for (let i = 1; i < routeTerminals.length; i++) {
      const dist = haversine(originLat, originLon, routeTerminals[i].latitude, routeTerminals[i].longitude);
      if (dist < minDistanceToBoarding) {
        minDistanceToBoarding = dist;
        nearestBoardingTerminal = routeTerminals[i];
      }
    }

    // Calculate distance of the jeep journey (boarding terminal -> destination terminal)
    const jeepDistance = haversine(
      nearestBoardingTerminal.latitude,
      nearestBoardingTerminal.longitude,
      destLat,
      destLon
    );

    // Apply road winding factor
    const roadDistance = jeepDistance * 1.4;

    // Estimate Fare (₱13 base for first 4km, ₱1.80/km thereafter)
    const baseFare = destRoute.base_fare || 13;
    const perKmRate = destRoute.per_km_rate || 1.80;
    let fare = baseFare;
    if (roadDistance > 4) {
      fare += (roadDistance - 4) * perKmRate;
    }
    const estimatedFare = Math.ceil(fare);

    // Estimate travel time (15 km/h avg speed)
    const travelTime = Math.ceil((roadDistance / 15) * 60);

    return {
      isCurrentGPS,
      originName,
      destName: destTerminal.name,
      routeName: destRoute.name,
      routeColor: destRoute.color_code,
      boardingTerminalName: nearestBoardingTerminal.name,
      boardingWalkDistance: minDistanceToBoarding * 1000, // in meters
      jeepDistance: roadDistance,
      estimatedFare,
      travelTime,
      baseFare,
      perKmRate
    };
  };

  const tripResult = calculateTrip();

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
        <ActivityIndicator size="large" color={Colors.primaryRed} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'browse' && styles.tabButtonActive]}
          onPress={() => setActiveTab('browse')}
        >
          <Ionicons name="list" size={18} color={activeTab === 'browse' ? Colors.white : Colors.darkText} />
          <Text style={[styles.tabButtonText, activeTab === 'browse' && styles.tabButtonTextActive]}>Browse Routes</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'planner' && styles.tabButtonActive]}
          onPress={() => setActiveTab('planner')}
        >
          <Ionicons name="navigate" size={18} color={activeTab === 'planner' ? Colors.white : Colors.darkText} />
          <Text style={[styles.tabButtonText, activeTab === 'planner' && styles.tabButtonTextActive]}>Trip Planner</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'browse' ? (
        /* ─── BROWSE ROUTES TAB ─── */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Jeepney Routes & Fares</Text>
          <Text style={styles.sectionDesc}>Tap on any route to view its list of terminals in sequential order.</Text>

          {routes.map(route => {
            const isExpanded = expandedRoute === route.id;
            const routeTerminals = getRouteTerminals(route.id);

            return (
              <View key={route.id} style={styles.routeCard}>
                <TouchableOpacity 
                  activeOpacity={0.8}
                  style={styles.routeHeader}
                  onPress={() => setExpandedRoute(isExpanded ? null : route.id)}
                >
                  <View style={[styles.routeColorBar, { backgroundColor: route.color_code || Colors.primaryRed }]} />
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeName}>{route.name}</Text>
                    <View style={styles.routeMeta}>
                      <View style={styles.metaBadge}>
                        <Ionicons name="time-outline" size={12} color="#666" />
                        <Text style={styles.metaText}>{route.operating_hours}</Text>
                      </View>
                      <View style={[styles.metaBadge, { backgroundColor: '#FFEBEE' }]}>
                        <Text style={styles.fareText}>₱{route.base_fare || 13} base</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={22} 
                    color={Colors.subtleGray} 
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    <Text style={styles.routeDesc}>{route.description}</Text>
                    
                    <Text style={styles.stopsHeader}>SEQUENCE OF STOPS</Text>
                    {routeTerminals.map((stop, idx) => (
                      <View key={stop.id} style={styles.stopRow}>
                        <View style={styles.stopTimeline}>
                          <View style={[styles.stopNode, { borderColor: route.color_code }]} />
                          {idx !== routeTerminals.length - 1 && (
                            <View style={[styles.stopLine, { backgroundColor: route.color_code }]} />
                          )}
                        </View>
                        <Text style={styles.stopName}>{stop.name}</Text>
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
          <Text style={styles.sectionTitle}>Plan Your Trip</Text>
          <Text style={styles.sectionDesc}>Select where you are and where you want to go. We'll find the closest terminal and calculate fares.</Text>

          <View style={styles.plannerCard}>
            {/* Origin Select */}
            <Text style={styles.pickerLabel}>FROM</Text>
            <TouchableOpacity 
              style={styles.pickerSelector}
              onPress={() => handleOpenPicker('from')}
            >
              <Ionicons 
                name={fromSelection === 'gps' ? "location" : "bus"} 
                size={18} 
                color={fromSelection === 'gps' ? Colors.primaryRed : Colors.subtleGray} 
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.pickerSelectorText, fromSelection === 'gps' && { color: Colors.primaryRed, fontWeight: '700' }]}>
                {getFromText()}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            <View style={styles.plannerConnector}>
              <View style={styles.connectorDot} />
              <View style={styles.connectorLine} />
              <View style={[styles.connectorDot, { backgroundColor: Colors.primaryRed }]} />
            </View>

            {/* Destination Select */}
            <Text style={styles.pickerLabel}>TO (DESTINATION)</Text>
            <TouchableOpacity 
              style={styles.pickerSelector}
              onPress={() => handleOpenPicker('to')}
            >
              <Ionicons name="flag" size={18} color={Colors.primaryRed} style={{ marginRight: 8 }} />
              <Text style={[styles.pickerSelectorText, toSelection && { color: Colors.darkText, fontWeight: '700' }]}>
                {getToText()}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.subtleGray} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>

          {/* TRIP PLAN RESULTS */}
          {tripResult && ('error' in tripResult ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={24} color={Colors.primaryRed} style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{tripResult.error}</Text>
            </View>
          ) : (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={[styles.routeBadge, { backgroundColor: tripResult.routeColor || Colors.primaryRed }]}>
                  <Text style={styles.routeBadgeText}>Recommended Route</Text>
                </View>
                <Text style={styles.resultRouteName}>{tripResult.routeName}</Text>
              </View>

              <View style={styles.divider} />

              {/* Nearest Boarding Terminal info */}
              <View style={styles.boardingSection}>
                <Ionicons name="walk" size={24} color={Colors.primaryYellow} />
                <View style={styles.boardingDetails}>
                  <Text style={styles.boardingLabel}>NEAREST BOARDING TERMINAL</Text>
                  <Text style={styles.boardingTerminalName}>{tripResult.boardingTerminalName}</Text>
                  {tripResult.isCurrentGPS && (
                    <Text style={styles.boardingDistance}>
                      Approx. {Math.round(tripResult.boardingWalkDistance)} meters from your location
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.divider} />

              {/* Estimate metrics */}
              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>ESTIMATED FARE</Text>
                  <Text style={styles.metricValue}>₱{tripResult.estimatedFare}</Text>
                  <Text style={styles.metricSub}>₱{tripResult.baseFare} base + ₱{tripResult.perKmRate}/km</Text>
                </View>
                <View style={[styles.metricItem, { borderLeftWidth: 1, borderColor: '#E8DFD3' }]}>
                  <Text style={styles.metricLabel}>EST. TRAVEL TIME</Text>
                  <Text style={styles.metricValue}>~{tripResult.travelTime} mins</Text>
                  <Text style={styles.metricSub}>Jeep distance: {tripResult.jeepDistance.toFixed(1)} km</Text>
                </View>
              </View>

              {/* Simple Guidance Flow */}
              <View style={styles.guidanceFlow}>
                <View style={styles.guidanceStep}>
                  <Ionicons name="pin" size={16} color={Colors.primaryRed} />
                  <Text style={styles.guidanceText}>Start at <Text style={{ fontWeight: 'bold' }}>{tripResult.originName}</Text></Text>
                </View>
                <View style={styles.guidanceConnector} />
                <View style={styles.guidanceStep}>
                  <Ionicons name="bus" size={16} color={Colors.primaryYellow} />
                  <Text style={styles.guidanceText}>Board at <Text style={{ fontWeight: 'bold' }}>{tripResult.boardingTerminalName}</Text></Text>
                </View>
                <View style={styles.guidanceConnector} />
                <View style={styles.guidanceStep}>
                  <Ionicons name="flag" size={16} color={Colors.primaryRed} />
                  <Text style={styles.guidanceText}>Arrive at <Text style={{ fontWeight: 'bold' }}>{tripResult.destName}</Text></Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* CUSTOM DROPDOWN PICKER MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalType === 'from' ? 'Select Departure Point' : 'Select Destination Point'}
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
                placeholder="Search terminals..."
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
                      <Text style={styles.gpsOptionTitle}>Current GPS Location</Text>
                      <Text style={styles.gpsOptionSub}>Automatically locate the nearest terminal</Text>
                    </View>
                  </TouchableOpacity>
                ) : null
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
    backgroundColor: Colors.offWhite 
  },
  container: { 
    flex: 1, 
    backgroundColor: Colors.offWhite 
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#E8DFD3',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.primaryRed,
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
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primaryRed,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 20,
  },
  
  // ── Route Directory Styling ──
  routeCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8DFD3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  routeColorBar: {
    width: 6,
    height: 48,
    borderRadius: 3,
    marginRight: 14,
  },
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
    gap: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  fareText: {
    fontSize: 11,
    color: Colors.primaryRed,
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
    fontSize: 11,
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
    borderColor: '#E8DFD3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.subtleGray,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pickerSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    borderRadius: 12,
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
    color: Colors.primaryRed,
    fontWeight: 'bold',
    flex: 1,
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8DFD3',
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
    fontSize: 11,
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
    fontSize: 10,
    fontWeight: '800',
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
    fontSize: 10,
    fontWeight: '800',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  metricSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  guidanceFlow: {
    marginTop: 20,
    backgroundColor: Colors.offWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8DFD3',
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
    fontWeight: '900',
    color: Colors.darkText,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFD3',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginBottom: 16,
  },
  gpsOptionIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsOptionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.primaryRed,
  },
  gpsOptionSub: {
    fontSize: 11,
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
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
});
