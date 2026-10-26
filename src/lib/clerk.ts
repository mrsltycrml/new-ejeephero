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

/**
 * Deterministically converts a Clerk user ID (e.g. "user_2abc...") into a valid UUID v4-formatted string
 * so all existing Supabase UUID columns (profiles.id, vehicles.driver_id, etc.) work seamlessly.
 */
export function clerkIdToUuid(clerkId: string): string {
  const input = `ejeephero-clerk:${clerkId}`;
  const bytes = new Uint8Array(16);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0xdeadbeef;
  let h4 = 0x12345678;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code << 3) | (code >>> 5)), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (code + i), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ (code * 31), 0x27d4eb2f) >>> 0;
  }

  const words = [h1, h2, h3, h4];
  for (let w = 0; w < 4; w++) {
    bytes[w * 4] = (words[w] >>> 24) & 0xff;
    bytes[w * 4 + 1] = (words[w] >>> 16) & 0xff;
    bytes[w * 4 + 2] = (words[w] >>> 8) & 0xff;
    bytes[w * 4 + 3] = words[w] & 0xff;
  }

  // RFC 4122 version 4 & variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
