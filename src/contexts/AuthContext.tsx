import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { useClerk, useUser, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { isSupabaseConfigured, supabase, supabaseAuth, setSupabaseTokenProvider } from '../lib/supabase';
import { isClerkConfigured } from '../lib/clerk';

type ProfileStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | null;
type Profile = { id: string; role: string; status: ProfileStatus; is_admin: boolean; full_name: string };
type AuthContextType = {
  user: User | null; loading: boolean; role: 'passenger' | 'driver' | null;
  status: ProfileStatus; isAdmin: boolean; fullName: string; authError: string;
  authProvider: 'clerk' | 'supabase'; signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>; getAccessToken: () => Promise<string | null>;
};
const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, role: null, status: null, isAdmin: false, fullName: '', authError: '',
  authProvider: 'supabase', signOut: async () => {}, refreshProfile: async () => {}, getAccessToken: async () => null,
});

function useSessionState() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  return { user, setUser, profile, setProfile, loading, setLoading, authError, setAuthError };
}

async function legacyProfile(user: User): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('id,role,status,is_admin,full_name').eq('id', user.id).single();
  if (error || !data) throw new Error('Your account could not be loaded. Please retry.');
  return data as Profile;
}

function ClerkAuthProviderInner({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const { getToken } = useClerkAuth();
  const state = useSessionState();
  const [legacyUser, setLegacyUser] = useState<User | null>(null);
  const [legacyChecked, setLegacyChecked] = useState(!isSupabaseConfigured);
  const [authProvider, setAuthProvider] = useState<'clerk' | 'supabase'>('clerk');
  const generation = useRef(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void supabaseAuth.auth.getSession().then(({ data }) => { setLegacyUser(data.session?.user ?? null); setLegacyChecked(true); })
      .catch(() => { setLegacyUser(null); setLegacyChecked(true); });
    const { data } = supabaseAuth.auth.onAuthStateChange((_event, session) => { setLegacyUser(session?.user ?? null); setLegacyChecked(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isLoaded || !legacyChecked) return;
    const current = ++generation.current;
    state.setAuthError('');
    try {
      if (isSignedIn && clerkUser) {
        setSupabaseTokenProvider(() => getToken());
        // The database derives identity and verified email from the signed JWT.
        // The RPC accepts only driver/passenger as self-service signup roles.
        const { data, error } = await supabase.rpc('bootstrap_clerk_profile', {
          requested_role: clerkUser.unsafeMetadata?.role === 'driver' ? 'driver' : 'passenger',
          display_name: clerkUser.fullName || String(clerkUser.unsafeMetadata?.full_name || ''),
        });
        if (error || !data) throw new Error(error?.message || 'Your account could not be verified. Please retry.');
        if (current !== generation.current) return;
        const profile = data as Profile;
        state.setProfile(profile);
        state.setUser({ id: profile.id, email: clerkUser.primaryEmailAddress?.emailAddress,
          app_metadata: { provider: 'clerk', clerk_id: clerkUser.id }, user_metadata: { full_name: profile.full_name, role: profile.role },
          aud: 'authenticated', created_at: clerkUser.createdAt?.toISOString() || '' } as User);
        setAuthProvider('clerk');
      } else if (legacyUser) {
        setSupabaseTokenProvider(null);
        const profile = await legacyProfile(legacyUser);
        if (current !== generation.current) return;
        state.setProfile(profile); state.setUser(legacyUser); setAuthProvider('supabase');
      } else {
        setSupabaseTokenProvider(null); state.setUser(null); state.setProfile(null);
      }
    } catch (error) {
      if (current !== generation.current) return;
      state.setUser(null); state.setProfile(null);
      state.setAuthError(error instanceof Error ? error.message : 'Could not verify your account. Please retry.');
    } finally { if (current === generation.current) state.setLoading(false); }
  }, [isLoaded, isSignedIn, clerkUser?.id, legacyChecked, legacyUser, getToken]);
  useEffect(() => { void refreshProfile(); }, [refreshProfile]);
  const signOut = async () => {
    ++generation.current;
    await Promise.all([isSignedIn ? clerkSignOut() : Promise.resolve(), supabaseAuth.auth.signOut({ scope: 'local' })]);
    setSupabaseTokenProvider(null); await supabase.removeAllChannels();
    setLegacyUser(null); state.setUser(null); state.setProfile(null); state.setAuthError(''); state.setLoading(false);
  };
  return <AuthContext.Provider value={{ user: state.user, loading: state.loading,
    role: state.profile ? state.profile.role === 'driver' ? 'driver' : 'passenger' : null,
    status: state.profile?.status ?? null, isAdmin: Boolean(state.profile?.is_admin || ['admin','supervisor'].includes(state.profile?.role || '')),
    fullName: state.profile?.full_name || '', authError: state.authError, authProvider, signOut, refreshProfile,
    getAccessToken: async () => authProvider === 'clerk' ? getToken() : (await supabaseAuth.auth.getSession()).data.session?.access_token ?? null,
  }}>{children}</AuthContext.Provider>;
}

function SupabaseAuthProviderInner({ children }: { children: React.ReactNode }) {
  const state = useSessionState();
  const refreshProfile = useCallback(async () => {
    state.setAuthError('');
    try {
      const { data } = await supabaseAuth.auth.getSession();
      const user = data.session?.user ?? null;
      const profile = user ? await legacyProfile(user) : null;
      state.setUser(user); state.setProfile(profile);
    } catch { state.setUser(null); state.setProfile(null); state.setAuthError('Your account could not be loaded. Please retry.'); }
    finally { state.setLoading(false); }
  }, []);
  useEffect(() => {
    void refreshProfile();
    const { data } = supabaseAuth.auth.onAuthStateChange(() => { setTimeout(() => { void refreshProfile(); }, 0); });
    return () => data.subscription.unsubscribe();
  }, [refreshProfile]);
  const signOut = async () => { await supabaseAuth.auth.signOut({ scope: 'local' }); await supabase.removeAllChannels(); state.setUser(null); state.setProfile(null); state.setAuthError(''); };
  return <AuthContext.Provider value={{ user: state.user, loading: state.loading,
    role: state.profile ? state.profile.role === 'driver' ? 'driver' : 'passenger' : null,
    status: state.profile?.status ?? null, isAdmin: Boolean(state.profile?.is_admin || ['admin','supervisor'].includes(state.profile?.role || '')),
    fullName: state.profile?.full_name || '', authError: state.authError, authProvider: 'supabase', signOut, refreshProfile,
    getAccessToken: async () => (await supabaseAuth.auth.getSession()).data.session?.access_token ?? null,
  }}>{children}</AuthContext.Provider>;
}
export const AuthProvider = ({ children }: { children: React.ReactNode }) => isClerkConfigured
  ? <ClerkAuthProviderInner>{children}</ClerkAuthProviderInner> : <SupabaseAuthProviderInner>{children}</SupabaseAuthProviderInner>;
export const useAuth = () => useContext(AuthContext);
