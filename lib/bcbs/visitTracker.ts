/**
 * BCBS Visit Tracker — helper functions for annual visit limit tracking.
 *
 * This is an additive feature that works alongside the existing authorization
 * system. It does NOT modify prior_authorizations or the Medicaid auth flow.
 *
 * BCBS-TX uses annual visit limits instead of prior authorizations:
 *   - Pooled: one shared limit across PT/OT/ST
 *   - Split: separate limits per discipline (PT/OT share, ST separate)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BCBSVisitBenefit {
  id: string;
  clinic_id: string;
  patient_id: string;
  benefit_year_start: string;
  benefit_year_end: string;
  benefit_type: 'pooled' | 'split';
  total_visits_allowed: number | null;
  total_visits_used: number;
  pt_visits_allowed: number | null;
  pt_visits_used: number;
  ot_visits_allowed: number | null;
  ot_visits_used: number;
  st_visits_allowed: number | null;
  st_visits_used: number;
  bcbs_member_id: string | null;
  bcbs_group_number: string | null;
  bcbs_plan_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  last_updated_at: string;
  last_updated_by: string | null;
}

export interface BCBSVisitLogEntry {
  id: string;
  benefit_id: string;
  visit_id: string | null;
  patient_id: string | null;
  clinic_id: string | null;
  discipline: 'PT' | 'OT' | 'ST';
  usage_type: 'deduction' | 'restore' | 'adjustment';
  visits_used: number;
  before_balance: number | null;
  after_balance: number | null;
  date_of_service: string | null;
  therapist_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export interface RemainingVisits {
  remaining: number;
  allowed: number;
  used: number;
  isPooled: boolean;
  pooledRemaining?: number;
  pooledAllowed?: number;
  pooledUsed?: number;
}

type SupabaseClient = { from: (table: string) => any };
type Discipline = 'PT' | 'OT' | 'ST';

// ---------------------------------------------------------------------------
// getActiveBCBSBenefit
// ---------------------------------------------------------------------------

/**
 * Returns the active benefit period for today's date.
 * Matches benefit_year_start <= today <= benefit_year_end.
 * Returns null if no active benefit found.
 */
export async function getActiveBCBSBenefit(
  supabase: SupabaseClient,
  patientId: string,
  clinicId: string,
): Promise<BCBSVisitBenefit | null> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('bcbs_visit_benefits')
    .select('*')
    .eq('patient_id', patientId)
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .lte('benefit_year_start', today)
    .gte('benefit_year_end', today)
    .order('benefit_year_start', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as BCBSVisitBenefit;
}

// ---------------------------------------------------------------------------
// getRemainingVisits
// ---------------------------------------------------------------------------

/**
 * Calculate remaining visits for a given discipline on a BCBS benefit.
 *
 * For pooled plans: returns total_visits_allowed - total_visits_used.
 * For split plans: returns discipline-specific remaining.
 * Always includes pooledRemaining for display even in split plans.
 */
export function getRemainingVisits(
  benefit: BCBSVisitBenefit,
  discipline: Discipline,
): RemainingVisits {
  if (benefit.benefit_type === 'pooled') {
    const allowed = benefit.total_visits_allowed ?? 0;
    const used = benefit.total_visits_used;
    const remaining = Math.max(0, allowed - used);
    return {
      remaining,
      allowed,
      used,
      isPooled: true,
      pooledRemaining: remaining,
      pooledAllowed: allowed,
      pooledUsed: used,
    };
  }

  // Split plan
  const disc = discipline.toUpperCase() as Discipline;
  let allowed: number;
  let used: number;

  if (disc === 'PT') {
    allowed = benefit.pt_visits_allowed ?? 0;
    used = benefit.pt_visits_used;
  } else if (disc === 'OT') {
    allowed = benefit.ot_visits_allowed ?? 0;
    used = benefit.ot_visits_used;
  } else {
    allowed = benefit.st_visits_allowed ?? 0;
    used = benefit.st_visits_used;
  }

  const remaining = Math.max(0, allowed - used);

  // Also compute total pooled view for display
  const totalAllowed =
    (benefit.pt_visits_allowed ?? 0) +
    (benefit.ot_visits_allowed ?? 0) +
    (benefit.st_visits_allowed ?? 0);
  const totalUsed =
    benefit.pt_visits_used +
    benefit.ot_visits_used +
    benefit.st_visits_used;

  return {
    remaining,
    allowed,
    used,
    isPooled: false,
    pooledRemaining: Math.max(0, totalAllowed - totalUsed),
    pooledAllowed: totalAllowed,
    pooledUsed: totalUsed,
  };
}

// ---------------------------------------------------------------------------
// deductBCBSVisit
// ---------------------------------------------------------------------------

/**
 * Deducts 1 visit from the appropriate counter on a BCBS benefit.
 *
 * - Reads before_balance, applies deduction, writes after_balance
 * - Inserts row into bcbs_visit_log
 * - Non-blocking on log failure — deduction is source of truth
 * - Idempotent — checks bcbs_visit_log for existing visit_id before deducting
 */
export async function deductBCBSVisit(
  supabase: SupabaseClient,
  benefitId: string,
  visitId: string,
  discipline: Discipline,
  patientId: string,
  clinicId: string,
  therapistId: string | null,
  dateOfService: string,
  createdBy: string,
): Promise<{ success: boolean; warning?: string }> {
  // Idempotency: check if this visit was already deducted
  const { data: existing } = await supabase
    .from('bcbs_visit_log')
    .select('id')
    .eq('benefit_id', benefitId)
    .eq('visit_id', visitId)
    .eq('usage_type', 'deduction')
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: true, warning: 'BCBS visit already deducted' };
  }

  // Fetch current benefit state
  const { data: benefit, error: fetchErr } = await supabase
    .from('bcbs_visit_benefits')
    .select('*')
    .eq('id', benefitId)
    .single();

  if (fetchErr || !benefit) {
    return { success: false, warning: 'BCBS benefit not found' };
  }

  const b = benefit as BCBSVisitBenefit;
  const isPooled = b.benefit_type === 'pooled';

  let beforeBalance: number;
  let afterBalance: number;
  const updatePayload: Record<string, unknown> = {};

  if (isPooled) {
    const allowed = b.total_visits_allowed ?? 0;
    beforeBalance = Math.max(0, allowed - b.total_visits_used);
    const newUsed = b.total_visits_used + 1;
    afterBalance = Math.max(0, allowed - newUsed);
    updatePayload.total_visits_used = newUsed;
  } else {
    const disc = discipline.toUpperCase() as Discipline;
    if (disc === 'PT') {
      const allowed = b.pt_visits_allowed ?? 0;
      beforeBalance = Math.max(0, allowed - b.pt_visits_used);
      updatePayload.pt_visits_used = b.pt_visits_used + 1;
      afterBalance = Math.max(0, allowed - b.pt_visits_used - 1);
    } else if (disc === 'OT') {
      const allowed = b.ot_visits_allowed ?? 0;
      beforeBalance = Math.max(0, allowed - b.ot_visits_used);
      updatePayload.ot_visits_used = b.ot_visits_used + 1;
      afterBalance = Math.max(0, allowed - b.ot_visits_used - 1);
    } else {
      const allowed = b.st_visits_allowed ?? 0;
      beforeBalance = Math.max(0, allowed - b.st_visits_used);
      updatePayload.st_visits_used = b.st_visits_used + 1;
      afterBalance = Math.max(0, allowed - b.st_visits_used - 1);
    }
  }

  // Apply deduction
  const { error: updateErr } = await supabase
    .from('bcbs_visit_benefits')
    .update(updatePayload)
    .eq('id', benefitId);

  if (updateErr) {
    console.error('[BCBS] Failed to deduct visit:', updateErr.message);
    return { success: false, warning: `DB update failed: ${updateErr.message}` };
  }

  // Log — non-blocking, never throws
  try {
    await supabase
      .from('bcbs_visit_log')
      .insert({
        benefit_id: benefitId,
        visit_id: visitId,
        patient_id: patientId,
        clinic_id: clinicId,
        discipline,
        usage_type: 'deduction',
        visits_used: 1,
        before_balance: beforeBalance,
        after_balance: afterBalance,
        date_of_service: dateOfService,
        therapist_id: therapistId,
        created_by: createdBy,
      });
  } catch (err) {
    console.error('[BCBS] Visit log insert failed:', err);
  }

  if (afterBalance <= 0) {
    return { success: true, warning: 'BCBS visit limit reached (0 remaining)' };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// restoreBCBSVisit
// ---------------------------------------------------------------------------

/**
 * Restores 1 visit when a completed visit is undone.
 *
 * Increments the appropriate counter and logs a restore row.
 */
export async function restoreBCBSVisit(
  supabase: SupabaseClient,
  benefitId: string,
  visitId: string,
  discipline: Discipline,
  restoredBy: string,
  note: string,
): Promise<{ success: boolean; warning?: string }> {
  // Fetch current benefit state
  const { data: benefit, error: fetchErr } = await supabase
    .from('bcbs_visit_benefits')
    .select('*')
    .eq('id', benefitId)
    .single();

  if (fetchErr || !benefit) {
    return { success: false, warning: 'BCBS benefit not found' };
  }

  const b = benefit as BCBSVisitBenefit;
  const isPooled = b.benefit_type === 'pooled';

  let beforeBalance: number;
  let afterBalance: number;
  const updatePayload: Record<string, unknown> = {};

  if (isPooled) {
    const allowed = b.total_visits_allowed ?? 0;
    beforeBalance = Math.max(0, allowed - b.total_visits_used);
    const newUsed = Math.max(0, b.total_visits_used - 1);
    afterBalance = allowed - newUsed;
    updatePayload.total_visits_used = newUsed;
  } else {
    const disc = discipline.toUpperCase() as Discipline;
    if (disc === 'PT') {
      const allowed = b.pt_visits_allowed ?? 0;
      beforeBalance = Math.max(0, allowed - b.pt_visits_used);
      const newUsed = Math.max(0, b.pt_visits_used - 1);
      afterBalance = allowed - newUsed;
      updatePayload.pt_visits_used = newUsed;
    } else if (disc === 'OT') {
      const allowed = b.ot_visits_allowed ?? 0;
      beforeBalance = Math.max(0, allowed - b.ot_visits_used);
      const newUsed = Math.max(0, b.ot_visits_used - 1);
      afterBalance = allowed - newUsed;
      updatePayload.ot_visits_used = newUsed;
    } else {
      const allowed = b.st_visits_allowed ?? 0;
      beforeBalance = Math.max(0, allowed - b.st_visits_used);
      const newUsed = Math.max(0, b.st_visits_used - 1);
      afterBalance = allowed - newUsed;
      updatePayload.st_visits_used = newUsed;
    }
  }

  // Apply restore
  const { error: updateErr } = await supabase
    .from('bcbs_visit_benefits')
    .update(updatePayload)
    .eq('id', benefitId);

  if (updateErr) {
    console.error('[BCBS] Failed to restore visit:', updateErr.message);
    return { success: false, warning: `DB update failed: ${updateErr.message}` };
  }

  // Log — non-blocking
  try {
    await supabase
      .from('bcbs_visit_log')
      .insert({
        benefit_id: benefitId,
        visit_id: visitId,
        patient_id: b.patient_id,
        clinic_id: b.clinic_id,
        discipline,
        usage_type: 'restore',
        visits_used: 1,
        before_balance: beforeBalance,
        after_balance: afterBalance,
        note,
        created_by: restoredBy,
      });
  } catch (err) {
    console.error('[BCBS] Visit log insert failed:', err);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// getBCBSVisitLog
// ---------------------------------------------------------------------------

/**
 * Fetch visit usage history for a BCBS benefit, sorted newest first.
 */
export async function getBCBSVisitLog(
  supabase: SupabaseClient,
  benefitId: string,
): Promise<BCBSVisitLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('bcbs_visit_log')
      .select('*')
      .eq('benefit_id', benefitId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[BCBS] Visit log fetch failed:', error.message);
      return [];
    }

    return (data ?? []) as BCBSVisitLogEntry[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Get the color class for remaining visits based on percentage thresholds.
 * Green: > 20% remaining
 * Yellow: 10-20% remaining
 * Red: < 10% remaining or <= 5 visits
 */
export function getVisitLimitColor(remaining: number, allowed: number): 'green' | 'yellow' | 'red' {
  if (allowed <= 0) return 'red';
  if (remaining <= 0) return 'red';
  if (remaining <= 5) return 'red';
  const pct = remaining / allowed;
  if (pct <= 0.1) return 'red';
  if (pct <= 0.2) return 'yellow';
  return 'green';
}

export const VISIT_LIMIT_COLORS = {
  green: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
  },
  yellow: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700 border-red-200',
    bar: 'bg-red-500',
  },
} as const;
