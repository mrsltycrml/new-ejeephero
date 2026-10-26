import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const isSupabaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Keep legacy Supabase sign-in separate: data requests always carry the active
// provider's verified session token, including Clerk sessions.
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let sessionToken: (() => Promise<string | null>) | null = null;
export function setSupabaseTokenProvider(provider: (() => Promise<string | null>) | null) {
  sessionToken = provider;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => sessionToken
    ? sessionToken()
    : (await supabaseAuth.auth.getSession()).data.session?.access_token ?? null,
});
