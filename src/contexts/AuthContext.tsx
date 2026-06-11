import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type ProfileStatus = 'pending' | 'approved' | 'rejected' | null;

type AuthContextType = {
  user: User | null;
  loading: boolean;
  role: 'passenger' | 'driver' | null;
  status: ProfileStatus;
  isAdmin: boolean;
  fullName: string;
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
      // Profile might not exist yet (edge case during signup)
      setRole(null);
      setStatus('pending');
      setIsAdmin(false);
      setFullNameState('');
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      } else {
        setRole(null);
        setStatus(null);
        setIsAdmin(false);
        setFullNameState('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setStatus(null);
    setIsAdmin(false);
    setFullNameState('');
  };

  return (
    <AuthContext.Provider value={{ user, loading, role, status, isAdmin, fullName, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
