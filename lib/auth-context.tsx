'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ClinicMembership, ClinicRole } from './auth';

type DocumentationMode = 'emr' | 'paper';

interface AuthContextType {
  user: User | null;
  memberships: ClinicMembership[];
  currentClinic: ClinicMembership | null;
  loading: boolean;
  documentationMode: DocumentationMode;
  isEmrMode: boolean;
  isPaperMode: boolean;
  // Multi-clinic super admin support
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
  setCurrentClinic: (membership: ClinicMembership) => void;
  hasRole: (roles: ClinicRole[]) => boolean;
  canFinalize: () => boolean;
  refreshDocumentationMode: () => Promise<void>;
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
  const [documentationMode, setDocumentationMode] = useState<DocumentationMode>('emr');
  // Super admin flag — derived from any of the user's memberships having is_super_admin=true
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Fetch the clinic's documentation mode
  const fetchDocumentationMode = async (clinicId: string) => {
    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('documentation_mode')
        .eq('id', clinicId)
        .single();

      if (!error && data) {
        setDocumentationMode(data.documentation_mode || 'emr');
      }
    } catch (error) {
      console.error('Error fetching documentation mode:', error);
    }
  };

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

      // Normalize: ensure clinic_id is always populated (fall back to clinic_id_ref)
      const normalized = (data || []).map((m) => ({
        ...m,
        clinic_id: m.clinic_id || m.clinic_id_ref,
      }));

      setMemberships(normalized);

      // Check if user has super admin flag on any membership
      const hasSuperAdmin = normalized.some((m: any) => m.is_super_admin === true);
      setIsSuperAdmin(hasSuperAdmin);

      // Try to restore previously selected clinic from cookie
      const savedClinicId = getCookie(ACTIVE_CLINIC_COOKIE);
      let clinicToSet: ClinicMembership | null = null;

      if (savedClinicId && normalized.length > 0) {
        clinicToSet = normalized.find(
          (m) => m.clinic_id === savedClinicId || m.clinic_id_ref === savedClinicId
        ) || null;
      }

      // Fall back to first clinic if saved clinic not found
      if (!clinicToSet && normalized.length > 0) {
        clinicToSet = normalized[0];
      }

      if (clinicToSet) {
        setCurrentClinicState(clinicToSet);
        const idForCookie = clinicToSet.clinic_id || clinicToSet.clinic_id_ref;
        if (idForCookie) {
          setCookie(ACTIVE_CLINIC_COOKIE, idForCookie);
          fetchDocumentationMode(idForCookie);
        }
      }
    } catch (error) {
      console.error('Error fetching memberships:', error);
      setMemberships([]);
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
      fetchDocumentationMode(membership.clinic_id);
    }
  };

  const refreshDocumentationMode = async () => {
    const clinicId = currentClinic?.clinic_id || currentClinic?.clinic_id_ref;
    if (clinicId) {
      await fetchDocumentationMode(clinicId);
    }
  };

  const hasRole = (roles: ClinicRole[]): boolean => {
    // Super admin has full access regardless of current clinic
    if (isSuperAdmin) return true;
    if (!currentClinic) return false;
    // Admin and clinic_admin have full access within their clinic
    if (currentClinic.role === 'admin' || currentClinic.role === 'clinic_admin') return true;
    return roles.includes(currentClinic.role);
  };

  const canFinalize = (): boolean => {
    return hasRole(['pt', 'ot', 'slp', 'admin']);
  };

  const value = {
    user,
    memberships,
    currentClinic,
    loading,
    documentationMode,
    isEmrMode: documentationMode === 'emr',
    isPaperMode: documentationMode === 'paper',
    isSuperAdmin,
    signOut,
    setCurrentClinic,
    hasRole,
    canFinalize,
    refreshDocumentationMode,
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
