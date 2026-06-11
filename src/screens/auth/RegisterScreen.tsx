import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setLocalRole] = useState<'passenger' | 'driver'>('passenger');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !fullName) {
      Alert.alert('Required Fields', 'Please fill in your name, email, and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, full_name: fullName } }
    });
    
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert(
        'Registration Submitted',
        'Your account is pending admin approval. You will be notified once approved.',
        [{ text: 'OK' }]
      );
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={Colors.primaryRed} />
      </TouchableOpacity>

      <View style={styles.logoContainer}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join EjeepHero Transit Network</Text>
      </View>

      <View style={styles.formCard}>
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#A0A0A0"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />
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
        
        <Text style={styles.sectionLabel}>Select Your Role</Text>
        <View style={styles.roleContainer}>
          <TouchableOpacity 
            style={[
              styles.roleButton, 
              role === 'passenger' ? styles.roleActivePassenger : styles.roleInactive
            ]}
            onPress={() => setLocalRole('passenger')}
          >
            <Ionicons 
              name="people" 
              size={24} 
              color={role === 'passenger' ? Colors.white : Colors.darkText} 
            />
            <Text style={[
              styles.roleText, 
              role === 'passenger' ? styles.roleTextActive : styles.roleTextInactive
            ]}>Passenger</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.roleButton, 
              role === 'driver' ? styles.roleActiveDriver : styles.roleInactive
            ]}
            onPress={() => setLocalRole('driver')}
          >
            <Ionicons 
              name="car" 
              size={24} 
              color={role === 'driver' ? Colors.white : Colors.darkText} 
            />
            <Text style={[
              styles.roleText, 
              role === 'driver' ? styles.roleTextActive : styles.roleTextInactive
            ]}>Driver</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.noteContainer}>
          <Ionicons name="information-circle" size={16} color="#FF9800" />
          <Text style={styles.noteText}>
            Your account will require admin approval before you can access the app.
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkButton}>
        <Text style={styles.linkText}>
          Already have an account? <Text style={styles.linkAction}>Log In</Text>
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
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: 10,
    zIndex: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.primaryRed,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    fontWeight: '500',
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
    marginBottom: 20,
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
  sectionLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.darkText,
    marginBottom: 10,
    marginTop: 4,
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roleInactive: {
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  roleActivePassenger: {
    backgroundColor: Colors.primaryYellow,
    borderWidth: 1,
    borderColor: Colors.primaryYellow,
  },
  roleActiveDriver: {
    backgroundColor: Colors.primaryRed,
    borderWidth: 1,
    borderColor: Colors.primaryRed,
  },
  roleText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  roleTextInactive: {
    color: Colors.darkText,
  },
  roleTextActive: {
    color: Colors.white,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  noteText: {
    fontSize: 12,
    color: '#795548',
    flex: 1,
    lineHeight: 16,
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
