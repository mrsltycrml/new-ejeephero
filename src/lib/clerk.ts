import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
export const isClerkConfigured = Boolean(
  clerkPublishableKey && (clerkPublishableKey.startsWith('pk_test_') || clerkPublishableKey.startsWith('pk_live_'))
);

export const clerkTokenCache = {
  async getToken(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore secure store errors
    }
  },
  async clearToken(key: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore secure store errors
    }
  },
};
