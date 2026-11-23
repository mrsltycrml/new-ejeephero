import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { passengerStyles as s } from '../../components/PassengerUI';
import { color } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

export default function MoreScreen({ navigation }: any) {
  const [signOutFailed, setSignOutFailed] = useState(false);
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const groups = [
    { title: 'trip', items: [
      { name: 'passenger.nav.directory', screen: 'PassengerDirectory', icon: 'git-branch-outline' },
      { name: 'passenger.nav.weather', screen: 'PassengerWeather', icon: 'cloud-outline' },
      { name: 'passenger.nav.assistant', screen: 'PassengerAssistant', icon: 'chatbubble-outline' },
    ] },
    { title: 'help', items: [
      { name: 'passenger.more.contacts', screen: 'Safety', icon: 'people-outline' },
      { name: 'passenger.nav.about', screen: 'PassengerAbout', icon: 'information-circle-outline' },
    ] },
  ] as const;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]} keyboardShouldPersistTaps="always">
      <Text accessibilityRole="header" style={s.title}>{t('passenger.nav.more')}</Text>
      {groups.map(group => <View key={group.title} style={styles.group}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.more.' + group.title)}</Text>
        <View style={[s.section, styles.list]}>
          {group.items.map((item, index) => <TouchableOpacity key={item.screen} accessibilityRole="button"
            onPress={() => item.screen === 'Safety' ? navigation.navigate('Safety', { section: 'contacts' }) : navigation.navigate(item.screen)}
            style={[styles.row, index > 0 && styles.rule]}>
            <Ionicons aria-hidden name={item.icon} size={22} color={color.action} />
            <Text style={[s.label, styles.details]}>{t(item.name)}</Text>
            <Ionicons aria-hidden name="chevron-forward" size={18} color={color.inkMuted} />
          </TouchableOpacity>)}
        </View>
      </View>)}
      <View style={styles.group}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.more.account')}</Text>
        <View style={[s.section, styles.list]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('PassengerProfile')} style={styles.row}>
            <Ionicons aria-hidden name="person-outline" size={22} color={color.action} />
            <Text style={[s.label, styles.details]}>{t('passenger.nav.profile')}</Text>
            <Ionicons aria-hidden name="chevron-forward" size={18} color={color.inkMuted} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setSignOutFailed(false); void signOut().catch(() => setSignOutFailed(true)); }} style={[styles.row, styles.rule]}>
            <Ionicons aria-hidden name="log-out-outline" size={22} color={color.ink} />
            <Text style={s.label}>{t('passenger.more.signOut')}</Text>
          </TouchableOpacity>
        </View>
        {signOutFailed && <Text accessibilityRole="alert" style={s.muted}>{t('passenger.more.signOutError')}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  list: { paddingVertical: 0, gap: 0 },
  details: { flex: 1, minWidth: 0, gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12, paddingVertical: 14 },
  rule: { borderTopWidth: 1, borderTopColor: color.border },
});
