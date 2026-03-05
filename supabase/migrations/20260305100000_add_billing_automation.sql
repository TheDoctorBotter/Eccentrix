-- ============================================================================
-- BILLING AUTOMATION MODULE — Step 1: Add enum value
-- Must be in its own transaction before it can be used.
-- ============================================================================

ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'biller' AFTER 'admin';
