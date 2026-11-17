import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

export default function MoreScreen({ navigation }: any) {
  const { signOut } = useAuth();

  const tools = [
    {
      screen: 'PassengerAssistant',
      name: 'ejeepherobot',
      desc: 'Ask a commuting question',
      icon: 'chatbubble-outline' as const,
    },
    {
      screen: 'PassengerDirectory',
      name: 'Routes & trip planner',
      desc: 'Explore stops and route options',
      icon: 'git-branch-outline' as const,
    },
    {
      screen: 'PassengerWeather',
      name: 'Makati weather',
      desc: 'Forecast and travel advisory',
      icon: 'cloud-outline' as const,
    },
  ];

  const handleSignOut = () => {
    void signOut().catch(() => Alert.alert('Could not sign out', 'Please try again.'));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={s.title}>More</Text>
        <Text style={s.subtitle}>Tools for your everyday commute.</Text>
      </View>

      <View style={styles.listSection}>
        {tools.map((item) => (
          <TouchableOpacity
            key={item.screen}
            accessibilityRole="button"
            onPress={() => navigation.getParent()?.navigate(item.screen)}
            style={styles.row}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={20} color={Colors.brandGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowDesc}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionBand}>
        <Text style={styles.sectionBandText}>Account</Text>
      </View>

      <View style={styles.listSection}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.getParent()?.navigate('PassengerProfile')}
          style={styles.row}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="person-outline" size={20} color={Colors.brandGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.getParent()?.navigate('PassengerAbout')}
          style={styles.row}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.brandGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>About ejeephero</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={handleSignOut}
        style={styles.signOutBtn}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingBottom: 36,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 2,
  },
  listSection: {
    borderTopWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  rowDesc: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  sectionBand: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sectionBandText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.subtleGray,
  },
  signOutBtn: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brandGreen,
    textDecorationLine: 'underline',
  },
});
