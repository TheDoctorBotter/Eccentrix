-- =============================================================================
-- MULTI-CLINIC SUPER ADMIN MIGRATION - PART 1
-- =============================================================================
-- Run this FIRST. It adds the clinic_admin enum value.
-- The enum value must be committed before it can be used in functions/policies.
-- =============================================================================

-- Add clinic_admin to the clinic_role enum
-- Must be a bare statement (no DO block / EXCEPTION handler) because
-- ALTER TYPE ... ADD VALUE cannot run inside a subtransaction.
-- IF NOT EXISTS handles idempotency natively.
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'clinic_admin';
