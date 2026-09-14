import React, { useEffect, useState, useRef } from 'react';
import {
  View, StyleSheet, Text, TouchableOpacity, ScrollView,
  Animated, Platform
} from 'react-native';
import LeafletMap, { LeafletMapRef } from '../../components/LeafletMap';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import WeatherBanner from '../../components/WeatherBanner';
import SOSButton from '../../components/SOSButton';
import {
  offlineTransit,
  RouteData,
  TerminalData,
  VehicleData,
  MAKATI_PRIMARY_ROUTE,
  MAKATI_OFFICIAL_TERMINALS,
  INITIAL_VEHICLES,
} from '../../services/offlineTransitService';
import {
  evaluateGeofence,
  GeofenceEvaluationResult,
  OFFICIAL_BAY_RADIUS_METERS,
} from '../../services/geofencingService';
import {
  densityRouting,
  StopSafetyProfile,
  LateNightSafeRoutingResult,
} from '../../services/densityRoutingService';

// Makati Center Default Region
const INITIAL_REGION = {
  latitude: 14.5547,
  longitude: 121.0244,
  latitudeDelta: 0.035,
  longitudeDelta: 0.035,
};

export default function PassengerHomeScreen() {
  const { location } = useLocation();
  const { isConnected } = useNetwork();
  const mapRef = useRef<LeafletMapRef | null>(null);
  const [hasCentered, setHasCentered] = useState(false);

  // Transit Data (SO1 Cache-First)
  const [routes, setRoutes] = useState<RouteData[]>([MAKATI_PRIMARY_ROUTE]);
  const [terminals, setTerminals] = useState<TerminalData[]>(MAKATI_OFFICIAL_TERMINALS);
  const [vehicles, setVehicles] = useState<VehicleData[]>(INITIAL_VEHICLES);
  const [dataLatencyMs, setDataLatencyMs] = useState<number>(18);
  const [isDataCached, setIsDataCached] = useState<boolean>(true);

  // Geofencing State (SO2)
  const [geofenceResult, setGeofenceResult] = useState<GeofenceEvaluationResult | null>(null);

  // Safe Stop & DBSCAN Density Routing State (SO5)
  const [safeNightMode, setSafeNightMode] = useState(false);
  const [densityProfiles, setDensityProfiles] = useState<Map<string, StopSafetyProfile>>(new Map());
  const [safeRoutingResult, setSafeRoutingResult] = useState<LateNightSafeRoutingResult | null>(null);
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalData | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);

  // ─── 1. SO1: Load Transit Data (Cache-First) ───
  useEffect(() => {
    let isMounted = true;

    const loadTransitData = async () => {
      const data = await offlineTransit.getTransitData();
      if (!isMounted) return;

      setRoutes(data.routes);
      setTerminals(data.terminals);
      setDataLatencyMs(data.latencyMs);
      setIsDataCached(data.isFromCache);

      // Load vehicles with capacity classification
      const vehs = await offlineTransit.getVehicles();
      const classified = densityRouting.updateVehicleCapacities(vehs);
      setVehicles(classified);

      // Compute initial stop densities
      const profiles = densityRouting.evaluateStopDensities(data.terminals);
      setDensityProfiles(profiles);
    };

    loadTransitData();

    // If online and Supabase is configured, listen to realtime vehicle positions
    if (isConnected && isSupabaseConfigured) {
      const sub = supabase
        .channel('public:vehicle_positions')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'vehicle_positions' },
          payload => {
            const newV = payload.new;
            setVehicles(current => {
              const updated = current.map(v => {
                if (v.vehicle_id === newV.vehicle_id || v.id === newV.vehicle_id) {
                  return {
                    ...v,
                    latitude: newV.latitude,
                    longitude: newV.longitude,
                    speed: newV.speed || v.speed,
                  };
                }
                return v;
              });
              return densityRouting.updateVehicleCapacities(updated);
            });
          }
        )
        .subscribe();

      return () => {
        isMounted = false;
        supabase.removeChannel(sub);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [isConnected]);

  // ─── 2. Auto-center Map to Commuter's GPS ───
  useEffect(() => {
    if (location && !hasCentered && mapRef.current) {
      mapRef.current.centerOn(location.coords.latitude, location.coords.longitude, 16);
      setHasCentered(true);
    }
  }, [location, hasCentered]);

  // ─── 3. SO2 & SO5: Live Geofence & Safe-Routing Evaluation ───
  useEffect(() => {
    const lat = location?.coords.latitude || 14.5547;
    const lon = location?.coords.longitude || 121.0244;

    // SO2: Geofence check
    const geo = evaluateGeofence(lat, lon, terminals);
    setGeofenceResult(geo);

    // SO5: Late-Night Safe-Stop Routing
    const safeRoute = densityRouting.calculateLateNightSafeRoute(lat, lon, terminals, safeNightMode);
    setSafeRoutingResult(safeRoute);

    // Recompute densities
    const profiles = densityRouting.evaluateStopDensities(terminals);
    setDensityProfiles(profiles);
  }, [location, terminals, safeNightMode]);

  // Nearest vehicle for SOS vehicle metadata binding (SO4)
  const activeVehicle = selectedVehicle || vehicles[0];

  return (
    <View style={styles.container}>
      {/* ─── INTERACTIVE MAP ─── */}
      {/* ─── INTERACTIVE LEAFLET OPENSTREETMAP (100% Free, Zero Billing) ─── */}
      <LeafletMap
        ref={mapRef}
        routes={routes}
        terminals={terminals}
        vehicles={vehicles}
        userLocation={
          location?.coords
            ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              }
            : null
        }
        geofenceResult={geofenceResult}
        densityProfiles={densityProfiles}
        safeRoutingResult={safeRoutingResult}
        selectedTerminal={selectedTerminal}
        selectedVehicle={selectedVehicle}
        onSelectTerminal={setSelectedTerminal}
        onSelectVehicle={setSelectedVehicle}
      />

      {/* ─── TOP STATUS OVERLAY ─── */}
      <View style={styles.topOverlayContainer}>
        {/* SO1 & Telemetry Bar: Cache Latency & Offline Indicator */}
        <View style={styles.telemetryBar}>
          <View style={styles.telemetryItem}>
            <Ionicons
              name={isConnected ? 'cloud-done' : 'cloud-offline'}
              size={14}
              color={isConnected ? '#4CAF50' : '#FF9800'}
            />
            <Text style={styles.telemetryText}>
              {isConnected ? 'Live Sync' : 'Offline Mode'}
            </Text>
          </View>

          <View style={styles.telemetryItem}>
            <Ionicons name="speedometer-outline" size={14} color={Colors.primaryYellow} />
            <Text style={styles.telemetryText}>
              SO1 Cache: <Text style={{ fontWeight: 'bold' }}>{dataLatencyMs}ms</Text> (&lt;2s target)
            </Text>
          </View>

          {/* SO5 Late-Night Safe Commute Mode Toggle */}
          <TouchableOpacity
            style={[styles.nightModeBtn, safeNightMode && styles.nightModeBtnActive]}
            onPress={() => setSafeNightMode(!safeNightMode)}
          >
            <Ionicons
              name="moon"
              size={13}
              color={safeNightMode ? Colors.white : Colors.darkText}
            />
            <Text style={[styles.nightModeText, safeNightMode && styles.nightModeTextActive]}>
              Safe Routing
            </Text>
          </TouchableOpacity>
        </View>

        {/* SO2: Visual Geofence Indicator Banner */}
        {geofenceResult && (
          <View style={[
            styles.geofenceBanner,
            geofenceResult.isInsideLegalZone ? styles.geofenceLegal : styles.geofenceWarning
          ]}>
            <View style={styles.geofenceIconWrapper}>
              <Ionicons
                name={geofenceResult.isInsideLegalZone ? 'checkmark-circle' : 'warning'}
                size={22}
                color={geofenceResult.isInsideLegalZone ? '#4CAF50' : '#D32F2F'}
              />
            </View>
            <View style={styles.geofenceTextContainer}>
              <Text style={[
                styles.geofenceTitle,
                { color: geofenceResult.isInsideLegalZone ? '#2E7D32' : '#C62828' }
              ]}>
                {geofenceResult.isInsideLegalZone
                  ? 'LEGAL BOARDING ZONE'
                  : 'WARNING: NO LOADING AREA'}
              </Text>
              <Text style={styles.geofenceSub} numberOfLines={2}>
                {geofenceResult.isInsideLegalZone
                  ? geofenceResult.currentZone?.name
                  : `Please walk ${geofenceResult.distanceToNearestMeters}m to designated bay: ${geofenceResult.nearestZone?.name}`}
              </Text>
            </View>
            {!geofenceResult.isInsideLegalZone && (
              <TouchableOpacity
                style={styles.guideMeBtn}
                onPress={() => {
                  if (mapRef.current && geofenceResult.nearestZone) {
                    mapRef.current.animateToRegion({
                      latitude: geofenceResult.nearestZone.latitude,
                      longitude: geofenceResult.nearestZone.longitude,
                      latitudeDelta: 0.008,
                      longitudeDelta: 0.008,
                    }, 600);
                  }
                }}
              >
                <Text style={styles.guideMeText}>View Bay</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Weather Banner */}
        <WeatherBanner />
      </View>

      {/* ─── SO5: DYNAMIC SAFE-STOP ROUTING BOTTOM CARD ─── */}
      {safeNightMode && safeRoutingResult && (
        <View style={styles.safeRoutingCard}>
          <View style={styles.safeCardHeader}>
            <View style={styles.safeIconBadge}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.safeCardTitle}>
                SO5: Safe-Stop Navigational Guide
              </Text>
              <Text style={styles.safeCardSub}>
                DBSCAN Density-Aware Nighttime Rerouting (&lt;5s)
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSafeNightMode(false)}>
              <Ionicons name="close-circle" size={20} color={Colors.subtleGray} />
            </TouchableOpacity>
          </View>

          <View style={styles.safeDetailsRow}>
            <View style={styles.safeMetricBox}>
              <Text style={styles.safeMetricLabel}>TARGET STOP</Text>
              <Text style={styles.safeMetricValue} numberOfLines={1}>
                {safeRoutingResult.recommendedSafeStop.name}
              </Text>
            </View>
            <View style={[styles.safeMetricBox, { borderLeftWidth: 1, borderColor: '#E8DFD3', paddingLeft: 12 }]}>
              <Text style={styles.safeMetricLabel}>DISTANCE / ETA</Text>
              <Text style={styles.safeMetricValue}>
                {safeRoutingResult.distanceToSafeStopMeters}m (~{safeRoutingResult.walkingTimeMinutes} min)
              </Text>
            </View>
          </View>

          <Text style={styles.safeReasonText}>
            💡 {safeRoutingResult.safetyReason}
          </Text>
        </View>
      )}

      {/* ─── RE-CENTER BUTTON ─── */}
      <TouchableOpacity
        style={styles.recenterBtn}
        onPress={() => {
          if (location && mapRef.current) {
            mapRef.current.centerOn(
              location.coords.latitude,
              location.coords.longitude,
              16
            );
          } else if (mapRef.current) {
            mapRef.current.centerOn(14.5547, 121.0244, 15);
          }
        }}
      >
        <Ionicons name="locate" size={22} color={Colors.primaryRed} />
      </TouchableOpacity>

      {/* ─── FLOATING SOS BUTTON (SO4 Integrated with Vehicle Metadata) ─── */}
      <View style={styles.sosOverlay}>
        <SOSButton
          activeVehiclePlate={activeVehicle.plate_number}
          activeVehicleBody={activeVehicle.body_number}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  map: { width: '100%', height: '100%' },

  // Top Overlay Container
  topOverlayContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 12,
    left: 12,
    right: 12,
    zIndex: 20,
    gap: 8,
  },

  // Telemetry Bar (SO1)
  telemetryBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  telemetryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  telemetryText: {
    fontSize: 11,
    color: Colors.darkText,
    fontWeight: '600',
  },
  nightModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  nightModeBtnActive: {
    backgroundColor: Colors.primaryRed,
    borderColor: Colors.primaryRed,
  },
  nightModeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  nightModeTextActive: {
    color: Colors.white,
  },

  // Geofence Banner (SO2)
  geofenceBanner: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1.5,
  },
  geofenceLegal: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  geofenceWarning: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF5350',
  },
  geofenceIconWrapper: {
    marginRight: 10,
  },
  geofenceTextContainer: {
    flex: 1,
  },
  geofenceTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  geofenceSub: {
    fontSize: 12,
    color: Colors.darkText,
    marginTop: 2,
    lineHeight: 16,
    fontWeight: '600',
  },
  guideMeBtn: {
    backgroundColor: Colors.primaryRed,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  guideMeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Markers
  terminalMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  terminalRecommended: {
    backgroundColor: '#2E7D32',
    transform: [{ scale: 1.25 }],
    borderColor: Colors.primaryYellow,
    borderWidth: 2.5,
  },
  terminalSelected: {
    borderColor: Colors.primaryYellow,
    borderWidth: 3,
  },
  densityBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: Colors.white,
  },
  densityBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: 'bold',
  },

  // Vehicles
  vehicleMarkerContainer: {
    alignItems: 'center',
  },
  capacityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  capacityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  vehicleIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },

  // Safe Routing Card (SO5)
  safeRoutingCard: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    zIndex: 15,
  },
  safeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  safeIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.darkText,
  },
  safeCardSub: {
    fontSize: 11,
    color: '#666',
  },
  safeDetailsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.offWhite,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  safeMetricBox: {
    flex: 1,
  },
  safeMetricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.subtleGray,
    letterSpacing: 0.5,
  },
  safeMetricValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginTop: 2,
  },
  safeReasonText: {
    fontSize: 11,
    color: '#555',
    lineHeight: 15,
  },

  // Buttons
  recenterBtn: {
    position: 'absolute',
    bottom: 148,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    zIndex: 12,
  },
  sosOverlay: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    zIndex: 25,
  },
});
