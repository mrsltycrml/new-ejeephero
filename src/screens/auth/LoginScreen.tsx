import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Error', error.message);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.jeepneyBadge}>
          <Text style={styles.jeepneyEmoji}>🚌</Text>
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
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primaryRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primaryYellow,
    marginBottom: 16,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  jeepneyEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.primaryRed,
    letterSpacing: 1,
  },
  titleHighlight: {
    color: Colors.primaryYellow,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.darkText,
    marginTop: 6,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#F0E6D8',
  },
  input: {
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    color: Colors.darkText,
  },
  button: {
    backgroundColor: Colors.primaryRed,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
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
    color: Colors.primaryRed,
    fontWeight: 'bold',
  },
});
