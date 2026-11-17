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
      {/* MAP-FIRST HERO COCKPIT */}
      <View style={[s.heroBanner, { padding: 0, overflow: 'hidden', gap: 0 }]}>
        {/* Top Dark Command Header */}
        <View style={{ padding: 18, paddingBottom: 14, gap: 12 }}>
          <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brandMintLight }} />
                <Text style={s.eyebrow}>Route 01 · Electric Transit Cockpit</Text>
              </View>
              <Text style={s.heroTitle}>Where are you going?</Text>
            </View>
            <SOSButton
              activeVehicleId={unit?.vehicle_id}
              activeVehicleBody={unit?.body_number}
              activeVehiclePlate={unit?.plate_number || undefined}
              activeVehicleIsSample={unit?.source === 'sample'}
            />
          </View>

          {/* Mode Switcher + Route Status Bar */}
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={s.pillDark}>
              <Ionicons name="analytics-outline" size={13} color={Colors.brandMintLight} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#E2E8F0' }}>
                {destination ? `${displayed.length} units on ${destination.name}` : 'Select a stop below to show units'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: Colors.brandSurfaceDark, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: '#1E463E' }}>
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
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: active ? Colors.brandMint : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: active ? Colors.ink : '#94A3B8' }}>
                      {value === 'live' ? 'LIVE GPS' : 'SAMPLE FLEET'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Full-Bleed Map Viewport at Top */}
        <View style={{ height: 350, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1E463E' }}>
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

        {/* Telemetry Status Footer */}
        <View style={{ paddingHorizontal: 18, paddingVertical: 11, backgroundColor: Colors.brandSurfaceDark, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="radio-outline" size={16} color={Colors.brandMintLight} />
          <Text style={{ flex: 1, fontSize: 12, color: '#A7F3D0', fontWeight: '600' }}>
            {!destination
              ? 'Tap any numbered stop card below or search a street to filter units.'
              : mode === 'sample'
                ? 'Sample preview active · Tap a vehicle marker to test boarding.'
                : !isConnected
                  ? 'Offline · Reconnect for live telemetry.'
                  : errorMsg
                    ? 'Enable device location to auto-detect your boarded e-jeep.'
                    : signal}
          </Text>
        </View>
      </View>

      {/* ACTIVE RIDE TRANSPONDER CARD */}
      {unit && (
        <View
          onLayout={e => {
            if (scrollToRide.current) {
              scroll.current?.scrollTo({ y: e.nativeEvent.layout.y - 12, animated: true });
              scrollToRide.current = false;
            }
          }}
          accessibilityLiveRegion="polite"
          style={[s.heroBanner, { backgroundColor: '#064E3B', borderColor: Colors.brandMint }]}
        >
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.eyebrow}>{unit.source === 'sample' ? 'SAMPLE TRANSPONDER LINKED' : 'LIVE RIDE TRANSPONDER'}</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: Colors.white }}>
                {unit.body_number} · {unit.plate_number}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => { endRide(); setQuery(''); setSearchOpen(true); setSelected(null); }}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.white }}>End ride</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: '#D1FAE5' }}>{signal} SOS automatically includes this vehicle.</Text>
        </View>
      )}

      {/* SELECTED VEHICLE BOARDING SHEET */}
      {currentSelected && (
        <View
          onLayout={e => {
            selectionY.current = e.nativeEvent.layout.y;
            scroll.current?.scrollTo({ y: selectionY.current - 12, animated: true });
          }}
          style={[s.heroBanner]}
        >
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.eyebrow}>{currentSelected.is_sample ? 'SAMPLE E-JEEP UNIT' : 'LIVE BROADCASTING UNIT'}</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: Colors.white }}>{currentSelected.body_number}</Text>
              <Text style={{ fontSize: 13, color: '#A7F3D0', fontWeight: '600' }}>Plate {currentSelected.plate_number}</Text>
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
                style={s.buttonMint}
              >
                <Ionicons name="checkmark-circle" size={18} color={Colors.ink} />
                <Text style={{ fontSize: 14, fontWeight: '900', color: Colors.ink }}>Preview boarding</Text>
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
                style={s.buttonMint}
              >
                <Ionicons name="checkmark-circle" size={18} color={Colors.ink} />
                <Text style={{ fontSize: 14, fontWeight: '900', color: Colors.ink }}>I boarded this unit</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ fontSize: 12, color: '#A7F3D0', maxWidth: 160 }}>Board at a designated stop. GPS verifies your ride.</Text>
            )}
          </View>
        </View>
      )}

      {/* DESTINATION SEARCH & NUMBERED STOP CAROUSEL */}
      <View style={s.section}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={s.eyebrow}>Destination Finder</Text>
            <Text style={s.sectionTitle}>Choose stop or search street</Text>
          </View>
          {destination && !searchOpen && (
            <TouchableOpacity accessibilityRole="button" onPress={() => setSearchOpen(true)} style={s.pill}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.ink }}>Change</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Numbered Route Stop Cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {stops.map((stop, idx) => {
            const active = destination?.id === stop.id && !place;
            return (
              <TouchableOpacity
                key={stop.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => chooseDestination(stop)}
                style={{
                  width: 156,
                  padding: 13,
                  borderRadius: 16,
                  backgroundColor: active ? Colors.ink : Colors.sand,
                  borderWidth: 1.5,
                  borderColor: active ? Colors.brandMint : Colors.border,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: active ? Colors.brandMint : Colors.paper }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: Colors.ink }}>STOP 0{idx + 1}</Text>
                  </View>
                  <Ionicons name={active ? 'checkmark-circle' : 'arrow-forward-circle-outline'} size={18} color={active ? Colors.brandMintLight : Colors.subtleGray} />
                </View>
                <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '800', color: active ? Colors.white : Colors.ink, lineHeight: 17 }}>
                  {stop.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

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
            placeholder="Or type any building, street, or landmark…"
            placeholderTextColor={Colors.subtleGray}
            style={[s.input, { flex: 1, minWidth: 0, flexShrink: 1 }]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Search places"
            disabled={searching || query.trim().length < 3}
            accessibilityState={{ disabled: searching || query.trim().length < 3 }}
            onPress={searchPlaces}
            style={[s.buttonMint, { minWidth: 52 }, (searching || query.trim().length < 3) && { opacity: 0.45 }]}
          >
            <Ionicons name="search" size={20} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        {searching && <Text accessibilityLiveRegion="polite" style={s.muted}>Searching Metro Manila places…</Text>}
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
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location" size={17} color={Colors.brandMintLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { fontWeight: '700' }]}>{value.name}</Text>
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
                <Text style={[s.eyebrow, { marginTop: 4, marginBottom: 6 }]}>Matching Route Landmarks</Text>
                {results.map(stop => (
                  <TouchableOpacity
                    key={stop.id}
                    accessibilityRole="button"
                    onPress={() => chooseDestination(stop)}
                    style={{ minHeight: 48, paddingVertical: 11, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderColor: Colors.border }}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="bus" size={15} color={Colors.ink} />
                    </View>
                    <Text style={[s.body, { flex: 1, fontWeight: '700' }]}>{stop.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {place && !searchOpen && (
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
            <Text style={s.label}>{place.name}</Text>
            <Text style={s.muted}>{place.address}</Text>
            {placeMatch ? (
              <>
                <Text style={[s.body, { fontWeight: '700', marginTop: 2 }]}>
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

        <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
          <Text style={s.muted}>Place search: OpenStreetMap / Photon · Metro Manila</Text>
        </TouchableOpacity>
      </View>

      {/* ACTIVE FLEET ROSTER FOR SELECTED STOP */}
      {destination && (
        <View style={s.section}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View>
              <Text style={s.eyebrow}>Dispatched E-Jeeps</Text>
              <Text style={s.sectionTitle}>Units serving {destination.name}</Text>
            </View>
            <View style={s.pill}>
              <Text style={s.label}>{displayed.length} active</Text>
            </View>
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
                padding: 14,
                borderRadius: 14,
                backgroundColor: Colors.sand,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bus" size={20} color={Colors.brandMintLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.ink }}>{v.body_number} · {v.plate_number}</Text>
                <Text style={s.muted}>{v.is_sample ? 'Sample fleet unit · Tap to preview' : 'Live GPS telemetry · Tap to locate'}</Text>
              </View>
              <Ionicons name="locate" size={18} color={Colors.brandMint} />
            </TouchableOpacity>
          ))}
          {!displayed.length && <Text style={s.body}>No units to show. Switch to Sample Fleet on the map to preview the journey.</Text>}
        </View>
      )}

      <PassengerStopGuide
        openRequest={route?.params?.showStopGuide}
        boarding={boarding}
        zones={zones}
        landmarks={stops}
        onRefresh={refreshZones}
        loading={zonesLoading}
        loadError={zonesError}
      />
    </FormScrollView>
  );
}
