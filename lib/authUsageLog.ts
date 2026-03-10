/**
 * Authorization Usage Log helpers.
 *
 * logAuthUsage  — insert a single audit row (never throws)
 * getAuthUsageHistory — fetch history for an authorization (newest first)
 */

export interface AuthUsageLogEntry {
  id: string;
  authorization_id: string;
  visit_id: string | null;
  patient_id: string | null;
  clinic_id: string | null;
  discipline: 'PT' | 'OT' | 'ST';
  usage_type: 'deduction' | 'restore' | 'adjustment';
  amount: number;
  amount_kind: 'units' | 'visits';
  before_balance: number | null;
  after_balance: number | null;
  date_of_service: string | null;
  therapist_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Insert a usage log entry.
 *
 * CRITICAL: This must NEVER throw. Deductions are the source of truth —
 * a log failure must not block or roll back the deduction.
 */
export async function logAuthUsage(
  supabase: { from: (table: string) => any },
  entry: {
    authorization_id: string;
    visit_id?: string | null;
    patient_id?: string | null;
    clinic_id?: string | null;
    discipline: 'PT' | 'OT' | 'ST';
    usage_type: 'deduction' | 'restore' | 'adjustment';
    amount: number;
    amount_kind: 'units' | 'visits';
    before_balance: number | null;
    after_balance: number | null;
    date_of_service?: string | null;
    therapist_id?: string | null;
    created_by?: string | null;
    note?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase
      .from('authorization_usage_log')
      .insert({
        authorization_id: entry.authorization_id,
        visit_id: entry.visit_id ?? null,
        patient_id: entry.patient_id ?? null,
        clinic_id: entry.clinic_id ?? null,
        discipline: entry.discipline,
        usage_type: entry.usage_type,
        amount: entry.amount,
        amount_kind: entry.amount_kind,
        before_balance: entry.before_balance,
        after_balance: entry.after_balance,
        date_of_service: entry.date_of_service ?? null,
        therapist_id: entry.therapist_id ?? null,
        created_by: entry.created_by ?? null,
        note: entry.note ?? null,
      });

    if (error) {
      // Safe error log — no PHI
      console.error('Auth usage log insert failed:', error.message, {
        authorization_id: entry.authorization_id,
        visit_id: entry.visit_id,
        discipline: entry.discipline,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Auth usage log insert failed:', message, {
      authorization_id: entry.authorization_id,
      visit_id: entry.visit_id,
      discipline: entry.discipline,
    });
  }
}

/**
 * Fetch usage history for a given authorization, sorted newest first.
 * Returns an empty array on error.
 */
export async function getAuthUsageHistory(
  supabase: { from: (table: string) => any },
  authorizationId: string,
): Promise<AuthUsageLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('authorization_usage_log')
      .select('*')
      .eq('authorization_id', authorizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Auth usage log fetch failed:', error.message, {
        authorization_id: authorizationId,
      });
      return [];
    }

    return (data ?? []) as AuthUsageLogEntry[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Auth usage log fetch failed:', message, {
      authorization_id: authorizationId,
    });
    return [];
  }
}
