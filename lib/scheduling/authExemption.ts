/**
 * Authorization exemption helpers.
 *
 * Single source of truth for determining whether a patient's payer type
 * is exempt from prior authorization at a given clinic.
 *
 * Each clinic independently controls its auth_exempt_payers list.
 * A clinic with an empty list has no exemptions — identical to today's behavior.
 */

/** Supported payer types for the patients.payer_type column. */
export const PAYER_TYPES = [
  'medicaid',
  'medicare',
  'private_insurance',
  'bcbs_tx',
  'eci',
  'self_pay',
  'tricare',
  'chip',
  'other',
] as const

export type PayerType = (typeof PAYER_TYPES)[number]

/** Human-readable labels for payer types. */
export const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  medicaid: 'Medicaid',
  medicare: 'Medicare',
  private_insurance: 'Private Insurance',
  bcbs_tx: 'BCBS Texas',
  eci: 'ECI (Early Childhood Intervention)',
  self_pay: 'Self Pay',
  tricare: 'TRICARE',
  chip: 'CHIP',
  other: 'Other',
}

/**
 * Check whether a patient's payer type is exempt from prior authorization
 * at a given clinic.
 *
 * Returns false when:
 *  - payerType is null/undefined (unknown payer — default to requiring auth)
 *  - clinicAuthExemptPayers is empty (no exemptions configured)
 *  - payerType is not in the clinic's exempt list
 */
export function isAuthExempt(
  payerType: string | null | undefined,
  clinicAuthExemptPayers: string[],
): boolean {
  if (!payerType) return false
  if (!clinicAuthExemptPayers || clinicAuthExemptPayers.length === 0) return false
  return clinicAuthExemptPayers.includes(payerType.toLowerCase())
}

/**
 * Get a human-readable reason string for why a visit is auth-exempt.
 * Stored in visits.auth_exempt_reason for auditability.
 */
export function getAuthExemptReason(payerType: string): string {
  const reasons: Record<string, string> = {
    eci: 'ECI — Early Childhood Intervention program does not require prior authorization',
    self_pay: 'Self-pay patient — no insurance authorization required',
    private_pay: 'Private pay — no insurance authorization required',
    tricare: 'TRICARE — authorization exemption configured for this clinic',
    chip: 'CHIP — authorization exemption configured for this clinic',
    bcbs_tx: 'BCBS Texas — does not require prior authorization for scheduled visits at this clinic',
  }
  return (
    reasons[payerType.toLowerCase()] ??
    `${payerType} marked as auth-exempt for this clinic`
  )
}
