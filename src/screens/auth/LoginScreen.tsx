import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required Fields', 'Please fill in both email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const message = error.message.toLowerCase();
        const guidance = message.includes('email not confirmed')
          ? 'Confirm your email using the link we sent, then try again.'
          : message.includes('invalid login credentials')
            ? 'Check your email and password. If you have not registered yet, create an account first.'
            : error.message;
        Alert.alert('Could not log in', guidance);
      }
    } catch (error) {
      Alert.alert('Could not log in', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.jeepneyBadge}>
          <Ionicons name="bus" size={34} color={Colors.white} />
        </View>
        <Text style={styles.title}>Ejeep<Text style={styles.titleHighlight}>Hero</Text></Text>
        <Text style={styles.subtitle}>Philippine e-Jeepney Transit Tracker</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.offWhite,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  jeepneyBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    marginBottom: 16,
    elevation: 0,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.navy,
    letterSpacing: 0.2,
  },
  titleHighlight: {
    color: Colors.primaryRed,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.darkText,
    marginTop: 6,
    fontWeight: '400',
  },
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    backgroundColor: '#FAFBFC',
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    borderRadius: 9,
    marginBottom: 16,
    fontSize: 16,
    color: Colors.darkText,
  },
  button: {
    backgroundColor: Colors.navy,
    padding: 15,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.navy,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    padding: 10,
  },
  linkText: {
    color: '#666',
    textAlign: 'center',
    fontSize: 15,
  },
  linkAction: {
    color: Colors.navy,
    fontWeight: 'bold',
  },
});
