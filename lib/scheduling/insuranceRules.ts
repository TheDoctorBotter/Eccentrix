/**
 * Insurance-based scheduling rules for TREATMENT visits only.
 *
 * Evaluation visits are always assigned to a licensed SLP regardless
 * of insurance — this is a clinical and compliance requirement, not
 * a business rule, and cannot be overridden.
 *
 * These rules only apply to the ST (Speech Therapy) discipline.
 * PT and OT scheduling is completely unaffected.
 *
 * Visit type values found in the codebase:
 *   UI (schedule page):  'treatment' | 'evaluation' | 're_evaluation' | 'discharge'
 *   SMS/Buckeye:         'eval' | 'treat' (normalized to 'evaluation' | 'treatment' on read)
 *   Database (visits):   TEXT column, no enum — stores the normalized long form
 */

export type VisitCategory = 'evaluation' | 'treatment'

export type SchedulingRule = {
  payerMatch: (payerName: string, payerType: string) => boolean
  allowedCredentials: string[]
  allowedRoles: string[]
  label: string
  warningMessage: string
}

// ---------------------------------------------------------------------------
// Treatment scheduling rules — keyed by insurance plan.
// These rules determine which clinician types can provide TREATMENT sessions.
// Do NOT apply these rules to evaluations under any circumstance.
// ---------------------------------------------------------------------------

export const TREATMENT_SCHEDULING_RULES: SchedulingRule[] = [
  {
    // Driscoll Health Plan — licensed SLP required for treatment.
    // Driscoll does not credential or reimburse SLPAs for treatment sessions.
    payerMatch: (payerName) =>
      payerName.toLowerCase().includes('driscoll'),
    allowedCredentials: ['SLP', 'CCC-SLP', 'CF-SLP'],
    allowedRoles: ['slp'],
    label: 'Driscoll Health Plan',
    warningMessage:
      'Driscoll Health Plan requires a licensed SLP for treatment visits. SLPAs are not covered under this plan.',
  },
  {
    // Private Pay — SLPA handles treatment sessions.
    // Private pay patients are scheduled with SLPAs for treatment
    // to optimize clinician utilization; SLPs handle evaluations only.
    payerMatch: (_, payerType) =>
      payerType === 'private_pay',
    allowedCredentials: ['SLPA'],
    allowedRoles: ['slpa'],
    label: 'Private Pay',
    warningMessage:
      'Private pay treatment visits are scheduled with SLPAs only.',
  },
  {
    // Blue Cross Blue Shield — SLPA handles treatment sessions.
    // BCBS credentials SLPAs for treatment under SLP supervision.
    payerMatch: (payerName) =>
      payerName.toLowerCase().includes('blue cross') ||
      payerName.toLowerCase().includes('bcbs') ||
      payerName.toLowerCase().includes('bluecross'),
    allowedCredentials: ['SLPA'],
    allowedRoles: ['slpa'],
    label: 'Blue Cross Blue Shield',
    warningMessage:
      'Blue Cross Blue Shield treatment visits are scheduled with SLPAs only.',
  },
]

// ---------------------------------------------------------------------------
// Evaluation visit type detection
// ---------------------------------------------------------------------------

/**
 * Canonical evaluation visit type values.
 *
 * Database/UI values mapped to category:
 *   'evaluation'         → evaluation  (UI option)
 *   're_evaluation'      → evaluation  (UI option)
 *   'eval'               → evaluation  (SMS/Buckeye short form)
 *   'initial_eval'       → evaluation  (potential variant)
 *   'initial_evaluation' → evaluation  (potential variant)
 *   're_eval'            → evaluation  (potential variant)
 *   'screening'          → evaluation  (potential variant)
 *   'treatment'          → treatment   (UI option)
 *   'discharge'          → treatment   (UI option — not an eval)
 *   'treat'              → treatment   (SMS/Buckeye short form)
 */
export const EVALUATION_VISIT_TYPES = [
  'evaluation',
  'eval',
  're_evaluation',
  're_eval',
  'initial_eval',
  'initial_evaluation',
  'screening',
]

export function isEvaluation(visitType: string): boolean {
  return EVALUATION_VISIT_TYPES.includes(visitType.toLowerCase().trim())
}

// ---------------------------------------------------------------------------
// Rule result type
// ---------------------------------------------------------------------------

export type InsuranceRuleResult = {
  /** True when a treatment insurance rule matched */
  hasRule: boolean
  /** The matched rule, if any */
  rule: SchedulingRule | null
  /** Credentials allowed by the rule (or by evaluation override) */
  allowedCredentials: string[]
  /** Roles allowed by the rule (or by evaluation override) */
  allowedRoles: string[]
  /** Warning message to display in the UI */
  warningMessage: string | null
  /** Human-readable insurance plan label */
  insuranceLabel: string | null
  /** True when rules are bypassed because this is an evaluation */
  evaluationOverride: boolean
  /** Informational message shown for evaluation visits */
  evaluationMessage: string | null
}

// ---------------------------------------------------------------------------
// Core rule engine
// ---------------------------------------------------------------------------

/**
 * Determine which scheduling rule applies for the given insurance and visit type.
 *
 * EVALUATION RULE: Evaluations must always be conducted by a licensed SLP.
 * This is a clinical compliance requirement — not a business preference —
 * and cannot be overridden by admin users or any insurance plan.
 *
 * TREATMENT RULE: Insurance-based rules filter eligible clinicians for
 * treatment sessions. Admin users can override treatment rules but not
 * evaluation rules.
 */
export function getSchedulingRule(
  payerName: string,
  payerType: string,
  visitType: string
): InsuranceRuleResult {
  // EVALUATION RULE — always a licensed SLP, no exceptions, no insurance rules apply.
  // This is a clinical and compliance requirement: only a licensed SLP can perform
  // an evaluation because the evaluation establishes the plan of care and requires
  // clinical judgment that assistants are not licensed to provide.
  if (isEvaluation(visitType)) {
    return {
      hasRule: false,
      rule: null,
      allowedCredentials: ['SLP', 'CCC-SLP', 'CF-SLP'],
      allowedRoles: ['slp'],
      warningMessage: null,
      insuranceLabel: null,
      evaluationOverride: true,
      evaluationMessage:
        'Evaluations must be conducted by a licensed SLP regardless of insurance plan.',
    }
  }

  // TREATMENT RULE — apply insurance-based rules
  const match = TREATMENT_SCHEDULING_RULES.find(r =>
    r.payerMatch(payerName, payerType)
  )

  if (!match) {
    return {
      hasRule: false,
      rule: null,
      allowedCredentials: [],
      allowedRoles: [],
      warningMessage: null,
      insuranceLabel: null,
      evaluationOverride: false,
      evaluationMessage: null,
    }
  }

  return {
    hasRule: true,
    rule: match,
    allowedCredentials: match.allowedCredentials,
    allowedRoles: match.allowedRoles,
    warningMessage: match.warningMessage,
    insuranceLabel: match.label,
    evaluationOverride: false,
    evaluationMessage: null,
  }
}

// ---------------------------------------------------------------------------
// Clinician filtering
// ---------------------------------------------------------------------------

/**
 * Filter a list of clinicians based on the scheduling rule result.
 *
 * When evaluationOverride is true, only licensed SLPs are allowed.
 * When a treatment rule applies, only clinicians matching the rule are allowed.
 * When no rule applies and it's not an evaluation, all clinicians pass through.
 */
export function applySchedulingRule<T extends {
  role: string
  credential: string | null
}>(
  clinicians: T[],
  ruleResult: InsuranceRuleResult
): { allowed: T[]; excluded: T[] } {
  // If no rule and not an evaluation override, return all clinicians unchanged
  if (!ruleResult.hasRule && !ruleResult.evaluationOverride) {
    return { allowed: clinicians, excluded: [] }
  }

  // Both evaluation override and insurance rules filter by allowedRoles/credentials
  const allowed = clinicians.filter(c =>
    ruleResult.allowedRoles.includes(c.role) ||
    (c.credential && ruleResult.allowedCredentials.some(cred =>
      c.credential!.toUpperCase().includes(cred.toUpperCase())
    ))
  )
  const excluded = clinicians.filter(c => !allowed.includes(c))
  return { allowed, excluded }
}
