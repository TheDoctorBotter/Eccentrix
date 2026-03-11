const PHASE_ORDER = [
  'monitoring',
  'referral_sent',
  'evaluation_completed',
  'equipment_received',
] as const;

export function getNextPhase(currentPhase: string): string | null {
  const idx = PHASE_ORDER.indexOf(currentPhase as (typeof PHASE_ORDER)[number]);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

/**
 * Returns the date field that should be auto-populated when advancing to the given phase.
 */
export function getDateFieldForPhase(
  phase: string
): 'referral_sent_date' | 'evaluation_date' | 'equipment_received_date' | null {
  switch (phase) {
    case 'referral_sent':
      return 'referral_sent_date';
    case 'evaluation_completed':
      return 'evaluation_date';
    case 'equipment_received':
      return 'equipment_received_date';
    default:
      return null;
  }
}
