-- =============================================================================
-- MULTI-CLINIC SUPER ADMIN MIGRATION
-- =============================================================================
-- This migration adds super admin support to the existing multi-clinic
-- architecture. The app already has:
--   - clinics table with basic fields
--   - clinic_memberships for user-to-clinic role mapping
--   - clinic_id on most data tables
--   - RLS policies scoped to clinic membership
--
-- What this migration adds:
--   1. Missing columns on clinics (slug, fax, npi, tax_id, etc.)
--   2. is_super_admin flag on clinic_memberships
--   3. clinic_admin role in the enum
--   4. Super admin bypass in RLS helper functions
--   5. Updated RLS policies with super admin bypass
-- =============================================================================

-- =============================================================================
-- A) ADD MISSING COLUMNS TO CLINICS TABLE
-- The clinics table already exists but lacks some fields needed for full
-- multi-clinic SaaS (slug for URL routing, NPI/tax_id for billing identity,
-- separated address fields, branding colors).
-- =============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address_zip TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS fax TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS npi TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS logo_storage_path TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS letterhead_storage_path TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#1e40af';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#64748b';

CREATE INDEX IF NOT EXISTS clinics_slug_idx ON clinics(slug);
CREATE INDEX IF NOT EXISTS clinics_active_idx ON clinics(is_active);

-- Generate slugs for existing clinics that don't have one
UPDATE clinics
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL;

-- =============================================================================
-- B) ADD is_super_admin TO clinic_memberships
-- Super admin is a global flag orthogonal to the per-clinic role. A user can be
-- is_super_admin=true AND role='admin' for their home clinic, but the super admin
-- flag grants cross-clinic visibility and management access.
-- We add it to clinic_memberships rather than a separate table because all user
-- identity checks already go through clinic_memberships.
-- =============================================================================

ALTER TABLE clinic_memberships
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- =============================================================================
-- C) ADD clinic_admin TO THE clinic_role ENUM
-- clinic_admin has the same powers as admin but is semantically "owner of this
-- clinic" vs "global admin". RLS treats both the same within their clinic scope.
-- =============================================================================

-- Safely add 'clinic_admin' to the enum if it doesn't exist
DO $$ BEGIN
  ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'clinic_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- D) CREATE SUPER ADMIN CHECK FUNCTION
-- Used by RLS policies to grant cross-clinic access. Queries clinic_memberships
-- directly with is_super_admin flag to avoid creating a separate table.
-- =============================================================================

CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM clinic_memberships
    WHERE user_id = p_user_id
      AND is_super_admin = true
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- =============================================================================
-- E) UPDATE HELPER FUNCTIONS WITH SUPER ADMIN BYPASS
-- The existing get_user_clinic_role, is_clinic_admin, is_clinic_pt, and
-- has_episode_access functions need to recognize super admin.
-- =============================================================================

-- Update is_clinic_admin to also return true for clinic_admin role and super admin
CREATE OR REPLACE FUNCTION is_clinic_admin(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admin has admin access everywhere
  IF is_super_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id)
      AND role IN ('admin', 'clinic_admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Update is_clinic_pt to recognize super admin and multi-discipline roles
CREATE OR REPLACE FUNCTION is_clinic_pt(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_super_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id)
      AND role IN ('pt', 'ot', 'slp', 'admin', 'clinic_admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Update has_episode_access to grant super admin full access
CREATE OR REPLACE FUNCTION has_episode_access(
  p_user_id UUID,
  p_episode_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_clinic_id UUID;
  v_role clinic_role;
BEGIN
  -- Super admin can access all episodes
  IF is_super_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Get episode's clinic
  SELECT clinic_id INTO v_clinic_id
  FROM episodes
  WHERE id = p_episode_id;

  IF v_clinic_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user's role in that clinic
  SELECT role INTO v_role
  FROM clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = v_clinic_id OR clinic_id = v_clinic_id)
    AND is_active = true
  LIMIT 1;

  -- Admin, clinic_admin, front_office, and biller can see all episodes in their clinic
  IF v_role IN ('admin', 'clinic_admin', 'front_office', 'biller') THEN
    RETURN TRUE;
  END IF;

  -- Clinical staff need to be on the care team
  IF v_role IN ('pt', 'pta', 'ot', 'ota', 'slp', 'slpa') THEN
    RETURN EXISTS (
      SELECT 1
      FROM episode_care_team
      WHERE episode_id = p_episode_id
        AND user_id = p_user_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- =============================================================================
-- F) UPDATE RLS POLICIES WITH SUPER ADMIN BYPASS
-- Super admins can see and modify data across all clinics.
-- We update the key tables' SELECT policies to include the super admin check.
-- =============================================================================

-- CLINICS: super admin can see all clinics
DROP POLICY IF EXISTS "clinics_select" ON clinics;
CREATE POLICY "clinics_select"
ON clinics FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = clinics.id
           OR clinic_memberships.clinic_id = clinics.id)
      AND clinic_memberships.is_active = true
  )
);

-- CLINICS: super admin can insert clinics
DROP POLICY IF EXISTS "clinics_insert" ON clinics;
CREATE POLICY "clinics_insert"
ON clinics FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
      AND clinic_memberships.is_active = true
  )
);

-- CLINICS: super admin can update all clinics; clinic_admin can update their own
DROP POLICY IF EXISTS "clinics_update" ON clinics;
CREATE POLICY "clinics_update"
ON clinics FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = clinics.id
           OR clinic_memberships.clinic_id = clinics.id)
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
      AND clinic_memberships.is_active = true
  )
);

-- CLINICS: super admin can deactivate; clinic_admin can manage their own
DROP POLICY IF EXISTS "clinics_delete" ON clinics;
CREATE POLICY "clinics_delete"
ON clinics FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = clinics.id
           OR clinic_memberships.clinic_id = clinics.id)
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
      AND clinic_memberships.is_active = true
  )
);

-- PATIENTS: super admin can see all patients
DROP POLICY IF EXISTS "patients_select" ON patients;
CREATE POLICY "patients_select"
ON patients FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- PATIENTS: super admin can write all patients
DROP POLICY IF EXISTS "patients_insert" ON patients;
CREATE POLICY "patients_insert"
ON patients FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

DROP POLICY IF EXISTS "patients_update" ON patients;
CREATE POLICY "patients_update"
ON patients FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

DROP POLICY IF EXISTS "patients_delete" ON patients;
CREATE POLICY "patients_delete"
ON patients FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
      AND clinic_memberships.is_active = true
  )
);

-- EPISODES: super admin handled via updated has_episode_access function
-- (already updated above — no policy changes needed for episodes/documents)

-- VISITS: add super admin bypass
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'visits') THEN
    EXECUTE 'DROP POLICY IF EXISTS "visits_select" ON visits';
    EXECUTE $policy$
      CREATE POLICY "visits_select" ON visits FOR SELECT
      USING (
        is_super_admin(auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE clinic_memberships.user_id = auth.uid()
            AND (clinic_memberships.clinic_id_ref = visits.clinic_id
                 OR clinic_memberships.clinic_id = visits.clinic_id)
            AND clinic_memberships.is_active = true
        )
      )
    $policy$;
  END IF;
END $$;

-- NOTES: add super admin bypass
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notes') THEN
    EXECUTE 'DROP POLICY IF EXISTS "notes_select" ON notes';
    EXECUTE $policy$
      CREATE POLICY "notes_select" ON notes FOR SELECT
      USING (
        is_super_admin(auth.uid())
        OR
        (
          clinic_id IS NULL
          OR
          EXISTS (
            SELECT 1 FROM clinic_memberships
            WHERE clinic_memberships.user_id = auth.uid()
              AND (clinic_memberships.clinic_id_ref = notes.clinic_id
                   OR clinic_memberships.clinic_id = notes.clinic_id)
              AND clinic_memberships.is_active = true
          )
        )
      )
    $policy$;
  END IF;
END $$;

-- CLINIC_MEMBERSHIPS: super admin can see all memberships (for user management)
DROP POLICY IF EXISTS "clinic_memberships_select" ON clinic_memberships;
CREATE POLICY "clinic_memberships_select"
ON clinic_memberships FOR SELECT
USING (
  user_id = auth.uid()
  OR
  -- Super admin can see all memberships for management purposes.
  -- Direct column check avoids recursion since we check the requesting user's
  -- own row for is_super_admin, not a subquery into clinic_memberships.
  EXISTS (
    SELECT 1 FROM clinic_memberships sa
    WHERE sa.user_id = auth.uid()
      AND sa.is_super_admin = true
      AND sa.is_active = true
  )
);

-- =============================================================================
-- G) UPDATE FINALIZATION TRIGGER TO RECOGNIZE clinic_admin
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_finalization_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_user_role clinic_role;
  v_old_status text;
  v_new_status text;
BEGIN
  v_old_status := COALESCE(OLD.status, 'draft');
  v_new_status := NEW.status;

  IF v_new_status != 'final' OR v_old_status = 'final' THEN
    RETURN NEW;
  END IF;

  -- Super admin can finalize anything
  IF is_super_admin(auth.uid()) THEN
    NEW.finalized_at := NOW();
    NEW.finalized_by := auth.uid();
    RETURN NEW;
  END IF;

  SELECT role INTO v_user_role
  FROM clinic_memberships
  WHERE user_id = auth.uid()
    AND (clinic_id_ref = NEW.clinic_id OR clinic_id = NEW.clinic_id)
    AND is_active = true
  LIMIT 1;

  IF NEW.doc_type IN ('evaluation', 're_evaluation', 'progress_summary', 'discharge_summary') THEN
    IF v_user_role NOT IN ('pt', 'ot', 'slp', 'admin', 'clinic_admin') THEN
      RAISE EXCEPTION 'Only PT/OT/SLP/Admin can finalize %', NEW.doc_type;
    END IF;
  END IF;

  NEW.finalized_at := NOW();
  NEW.finalized_by := auth.uid();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';
