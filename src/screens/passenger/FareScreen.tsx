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

const TYPES: { id: FarePassengerType; name: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'regular', name: 'Regular', icon: 'person-outline' },
  { id: 'student', name: 'Student', icon: 'school-outline' },
  { id: 'senior', name: 'Senior citizen', icon: 'heart-outline' },
  { id: 'pwd', name: 'PWD', icon: 'accessibility-outline' },
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
      <View>
        <Text style={s.eyebrow}>Tariff & Concessions</Text>
        <Text style={s.title}>Fare calculator</Text>
        <Text style={s.subtitle}>Estimate your e-jeepney fare before boarding.</Text>
      </View>

      <View style={s.section}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.sectionTitle}>MRT Buendia – Mandaluyong City Hall</Text>
          <View style={s.pill}>
            <Ionicons name="flash-outline" size={13} color={Colors.ink} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.ink }}>Modern E-Jeep</Text>
          </View>
        </View>

        {/* Passenger Type Selector */}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Passenger category</Text>
          <View style={s.row}>
            {TYPES.map(item => {
              const selected = type === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { triggerHaptic('light'); setType(item.id); }}
                  style={[
                    s.button,
                    s.secondary,
                    { flexGrow: 1, paddingHorizontal: 12 },
                    selected && { borderColor: Colors.ink, backgroundColor: Colors.ink },
                  ]}
                >
                  <Ionicons name={item.icon} size={16} color={selected ? Colors.white : Colors.ink} />
                  <Text style={[s.label, { color: selected ? Colors.white : Colors.ink }]}>{item.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Segmented Mode Toggle */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.sand, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: Colors.border }}>
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
                  minHeight: 40,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? Colors.paper : 'transparent',
                }}
              >
                <Text style={[s.label, { color: active ? Colors.ink : Colors.subtleGray }]}>
                  {value === 'distance' ? 'Enter distance' : 'Choose stops'}
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
              <Text accessibilityRole="alert" style={[s.muted, { color: Colors.primaryRed }]}>
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

        {/* Transit Ticket Quote Card */}
        {quote && (
          <View style={{ backgroundColor: Colors.sand, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={{ gap: 2 }}>
                <Text style={s.eyebrow}>{quote.basis}</Text>
                <Text style={[s.label, { fontSize: 15 }]}>
                  {TYPES.find(t => t.id === type)?.name} · {Number(km).toFixed(2)} km
                </Text>
              </View>
              <Text style={{ fontSize: 36, fontWeight: '800', color: Colors.ink, fontVariant: ['tabular-nums'] }}>
                {peso(quote.amount)}
              </Text>
            </View>
            {quote.official ? (
              <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(quote.source!)}>
                <Text style={s.link}>View LTFRB fare matrix</Text>
              </TouchableOpacity>
            ) : (
              <Text style={s.muted}>
                First 4 km: ₱{type === 'regular' ? ESAKAY_OPERATIONS.regularBaseFare : ESAKAY_OPERATIONS.discountedBaseFare}. Add ₱1 per km after 4 km. Operator-provided rates; confirm against the fare matrix displayed in the unit.
              </Text>
            )}
            {type !== 'regular' && (
              <Text style={[s.muted, { fontWeight: '600', color: Colors.ink }]}>
                Bring your valid student, senior citizen, or PWD identification.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Walk & Save Section */}
      <View style={s.section}>
        <View style={s.row}>
          <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="walk-outline" size={20} color={Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>Walk & save</Text>
            <Text style={s.muted}>Compare boarding at a nearby stop to reduce your fare.</Text>
          </View>
        </View>
        <View style={[s.row, { justifyContent: 'space-between', backgroundColor: Colors.sand, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border }]}>
          <Text style={[s.label, { flex: 1 }]}>Step-free walking routes only</Text>
          <Switch accessibilityLabel="Step-free walking routes only" value={stepFree} onValueChange={setStepFree} trackColor={{ true: Colors.ink }} />
        </View>
        {savings.length ? (
          savings.map(item => (
            <View key={item.stop.id} style={{ backgroundColor: Colors.successBg, borderRadius: 10, padding: 14, gap: 6 }}>
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
              ? 'Choose your boarding stop and destination to check nearby options.'
              : 'No verified cheaper walking option is available for this journey.'}
          </Text>
        )}
      </View>
    </FormScrollView>
  );
}
