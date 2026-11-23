import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EMERGENCY_HOTLINES } from '../services/passengerSafety';
import { passengerStyles as s } from './PassengerUI';
import { color } from '../constants/theme';

export default function EmergencyHotlines() {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  return (
    <View>
      <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.hotlines.heading')}</Text>
      {EMERGENCY_HOTLINES.map(h => (
        <TouchableOpacity key={h.dial} accessibilityRole="link" accessibilityLabel={t('passenger.hotlines.call', { name: h.name, number: h.number })}
          onPress={() => {
            setError('');
            void Linking.openURL(`tel:${h.dial}`).catch(() => setError(t('passenger.hotlines.failed', { number: h.number })));
          }} style={styles.row}>
          <View style={styles.details}>
            <Text style={s.label}>{h.name}</Text>
            <Text style={styles.number}>{h.number}</Text>
          </View>
          <Ionicons aria-hidden name="call-outline" size={21} color={color.action} />
        </TouchableOpacity>
      ))}
      {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}
      <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://barangaybelair.ph/emergency/')} style={styles.source}>
        <Text style={[s.link, { flexShrink: 1 }]}>{t('passenger.hotlines.directory')}</Text>
        <Ionicons aria-hidden name="open-outline" size={16} color={color.action} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.border },
  details: { flex: 1, gap: 2 },
  number: { fontSize: 18, fontWeight: '700', color: color.action, fontVariant: ['tabular-nums'] },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
});
