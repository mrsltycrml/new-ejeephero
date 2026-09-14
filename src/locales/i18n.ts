import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import fil from './fil.json';

const resources = {
  en: { translation: en },
  fil: { translation: fil },
};

// Initialize i18next
i18next
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes content
    },
    defaultNS: 'translation',
    ns: ['translation'],
    compatibilityJSON: 'v3', // Use v3 format for React Native compatibility
  });

// Load language preference from AsyncStorage on app start
export const initializeLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('app_language');
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'fil')) {
      await i18next.changeLanguage(savedLanguage);
    }
  } catch (err) {
    console.error('Error loading language preference:', err);
  }
};

// Function to change language and persist it
export const changeLanguage = async (lang: string) => {
  try {
    await i18next.changeLanguage(lang);
    await AsyncStorage.setItem('app_language', lang);
  } catch (err) {
    console.error('Error changing language:', err);
  }
};

export default i18next;
