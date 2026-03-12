/**
 * Availity payer/trading partner ID mapping.
 *
 * Keys are normalised lower-case aliases used in the clinic's payer_name or
 * payer_trading_partner_id. Values are the Availity trading partner IDs sent
 * in the eligibility inquiry request.
 *
 * null = payer not supported for automated eligibility.
 */
export const PAYER_MAP: Record<string, string | null> = {
  tmhp: 'TMHP',
  txmcd: 'TMHP',
  medicaid: 'TMHP',
  texas_medicaid: 'TMHP',
  bcbs: '00901',
  united: '87726',
  uhc: '87726',
  aetna: '60054',
  cigna: '62308',
  humana: '61101',
  molina: 'MLTXP',
  superior: 'SHP',
  driscoll: 'DCHP',
  other: null,
};

/**
 * Resolve an Availity trading partner ID from a clinic/payer string.
 * Returns null when no automated check is available.
 */
export function resolvePayerId(payerKey: string | null | undefined): string | null {
  if (!payerKey) return null;
  const key = payerKey.trim().toLowerCase();

  // Direct lookup
  if (key in PAYER_MAP) return PAYER_MAP[key];

  // Partial match — e.g. "Texas Medicaid (TMHP)" should match "medicaid"
  for (const [alias, id] of Object.entries(PAYER_MAP)) {
    if (key.includes(alias)) return id;
  }

  return null;
}
