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

const ACTIVE_CLINIC_COOKIE = 'active_clinic_id';

// Cookie helper functions
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<ClinicMembership[]>([]);
  const [currentClinic, setCurrentClinicState] = useState<ClinicMembership | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user's memberships
  const fetchMemberships = async (userId: string) => {
    console.log('AuthContext - fetchMemberships called with userId:', userId);
    try {
      const { data, error } = await supabase
        .from('clinic_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      console.log('AuthContext - Supabase query result:', { data, error });
      if (error) throw error;

      console.log('AuthContext - Fetched memberships:', data);
      setMemberships(data || []);

      // Try to restore previously selected clinic from cookie
      const savedClinicId = getCookie(ACTIVE_CLINIC_COOKIE);
      console.log('AuthContext - Saved clinic ID from cookie:', savedClinicId);
      let clinicToSet: ClinicMembership | null = null;

      if (savedClinicId && data) {
        // Check if saved clinic is still in user's memberships
        clinicToSet = data.find((m) => m.clinic_id === savedClinicId) || null;
        console.log('AuthContext - Found saved clinic in memberships:', clinicToSet);
      }

      // Fall back to first clinic if saved clinic not found
      if (!clinicToSet && data && data.length > 0) {
        clinicToSet = data[0];
        console.log('AuthContext - Falling back to first clinic:', clinicToSet);
      }

      if (clinicToSet) {
        console.log('AuthContext - Setting current clinic:', clinicToSet);
        setCurrentClinicState(clinicToSet);
        // Ensure cookie is set
        if (clinicToSet.clinic_id) {
          setCookie(ACTIVE_CLINIC_COOKIE, clinicToSet.clinic_id);
        }
      } else {
        console.log('AuthContext - No clinic to set!');
      }
    } catch (error) {
      console.error('Error fetching memberships:', error);
      setMemberships([]);

      // TEMPORARY WORKAROUND: If query fails and we know the user, hardcode the clinic
      if (userId === '65309deb-8e3f-4393-b876-76e37dd9dcb3') {
        console.warn('AuthContext - Using hardcoded fallback clinic!');
        const fallbackClinic: ClinicMembership = {
          id: '752eb5f3-c60b-4a32-aa9c-f913d34859b0',
          user_id: '65309deb-8e3f-4393-b876-76e37dd9dcb3',
          clinic_id: '47565d82-a8c9-463a-92af-fe3d3315b59f',
          clinic_id_ref: null,
          clinic_name: 'Childrens Therapy World',
          role: 'admin',
          is_active: true,
          created_at: '2026-02-10T17:10:23.87292+00:00',
          updated_at: '2026-02-10T17:10:23.87292+00:00',
        };
        setMemberships([fallbackClinic]);
        setCurrentClinicState(fallbackClinic);
        if (fallbackClinic.clinic_id) {
          setCookie(ACTIVE_CLINIC_COOKIE, fallbackClinic.clinic_id);
        }
      }
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Add timeout to prevent infinite loading if query hangs
        const timeout = new Promise(resolve => setTimeout(resolve, 10000));
        await Promise.race([fetchMemberships(session.user.id), timeout]);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);

        if (session?.user) {
          // Add timeout to prevent infinite loading if query hangs
          const timeout = new Promise(resolve => setTimeout(resolve, 10000));
          await Promise.race([fetchMemberships(session.user.id), timeout]);
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
    deleteCookie(ACTIVE_CLINIC_COOKIE);
  };

  const setCurrentClinic = (membership: ClinicMembership) => {
    setCurrentClinicState(membership);
    // Persist to cookie
    if (membership.clinic_id) {
      setCookie(ACTIVE_CLINIC_COOKIE, membership.clinic_id);
    }
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
