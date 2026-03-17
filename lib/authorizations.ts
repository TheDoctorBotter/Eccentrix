/**
 * Shared authorization matching, deduction, and reversal utilities.
 *
 * Field names match the existing prior_authorizations table:
 *   - authorized_visits / used_visits / remaining_visits  (visit-based, e.g. ST)
 *   - units_authorized / units_used                       (unit-based, e.g. PT / OT)
 *
 * Visits link via `auth_id` (existing FK) and track per-visit usage with
 * `units_used` (integer) and `auth_usage_applied` (boolean idempotency flag).
 */

import { calculateEightMinuteRule } from '@/lib/billing/eight-minute-rule';
import { logAuthUsage } from '@/lib/authUsageLog';

// ---------------------------------------------------------------------------
// Authorization alert thresholds — single source of truth
// ---------------------------------------------------------------------------

export const AUTH_THRESHOLDS = {
  PT: { low: 16, critical: 8 },   // units
  OT: { low: 16, critical: 8 },   // units
  ST: { low: 5, critical: 2 },    // visits
} as const;

export type AuthDisplayStatus = 'exhausted' | 'critical' | 'low' | 'expiring' | 'active';

/**
 * Determine the display status of an authorization based on remaining balance,
 * discipline, and end date.
 */
export function getAuthStatus(
  remaining: number,
  discipline: string,
  endDate: string | null,
): AuthDisplayStatus {
  if (remaining <= 0) return 'exhausted';
  const key = discipline.toUpperCase() as keyof typeof AUTH_THRESHOLDS;
  const thresholds = AUTH_THRESHOLDS[key] || AUTH_THRESHOLDS.PT;
  if (remaining <= thresholds.critical) return 'critical';
  if (remaining <= thresholds.low) return 'low';
  if (endDate) {
    const d = new Date(endDate);
    if (!isNaN(d.getTime())) {
      const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) return 'expiring';
    }
  }
  return 'active';
}

// ---------------------------------------------------------------------------
// Unit calculation helper
// ---------------------------------------------------------------------------

/**
 * Convert treatment minutes to billing units using the 8-minute rule.
 * Falls back to 1 unit when minutes are missing or below the 8-minute minimum.
 */
export function calculateUnitsFromDuration(minutes: number | null | undefined): number {
  if (!minutes || minutes <= 0) return 1;
  const result = calculateEightMinuteRule(minutes, true);
  return result.units > 0 ? result.units : 1;
}

// ---------------------------------------------------------------------------
// Authorization matching
// ---------------------------------------------------------------------------

/**
 * Find the best active authorization for a given patient + discipline + date.
 *
 * Matching priority:
 *  1. If the visit already has auth_id set, the caller should use that directly.
 *  2. Match by patient_id, discipline, date within start_date–end_date, status approved.
 *  3. If multiple match, the one with the latest start_date wins (order desc, limit 1).
 *  4. Returns null when nothing matches — caller should NOT crash.
 */
export async function findMatchingAuthorization(
  supabase: { from: (table: string) => any },
  patientId: string,
  discipline: string,
  dateOfService: string,
): Promise<{
  id: string;
  auth_type?: string;
  units_authorized?: number | null;
  units_used?: number | null;
  authorized_visits?: number | null;
  used_visits?: number | null;
  remaining_visits?: number | null;
} | null> {
  const { data, error } = await supabase
    .from('prior_authorizations')
    .select('id, discipline, auth_type, units_authorized, units_used, authorized_visits, used_visits, remaining_visits, start_date, end_date, status')
    .eq('patient_id', patientId)
    .eq('discipline', discipline)
    .lte('start_date', dateOfService)
    .gte('end_date', dateOfService)
    .in('status', ['active', 'approved'])
    .order('start_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

// ---------------------------------------------------------------------------
// Deduction
// ---------------------------------------------------------------------------

/**
 * Apply authorization usage after a visit is completed.
 *
 * Discipline rules:
 *  - PT / OT → unit-based: deduct `unitsUsed` from units_used (increment used count)
 *  - ST       → visit-based: increment used_visits by 1
 *  - Never go below 0 remaining (clamp)
 *  - auth_usage_applied flag prevents double deduction
 *  - Auto-sets status to 'exhausted' when balance hits 0
 */
export async function applyAuthorizationUsage(
  supabase: { from: (table: string) => any },
  visitId: string,
  authorizationId: string,
  discipline: string,
  unitsUsed: number,
): Promise<{ success: boolean; warning?: string }> {
  const normalizedDiscipline = discipline.toUpperCase();

  // Idempotency check — never deduct twice
  // Also fetch visit details needed for the usage log
  const { data: visit } = await supabase
    .from('visits')
    .select('auth_usage_applied, patient_id, clinic_id, date_of_service, therapist_user_id')
    .eq('id', visitId)
    .single();

  if (visit?.auth_usage_applied) {
    return { success: true, warning: 'Auth usage already applied' };
  }

  // Discipline determines the deduction type — PT/OT are always unit-based,
  // ST is always visit-based. auth_type is a secondary signal only.
  const isUnitBased = ['PT', 'OT'].includes(normalizedDiscipline);

  // Verify the authorization discipline matches the visit discipline
  const { data: auth } = await supabase
    .from('prior_authorizations')
    .select('discipline, units_authorized, units_used, authorized_visits, used_visits, auth_type')
    .eq('id', authorizationId)
    .single();

  if (!auth) return { success: false, warning: 'Authorization not found' };

  // Discipline safety: never cross-deduct
  if (auth.discipline && auth.discipline.toUpperCase() !== normalizedDiscipline) {
    return {
      success: false,
      warning: `Discipline mismatch: visit is ${normalizedDiscipline} but auth is ${auth.discipline}`,
    };
  }

  const updatePayload: Record<string, unknown> = {};
  let newRemaining: number;
  let beforeBalance: number;
  let actualAmount: number;

  if (isUnitBased) {
    // Unit-based (PT/OT): increment units_used, cap so remaining never goes below 0
    const currentUsed = auth.units_used ?? 0;
    const authorized = auth.units_authorized ?? 0;
    beforeBalance = authorized - currentUsed;
    const maxDeductible = Math.max(0, authorized - currentUsed);
    const actualDeduction = Math.min(unitsUsed, maxDeductible);
    actualAmount = actualDeduction;
    updatePayload.units_used = currentUsed + actualDeduction;
    newRemaining = authorized - (currentUsed + actualDeduction);

    if (newRemaining <= 0 && authorized > 0) {
      updatePayload.status = 'exhausted';
    }
  } else {
    // Visit-based (ST): increment used_visits by 1
    // NOTE: remaining_visits is a GENERATED column (authorized_visits - used_visits)
    // so we must NOT include it in the update payload.
    const currentUsed = auth.used_visits ?? 0;
    const authorized = auth.authorized_visits ?? 0;
    beforeBalance = authorized - currentUsed;
    const canDeduct = currentUsed < authorized || authorized === 0;
    actualAmount = canDeduct ? 1 : 0;
    updatePayload.used_visits = currentUsed + actualAmount;
    newRemaining = authorized - (currentUsed + actualAmount);

    if (newRemaining <= 0 && authorized > 0) {
      updatePayload.status = 'exhausted';
    }
  }

  // Apply deduction to authorization — check for errors before marking visit
  const { error: updateError } = await supabase
    .from('prior_authorizations')
    .update(updatePayload)
    .eq('id', authorizationId);

  if (updateError) {
    console.error('[AUTH] Failed to update authorization:', updateError.message);
    return { success: false, warning: `DB update failed: ${updateError.message}` };
  }

  // Mark visit as applied and store units used — only after successful deduction
  await supabase
    .from('visits')
    .update({
      auth_usage_applied: true,
      auth_id: authorizationId,
      units_used: isUnitBased ? unitsUsed : null,
    })
    .eq('id', visitId);

  // Log the deduction — non-blocking, never throws
  if (actualAmount > 0) {
    await logAuthUsage(supabase, {
      authorization_id: authorizationId,
      visit_id: visitId,
      patient_id: visit?.patient_id ?? null,
      clinic_id: visit?.clinic_id ?? null,
      discipline: normalizedDiscipline as 'PT' | 'OT' | 'ST',
      usage_type: 'deduction',
      amount: actualAmount,
      amount_kind: isUnitBased ? 'units' : 'visits',
      before_balance: beforeBalance,
      after_balance: newRemaining,
      date_of_service: visit?.date_of_service ?? null,
      therapist_id: visit?.therapist_user_id ?? null,
      note: null,
    });
  }

  if (newRemaining <= 0) {
    return { success: true, warning: 'Authorization balance is now 0' };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Reversal (undo completion)
// ---------------------------------------------------------------------------

/**
 * Reverse authorization usage when a visit is un-completed.
 *
 *  1. Check auth_usage_applied — only reverse if true
 *  2. Restore the deducted amount to the authorization
 *  3. Clear auth_usage_applied and units_used on the visit
 */
export async function reverseAuthorizationUsage(
  supabase: { from: (table: string) => any },
  visitId: string,
): Promise<{ success: boolean; warning?: string }> {
  // Fetch the visit to see if usage was applied
  const { data: visit } = await supabase
    .from('visits')
    .select('id, auth_id, auth_usage_applied, units_used, discipline, patient_id, clinic_id, date_of_service, therapist_user_id')
    .eq('id', visitId)
    .single();

  if (!visit || !visit.auth_usage_applied || !visit.auth_id) {
    return { success: true, warning: 'No auth usage to reverse' };
  }

  const isUnitBased = ['PT', 'OT'].includes((visit.discipline ?? '').toUpperCase());

  // Fetch current authorization
  const { data: auth } = await supabase
    .from('prior_authorizations')
    .select('units_authorized, units_used, authorized_visits, used_visits, auth_type, status')
    .eq('id', visit.auth_id)
    .single();

  if (!auth) {
    return { success: false, warning: 'Authorization not found for reversal' };
  }

  const updatePayload: Record<string, unknown> = {};
  let beforeBalance: number;
  let afterBalance: number;
  let restoredAmount: number;
  const normalizedDiscipline = (visit.discipline ?? '').toUpperCase();

  if (isUnitBased) {
    // Restore units
    const restoredUnits = visit.units_used ?? 0;
    restoredAmount = restoredUnits;
    const authorized = auth.units_authorized ?? 0;
    const currentUsed = auth.units_used ?? 0;
    beforeBalance = authorized - currentUsed;
    const newUsed = Math.max(0, currentUsed - restoredUnits);
    afterBalance = authorized - newUsed;
    updatePayload.units_used = newUsed;
  } else {
    // Restore 1 visit
    // NOTE: remaining_visits is a GENERATED column — do NOT include in update
    restoredAmount = 1;
    const authorized = auth.authorized_visits ?? 0;
    const currentUsed = auth.used_visits ?? 0;
    beforeBalance = authorized - currentUsed;
    const newUsed = Math.max(0, currentUsed - 1);
    afterBalance = authorized - newUsed;
    updatePayload.used_visits = newUsed;
  }

  // If auth was exhausted, set back to approved
  if (auth.status === 'exhausted') {
    updatePayload.status = 'approved';
  }

  const { error: updateError } = await supabase
    .from('prior_authorizations')
    .update(updatePayload)
    .eq('id', visit.auth_id);

  if (updateError) {
    console.error('[AUTH] Failed to reverse authorization:', updateError.message);
    return { success: false, warning: `DB update failed: ${updateError.message}` };
  }

  // Clear usage flags on the visit — only after successful reversal
  await supabase
    .from('visits')
    .update({
      auth_usage_applied: false,
      units_used: null,
    })
    .eq('id', visitId);

  // Log the restore — non-blocking, never throws
  await logAuthUsage(supabase, {
    authorization_id: visit.auth_id,
    visit_id: visitId,
    patient_id: visit.patient_id ?? null,
    clinic_id: visit.clinic_id ?? null,
    discipline: (['PT', 'OT', 'ST'].includes(normalizedDiscipline) ? normalizedDiscipline : 'PT') as 'PT' | 'OT' | 'ST',
    usage_type: 'restore',
    amount: restoredAmount,
    amount_kind: isUnitBased ? 'units' : 'visits',
    before_balance: beforeBalance,
    after_balance: afterBalance,
    date_of_service: visit.date_of_service ?? null,
    therapist_id: visit.therapist_user_id ?? null,
    note: 'Visit completion undone',
  });

  return { success: true };
}
