import React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';

export default function ServiceAccountMenu({ open, onClose, onProfile, onAbout }: { open: boolean; onClose: () => void; onProfile: () => void; onAbout?: () => void }) {
  const { user, fullName, signOut } = useAuth();
  const { width } = useWindowDimensions();
  if (!open) return null;

  const logOut = () => {
    onClose();
    const perform = () => { void signOut().catch(() => Alert.alert('Could not log out', 'Please try again.')); };
    if (Platform.OS === 'web') {
      if (window.confirm('Log out of eSAKAY?')) perform();
    } else {
      Alert.alert('Log out', 'Log out of eSAKAY?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: perform }]);
    }
  };

  return <View style={styles.layer}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close account menu" onPress={onClose} style={styles.backdrop} />
    <View style={[styles.menu, { width: Math.min(300, width - 24) }]}>
      <View style={styles.identity}><View style={styles.avatar}><Ionicons name="person-outline" size={21} color={Colors.ink} /></View><View style={styles.identityText}><Text style={styles.name} numberOfLines={1}>{fullName || 'Your account'}</Text><Text style={styles.email} numberOfLines={2}>{user?.email || ''}</Text></View></View>
      <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); onProfile(); }} style={styles.action}><Ionicons name="person-circle-outline" size={20} color={Colors.ink} /><Text style={styles.actionText}>Account settings</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>
      {onAbout && <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); onAbout(); }} style={styles.action}><Ionicons name="information-circle-outline" size={20} color={Colors.ink} /><Text style={styles.actionText}>About eSAKAY</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" onPress={logOut} style={styles.action}><Ionicons name="log-out-outline" size={20} color={Colors.ink} /><Text style={[styles.actionText, styles.logout]}>Log out</Text></TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  menu: { position: 'absolute', top: 64, right: 12, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 8, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 9 },
  identity: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
  avatar: { width: 38, height: 38, borderRadius: 6, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1 },
  name: { color: Colors.ink, fontSize: 14, fontWeight: '600' },
  email: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  action: { minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 10, borderRadius: 8 },
  actionText: { color: Colors.ink, fontSize: 13, fontWeight: '700', flex: 1 },
  logout: { color: Colors.ink },
});
