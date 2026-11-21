import React from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ESakayLogo from '../../components/ESakayLogo';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
import { BOARDING_EDUCATION } from '../../services/passengerSafety';

export default function AboutScreen() {
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]}>
      <View style={s.heroBanner}>
        <ESakayLogo />
        <Text accessibilityRole="header" style={s.heroTitle}>Electric jeepney service</Text>
        <Text style={s.heroSubtitle}>MRT Buendia to Mandaluyong City Hall</Text>
      </View>

      <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Boarding at a stop</Text>
        <Text style={s.body}>{BOARDING_EDUCATION}</Text>
        <Text style={s.body}>Wait on the sidewalk until the vehicle stops fully. Confirm your destination with the driver before boarding.</Text>
      </View>

      <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Passenger guide</Text>
        {([
          { icon: 'location-outline', label: 'Map', detail: 'Find a place, inspect a stop and check available units.' },
          { icon: 'ticket-outline', label: 'Fare', detail: 'Check sourced regular, student, senior and PWD fares.' },
          { icon: 'shield-outline', label: 'Safety', detail: 'Manage trusted contacts and prepare an SOS with your location and ride details.' },
          { icon: 'chatbubble-outline', label: 'Commuter assistant', detail: 'Ask about routes, stops and using the service.' },
        ] as const).map(item => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: 1, borderColor: Colors.border, paddingTop: 12 }}>
            <Ionicons aria-hidden name={item.icon} size={21} color={Colors.ink} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.muted}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity accessibilityRole="link"
        onPress={() => Linking.openURL('https://meralcomain.s3.ap-southeast-1.amazonaws.com/2020-04/mer_sustainabilityreport2019_final.pdf')}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.link, { flexShrink: 1 }]}>Meralco sustainability report (PDF)</Text>
        <Ionicons aria-hidden name="open-outline" size={16} color={Colors.brandGreen} />
      </TouchableOpacity>
    </ScrollView>
  );
}
