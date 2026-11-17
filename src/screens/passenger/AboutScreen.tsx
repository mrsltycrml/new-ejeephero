import React from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ESakayLogo from '../../components/ESakayLogo';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
import { BOARDING_EDUCATION } from '../../services/passengerSafety';

export default function AboutScreen() {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.section}>
        <ESakayLogo width={168} />
        <Text style={s.title}>About eSAKAY</Text>
        <Text style={s.body}>
          eSAKAY is Meralco’s electric mobility business. Its electric jeepney service connects MRT Buendia and Mandaluyong City Hall with clean, zero-emission daily transit.
        </Text>
        <Text style={s.body}>
          This app helps you find a unit, plan your fare, check boarding information, and prepare an emergency message for your trusted contacts.
        </Text>
      </View>

      <View style={s.section}>
        <View style={s.row}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.ink} />
          </View>
          <Text style={s.sectionTitle}>A safer way to travel</Text>
        </View>
        <Text style={s.body}>{BOARDING_EDUCATION}</Text>
        <Text style={s.body}>
          Wait on the sidewalk at a designated loading bay. Let the vehicle stop fully before boarding, and confirm your destination with the driver.
        </Text>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Your journey, in one place</Text>
        <View style={{ gap: 10 }}>
          {[
            { icon: 'map-outline' as const, label: 'Dashboard', detail: 'Search for a place and see the units serving a nearby route stop.' },
            { icon: 'calculator-outline' as const, label: 'Fares', detail: 'Compare regular, student, senior citizen, and PWD fares.' },
            { icon: 'alert-circle-outline' as const, label: 'Safety', detail: 'Manage your emergency contacts and open Messages with your location and ride details.' },
            { icon: 'sparkles-outline' as const, label: 'esakaybot', detail: 'Ask questions about routes, stops, and using the service.' },
          ].map((item) => (
            <View key={item.label} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 10, backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border }}>
              <Ionicons name={item.icon} size={20} color={Colors.ink} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.label}>{item.label}</Text>
                <Text style={s.muted}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="link"
        onPress={() => Linking.openURL('https://meralcomain.s3.ap-southeast-1.amazonaws.com/2020-04/mer_sustainabilityreport2019_final.pdf')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Text style={s.link}>Meralco report · Learn about eSAKAY</Text>
        <Ionicons name="open-outline" size={14} color={Colors.ink} />
      </TouchableOpacity>
    </ScrollView>
  );
}
