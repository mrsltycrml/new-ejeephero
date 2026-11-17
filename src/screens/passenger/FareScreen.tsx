import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s, PassengerSelect } from '../../components/PassengerUI';
import { FormScrollView, SkeletonBlock, triggerHaptic } from '../../components/AppUI';
import { Colors } from '../../constants/theme';
import { loadPassengerPlanningData } from '../../services/passengerDataService';
import { findVerifiedSavings, quotePassengerFare, verifiedRideDistance } from '../../services/passengerFare';
import type { FarePassengerType } from '../../services/fareCalculator';

const TYPES: { id: FarePassengerType; name: string; helper: string }[] = [
  { id: 'regular', name: 'Regular', helper: 'Standard regular fare (no discount)' },
  { id: 'student', name: 'Student', helper: 'Student discount: 20%' },
  { id: 'senior', name: 'Senior', helper: 'Senior citizen discount: 20%' },
  { id: 'pwd', name: 'PWD', helper: 'PWD discount: 20%' },
];
const peso = (n: number) => `₱${n.toFixed(2)}`;

export default function FareScreen() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPassengerPlanningData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'distance' | 'stops'>('distance');
  const [type, setType] = useState<FarePassengerType>('regular');
  const [distance, setDistance] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [stepFree, setStepFree] = useState(false);
  const [walkExpanded, setWalkExpanded] = useState(false);
  const [showEstimate, setShowEstimate] = useState(true);

  useEffect(() => {
    let active = true;
    loadPassengerPlanningData()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const route = data?.routes[0];
  const stops = useMemo(
    () => (data?.terminals || []).filter((t) => t.route_id === route?.id && t.location_source_url && t.location_verified_at),
    [data, route?.id]
  );
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const matrix = data?.matrices.find(
    (m) => m.route_id === route?.id && m.effective_from <= today && (!m.effective_to || m.effective_to >= today)
  );
  const km =
    mode === 'distance'
      ? distance.trim()
        ? Number(distance)
        : NaN
      : origin && destination && route
        ? verifiedRideDistance(origin, destination, route?.id, data?.segments || [])
        : null;
  const validDistance = km != null && Number.isFinite(km) && Number(km) > 0 && Number(km) <= 200;
  const quoted = validDistance && route && matrix ? quotePassengerFare(Number(km), type, route, matrix, today) : null;
  const quote = quoted?.official ? quoted : null;
  const savings =
    mode === 'stops' && data && route && matrix && quote
      ? findVerifiedSavings({
          originId: origin,
          destinationId: destination,
          routeId: route?.id,
          type,
          route,
          stops,
          segments: data.segments,
          walks: data.walks,
          matrix,
          stepFreeOnly: stepFree,
          date: today,
        })
      : [];

  const activeTypeInfo = TYPES.find((t) => t.id === type) || TYPES[0];

  return (
    <FormScrollView style={s.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={s.title}>Fare</Text>
        <Text style={s.subtitle}>Estimate the cost of your ride.</Text>
      </View>

      {/* 2-Segment Mode Control */}
      <View style={styles.segmentContainer}>
        {(['distance', 'stops'] as const).map((value) => {
          const active = mode === value;
          return (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                triggerHaptic('light');
                setMode(value);
              }}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {value === 'distance' ? 'Distance' : 'Stops'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Distance or Stops Input */}
      {mode === 'distance' ? (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Distance (km)</Text>
          <TextInput
            accessibilityLabel="Journey distance in kilometres"
            style={s.input}
            keyboardType="decimal-pad"
            value={distance}
            onChangeText={(val) => {
              setDistance(val);
              setShowEstimate(true);
            }}
            placeholder="e.g. 4.0"
            placeholderTextColor={Colors.subtleGray}
          />
          {distance !== '' && !validDistance && (
            <Text accessibilityRole="alert" style={[s.muted, { color: Colors.primaryRed, fontWeight: '600' }]}>
              Enter a distance greater than 0 and up to 200 km.
            </Text>
          )}
        </View>
      ) : loading ? (
        <SkeletonBlock height={76} />
      ) : stops.length < 2 ? (
        <Text style={s.body}>
          Stop-to-stop distances are being verified. Use Distance mode to estimate your fare.
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          <PassengerSelect
            label="Boarding stop"
            value={origin}
            options={stops.map((t) => ({ value: t.id, label: t.name }))}
            onSelect={(val) => {
              setOrigin(val);
              setShowEstimate(true);
            }}
          />
          <PassengerSelect
            label="Destination"
            value={destination}
            options={stops.filter((t) => t.id !== origin).map((t) => ({ value: t.id, label: t.name }))}
            onSelect={(val) => {
              setDestination(val);
              setShowEstimate(true);
            }}
          />
        </View>
      )}

      {/* Passenger Type 2x2 Grid */}
      <View style={{ gap: 8 }}>
        <Text style={s.label}>Passenger type</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((item) => {
            const selected = type === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  triggerHaptic('light');
                  setType(item.id);
                  setShowEstimate(true);
                }}
                style={[styles.typeCard, selected && styles.typeCardSelected]}
              >
                <Text style={[styles.typeCardText, selected && styles.typeCardTextSelected]}>
                  {item.name}
                </Text>
                {selected && <Ionicons name="checkmark-circle" size={18} color={Colors.brandGreen} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={s.muted}>{activeTypeInfo.helper}</Text>
      </View>

      {/* Calculate Fare Button */}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!validDistance}
        onPress={() => {
          triggerHaptic('light');
          setShowEstimate(true);
        }}
        style={[
          styles.calculateBtn,
          !validDistance && styles.calculateBtnDisabled,
        ]}
      >
        <Text style={[styles.calculateBtnText, !validDistance && styles.calculateBtnTextDisabled]}>
          Calculate fare
        </Text>
      </TouchableOpacity>

      {!loading && !quote && <Text style={s.muted}>Fare unavailable. A route, current sourced fare matrix and trip distance are required.</Text>}
      {/* Estimated Fare Output Card */}
      {showEstimate && quote && (
        <View style={styles.quoteCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.quoteLabel}>Estimated fare · {activeTypeInfo.name}</Text>
            <Text style={s.muted}>
              {Number(km).toFixed(1)} km on {route?.name}
            </Text>
          </View>
          <Text style={styles.quoteAmount}>{peso(quote.amount)}</Text>
        </View>
      )}

      <View style={s.divider} />

      {/* Walk & Save Row */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: walkExpanded }}
        onPress={() => setWalkExpanded(!walkExpanded)}
        style={styles.walkRow}
      >
        <View style={styles.walkIconBox}>
          <Ionicons name="walk-outline" size={20} color={Colors.brandGreen} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.walkTitle}>Walk & save</Text>
          <Text style={s.muted}>Explore nearby boarding stops</Text>
        </View>
        <Ionicons name={walkExpanded ? 'chevron-up' : 'chevron-forward'} size={18} color={Colors.subtleGray} />
      </TouchableOpacity>

      {walkExpanded && (
        <View style={styles.walkExpandedBox}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.label, { flex: 1 }]}>Step-free walking routes only</Text>
            <Switch
              accessibilityLabel="Step-free walking routes only"
              value={stepFree}
              onValueChange={setStepFree}
              trackColor={{ true: Colors.brandGreen }}
            />
          </View>
          {savings.length ? (
            savings.map((item) => (
              <View key={item.stop.id} style={styles.savingItem}>
                <Text style={[s.label, { color: Colors.brandGreen }]}>
                  Walk {item.minutes} min, save {peso(item.savings)}
                </Text>
                <Text style={s.body}>
                  Board at {item.stop.name}. Your fare becomes {peso(item.fare)}.
                </Text>
                <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(item.walk.source_url)}>
                  <Text style={s.link}>View walking route</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={s.muted}>
              {mode !== 'stops' || !origin || !destination
                ? 'Switch to Stops mode and choose your boarding and destination stops to compare nearby walking options.'
                : 'Verified walking savings unavailable for this stop pair.'}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.bottomNote}>
        Estimate only. Confirm your fare with the driver.
      </Text>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 16,
  },
  headerBlock: {
    gap: 2,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.canvas,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandGreen,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeCardSelected: {
    backgroundColor: Colors.paleGreen,
    borderColor: Colors.brandGreen,
    borderWidth: 1.5,
  },
  typeCardText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  typeCardTextSelected: {
    fontWeight: '700',
  },
  calculateBtn: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  calculateBtnDisabled: {
    backgroundColor: '#D5DBD6',
  },
  calculateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  calculateBtnTextDisabled: {
    color: Colors.subtleGray,
  },
  quoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
    borderRadius: 12,
    padding: 16,
  },
  quoteLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  quoteAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.brandGreen,
    fontVariant: ['tabular-nums'],
  },
  walkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  walkIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  walkExpandedBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  savingItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.paleGreen,
    gap: 4,
  },
  bottomNote: {
    fontSize: 13,
    color: Colors.subtleGray,
    textAlign: 'center',
    marginTop: 4,
  },
});
