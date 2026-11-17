import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EMERGENCY_HOTLINES } from '../services/passengerSafety';
import { passengerStyles as s } from './PassengerUI';
import { Colors } from '../constants/theme';

export default function EmergencyHotlines() {
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.sectionTitle}>Emergency hotlines</Text>
        <Text style={s.muted}>Tap to dial</Text>
      </View>
      <View style={{ gap: 8 }}>
        {EMERGENCY_HOTLINES.map((h) => (
          <TouchableOpacity
            key={h.dial}
            accessibilityRole="link"
            accessibilityLabel={`Call ${h.name}, ${h.number}`}
            onPress={() => Linking.openURL(`tel:${h.dial}`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: 54,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.sand,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: Colors.dangerBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="call" size={17} color={Colors.primaryRed} />
            </View>
            <Text style={[s.body, { flex: 1, fontWeight: '600' }]}>{h.name}</Text>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                backgroundColor: Colors.paper,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <Text style={[s.label, { fontVariant: ['tabular-nums'] }]}>{h.number}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        accessibilityRole="link"
        onPress={() => Linking.openURL('https://barangaybelair.ph/emergency/')}
        style={{ paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Text style={s.link}>View Makati hotline directory</Text>
        <Ionicons name="open-outline" size={14} color={Colors.ink} />
      </TouchableOpacity>
    </View>
  );
}
