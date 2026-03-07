import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';

export type ClinicRole = 'admin' | 'clinic_admin' | 'pt' | 'pta' | 'ot' | 'ota' | 'slp' | 'slpa' | 'front_office' | 'biller';

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface ClinicMembership {
  id: string;
  user_id: string;
  clinic_id: string | null;
  clinic_id_ref: string | null;
  clinic_name: string;
  role: ClinicRole;
  is_active: boolean;
  is_super_admin?: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  user: User;
  memberships: ClinicMembership[];
  currentClinic: ClinicMembership | null;
}

/**
 * Create a Supabase client for server-side operations
 * Uses cookies for session management
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        // Add cookie header for auth
        cookie: cookies().toString(),
      },
    },
  });
}

/**
 * Get the current authenticated user (server-side)
 * Cached per request
 */
export const getUser = cache(async () => {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

/**
 * Get user's clinic memberships
 */
export async function getUserMemberships(userId: string): Promise<ClinicMembership[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('clinic_memberships')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user memberships:', error);
    return [];
  }

  return data || [];
}

/**
 * Get user's role for a specific clinic
 */
export async function getUserClinicRole(
  userId: string,
  clinicId: string
): Promise<ClinicRole | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('clinic_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`clinic_id_ref.eq.${clinicId},clinic_id.eq.${clinicId}`)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as ClinicRole;
}

/**
 * Check if user has a specific role in a clinic
 */
export async function hasRole(
  userId: string,
  clinicId: string,
  roles: ClinicRole[]
): Promise<boolean> {
  // Check if user is super admin (cross-clinic access)
  const isSuperAdminUser = await checkIsSuperAdmin(userId);
  if (isSuperAdminUser) return true;

  const userRole = await getUserClinicRole(userId, clinicId);
  if (!userRole) return false;
  // Admin and clinic_admin have full access within their clinic
  if (userRole === 'admin' || userRole === 'clinic_admin') return true;
  return roles.includes(userRole);
}

/**
 * Check if user is admin in any clinic
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('clinic_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  return true;
}

/**
 * Check if user can finalize documents
 * Only primary clinicians (PT, OT, SLP) and Admin can finalize
 */
export async function canFinalize(
  userId: string,
  clinicId: string
): Promise<boolean> {
  return hasRole(userId, clinicId, ['pt', 'ot', 'slp', 'admin']);
}

/**
 * Get full user profile with memberships
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createServerClient();

  // Get user details
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return null;
  }

  // Get memberships
  const memberships = await getUserMemberships(userId);

  // Get current clinic (first active membership)
  const currentClinic = memberships.length > 0 ? memberships[0] : null;

  return {
    user: {
      id: userData.user.id,
      email: userData.user.email || '',
      created_at: userData.user.created_at || '',
    },
    memberships,
    currentClinic,
  };
}

/**
 * Check if user has access to an episode
 */
export async function hasEpisodeAccess(
  userId: string,
  episodeId: string
): Promise<boolean> {
  const supabase = createServerClient();

  // Get episode's clinic
  const { data: episode, error: episodeError } = await supabase
    .from('episodes')
    .select('clinic_id')
    .eq('id', episodeId)
    .single();

  if (episodeError || !episode) {
    return false;
  }

  // Get user's role in that clinic
  const userRole = await getUserClinicRole(userId, episode.clinic_id);
  if (!userRole) {
    return false;
  }

  // Admin and front_office can see all episodes
  if (['admin', 'front_office'].includes(userRole)) {
    return true;
  }

  // Clinical staff need to be on the care team
  const { data: careTeam, error: careTeamError } = await supabase
    .from('episode_care_team')
    .select('id')
    .eq('episode_id', episodeId)
    .eq('user_id', userId)
    .limit(1);

  if (careTeamError || !careTeam || careTeam.length === 0) {
    return false;
  }

  return true;
}

/**
 * Check if user has the super admin flag on any of their memberships.
 * Super admins can see and manage all clinics.
 */
export async function checkIsSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('clinic_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('is_super_admin', true)
    .eq('is_active', true)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}

/**
 * Get the clinic_id for the current user from their first active membership.
 * Used by server actions to scope all writes to the correct clinic.
 * Throws if the user is not authenticated or has no clinic assignment.
 */
export async function getClinicId(): Promise<string> {
  const user = await requireAuth();
  const memberships = await getUserMemberships(user.id);

  if (memberships.length === 0) {
    throw new Error('No clinic assigned to this user');
  }

  const clinicId = memberships[0].clinic_id || memberships[0].clinic_id_ref;
  if (!clinicId) {
    throw new Error('No clinic_id found on membership');
  }
  return clinicId;
}

/**
 * Require authentication - throws if not authenticated
 * Use in server components/actions
 */
export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Require specific role - throws if user doesn't have role
 */
export async function requireRole(clinicId: string, roles: ClinicRole[]) {
  const user = await requireAuth();
  const userHasRole = await hasRole(user.id, clinicId, roles);

  if (!userHasRole) {
    throw new Error(`Insufficient permissions. Required roles: ${roles.join(', ')}`);
  }

  return user;
}
