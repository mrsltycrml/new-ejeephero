import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { passengerStyles as s } from './PassengerUI';
import type { WalkingRoute } from '../services/walkingDirections';

export default function WalkingDirectionsPanel({ route, fromLabel, toLabel }: { route: WalkingRoute; fromLabel: string; toLabel: string }) {
  return <View style={s.section}>
    <Text style={s.sectionTitle}>Walking directions</Text>
    <Text style={s.body}>{fromLabel} → {toLabel}</Text>
    <Text style={s.label}>{Math.round(route.distance_meters)} m · about {Math.ceil(route.duration_seconds / 60)} min</Text>
    <Text style={s.muted}>{route.accessible === true ? 'Step-free access recorded for this path.' : route.accessible === false ? 'This path is not marked step-free.' : 'Accessibility unconfirmed. Check steps and crossings on your journey.'}</Text>
    {route.steps.map((step, index) => <View key={index} style={{ gap: 3 }}>
      <Text style={s.body}>{index + 1}. {step.instruction}</Text>
      <Text style={s.muted}>{Math.round(step.distance_meters)} m</Text>
    </View>)}
    <TouchableOpacity accessibilityRole="link" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openURL(route.source_url)}>
      <Text style={s.link}>Walking path source · {new Date(route.verified_at).toLocaleDateString()}</Text>
    </TouchableOpacity>
  </View>;
}
