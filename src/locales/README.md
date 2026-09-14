/**
 * Example: How to use translations in your React Native components
 * 
 * 1. Import the useTranslation hook:
 *    import { useTranslation } from 'react-i18next';
 * 
 * 2. Inside your component, call the hook:
 *    const { t, i18n } = useTranslation();
 * 
 * 3. Use it in your JSX:
 *    <Text>{t('common.ok')}</Text>
 *    <Text>{t('directory.estimatedFare')}</Text>
 * 
 * 4. To handle interpolation (variables):
 *    <Text>{t('sos.emergencyMessageSent', { name: 'John Doe' })}</Text>
 * 
 * 5. To check current language:
 *    if (i18n.language === 'en') { ... }
 * 
 * 6. To change language programmatically:
 *    import { changeLanguage } from '../locales/i18n';
 *    await changeLanguage('fil');
 * 
 * Available translation keys are organized in namespaces:
 * - common: General UI elements
 * - navigation: Navigation labels
 * - auth: Authentication screens
 * - home: Home screen
 * - directory: Directory/Trip Planner screens
 * - weather: Weather screen
 * - contacts: Emergency Contacts screen
 * - sos: SOS Emergency feature
 * - profile: Profile screen
 * - herobot: HeroBot assistant
 * - dashboard: Driver Dashboard
 * 
 * Supported Languages:
 * - 'en': English
 * - 'fil': Filipino (Tagalog)
 * 
 * Language preference is automatically saved to device storage and restored on app restart.
 */

// Example component with translations
/*
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export const ExampleComponent = () => {
  const { t, i18n } = useTranslation();
  
  return (
    <View>
      <Text>{t('common.ok')}</Text>
      <Text>{t('home.welcomeBack')}</Text>
      <Text>{t('profile.selectLanguage')}</Text>
      {i18n.language === 'fil' && (
        <Text>{t('navigation.home')}</Text>
      )}
    </View>
  );
};
*/
