-- ============================================================================
-- ACTUAL DURATION TRACKING & SHORTENED VISIT DOCUMENTATION
-- Additive migration: no existing tables/columns/policies are changed.
-- ============================================================================

-- Add actual duration and shortened visit reason to the visits table.
-- When null, downstream logic falls back to scheduled duration (start_time → end_time).
ALTER TABLE visits ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS shortened_visit_reason TEXT NULL;

COMMENT ON COLUMN visits.actual_duration_minutes IS 'Therapist-entered actual visit duration in minutes. Null = use scheduled duration.';
COMMENT ON COLUMN visits.shortened_visit_reason IS 'Required documentation when actual duration is less than scheduled duration.';
