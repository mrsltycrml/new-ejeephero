import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import { FormScrollView, SkeletonBlock, triggerHaptic } from '../../components/AppUI';
import { Colors } from '../../constants/theme';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';
import { MAKATI_PRIMARY_ROUTE } from '../../services/offlineTransitService';
import { loadPassengerPlanningData } from '../../services/passengerDataService';
import { findVerifiedSavings, quotePassengerFare, verifiedRideDistance } from '../../services/passengerFare';
import type { FarePassengerType } from '../../services/fareCalculator';

const TYPES: { id: FarePassengerType; name: string; tag: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'regular', name: 'Regular', tag: 'Standard', icon: 'person' },
  { id: 'student', name: 'Student', tag: '20% Discount', icon: 'school' },
  { id: 'senior', name: 'Senior citizen', tag: '20% Discount', icon: 'heart' },
  { id: 'pwd', name: 'PWD', tag: '20% Discount', icon: 'accessibility' },
];
const peso = (n: number) => `₱${n.toFixed(2)}`;

export default function FareScreen() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPassengerPlanningData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'stops' | 'distance'>('distance');
  const [type, setType] = useState<FarePassengerType>('regular');
  const [distance, setDistance] = useState('4');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [stepFree, setStepFree] = useState(false);

  useEffect(() => {
    let active = true;
    loadPassengerPlanningData()
      .then(value => { if (active) setData(value); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const route = MAKATI_PRIMARY_ROUTE;
  const stops = useMemo(() => (data?.terminals || []).filter(t => t.route_id === route.id && t.location_source_url && t.location_verified_at), [data]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const matrix = data?.matrices.find(m => m.route_id === route.id && m.effective_from <= today && (!m.effective_to || m.effective_to >= today));
  const km = mode === 'distance'
    ? (distance.trim() ? Number(distance) : NaN)
    : (origin && destination ? verifiedRideDistance(origin, destination, route.id, data?.segments || []) : null);
  const quote = km == null ? null : quotePassengerFare(km, type, route, matrix, today);
  const savings = mode === 'stops' && data
    ? findVerifiedSavings({ originId: origin, destinationId: destination, routeId: route.id, type, route, stops, segments: data.segments, walks: data.walks, matrix, stepFreeOnly: stepFree, date: today })
    : [];

  return (
    <FormScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* DIGITAL BOARDING PASS HERO TICKET */}
      <View style={s.heroBanner}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.eyebrow}>eSAKAY Digital Tariff Pass</Text>
            <Text style={s.heroTitle}>Fare calculator</Text>
            <Text style={s.heroSubtitle}>MRT Buendia ↔ Mandaluyong City Hall</Text>
          </View>
          <View style={s.pillDark}>
            <Ionicons name="flash" size={13} color={Colors.brandMintLight} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.brandMintLight }}>ROUTE 01</Text>
          </View>
        </View>

        {/* Perforated Divider */}
        <View style={{ height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: '#1E463E', marginVertical: 4 }} />

        {/* Live Fare Display Inside Ticket */}
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
          <View style={{ gap: 4, flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#94A3B8' }}>
              {quote ? quote.basis : 'Estimated Fare'}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.white }}>
              {TYPES.find(t => t.id === type)?.name} · {Number.isFinite(km) && km != null ? `${Number(km).toFixed(2)} km` : 'Select stops / distance'}
            </Text>
            {type !== 'regular' && (
              <Text style={{ fontSize: 12, color: Colors.brandMintLight, fontWeight: '600' }}>
                Valid Student / Senior / PWD ID required
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 44, fontWeight: '900', color: Colors.brandMintLight, fontVariant: ['tabular-nums'] }}>
            {quote ? peso(quote.amount) : '—'}
          </Text>
        </View>

        {quote && (
          quote.official ? (
            <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(quote.source!)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.brandMintLight }}>View official LTFRB fare matrix →</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 12, lineHeight: 17, color: '#94A3B8' }}>
              First 4 km: ₱{type === 'regular' ? ESAKAY_OPERATIONS.regularBaseFare : ESAKAY_OPERATIONS.discountedBaseFare} (+₱1/km after 4 km). Confirm against the unit matrix.
            </Text>
          )
        )}
      </View>

      {/* PASSENGER CATEGORY 2x2 BENTO GRID */}
      <View style={s.section}>
        <Text style={s.eyebrow}>Step 1 · Passenger Concession</Text>
        <Text style={s.sectionTitle}>Select passenger type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {TYPES.map(item => {
            const selected = type === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => { triggerHaptic('light'); setType(item.id); }}
                style={{
                  flexGrow: 1,
                  flexBasis: 140,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: selected ? Colors.ink : Colors.sand,
                  borderWidth: 1.5,
                  borderColor: selected ? Colors.brandMint : Colors.border,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Ionicons name={item.icon} size={18} color={selected ? Colors.brandMintLight : Colors.ink} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: selected ? Colors.brandMintLight : Colors.subtleGray }}>
                    {item.tag}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: selected ? Colors.white : Colors.ink }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.divider} />

        {/* DISTANCE VS STOPS SWITCHER */}
        <Text style={s.eyebrow}>Step 2 · Trip Distance</Text>
        <View style={{ flexDirection: 'row', backgroundColor: Colors.sand, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.border }}>
          {(['distance', 'stops'] as const).map(value => {
            const active = mode === value;
            return (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => { triggerHaptic('light'); setMode(value); }}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? Colors.ink : 'transparent',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: active ? Colors.white : Colors.subtleGray }}>
                  {value === 'distance' ? 'Enter distance (km)' : 'Choose route stops'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === 'distance' ? (
          <View style={{ gap: 7 }}>
            <Text style={s.label}>Journey distance (km)</Text>
            <TextInput
              accessibilityLabel="Journey distance in kilometres"
              style={s.input}
              keyboardType="decimal-pad"
              value={distance}
              onChangeText={setDistance}
              placeholder="e.g. 6"
              placeholderTextColor={Colors.subtleGray}
            />
            <Text style={s.muted}>Use the road distance for your journey.</Text>
            {distance !== '' && (!Number.isFinite(km) || Number(km) <= 0 || Number(km) > 200) && (
              <Text accessibilityRole="alert" style={[s.muted, { color: Colors.primaryRed, fontWeight: '700' }]}>
                Enter a distance greater than 0 and up to 200 km.
              </Text>
            )}
          </View>
        ) : loading ? (
          <SkeletonBlock height={76} />
        ) : stops.length < 2 ? (
          <Text style={s.body}>Stop-to-stop distances are being verified. Use “Enter distance” to estimate your fare for now.</Text>
        ) : (
          <View style={{ gap: 14 }}>
            <PassengerSelect label="Boarding stop" value={origin} options={stops.map(t => ({ value: t.id, label: t.name }))} onSelect={setOrigin} />
            <PassengerSelect label="Destination" value={destination} options={stops.filter(t => t.id !== origin).map(t => ({ value: t.id, label: t.name }))} onSelect={setDestination} />
            {origin && destination && km == null && (
              <Text style={s.muted}>A verified road connection is not available for these stops in this direction.</Text>
            )}
          </View>
        )}
      </View>

      {/* WALK & SAVE */}
      <View style={s.section}>
        <View style={s.row}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="walk" size={20} color={Colors.brandMintLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Smart Commute</Text>
            <Text style={s.sectionTitle}>Walk & save</Text>
          </View>
        </View>
        <View style={[s.row, { justifyContent: 'space-between', backgroundColor: Colors.sand, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border }]}>
          <Text style={[s.label, { flex: 1 }]}>Step-free walking routes only</Text>
          <Switch accessibilityLabel="Step-free walking routes only" value={stepFree} onValueChange={setStepFree} trackColor={{ true: Colors.brandMint }} />
        </View>
        {savings.length ? (
          savings.map(item => (
            <View key={item.stop.id} style={{ backgroundColor: Colors.successBg, borderRadius: 14, padding: 16, gap: 6 }}>
              <Text style={[s.sectionTitle, { color: Colors.success }]}>
                Walk {item.minutes} min, save {peso(item.savings)}
              </Text>
              <Text style={s.body}>Board at {item.stop.name}. Your fare becomes {peso(item.fare)}.</Text>
              <Text style={s.muted}>{Math.round(item.walk.distance_meters)} m along a mapped walking path · Walking time is an estimate.</Text>
              <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(item.walk.source_url)}>
                <Text style={s.link}>View walking route</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={s.muted}>
            {mode !== 'stops' || !origin || !destination
              ? 'Choose your boarding stop and destination to check nearby walking savings.'
              : 'No verified cheaper walking option is available for this journey.'}
          </Text>
        )}
      </View>
    </FormScrollView>
  );
}
