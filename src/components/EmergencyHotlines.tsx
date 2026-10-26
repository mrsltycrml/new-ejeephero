import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EMERGENCY_HOTLINES } from '../services/passengerSafety';
import { passengerStyles as s } from './PassengerUI';
import { Colors } from '../constants/theme';

export default function EmergencyHotlines() {
  return <View style={{ gap: 8 }}><Text style={s.sectionTitle}>Emergency hotlines</Text>{EMERGENCY_HOTLINES.map(h => <TouchableOpacity key={h.dial} accessibilityRole="link" accessibilityLabel={`Call ${h.name}, ${h.number}`} onPress={() => Linking.openURL(`tel:${h.dial}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 10 }}><Ionicons name="call-outline" size={19} color={Colors.primaryRed} /><Text style={[s.body, { flex: 1 }]}>{h.name}</Text><Text style={[s.label, { fontVariant: ['tabular-nums'] }]}>{h.number}</Text></TouchableOpacity>)}<TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://barangaybelair.ph/emergency/')} style={{ paddingVertical: 8 }}><Text style={s.link}>View Makati hotline directory</Text></TouchableOpacity></View>;
}
