import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/theme';

export default function ServiceAccountMenu({ open, onClose, onProfile, onAbout }: { open: boolean; onClose: () => void; onProfile: () => void; onAbout?: () => void }) {
  const { t } = useTranslation();
  const { user, fullName, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const close = () => { setConfirmLogout(false); onClose(); };
  if (!open) return null;

  const logOut = () => {
    close();
    void signOut().catch(() => Alert.alert(t('passenger.menu.logoutError'), t('passenger.menu.retry')));
  };

  return <View style={styles.layer}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.menu.close')} onPress={close} style={styles.backdrop} />
    <View style={[styles.menu, { top: 58 + insets.top, width: Math.min(300, width - 24) }]}>
      <View style={styles.identity}><View style={styles.avatar}><Ionicons name="person-outline" size={20} color={Colors.action} /></View><View style={styles.identityText}><Text style={styles.name} numberOfLines={1}>{fullName || t('passenger.menu.account')}</Text><Text style={styles.email} numberOfLines={2}>{user?.email || ''}</Text></View></View>
      <TouchableOpacity accessibilityRole="button" onPress={() => { close(); onProfile(); }} style={styles.action}><Ionicons name="person-circle-outline" size={20} color={Colors.ink} /><Text style={styles.actionText}>{t('passenger.nav.profile')}</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>
      {onAbout && <TouchableOpacity accessibilityRole="button" onPress={() => { close(); onAbout(); }} style={styles.action}><Ionicons name="information-circle-outline" size={20} color={Colors.ink} /><Text style={styles.actionText}>{t('passenger.nav.about')}</Text><Ionicons name="chevron-forward" size={16} color={Colors.subtleGray} /></TouchableOpacity>}
      {confirmLogout ? <View style={styles.confirmBox}><Text style={styles.confirmTitle}>{t('passenger.menu.confirmLogout')}</Text><View style={styles.confirmRow}><TouchableOpacity accessibilityRole="button" onPress={logOut} style={styles.confirmDanger}><Text style={styles.confirmDangerText}>{t('passenger.menu.signOut')}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => setConfirmLogout(false)} style={styles.confirmCancel}><Text style={styles.actionText}>{t('common.cancel')}</Text></TouchableOpacity></View></View> : <TouchableOpacity accessibilityRole="button" onPress={() => setConfirmLogout(true)} style={styles.action}><Ionicons name="log-out-outline" size={20} color={Colors.action} /><Text style={[styles.actionText, styles.logout]}>{t('passenger.menu.signOut')}</Text></TouchableOpacity>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16,36,27,0.16)' },
  menu: { position: 'absolute', top: 64, right: 12, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border, borderRadius: 24, padding: 8, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 9 },
  identity: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.actionTint, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1 },
  name: { color: Colors.ink, fontSize: 15, fontWeight: '700' },
  email: { color: Colors.subtleGray, fontSize: 13, marginTop: 2 },
  action: { minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 10, borderRadius: 8 },
  actionText: { color: Colors.ink, fontSize: 14, fontWeight: '600', flex: 1 },
  logout: { color: Colors.action, fontWeight: '700' },
  confirmBox: { padding: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8, marginTop: 4 },
  confirmTitle: { color: Colors.ink, fontSize: 14, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', gap: 8 },
  confirmDanger: { flex: 1, minHeight: 44, borderRadius: 999, backgroundColor: Colors.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  confirmDangerText: { color: Colors.onDark, fontSize: 14, fontWeight: '700' },
  confirmCancel: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
