import { useTranslation } from 'react-i18next';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EJeepHeroLogo from '../../components/EJeepHeroLogo';
import { passengerStyles as s } from '../../components/PassengerUI';
import { color } from '../../constants/theme';
import { BOARDING_EDUCATION } from '../../services/passengerSafety';

export default function AboutScreen() {
  const { t } = useTranslation();
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { maxWidth: 640 }]}>
      <View style={s.heroBanner}>
        <EJeepHeroLogo />
        <Text accessibilityRole="header" style={s.heroTitle}>{t('passenger.about.service')}</Text>
        <Text style={s.heroSubtitle}>{t('passenger.about.route')}</Text>
      </View>

      <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.about.boarding')}</Text>
        <Text style={s.body}>{t('passenger.guide.education', BOARDING_EDUCATION)}</Text>
        <Text style={s.body}>{t('passenger.about.wait')}</Text>
      </View>

      <View style={s.section}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.about.guide')}</Text>
        {([
          { icon: 'location-outline', label: t('passenger.nav.map'), detail: t('passenger.about.mapDetail') },
          { icon: 'ticket-outline', label: t('passenger.nav.fare'), detail: t('passenger.about.fareDetail') },
          { icon: 'shield-outline', label: t('passenger.nav.safety'), detail: t('passenger.about.safetyDetail') },
          { icon: 'chatbubble-outline', label: t('passenger.nav.assistant'), detail: t('passenger.about.assistantDetail') },
        ] as const).map(item => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: 1, borderColor: color.border, paddingTop: 12 }}>
            <Ionicons aria-hidden name={item.icon} size={21} color={color.ink} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.muted}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={s.body}>{t('passenger.about.report')}</Text>
    </ScrollView>
  );
}
