import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }: any) {
  const { loginAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required Fields', 'Please fill in both email and password.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Offline Demo Mode', 'Supabase credentials are not configured in .env. Please use "Continue as Commuter (Instant Access)" below.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Error', error.message);
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <View style={styles.jeepneyBadge}>
            <Text style={styles.jeepneyEmoji}>🚌</Text>
          </View>
          <Text style={styles.title}>
            Ejeep<Text style={styles.titleHighlight}>Hero</Text>
          </Text>
          <Text style={styles.subtitle}>Makati City Real-Time E-Jeepney Guide</Text>
        </View>

        {/* ─── INSTANT COMMUTER ACCESS (FOR EVALUATION & TUNNEL TESTING) ─── */}
        <View style={styles.guestCard}>
          <Text style={styles.guestTitle}>TESTING / GUEST COMMUTER ACCESS</Text>
          <Text style={styles.guestSubtitle}>
            Explore live tracking, visual geofencing, dynamic fare calculator, and SOS panic module without logging in.
          </Text>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={() => loginAsGuest('passenger')}
          >
            <Ionicons name="map" size={20} color={Colors.white} />
            <Text style={styles.guestButtonText}>Continue as Commuter</Text>
          </TouchableOpacity>

          {/* Quick Role Tester for Evaluators */}
          <View style={styles.rolePickerRow}>
            <TouchableOpacity
              style={styles.roleChip}
              onPress={() => loginAsGuest('driver')}
            >
              <Ionicons name="car" size={14} color={Colors.primaryRed} />
              <Text style={styles.roleChipText}>Driver Demo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.roleChip}
              onPress={() => loginAsGuest('admin')}
            >
              <Ionicons name="shield-checkmark" size={14} color={Colors.primaryYellow} />
              <Text style={styles.roleChipText}>Admin Portal</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR SIGN IN WITH ACCOUNT</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#A0A0A0"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#A0A0A0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkButton}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkAction}>Register Now</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.offWhite,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  jeepneyBadge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primaryYellow,
    marginBottom: 12,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  jeepneyEmoji: {
    fontSize: 34,
  },
  title: {
    fontSize: 38,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 1,
  },
  titleHighlight: {
    color: Colors.primaryYellow,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.darkText,
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Guest Card
  guestCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.primaryYellow,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  guestTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 0.8,
  },
  guestSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 16,
  },
  guestButton: {
    backgroundColor: Colors.primaryRed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  guestButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  roleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.offWhite,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    gap: 6,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.darkText,
  },

  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0D6C8',
  },
  orText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.subtleGray,
    marginHorizontal: 10,
    letterSpacing: 0.5,
  },

  formCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F0E6D8',
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    fontSize: 15,
    color: Colors.darkText,
  },
  button: {
    backgroundColor: Colors.darkText,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkButton: {
    padding: 10,
  },
  linkText: {
    color: '#666',
    textAlign: 'center',
    fontSize: 14,
  },
  linkAction: {
    color: Colors.primaryRed,
    fontWeight: 'bold',
  },
});
