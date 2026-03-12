-- Migration: Add 'manual_required' to eligibility_checks status values
--
-- The eligibility_checks.status column is TEXT (no enum/check constraint),
-- so the new 'manual_required' status value works without schema changes.
--
-- This migration is a no-op included for documentation purposes.
-- The Availity integration adds these possible status values:
--   'eligible'         — active coverage confirmed via Availity API
--   'ineligible'       — inactive coverage confirmed via Availity API
--   'error'            — API call failed
--   'manual_required'  — AVAILITY_ENABLED=false, staff directed to Availity portal
--   'pending'          — legacy: 270 EDI file generated for manual submission

-- No schema changes required.
SELECT 1;
