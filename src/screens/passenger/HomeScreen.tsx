import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Linking, Platform, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap, { type LeafletMapRef } from '../../components/LeafletMap';
import PassengerStopGuide from '../../components/PassengerStopGuide';
import SOSButton from '../../components/SOSButton';
import { passengerStyles as s } from '../../components/PassengerUI';
import { FormScrollView, triggerHaptic } from '../../components/AppUI';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { offlineTransit, MAKATI_OFFICIAL_TERMINALS, type TerminalData, type VehicleData } from '../../services/offlineTransitService';
import { SAMPLE_PASSENGER_VEHICLES } from '../../constants/samplePassengerFleet';
import { loadLoadingZones } from '../../services/passengerDataService';
import { evaluateBoardingLocation, type LoadingZone } from '../../services/passengerSafety';
import { searchPassengerPlaces } from '../../services/placeSearchService';
import { nearestRouteStop, type PassengerPlace } from '../../services/passengerPlaces';
import { Colors } from '../../constants/theme';

export default function PassengerHomeScreen({ route }: any) {
  const { location, errorMsg } = useLocation();
  const { isConnected } = useNetwork();
  const { unit, setUnit, destination, setDestination, place, setPlace, vehicles, nearby, signal, endRide } = usePassengerJourney();
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const selectionY = useRef(0);
  const scrollToRide = useRef(false);
  useEffect(() => { if (route?.params?.showStopGuide) scroll.current?.scrollTo({ y: 0, animated: true }); }, [route?.params?.showStopGuide]);
  const map = useRef<LeafletMapRef>(null);
  const [stops, setStops] = useState<TerminalData[]>(MAKATI_OFFICIAL_TERMINALS);
  const [query, setQuery] = useState(place?.name || destination?.name || '');
  const [searchOpen, setSearchOpen] = useState(false);
  const [places, setPlaces] = useState<PassengerPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);
  const searchVersion = useRef(0);
  const [mode, setMode] = useState<'live' | 'sample'>('sample');
  const [selected, setSelected] = useState<VehicleData | null>(null);
  const [zones, setZones] = useState<LoadingZone[]>([]);
  const [now, setNow] = useState(Date.now());
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState(false);

  const refreshZones = async () => {
    setZonesLoading(true); setZonesError(false);
    try { setZones(await loadLoadingZones()); } catch { setZonesError(true); }
    finally { setZonesLoading(false); }
  };

  const lastWarning = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    offlineTransit.getTransitData().then(data => { if (active) setStops(data.terminals); }).catch(() => {});
    setZonesLoading(true);
    loadLoadingZones().then(data => { if (active) { setZones(data); setZonesError(false); } }).catch(() => { if (active) setZonesError(true); }).finally(() => { if (active) setZonesLoading(false); });
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [isConnected]);

  const fix = location ? { ...location.coords, timestamp: location.timestamp } : null;
  const boarding = evaluateBoardingLocation(fix, zones, now);
  const warningKey = boarding.kind === 'prohibited' ? boarding.zone!.id : null;
  useEffect(() => {
    if (warningKey && lastWarning.current !== warningKey) {
      if (Platform.OS !== 'web') Vibration.vibrate([0, 150, 100, 150]);
    }
    lastWarning.current = warningKey;
  }, [warningKey]);

  const results = stops.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const displayed = destination ? (mode === 'sample' ? SAMPLE_PASSENGER_VEHICLES : isConnected ? vehicles : []).filter(v => v.route_id === destination.route_id) : [];
  const currentSelected = selected ? displayed.find(v => v.vehicle_id === selected.vehicle_id) || null : null;
  const locationFresh = location && now - location.timestamp < 60_000;

  const chooseDestination = (stop: TerminalData) => {
    triggerHaptic('light');
    setPlace(null); setDestination(stop); setQuery(stop.name); setSearchOpen(false); setSelected(null);
    map.current?.centerOn(14.568, 121.033, 14);
  };
  const searchPlaces = async () => {
    const version = ++searchVersion.current;
    setSearching(true); setSearchError(''); setSearchOpen(true);
    try {
      const found = await searchPassengerPlaces(query);
      if (version === searchVersion.current) { setPlaces(found); setSearched(true); }
    } catch (error: any) {
      if (version === searchVersion.current) setSearchError(error.message);
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  };
  const choosePlace = (value: PassengerPlace) => {
    triggerHaptic('light');
    const nearest = nearestRouteStop(value, stops);
    setPlace(value); setDestination(nearest?.stop || null); setQuery(value.name); setSearchOpen(false); setSelected(null);
    map.current?.centerOn(value.latitude, value.longitude, 15);
  };
  const placeMatch = place ? nearestRouteStop(place, stops) : null;
  const selectMode = (value: 'live' | 'sample') => { triggerHaptic('light'); setMode(value); setSelected(null); };
  const selectVehicle = (vehicle: VehicleData) => {
    triggerHaptic('light');
    setSelected(vehicle);
    if (selectionY.current) scroll.current?.scrollTo({ y: selectionY.current - 12, animated: true });
  };

  return (
    <FormScrollView ref={scroll} style={s.screen} contentContainerStyle={s.content}>
      {/* Hero Header */}
      <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, minWidth: 190 }}>
          <Text style={s.eyebrow}>Makati – Mandaluyong Loop</Text>
          <Text style={s.title}>Where are you going?</Text>
          <Text style={s.subtitle}>Search a destination or tap a stop to track active e-jeeps.</Text>
        </View>
        <SOSButton
          activeVehicleId={unit?.vehicle_id}
          activeVehicleBody={unit?.body_number}
          activeVehiclePlate={unit?.plate_number || undefined}
          activeVehicleIsSample={unit?.source === 'sample'}
        />
      </View>

      {/* Active Ride Banner */}
      {unit && (
        <View
          onLayout={e => {
            if (scrollToRide.current) {
              scroll.current?.scrollTo({ y: e.nativeEvent.layout.y - 12, animated: true });
              scrollToRide.current = false;
            }
          }}
          accessibilityLiveRegion="polite"
          style={[s.section, { backgroundColor: Colors.ink, borderColor: Colors.ink }]}
        >
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#94A3B8' }}>
                  {unit.source === 'sample' ? 'Sample Ride Active' : 'Current Ride'}
                </Text>
              </View>
              <Text style={{ fontSize: 19, fontWeight: '800', color: Colors.white }}>
                {unit.body_number} · Plate {unit.plate_number}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => { endRide(); setQuery(''); setSearchOpen(true); setSelected(null); }}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.14)' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.white }}>End ride</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, lineHeight: 18, color: '#CBD5E1' }}>
            {signal} SOS automatically attaches this unit's body and plate number.
          </Text>
        </View>
      )}

      {/* Destination Search & Quick Stops */}
      <View style={s.section}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.sectionTitle}>Destination</Text>
          {destination && !searchOpen && (
            <View style={s.pill}>
              <Ionicons name="git-branch-outline" size={13} color={Colors.ink} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.ink }}>Route 1</Text>
            </View>
          )}
        </View>

        <View style={[s.row, { flexWrap: 'nowrap' }]}>
          <TextInput
            accessibilityLabel="Search destination"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChangeText={value => {
              searchVersion.current++;
              setQuery(value);
              setSearchOpen(true);
              setPlaces([]);
              setSearched(false);
              setSearching(false);
              setSearchError('');
            }}
            onSubmitEditing={searchPlaces}
            returnKeyType="search"
            enterKeyHint="search"
            clearButtonMode="while-editing"
            placeholder="Search a place, street, or landmark"
            placeholderTextColor={Colors.subtleGray}
            style={[s.input, { flex: 1, minWidth: 0, flexShrink: 1 }]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Search places"
            disabled={searching || query.trim().length < 3}
            accessibilityState={{ disabled: searching || query.trim().length < 3 }}
            onPress={searchPlaces}
            style={[s.button, { minWidth: 50 }, (searching || query.trim().length < 3) && { opacity: 0.5 }]}
          >
            <Ionicons name="search-outline" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Quick Stop Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {stops.map(stop => {
            const active = destination?.id === stop.id && !place;
            return (
              <TouchableOpacity
                key={stop.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => chooseDestination(stop)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? Colors.ink : Colors.sand,
                  borderWidth: 1,
                  borderColor: active ? Colors.ink : Colors.border,
                }}
              >
                <Ionicons name="bus-outline" size={14} color={active ? Colors.white : Colors.subtleGray} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? Colors.white : Colors.ink }}>
                  {stop.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {searching && <Text accessibilityLiveRegion="polite" style={s.muted}>Searching places…</Text>}
        {!!searchError && <Text accessibilityRole="alert" style={s.body}>{searchError}</Text>}

        {searchOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 }}>
            {places.map(value => (
              <TouchableOpacity
                key={value.id}
                accessibilityRole="button"
                onPress={() => choosePlace(value)}
                style={{ minHeight: 52, paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderColor: Colors.border }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location-outline" size={18} color={Colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { fontWeight: '600' }]}>{value.name}</Text>
                  <Text style={s.muted}>{value.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} />
              </TouchableOpacity>
            ))}
            {searched && !places.length && !searching && (
              <Text style={s.body}>No places found. Add a street or city name and search again.</Text>
            )}
            {!searched && results.length > 0 && (
              <>
                <Text style={[s.eyebrow, { marginTop: 4, marginBottom: 6 }]}>Route landmarks</Text>
                {results.map(stop => (
                  <TouchableOpacity
                    key={stop.id}
                    accessibilityRole="button"
                    onPress={() => chooseDestination(stop)}
                    style={{ minHeight: 48, paddingVertical: 11, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderColor: Colors.border }}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="bus-outline" size={16} color={Colors.ink} />
                    </View>
                    <Text style={[s.body, { flex: 1, fontWeight: '600' }]}>{stop.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {place && !searchOpen && (
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
            <Text style={s.label}>{place.name}</Text>
            <Text style={s.muted}>{place.address}</Text>
            {placeMatch ? (
              <>
                <Text style={[s.body, { fontWeight: '600', marginTop: 2 }]}>
                  {placeMatch.verified ? 'Nearest recorded stop' : 'Nearby route landmark'}: {placeMatch.stop.name}
                </Text>
                <Text style={s.muted}>
                  {Math.round(placeMatch.distance)} m straight-line estimate. {placeMatch.verified ? 'Check the walking route and loading signs.' : 'Exact boarding point awaiting confirmation; this is not walking guidance.'}
                </Text>
              </>
            ) : (
              <Text style={s.body}>No recorded route stop within 2 km of this destination. Choose another place to find a matching unit.</Text>
            )}
          </View>
        )}

        {destination && !searchOpen && (
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.muted, { flex: 1 }]}>Route 1 · MRT Buendia–Mandaluyong City Hall</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setSearchOpen(true)} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
              <Text style={s.link}>Change destination</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
          <Text style={s.muted}>Place search: OpenStreetMap / Photon · Metro Manila</Text>
        </TouchableOpacity>
      </View>

      <PassengerStopGuide
        openRequest={route?.params?.showStopGuide}
        boarding={boarding}
        zones={zones}
        landmarks={stops}
        onRefresh={refreshZones}
        loading={zonesLoading}
        loadError={zonesError}
      />

      {/* Map & Fleet View */}
      <View style={[s.section, { padding: 0, overflow: 'hidden', gap: 0 }]}>
        <View style={[s.row, { padding: 16, justifyContent: 'space-between' }]}>
          <View style={{ gap: 2 }}>
            <Text style={s.sectionTitle}>{destination ? `${displayed.length} units on this route` : 'Live Route Map'}</Text>
            <Text style={s.muted}>{mode === 'live' ? 'Real-time GPS telemetry' : 'Interactive sample preview'}</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: Colors.sand, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: Colors.border }}>
            {(['live', 'sample'] as const).map(value => {
              const active = mode === value;
              return (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => selectMode(value)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: active ? Colors.ink : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? Colors.white : Colors.subtleGray }}>
                    {value === 'live' ? 'Live units' : 'Sample units'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 400, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border }}>
          <LeafletMap
            ref={map}
            destinationPlace={place}
            hideOccupancy
            routes={[]}
            terminals={[]}
            vehicles={displayed}
            userLocation={locationFresh && mode === 'live' ? location.coords : null}
            selectedVehicle={currentSelected}
            isOffline={mode === 'live' && !isConnected}
            onSelectVehicle={selectVehicle}
          />
        </View>

        <View style={{ padding: 16, gap: 6, backgroundColor: Colors.sand }}>
          <Text style={s.muted}>
            {!destination
              ? 'Choose a destination above to show matching units on the map.'
              : mode === 'sample'
                ? 'Sample positions for testing. Tap a unit marker to preview boarding.'
                : !isConnected
                  ? 'Offline. Connect to see current units.'
                  : displayed.length
                    ? 'Units serving this route. Confirm the direction with the driver before boarding.'
                    : 'No available units are broadcasting on this route.'}
          </Text>
          {mode === 'live' && (
            <Text style={s.muted}>{errorMsg ? 'Allow location access in your device settings to detect your ride.' : signal}</Text>
          )}
        </View>
      </View>

      {/* Selected Vehicle Drawer Card */}
      {currentSelected && (
        <View
          onLayout={e => {
            selectionY.current = e.nativeEvent.layout.y;
            scroll.current?.scrollTo({ y: selectionY.current - 12, animated: true });
          }}
          style={[s.section, { borderColor: Colors.ink }]}
        >
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={s.row}>
                <Text style={s.sectionTitle}>{currentSelected.body_number}</Text>
                <View style={[s.pill, { backgroundColor: currentSelected.is_sample ? Colors.warningBg : Colors.successBg, borderColor: 'transparent' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: currentSelected.is_sample ? Colors.warning : Colors.success }}>
                    {currentSelected.is_sample ? 'Sample unit' : 'Live location'}
                  </Text>
                </View>
              </View>
              <Text style={s.body}>Plate {currentSelected.plate_number}</Text>
            </View>
            {currentSelected.is_sample ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  triggerHaptic('success');
                  scrollToRide.current = true;
                  setUnit({ vehicle_id: currentSelected.vehicle_id, body_number: currentSelected.body_number, plate_number: currentSelected.plate_number, source: 'sample' });
                  setSelected(null);
                }}
                style={s.button}
              >
                <Text style={s.buttonText}>Preview boarding</Text>
              </TouchableOpacity>
            ) : nearby.some(v => v.vehicle_id === currentSelected.vehicle_id) ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  triggerHaptic('success');
                  scrollToRide.current = true;
                  setUnit({ vehicle_id: currentSelected.vehicle_id, body_number: currentSelected.body_number, plate_number: currentSelected.plate_number, source: 'confirmed' });
                  setSelected(null);
                }}
                style={s.button}
              >
                <Text style={s.buttonText}>I boarded this unit</Text>
              </TouchableOpacity>
            ) : (
              <Text style={s.muted}>Board at a marked stop. GPS will check your unit as you travel.</Text>
            )}
          </View>
        </View>
      )}

      {/* Units List */}
      {destination && (
        <View style={s.section}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.sectionTitle}>Units for your destination</Text>
            <Text style={s.muted}>{displayed.length} available</Text>
          </View>
          {displayed.map(v => (
            <TouchableOpacity
              key={v.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${v.body_number}, plate ${v.plate_number}`}
              onPress={() => {
                selectVehicle(v);
                map.current?.centerOn(v.latitude, v.longitude, 16);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 10,
                backgroundColor: Colors.sand,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bus" size={20} color={Colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { fontSize: 14 }]}>{v.body_number} · {v.plate_number}</Text>
                <Text style={s.muted}>{v.is_sample ? 'Sample unit' : 'Live GPS location'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
            </TouchableOpacity>
          ))}
          {!displayed.length && <Text style={s.body}>No units to show. Try the sample fleet to preview the journey.</Text>}
        </View>
      )}
    </FormScrollView>
  );
}
