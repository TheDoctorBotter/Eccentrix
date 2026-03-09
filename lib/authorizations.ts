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
  // Idempotency check — never deduct twice
  const { data: visit } = await supabase
    .from('visits')
    .select('auth_usage_applied')
    .eq('id', visitId)
    .single();

  if (visit?.auth_usage_applied) {
    return { success: true, warning: 'Auth usage already applied' };
  }

  const isUnitBased = ['PT', 'OT'].includes(discipline.toUpperCase());

  // Fetch current authorization balance
  const { data: auth } = await supabase
    .from('prior_authorizations')
    .select('units_authorized, units_used, authorized_visits, used_visits, remaining_visits, auth_type')
    .eq('id', authorizationId)
    .single();

  if (!auth) return { success: false, warning: 'Authorization not found' };

  const updatePayload: Record<string, unknown> = {};
  let newRemaining: number;

  if (isUnitBased || auth.auth_type === 'units') {
    // Unit-based: increment units_used, cap so remaining never goes below 0
    const currentUsed = auth.units_used ?? 0;
    const authorized = auth.units_authorized ?? 0;
    const maxDeductible = Math.max(0, authorized - currentUsed);
    const actualDeduction = Math.min(unitsUsed, maxDeductible);
    updatePayload.units_used = currentUsed + actualDeduction;
    newRemaining = authorized - (currentUsed + actualDeduction);

    if (newRemaining <= 0) {
      updatePayload.status = 'exhausted';
    }
  } else {
    // Visit-based: increment used_visits by 1
    const currentUsed = auth.used_visits ?? 0;
    const authorized = auth.authorized_visits ?? 0;
    const canDeduct = currentUsed < authorized || authorized === 0;
    updatePayload.used_visits = currentUsed + (canDeduct ? 1 : 0);

    // Also update remaining_visits if the column is populated
    if (auth.remaining_visits != null) {
      updatePayload.remaining_visits = Math.max(0, (auth.remaining_visits ?? 0) - (canDeduct ? 1 : 0));
    }
    newRemaining = authorized - (currentUsed + (canDeduct ? 1 : 0));

    if (newRemaining <= 0 && authorized > 0) {
      updatePayload.status = 'exhausted';
    }
  }

  // Apply deduction to authorization
  await supabase
    .from('prior_authorizations')
    .update(updatePayload)
    .eq('id', authorizationId);

  // Mark visit as applied and store units used
  await supabase
    .from('visits')
    .update({
      auth_usage_applied: true,
      auth_id: authorizationId,
      units_used: isUnitBased || auth.auth_type === 'units' ? unitsUsed : null,
    })
    .eq('id', visitId);

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
    .select('id, auth_id, auth_usage_applied, units_used, discipline')
    .eq('id', visitId)
    .single();

  if (!visit || !visit.auth_usage_applied || !visit.auth_id) {
    return { success: true, warning: 'No auth usage to reverse' };
  }

  const isUnitBased = ['PT', 'OT'].includes((visit.discipline ?? '').toUpperCase());

  // Fetch current authorization
  const { data: auth } = await supabase
    .from('prior_authorizations')
    .select('units_authorized, units_used, authorized_visits, used_visits, remaining_visits, auth_type, status')
    .eq('id', visit.auth_id)
    .single();

  if (!auth) {
    return { success: false, warning: 'Authorization not found for reversal' };
  }

  const updatePayload: Record<string, unknown> = {};

  if (isUnitBased || auth.auth_type === 'units') {
    // Restore units
    const restoredUnits = visit.units_used ?? 0;
    updatePayload.units_used = Math.max(0, (auth.units_used ?? 0) - restoredUnits);
  } else {
    // Restore 1 visit
    updatePayload.used_visits = Math.max(0, (auth.used_visits ?? 0) - 1);
    if (auth.remaining_visits != null) {
      updatePayload.remaining_visits = (auth.remaining_visits ?? 0) + 1;
    }
  }

  // If auth was exhausted, set back to approved
  if (auth.status === 'exhausted') {
    updatePayload.status = 'approved';
  }

  await supabase
    .from('prior_authorizations')
    .update(updatePayload)
    .eq('id', visit.auth_id);

  // Clear usage flags on the visit
  await supabase
    .from('visits')
    .update({
      auth_usage_applied: false,
      units_used: null,
    })
    .eq('id', visitId);

  return { success: true };
}
