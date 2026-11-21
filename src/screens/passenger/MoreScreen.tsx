import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

const rideTools = [
  { screen: 'PassengerAssistant', name: 'Commuter assistant', detail: 'Ask about stops, fares and boarding.', icon: 'chatbubble-outline' },
  { screen: 'PassengerWeather', name: 'Makati weather', detail: 'Forecast and travel advisory', icon: 'cloud-outline' },
  { screen: 'PassengerAbout', name: 'About eSAKAY', detail: 'Service information and boarding guidance', icon: 'information-circle-outline' },
] as const;

export default function MoreScreen({ navigation }: any) {
  const { signOut } = useAuth();
  const open = (screen: string) => navigation.getParent()?.navigate(screen);
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]}>
      <Text accessibilityRole="header" style={s.title}>More</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => open('PassengerDirectory')} style={[s.heroBanner, styles.directory]}>
        <Ionicons aria-hidden name="git-branch-outline" size={28} color={Colors.signal} />
        <View style={styles.details}>
          <Text style={[s.sectionTitle, styles.light]}>Route directory</Text>
          <Text style={s.heroSubtitle}>Browse routes and stops in travel order.</Text>
        </View>
        <Ionicons aria-hidden name="arrow-forward" size={22} color={Colors.signal} />
      </TouchableOpacity>

      <View style={[s.section, styles.list]}>
        {rideTools.map((item, index) => (
          <TouchableOpacity key={item.screen} accessibilityRole="button" onPress={() => open(item.screen)}
            style={[styles.row, index > 0 && styles.rule]}>
            <Ionicons aria-hidden name={item.icon} size={22} color={Colors.brandGreen} />
            <View style={styles.details}>
              <Text style={s.label}>{item.name}</Text>
              <Text style={s.muted}>{item.detail}</Text>
            </View>
            <Ionicons aria-hidden name="chevron-forward" size={18} color={Colors.subtleGray} />
          </TouchableOpacity>
        ))}
      </View>

      <Text accessibilityRole="header" style={s.sectionTitle}>Account</Text>
      <View style={[s.section, styles.list]}>
        <TouchableOpacity accessibilityRole="button" onPress={() => open('PassengerProfile')} style={styles.row}>
          <Ionicons aria-hidden name="person-outline" size={22} color={Colors.brandGreen} />
          <Text style={[s.label, styles.details]}>Profile</Text>
          <Ionicons aria-hidden name="chevron-forward" size={18} color={Colors.subtleGray} />
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => void signOut().catch(() => Alert.alert('Could not sign out', 'Please try again.'))} style={[styles.row, styles.rule]}>
          <Ionicons aria-hidden name="log-out-outline" size={22} color={Colors.ink} />
          <Text style={s.label}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  directory: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  list: { paddingVertical: 0, gap: 0 },
  details: { flex: 1, minWidth: 0, gap: 3 },
  light: { color: Colors.onDark },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12, paddingVertical: 12 },
  rule: { borderTopWidth: 1, borderTopColor: Colors.border },
});
