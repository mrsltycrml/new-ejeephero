import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';

export default function MoreScreen({ navigation }: any) {
  const cards = [
    {
      screen: 'PassengerDirectory',
      tag: 'ROUTES & STOPS',
      name: 'Route directory & planner',
      desc: 'Explore all Route 1 terminals, fares, and stop-to-stop trip planning.',
      icon: 'bus' as const,
    },
    {
      screen: 'PassengerWeather',
      tag: 'LIVE ADVISORY',
      name: 'Makati weather radar',
      desc: 'Real-time temperature, rain forecast, and commuter safety advisories.',
      icon: 'thunderstorm' as const,
    },
    {
      screen: 'PassengerAbout',
      tag: 'ELECTRIC TRANSIT',
      name: 'About eSAKAY',
      desc: 'Learn about Meralco’s zero-emission electric jeepney network.',
      icon: 'leaf' as const,
    },
  ];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* AI ASSISTANT HERO CARD */}
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => navigation.getParent()?.navigate('PassengerAssistant')}
        style={s.heroBanner}
        activeOpacity={0.9}
      >
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={s.pillDark}>
            <Ionicons name="sparkles" size={14} color={Colors.brandMintLight} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.brandMintLight }}>AI TRANSIT CONCIERGE</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={26} color={Colors.brandMintLight} />
        </View>
        <Text style={s.heroTitle}>Ask esakaybot</Text>
        <Text style={s.heroSubtitle}>
          Instant answers on Route 1 stops, operating hours, discounted fares, and active e-jeeps.
        </Text>
      </TouchableOpacity>

      {/* BENTO GRID */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {cards.map((item) => (
          <TouchableOpacity
            key={item.screen}
            accessibilityRole="button"
            onPress={() => navigation.getParent()?.navigate(item.screen)}
            style={[
              s.section,
              {
                flexGrow: 1,
                flexBasis: 260,
                justifyContent: 'space-between',
                gap: 14,
              },
            ]}
          >
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  backgroundColor: Colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={item.icon} size={22} color={Colors.brandMintLight} />
              </View>
              <Ionicons name="chevron-forward-circle-outline" size={22} color={Colors.subtleGray} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.eyebrow}>{item.tag}</Text>
              <Text style={s.sectionTitle}>{item.name}</Text>
              <Text style={s.muted}>{item.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
