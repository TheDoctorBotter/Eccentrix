-- ============================================================================
-- Multi-Disciplinary Support: Step 1 — Add new enum values
-- Must be committed in its own transaction before they can be used.
-- ============================================================================

ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'ot' AFTER 'pta';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'ota' AFTER 'ot';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'slp' AFTER 'ota';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'slpa' AFTER 'slp';
