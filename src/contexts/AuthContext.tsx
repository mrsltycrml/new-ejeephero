import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type ProfileStatus = 'pending' | 'approved' | 'rejected' | null;

type AuthContextType = {
  user: User | null;
  loading: boolean;
  role: 'passenger' | 'driver' | null;
  status: ProfileStatus;
  isAdmin: boolean;
  fullName: string;
  isGuest: boolean;
  loginAsGuest: (selectedRole?: 'passenger' | 'driver' | 'admin') => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  status: null,
  isAdmin: false,
  fullName: '',
  isGuest: false,
  loginAsGuest: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'passenger' | 'driver' | null>(null);
  const [status, setStatus] = useState<ProfileStatus>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [fullName, setFullNameState] = useState('');
  const [isGuest, setIsGuest] = useState(false);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, status, is_admin, full_name')
      .eq('id', userId)
      .single();

    if (data && !error) {
      setRole(data.role as 'passenger' | 'driver');
      setStatus(data.status as ProfileStatus);
      setIsAdmin(data.is_admin ?? false);
      setFullNameState(data.full_name ?? '');
    } else {
      setRole(null);
      setStatus('pending');
      setIsAdmin(false);
      setFullNameState('');
    }
  };

  const refreshProfile = async () => {
    if (user?.id && !isGuest) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Check local guest session first
    AsyncStorage.getItem('@ejeephero_guest_session').then(guestData => {
      if (guestData) {
        try {
          const parsed = JSON.parse(guestData);
          setUser({ id: 'guest-user-id', email: parsed.email || 'commuter@ejeephero.local' } as any);
          setRole(parsed.role || 'passenger');
          setStatus('approved');
          setIsAdmin(Boolean(parsed.isAdmin));
          setFullNameState(parsed.fullName || 'Makati Commuter');
          setIsGuest(true);
          setLoading(false);
          return;
        } catch (e) {}
      }

      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      supabase.auth.getSession().then(async ({ data: { session } }) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          await fetchProfile(currentUser.id);
        }
        setLoading(false);
      }).catch(error => {
        console.error('Supabase session error:', error);
        setUser(null);
        setLoading(false);
      });
    });

    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        // Don't overwrite guest session with Supabase auth events
        const guestData = await AsyncStorage.getItem('@ejeephero_guest_session');
        if (guestData) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          await fetchProfile(currentUser.id);
        } else {
          setRole(null);
          setStatus(null);
          setIsAdmin(false);
          setFullNameState('');
          setIsGuest(false);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const loginAsGuest = async (selectedRole: 'passenger' | 'driver' | 'admin' = 'passenger') => {
    const isAdm = selectedRole === 'admin';
    const roleType = isAdm ? 'passenger' : selectedRole;
    const name = isAdm ? 'City Administrator' : selectedRole === 'driver' ? 'Makati Driver #04' : 'Makati Commuter';
    const email = `${selectedRole}@ejeephero.local`;

    const guestPayload = {
      role: roleType,
      isAdmin: isAdm,
      fullName: name,
      email,
    };

    await AsyncStorage.setItem('@ejeephero_guest_session', JSON.stringify(guestPayload));
    setUser({ id: 'guest-user-id', email } as any);
    setRole(roleType);
    setStatus('approved');
    setIsAdmin(isAdm);
    setFullNameState(name);
    setIsGuest(true);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('@ejeephero_guest_session');
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setRole(null);
    setStatus(null);
    setIsAdmin(false);
    setFullNameState('');
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        role,
        status,
        isAdmin,
        fullName,
        isGuest,
        loginAsGuest,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
