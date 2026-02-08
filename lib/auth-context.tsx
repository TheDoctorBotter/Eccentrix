'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ClinicMembership, ClinicRole } from './auth';

interface AuthContextType {
  user: User | null;
  memberships: ClinicMembership[];
  currentClinic: ClinicMembership | null;
  loading: boolean;
  signOut: () => Promise<void>;
  setCurrentClinic: (membership: ClinicMembership) => void;
  hasRole: (roles: ClinicRole[]) => boolean;
  canFinalize: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<ClinicMembership[]>([]);
  const [currentClinic, setCurrentClinicState] = useState<ClinicMembership | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user's memberships
  const fetchMemberships = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('clinic_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMemberships(data || []);

      // Set first clinic as current if not set
      if (data && data.length > 0 && !currentClinic) {
        setCurrentClinicState(data[0]);
      }
    } catch (error) {
      console.error('Error fetching memberships:', error);
      setMemberships([]);
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchMemberships(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchMemberships(session.user.id);
        } else {
          setMemberships([]);
          setCurrentClinicState(null);
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMemberships([]);
    setCurrentClinicState(null);
  };

  const setCurrentClinic = (membership: ClinicMembership) => {
    setCurrentClinicState(membership);
  };

  const hasRole = (roles: ClinicRole[]): boolean => {
    if (!currentClinic) return false;
    return roles.includes(currentClinic.role);
  };

  const canFinalize = (): boolean => {
    return hasRole(['pt', 'admin']);
  };

  const value = {
    user,
    memberships,
    currentClinic,
    loading,
    signOut,
    setCurrentClinic,
    hasRole,
    canFinalize,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
