-- Migration: Add support for insurance-based scheduling rules
--
-- 1. Adds a `credential` column to provider_profiles for explicit credential storage
--    (the existing `credentials` text field is free-form display text like "PT, DPT";
--     this new column stores the canonical credential code used for rule matching).
-- 2. Creates an index on patient_insurance for efficient lookup during scheduling.

-- Canonical credential code for rule matching (e.g., 'SLP', 'SLPA', 'PT', 'PTA')
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS credential TEXT;

-- Index for fast insurance lookup when scheduling: find the active primary insurance for a patient
CREATE INDEX IF NOT EXISTS idx_patient_insurance_scheduling
  ON patient_insurance(patient_id, payer_name, payer_type, is_active);
