-- =============================================================================
-- MULTI-CLINIC SUPER ADMIN MIGRATION - PART 1
-- =============================================================================
-- Run this FIRST. It adds the clinic_admin enum value.
-- The enum value must be committed before it can be used in functions/policies.
-- =============================================================================

-- Add clinic_admin to the clinic_role enum
DO $$ BEGIN
  ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'clinic_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
