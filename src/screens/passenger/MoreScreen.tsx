import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';

export default function MoreScreen({ navigation }: any) {
  const links = [
    {
      screen: 'PassengerDirectory',
      name: 'Route & stop directory',
      desc: 'Browse Route 1 stops, operating hours, fare tables, and trip planner.',
      icon: 'bus-outline' as const,
    },
    {
      screen: 'PassengerWeather',
      name: 'Makati weather & advisory',
      desc: 'Live temperature, rain conditions, and commuter travel advisories.',
      icon: 'partly-sunny-outline' as const,
    },
    {
      screen: 'PassengerAssistant',
      name: 'esakaybot assistant',
      desc: 'Ask questions about routes, stops, operating hours, and fares.',
      icon: 'sparkles-outline' as const,
    },
    {
      screen: 'PassengerAbout',
      name: 'About eSAKAY',
      desc: 'Meralco electric mobility service and safe boarding guide.',
      icon: 'information-circle-outline' as const,
    },
  ];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View>
        <Text style={s.eyebrow}>Commuter Hub</Text>
        <Text style={s.title}>Travel information</Text>
        <Text style={s.subtitle}>Routes, live weather, AI assistant, and service guides.</Text>
      </View>

      <View style={{ gap: 12 }}>
        {links.map((item) => (
          <TouchableOpacity
            key={item.screen}
            accessibilityRole="button"
            onPress={() => navigation.getParent()?.navigate(item.screen)}
            style={[
              s.section,
              {
                flexDirection: 'row',
                alignItems: 'center',
                padding: 18,
                gap: 14,
              },
            ]}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: Colors.sand,
                borderWidth: 1,
                borderColor: Colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={item.icon} size={22} color={Colors.ink} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.sectionTitle}>{item.name}</Text>
              <Text style={s.muted}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
