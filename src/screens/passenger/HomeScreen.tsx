import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Linking, Platform, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap, { type LeafletMapRef } from '../../components/LeafletMap';
import PassengerStopGuide from "../../components/PassengerStopGuide";
import SOSButton from '../../components/SOSButton';
import { passengerStyles as s } from '../../components/PassengerUI';
import { useLocation } from '../../contexts/LocationContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { usePassengerJourney } from '../../contexts/PassengerJourneyContext';
import { offlineTransit, MAKATI_OFFICIAL_TERMINALS, MAKATI_PRIMARY_ROUTE, type TerminalData, type VehicleData } from '../../services/offlineTransitService';
import { SAMPLE_PASSENGER_VEHICLES } from '../../constants/samplePassengerFleet';
import { loadLoadingZones } from '../../services/passengerDataService';
import { evaluateBoardingLocation, type LoadingZone } from '../../services/passengerSafety';
import { searchPassengerPlaces } from "../../services/placeSearchService";
import { nearestRouteStop, type PassengerPlace } from "../../services/passengerPlaces";
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
  const [searchError, setSearchError] = useState("");
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
    if (warningKey && lastWarning.current !== warningKey) { if (Platform.OS !== 'web') Vibration.vibrate([0, 150, 100, 150]); }
    lastWarning.current = warningKey;
  }, [warningKey]);
  const results = stops.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const displayed = destination ? (mode === 'sample' ? SAMPLE_PASSENGER_VEHICLES : isConnected ? vehicles : []).filter(v => v.route_id === destination.route_id) : [];
  const currentSelected = selected ? displayed.find(v => v.vehicle_id === selected.vehicle_id) || null : null;
  const locationFresh = location && now - location.timestamp < 60_000;
  const chooseDestination = (stop: TerminalData) => {
    setPlace(null); setDestination(stop); setQuery(stop.name); setSearchOpen(false); setSelected(null);
    // Fit the existing route's service area; do not invent a route line or stop pin.
    map.current?.centerOn(14.568, 121.033, 14);
  };
  const searchPlaces = async () => {
    const version = ++searchVersion.current;
    setSearching(true); setSearchError(""); setSearchOpen(true);
    try { const found = await searchPassengerPlaces(query); if (version === searchVersion.current) { setPlaces(found); setSearched(true); } }
    catch (error: any) { if (version === searchVersion.current) setSearchError(error.message); }
    finally { if (version === searchVersion.current) setSearching(false); }
  };
  const choosePlace = (value: PassengerPlace) => {
    const nearest = nearestRouteStop(value, stops);
    setPlace(value); setDestination(nearest?.stop || null); setQuery(value.name); setSearchOpen(false); setSelected(null);
    map.current?.centerOn(value.latitude, value.longitude, 15);
  };
  const placeMatch = place ? nearestRouteStop(place, stops) : null;
  const selectMode = (value: 'live' | 'sample') => { setMode(value); setSelected(null); };
  const selectVehicle = (vehicle: VehicleData) => {
    setSelected(vehicle);
    if (selectionY.current) scroll.current?.scrollTo({ y: selectionY.current - 12, animated: true });
  };
  return <ScrollView ref={scroll} style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <View style={[s.row, { justifyContent: 'space-between' }]}><View><Text style={s.title}>Where are you going?</Text><Text style={s.subtitle}>Find a unit for your destination.</Text></View><SOSButton activeVehicleId={unit?.vehicle_id} activeVehicleBody={unit?.body_number} activeVehiclePlate={unit?.plate_number || undefined} activeVehicleIsSample={unit?.source === 'sample'} /></View>
    <View style={s.section}>
      <Text style={s.label}>Destination</Text>
      <View style={[s.row, { flexWrap: "nowrap" }]}><TextInput accessibilityLabel="Search destination" value={query} onFocus={() => setSearchOpen(true)} onChangeText={value => { searchVersion.current++; setQuery(value); setSearchOpen(true); setPlaces([]); setSearched(false); setSearching(false); setSearchError(""); }} onSubmitEditing={searchPlaces} returnKeyType="search" placeholder="Search a place, street, or landmark" placeholderTextColor={Colors.subtleGray} style={[s.input, { flex: 1, minWidth: 0, flexShrink: 1 }]} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="Search places" disabled={searching || query.trim().length < 3} accessibilityState={{ disabled: searching || query.trim().length < 3 }} onPress={searchPlaces} style={[s.button, (searching || query.trim().length < 3) && { opacity: 0.55 }]}><Ionicons name="search-outline" size={20} color={Colors.white} /></TouchableOpacity></View>
      {searching && <Text accessibilityLiveRegion="polite" style={s.muted}>Searching places…</Text>}
      {!!searchError && <Text accessibilityRole="alert" style={s.body}>{searchError}</Text>}
      {searchOpen && <View>{places.map(value => <TouchableOpacity key={value.id} accessibilityRole="button" onPress={() => choosePlace(value)} style={{ minHeight: 52, paddingVertical: 13, flexDirection: "row", gap: 10, alignItems: "center", borderBottomWidth: 1, borderColor: Colors.border }}><Ionicons name="location-outline" size={19} color={Colors.subtleGray} /><View style={{ flex: 1 }}><Text style={s.body}>{value.name}</Text><Text style={s.muted}>{value.address}</Text></View><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>)}{searched && !places.length && !searching && <Text style={s.body}>No places found. Add a street or city name and search again.</Text>}{!searched && results.length > 0 && <><Text style={s.muted}>Or choose a route landmark</Text>{results.map(stop => <TouchableOpacity key={stop.id} accessibilityRole="button" onPress={() => chooseDestination(stop)} style={{ minHeight: 48, paddingVertical: 13, flexDirection: "row", gap: 10, alignItems: "center", borderBottomWidth: 1, borderColor: Colors.border }}><Ionicons name="bus-outline" size={19} color={Colors.subtleGray} /><Text style={[s.body, { flex: 1 }]}>{stop.name}</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>)}</>}</View>}
      {place && !searchOpen && <View style={{ gap: 6 }}><Text style={s.label}>{place.name}</Text><Text style={s.muted}>{place.address}</Text>{placeMatch ? <><Text style={s.body}>{placeMatch.verified ? "Nearest recorded stop" : "Nearby route landmark"}: {placeMatch.stop.name}</Text><Text style={s.muted}>{Math.round(placeMatch.distance)} m straight-line estimate. {placeMatch.verified ? "Check the walking route and loading signs." : "Exact boarding point awaiting confirmation; this is not walking guidance."}</Text></> : <Text style={s.body}>No recorded route stop within 2 km of this destination. Choose another place to find a matching unit.</Text>}</View>}
      {destination && !searchOpen && <View style={[s.row, { justifyContent: "space-between" }]}><Text style={[s.muted, { flex: 1 }]}>Route 1 · MRT Buendia–Mandaluyong City Hall</Text><TouchableOpacity accessibilityRole="button" onPress={() => setSearchOpen(true)} style={{ padding: 10 }}><Text style={s.link}>Change destination</Text></TouchableOpacity></View>}
      <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright")}><Text style={s.muted}>Place search: OpenStreetMap / Photon · Metro Manila</Text></TouchableOpacity>
    </View>
    <PassengerStopGuide openRequest={route?.params?.showStopGuide} boarding={boarding} zones={zones} landmarks={stops} onRefresh={refreshZones} loading={zonesLoading} loadError={zonesError} />
    {unit && <View onLayout={e => { if (scrollToRide.current) { scroll.current?.scrollTo({ y: e.nativeEvent.layout.y - 12, animated: true }); scrollToRide.current = false; } }} accessibilityLiveRegion="polite" style={s.section}><View style={[s.row, { justifyContent: 'space-between' }]}><View style={{ flex: 1 }}><Text style={s.sectionTitle}>{unit.source === 'sample' ? 'Sample ride' : 'Your ride'} · {unit.body_number}</Text><Text style={s.body}>Plate {unit.plate_number}</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => { endRide(); setQuery(''); setSearchOpen(true); setSelected(null); }} style={[s.button, s.secondary]}><Text style={s.label}>End ride</Text></TouchableOpacity></View><Text style={s.muted}>{signal} SOS uses these details without typing them.</Text></View>}

    <View style={[s.section, { padding: 0, overflow: 'hidden', gap: 0 }]}>
      <View style={[s.row, { padding: 16, justifyContent: 'space-between' }]}><Text style={s.sectionTitle}>{destination ? `${displayed.length} units on this route` : 'Route map'}</Text><View style={s.row}>{(['live', 'sample'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => selectMode(value)} style={[s.button, s.secondary, mode === value && { backgroundColor: Colors.sand, borderColor: Colors.ink }]}><Text style={s.label}>{value === 'live' ? 'Live units' : 'Sample units'}</Text></TouchableOpacity>)}</View></View>
      <View style={{ height: 380 }}><LeafletMap ref={map} destinationPlace={place} hideOccupancy routes={[]} terminals={[]} vehicles={displayed} userLocation={locationFresh && mode === 'live' ? location.coords : null} selectedVehicle={currentSelected} isOffline={mode === 'live' && !isConnected} onSelectVehicle={selectVehicle} /></View>
      <View style={{ padding: 16, gap: 8 }}><Text style={s.muted}>{!destination ? 'Choose a destination to show matching units.' : mode === 'sample' ? 'Sample positions for testing. Tap a unit to preview boarding.' : !isConnected ? 'Offline. Connect to see current units.' : displayed.length ? 'Units serving this route. Confirm the direction with the driver before boarding.' : 'No available units are broadcasting on this route.'}</Text>{mode === 'live' && <Text style={s.muted}>{errorMsg ? 'Allow location access in your device settings to detect your ride.' : signal}</Text>}</View>
    </View>
    {currentSelected && <View onLayout={e => { selectionY.current = e.nativeEvent.layout.y; scroll.current?.scrollTo({ y: selectionY.current - 12, animated: true }); }} style={s.section}><View style={[s.row, { justifyContent: 'space-between' }]}><View style={{ flex: 1 }}><Text style={s.sectionTitle}>{currentSelected.body_number}</Text><Text style={s.body}>Plate {currentSelected.plate_number}</Text><Text style={s.muted}>{currentSelected.is_sample ? "Sample unit" : "Live location"}</Text></View>{currentSelected.is_sample ? <TouchableOpacity accessibilityRole="button" onPress={() => { scrollToRide.current = true; setUnit({ vehicle_id: currentSelected.vehicle_id, body_number: currentSelected.body_number, plate_number: currentSelected.plate_number, source: 'sample' }); setSelected(null); }} style={s.button}><Text style={s.buttonText}>Preview boarding</Text></TouchableOpacity> : nearby.some(v => v.vehicle_id === currentSelected.vehicle_id) ? <TouchableOpacity accessibilityRole="button" onPress={() => { scrollToRide.current = true; setUnit({ vehicle_id: currentSelected.vehicle_id, body_number: currentSelected.body_number, plate_number: currentSelected.plate_number, source: 'confirmed' }); setSelected(null); }} style={s.button}><Text style={s.buttonText}>I boarded this unit</Text></TouchableOpacity> : <Text style={s.muted}>Board at a marked stop. GPS will check your unit as you travel.</Text>}</View></View>}
    {destination && <View style={s.section}><Text style={s.sectionTitle}>Units for your destination</Text>{displayed.map(v => <TouchableOpacity key={v.id} accessibilityRole="button" accessibilityLabel={`View ${v.body_number}, plate ${v.plate_number}`} onPress={() => { selectVehicle(v); map.current?.centerOn(v.latitude, v.longitude, 16); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: Colors.border }}><Ionicons name="bus-outline" size={24} color={Colors.subtleGray} /><View style={{ flex: 1 }}><Text style={s.label}>{v.body_number} · {v.plate_number}</Text><Text style={s.muted}>{v.is_sample ? "Sample unit" : "Live location"}</Text></View><Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} /></TouchableOpacity>)}{!displayed.length && <Text style={s.body}>No units to show. Try the sample fleet to preview the journey.</Text>}</View>}

  </ScrollView>;
}
