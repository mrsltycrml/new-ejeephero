import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import PassengerRouteRow from './PassengerRouteRow';
import { passengerStyles as s } from './PassengerUI';
import type { WalkingRoute } from '../services/walkingDirections';

export default function WalkingDirectionsPanel({ route, fromLabel, toLabel }: { route: WalkingRoute; fromLabel: string; toLabel: string }) {
  return (
    <View style={s.section}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons aria-hidden name="walk-outline" size={24} color={Colors.action} />
        <Text accessibilityRole="header" style={[s.sectionTitle, { flex: 1 }]}>Walking directions</Text>
      </View>
      <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border }}>
        <Text style={s.muted}>From {fromLabel}</Text>
        <Text style={s.sectionTitle}>To {toLabel}</Text>
        <Text style={s.label}>{Math.round(route.distance_meters)} m · about {Math.ceil(route.duration_seconds / 60)} min</Text>
      </View>
      <Text style={s.muted}>{route.accessible === true ? 'Step-free access recorded for this path.' : route.accessible === false ? 'This path is not marked step-free.' : 'Accessibility unconfirmed. Check steps and crossings on your journey.'}</Text>
      <View>
        {route.steps.map((step, index) => (
          <PassengerRouteRow key={index} first={index === 0} last={index === route.steps.length - 1}>
            <Text style={s.body}>{index + 1}. {step.instruction}</Text>
            <Text style={s.muted}>{Math.round(step.distance_meters)} m</Text>
          </PassengerRouteRow>
        ))}
      </View>
      <TouchableOpacity accessibilityRole="link" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openURL(route.source_url)}>
        <Text style={s.link}>Walking path source · {new Date(route.verified_at).toLocaleDateString()}</Text>
      </TouchableOpacity>
    </View>
  );
}
