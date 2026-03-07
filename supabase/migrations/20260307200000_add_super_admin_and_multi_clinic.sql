-- =============================================================================
-- MULTI-CLINIC SUPER ADMIN MIGRATION (RESILIENT / IDEMPOTENT)
-- =============================================================================
-- Safe to run multiple times. Handles partial prior application gracefully.
-- =============================================================================

-- =============================================================================
-- BLOCK 1: ADD COLUMNS TO CLINICS (without UNIQUE on slug)
-- =============================================================================
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS slug TEXT;
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

-- =============================================================================
-- BLOCK 2: POPULATE SLUGS (before adding unique constraint)
-- =============================================================================
UPDATE clinics
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
           || '-' || LEFT(id::text, 8)
WHERE slug IS NULL;

-- =============================================================================
-- BLOCK 3: ADD UNIQUE CONSTRAINT AND INDEXES ON SLUG
-- Now safe because all rows have non-null, unique slugs
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clinics_slug_key' AND conrelid = 'clinics'::regclass
  ) THEN
    ALTER TABLE clinics ADD CONSTRAINT clinics_slug_key UNIQUE (slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS clinics_slug_idx ON clinics(slug);
CREATE INDEX IF NOT EXISTS clinics_active_idx ON clinics(is_active);

-- =============================================================================
-- BLOCK 4: ADD is_super_admin TO clinic_memberships
-- =============================================================================
ALTER TABLE clinic_memberships
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- =============================================================================
-- BLOCK 5: ADD clinic_admin TO clinic_role ENUM
-- =============================================================================
DO $$ BEGIN
  ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'clinic_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- BLOCK 6: CREATE/UPDATE FUNCTIONS
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

CREATE OR REPLACE FUNCTION is_clinic_admin(
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
      AND role IN ('admin', 'clinic_admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

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

CREATE OR REPLACE FUNCTION has_episode_access(
  p_user_id UUID,
  p_episode_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_clinic_id UUID;
  v_role clinic_role;
BEGIN
  IF is_super_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  SELECT clinic_id INTO v_clinic_id
  FROM episodes
  WHERE id = p_episode_id;

  IF v_clinic_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = v_clinic_id OR clinic_id = v_clinic_id)
    AND is_active = true
  LIMIT 1;

  IF v_role IN ('admin', 'clinic_admin', 'front_office', 'biller') THEN
    RETURN TRUE;
  END IF;

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
-- BLOCK 7: UPDATE RLS POLICIES
-- All use DROP IF EXISTS + CREATE so they're safe to re-run.
-- =============================================================================

-- CLINICS
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

-- PATIENTS
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

-- VISITS (conditional - table may not exist)
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

-- NOTES (conditional - table may not exist)
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

-- CLINIC_MEMBERSHIPS
DROP POLICY IF EXISTS "clinic_memberships_select" ON clinic_memberships;
CREATE POLICY "clinic_memberships_select"
ON clinic_memberships FOR SELECT
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships sa
    WHERE sa.user_id = auth.uid()
      AND sa.is_super_admin = true
      AND sa.is_active = true
  )
);

-- =============================================================================
-- BLOCK 8: UPDATE FINALIZATION TRIGGER
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
