import { useTranslation } from 'react-i18next';
import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import PassengerRouteRow from './PassengerRouteRow';
import { passengerStyles as s } from './PassengerUI';
import type { WalkingRoute } from '../services/walkingDirections';

export default function WalkingDirectionsPanel({ route, fromLabel, toLabel }: { route: WalkingRoute; fromLabel: string; toLabel: string }) {
  const { t } = useTranslation();
  return (
    <View style={s.section}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons aria-hidden name="walk-outline" size={24} color={Colors.action} />
        <Text accessibilityRole="header" style={[s.sectionTitle, { flex: 1 }]}>{t('passenger.walk.title')}</Text>
      </View>
      <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border }}>
        <Text style={s.muted}>{t('passenger.walk.from', { place: fromLabel })}</Text>
        <Text style={s.sectionTitle}>{t('passenger.walk.to', { place: toLabel })}</Text>
        <Text style={s.label}>{t('passenger.walk.length', { distance: Math.round(route.distance_meters), minutes: Math.ceil(route.duration_seconds / 60) })}</Text>
      </View>
      <Text style={s.muted}>{route.accessible === true ? t('passenger.walk.accessible') : route.accessible === false ? t('passenger.walk.notAccessible') : t('passenger.walk.unknownAccess')}</Text>
      <View>
        {route.steps.map((step, index) => (
          <PassengerRouteRow key={index} first={index === 0} last={index === route.steps.length - 1}>
            <Text style={s.body}>{index + 1}. {step.instruction}</Text>
            <Text style={s.muted}>{Math.round(step.distance_meters)} m</Text>
          </PassengerRouteRow>
        ))}
      </View>
      <TouchableOpacity accessibilityRole="link" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => void Linking.openURL(route.source_url)}>
        <Text style={s.link}>{t('passenger.walk.source', { source: new Date(route.verified_at).toLocaleDateString() })}</Text>
      </TouchableOpacity>
    </View>
  );
}
