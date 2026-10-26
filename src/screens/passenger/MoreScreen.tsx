import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
export default function MoreScreen({ navigation }: any) {
  const links = [{ screen: 'PassengerDirectory', name: 'Route information', icon: 'bus-outline' as const }, { screen: 'PassengerWeather', name: 'Weather', icon: 'partly-sunny-outline' as const }, { screen: 'PassengerAbout', name: 'About eSAKAY', icon: 'information-circle-outline' as const }];
  return <ScrollView style={s.screen} contentContainerStyle={s.content}><View><Text style={s.title}>Travel information</Text><Text style={s.subtitle}>More help for your journey.</Text></View><View style={s.section}>{links.map(item => <TouchableOpacity key={item.screen} accessibilityRole="button" onPress={() => navigation.getParent()?.navigate(item.screen)} style={[s.row, { minHeight: 54, paddingVertical: 12 }]}><Ionicons name={item.icon} size={22} color={Colors.subtleGray} /><Text style={[s.body, { flex: 1 }]}>{item.name}</Text><Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} /></TouchableOpacity>)}</View></ScrollView>;
}
