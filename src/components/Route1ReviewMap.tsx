import React, { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import LeafletMap from './LeafletMap';
import { validPoint, type Point } from '../services/locationQuality';
import type { Route1Direction, Route1FieldPin, Route1Variant } from '../services/route1FieldMap';

export interface Route1ReviewMapProps {
  variant: Route1Variant;
  direction: Route1Direction;
  pins: Route1FieldPin[];
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  onPickCurb?: (point: Point) => void;
  draftCurb?: Point | null;
}

export default function Route1ReviewMap({ variant, direction, pins, selectedPinId, onSelectPin, onPickCurb, draftCurb }: Route1ReviewMapProps) {
  const overlay = useMemo(() => {
    const points = pins.map(pin => ({
      ...pin.point, id: pin.id, name: pin.name, isSelected: pin.id === selectedPinId,
      role: pin.kind === 'curb' ? 'Curb' : pin.kind === 'landmark' ? 'Landmark' : 'Platform',
    }));
    const curb = draftCurb && validPoint(draftCurb) ? draftCurb : null;
    if (curb) points.push({ ...curb, id: 'draft-curb', name: 'Curb being edited', isSelected: true, role: 'Curb' });
    const line = { id: variant.id, name: variant.label, coordinates: variant[direction],
      color_code: direction === 'outbound' ? '#19745e' : '#76549c', isSelected: true };
    const focus = curb ?? points.find(p => p.id === selectedPinId);
    return { line, pins: points, fitPoints: focus ? [focus] : [...line.coordinates, ...points],
      cameraKey: [variant.id, direction, selectedPinId, !!curb].join('/'), onSelect: onSelectPin, onPickCurb };
  }, [variant, direction, pins, selectedPinId, draftCurb, onSelectPin, onPickCurb]);
  const source = direction === 'outbound' ? variant.source : variant.returnSource;
  return <View>
    <View style={styles.map}>
      <LeafletMap preferMapcn routes={[]} terminals={[]} vehicles={[]} fieldReview={overlay} />
    </View>
    <View style={styles.key}>
      <Text style={styles.label}>P · Platform     L · Landmark{draftCurb || pins.some(pin => pin.kind === 'curb') ? '     C · Stop curb' : ''}</Text>
      <Pressable accessibilityRole="link" accessibilityLabel="Open the dated OpenStreetMap route record" onPress={() => void Linking.openURL(source)}>
        <Text style={[styles.label, styles.source]}>© OpenStreetMap contributors · Route source</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  map: { height: 310, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#C9DAD6', backgroundColor: '#EDF2EE' },
  key: { gap: 4, paddingVertical: 8 },
  label: { color: '#314C52', fontSize: 13 },
  source: { color: '#175D75', textDecorationLine: 'underline' },
});
