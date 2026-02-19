-- ============================================================================
-- SECURITY ADVISOR FIX: 8 Errors + 13 Warnings
-- HIPAA-sensitive healthcare application — all fixes in one migration
-- Run in Supabase SQL Editor
-- ============================================================================
--
-- ERRORS FIXED:
--   1-5. RLS Disabled on: intervention_library, branding_settings, templates,
--        document_templates, interventions (if exists)
--   6.   Policy Exists RLS Disabled on branding_settings
--   7-8. Security Definer Views: active_episodes_view, documents_with_episode_view
--
-- WARNINGS FIXED:
--   1-6. Function Search Path Mutable on 6 functions
--   7-13. RLS Policy Always True on clinic_memberships, clinics, documents,
--         episodes, notes, patients
--
-- NOTE: clinic_memberships.clinic_id is TEXT, clinic_memberships.clinic_id_ref
-- is UUID. All cross-table comparisons use ::text casts for safety.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ENABLE RLS ON ALL TABLES MISSING IT
-- (Errors 1-6: RLS Disabled / Policy Exists RLS Disabled)
-- ============================================================================

ALTER TABLE IF EXISTS intervention_library ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE 'ALTER TABLE interventions ENABLE ROW LEVEL SECURITY';
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- SECTION 2: FIX RLS POLICIES — INTERVENTION_LIBRARY
-- Read-only for all authenticated users (reference data, no PHI).
-- Only admins can modify.
-- ============================================================================

DROP POLICY IF EXISTS "intervention_library_select" ON intervention_library;
DROP POLICY IF EXISTS "intervention_library_insert" ON intervention_library;
DROP POLICY IF EXISTS "intervention_library_update" ON intervention_library;
DROP POLICY IF EXISTS "intervention_library_delete" ON intervention_library;

CREATE POLICY "intervention_library_select"
ON intervention_library FOR SELECT TO authenticated
USING (true);

CREATE POLICY "intervention_library_insert"
ON intervention_library FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
);

CREATE POLICY "intervention_library_update"
ON intervention_library FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
);

CREATE POLICY "intervention_library_delete"
ON intervention_library FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
);


-- ============================================================================
-- SECTION 3: FIX RLS POLICIES — NOTES (replace USING(true))
-- Restrict to clinic members. Allow null clinic_id notes to remain accessible
-- to any authenticated user (backward compat for older notes).
--
-- clinic_memberships.clinic_id is TEXT, clinic_memberships.clinic_id_ref is UUID.
-- notes.clinic_id is UUID. Cast everything to TEXT for safe comparison.
-- ============================================================================

DROP POLICY IF EXISTS "notes_select_policy" ON notes;
DROP POLICY IF EXISTS "notes_insert_policy" ON notes;
DROP POLICY IF EXISTS "notes_update_policy" ON notes;
DROP POLICY IF EXISTS "notes_delete_policy" ON notes;

CREATE POLICY "notes_select"
ON notes FOR SELECT TO authenticated
USING (
  clinic_id IS NULL
  OR clinic_id::text IN (
    SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
    UNION
    SELECT cm.clinic_id::text FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
  )
);

CREATE POLICY "notes_insert"
ON notes FOR INSERT TO authenticated
WITH CHECK (
  clinic_id IS NULL
  OR clinic_id::text IN (
    SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
    UNION
    SELECT cm.clinic_id::text FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
  )
);

CREATE POLICY "notes_update"
ON notes FOR UPDATE TO authenticated
USING (
  clinic_id IS NULL
  OR clinic_id::text IN (
    SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
    UNION
    SELECT cm.clinic_id::text FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
  )
);

CREATE POLICY "notes_delete"
ON notes FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref::text = notes.clinic_id::text
           OR cm.clinic_id::text = notes.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);


-- ============================================================================
-- SECTION 4: FIX RLS POLICIES — CLINIC_MEMBERSHIPS
-- Drop the old permissive USING(true) policies that were never cleaned up.
-- The proper policies from the auth migration already exist.
-- ============================================================================

DROP POLICY IF EXISTS "memberships_select_own" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_insert_policy" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_update_policy" ON clinic_memberships;

-- Verify the proper policies still exist (these were created in 20260208100000)
-- If they got dropped somehow, recreate them:
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clinic_memberships' AND policyname = 'clinic_memberships_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "clinic_memberships_select"
      ON clinic_memberships FOR SELECT
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid()
            AND (cm.clinic_id_ref = clinic_memberships.clinic_id_ref
                 OR cm.clinic_id = clinic_memberships.clinic_id)
            AND cm.is_active = true
        )
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clinic_memberships' AND policyname = 'clinic_memberships_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "clinic_memberships_insert"
      ON clinic_memberships FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid()
            AND (cm.clinic_id_ref = clinic_memberships.clinic_id_ref
                 OR cm.clinic_id = clinic_memberships.clinic_id)
            AND cm.role = 'admin'
            AND cm.is_active = true
        )
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clinic_memberships' AND policyname = 'clinic_memberships_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "clinic_memberships_update"
      ON clinic_memberships FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid()
            AND (cm.clinic_id_ref = clinic_memberships.clinic_id_ref
                 OR cm.clinic_id = clinic_memberships.clinic_id)
            AND cm.role = 'admin'
            AND cm.is_active = true
        )
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clinic_memberships' AND policyname = 'clinic_memberships_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "clinic_memberships_delete"
      ON clinic_memberships FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid()
            AND (cm.clinic_id_ref = clinic_memberships.clinic_id_ref
                 OR cm.clinic_id = clinic_memberships.clinic_id)
            AND cm.role = 'admin'
            AND cm.is_active = true
        )
      )
    $policy$;
  END IF;
END $$;


-- ============================================================================
-- SECTION 5: VERIFY/FIX RLS POLICIES — CLINICS, PATIENTS, EPISODES, DOCUMENTS
-- ============================================================================

DROP POLICY IF EXISTS "clinics_all" ON clinics;
DROP POLICY IF EXISTS "patients_all" ON patients;
DROP POLICY IF EXISTS "patients_select" ON patients;
DROP POLICY IF EXISTS "patients_insert" ON patients;
DROP POLICY IF EXISTS "patients_update" ON patients;
DROP POLICY IF EXISTS "patients_delete" ON patients;
DROP POLICY IF EXISTS "episodes_all" ON episodes;
DROP POLICY IF EXISTS "documents_all" ON documents;


-- ============================================================================
-- SECTION 6: FIX TEMPLATES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "templates_select" ON templates;
DROP POLICY IF EXISTS "templates_all_admin" ON templates;

CREATE POLICY "templates_select"
ON templates FOR SELECT TO authenticated
USING (true);

CREATE POLICY "templates_insert"
ON templates FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
);

CREATE POLICY "templates_update"
ON templates FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
);

CREATE POLICY "templates_delete"
ON templates FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
);


-- ============================================================================
-- SECTION 7: FIX DOCUMENT_TEMPLATES POLICIES
-- document_templates.clinic_id may be TEXT (added via dashboard).
-- Cast both sides to TEXT for safe comparison.
-- ============================================================================

DROP POLICY IF EXISTS "document_templates_select" ON document_templates;
DROP POLICY IF EXISTS "document_templates_all_admin" ON document_templates;
DROP POLICY IF EXISTS "document_templates_insert" ON document_templates;
DROP POLICY IF EXISTS "document_templates_update" ON document_templates;
DROP POLICY IF EXISTS "document_templates_delete" ON document_templates;

-- Ensure clinic_id column exists
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

CREATE POLICY "document_templates_select"
ON document_templates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref::text = document_templates.clinic_id::text
           OR cm.clinic_id::text = document_templates.clinic_id::text)
      AND cm.is_active = true
  )
);

CREATE POLICY "document_templates_insert"
ON document_templates FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref::text = document_templates.clinic_id::text
           OR cm.clinic_id::text = document_templates.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);

CREATE POLICY "document_templates_update"
ON document_templates FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref::text = document_templates.clinic_id::text
           OR cm.clinic_id::text = document_templates.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);

CREATE POLICY "document_templates_delete"
ON document_templates FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref::text = document_templates.clinic_id::text
           OR cm.clinic_id::text = document_templates.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);


-- ============================================================================
-- SECTION 8: FIX BRANDING_SETTINGS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to branding settings" ON branding_settings;
DROP POLICY IF EXISTS "Allow public insert of branding settings" ON branding_settings;
DROP POLICY IF EXISTS "Allow public update of branding settings" ON branding_settings;
DROP POLICY IF EXISTS "Allow public delete of branding settings" ON branding_settings;
DROP POLICY IF EXISTS "branding_settings_select" ON branding_settings;
DROP POLICY IF EXISTS "branding_settings_all_admin" ON branding_settings;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branding_settings'
      AND policyname = 'Users can read branding for their clinics'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can read branding for their clinics"
      ON branding_settings FOR SELECT TO authenticated
      USING (
        clinic_id::text IN (
          SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
          UNION
          SELECT cm.clinic_id::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branding_settings'
      AND policyname = 'Admins can insert branding for their clinics'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can insert branding for their clinics"
      ON branding_settings FOR INSERT TO authenticated
      WITH CHECK (
        clinic_id::text IN (
          SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
          UNION
          SELECT cm.clinic_id::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branding_settings'
      AND policyname = 'Admins can update branding for their clinics'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can update branding for their clinics"
      ON branding_settings FOR UPDATE TO authenticated
      USING (
        clinic_id::text IN (
          SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
          UNION
          SELECT cm.clinic_id::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
      WITH CHECK (
        clinic_id::text IN (
          SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
          UNION
          SELECT cm.clinic_id::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branding_settings'
      AND policyname = 'Admins can delete branding for their clinics'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can delete branding for their clinics"
      ON branding_settings FOR DELETE TO authenticated
      USING (
        clinic_id::text IN (
          SELECT cm.clinic_id_ref::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id_ref IS NOT NULL
          UNION
          SELECT cm.clinic_id::text FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
    $policy$;
  END IF;
END $$;


-- ============================================================================
-- SECTION 9: RECREATE VIEWS AS SECURITY INVOKER
-- (Errors 7-8: Security Definer Views)
-- ============================================================================

DROP VIEW IF EXISTS active_episodes_view;
CREATE VIEW active_episodes_view
WITH (security_invoker = true)
AS
SELECT
  e.id as episode_id,
  e.patient_id,
  e.clinic_id,
  e.start_date,
  e.diagnosis,
  e.frequency,
  e.primary_pt_id,
  e.care_team_ids,
  p.first_name,
  p.last_name,
  p.date_of_birth,
  p.primary_diagnosis,
  p.referring_physician
FROM episodes e
JOIN patients p ON e.patient_id = p.id
WHERE e.status = 'active';

COMMENT ON VIEW active_episodes_view IS 'Active episodes with patient demographics (SECURITY INVOKER — respects RLS)';

DROP VIEW IF EXISTS documents_with_episode_view;
CREATE VIEW documents_with_episode_view
WITH (security_invoker = true)
AS
SELECT
  d.*,
  e.status as episode_status,
  p.first_name,
  p.last_name
FROM documents d
JOIN episodes e ON d.episode_id = e.id
JOIN patients p ON d.patient_id = p.id;

COMMENT ON VIEW documents_with_episode_view IS 'Documents joined with episode and patient info (SECURITY INVOKER — respects RLS)';


-- ============================================================================
-- SECTION 10: FIX FUNCTION SEARCH PATHS
-- (Warnings 1-6: Function Search Path Mutable)
--
-- SET search_path = 'public' pins the search path (fixes "mutable" warning)
-- while still allowing resolution of custom types (clinic_role, etc.)
-- ============================================================================

-- 10a. is_user_pt — SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_user_pt(check_user_id UUID, check_clinic_name TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  IF check_clinic_name IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.clinic_memberships
      WHERE user_id = check_user_id
        AND role = 'pt'
        AND is_active = TRUE
    );
  ELSE
    RETURN EXISTS (
      SELECT 1 FROM public.clinic_memberships
      WHERE user_id = check_user_id
        AND clinic_name = check_clinic_name
        AND role = 'pt'
        AND is_active = TRUE
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 10b. requires_pt_finalization — IMMUTABLE
CREATE OR REPLACE FUNCTION requires_pt_finalization(dtype clinical_doc_type)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN dtype IN ('evaluation', 're_evaluation', 'progress_summary', 'discharge_summary');
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = 'public';

-- 10c. update_document_templates_updated_at — trigger
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

-- 10d. validate_finalization — trigger
CREATE OR REPLACE FUNCTION validate_finalization()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'final' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
    IF NEW.doc_type IS NOT NULL AND requires_pt_finalization(NEW.doc_type) THEN
      IF NOT is_user_pt(NEW.finalized_by, NEW.clinic_name) THEN
        RAISE EXCEPTION 'Only licensed Physical Therapists (PT) can finalize this document type';
      END IF;
    END IF;
    NEW.finalized_at := NOW();
  END IF;

  IF NEW.status = 'draft' AND OLD.status = 'final' THEN
    NEW.finalized_at := NULL;
    NEW.finalized_by := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

-- 10e. update_updated_at — generic timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

-- 10f. get_user_clinic_role — SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_user_clinic_role(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS clinic_role AS $$
DECLARE
  v_role clinic_role;
BEGIN
  SELECT role INTO v_role
  FROM clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id::text)
    AND is_active = true
  LIMIT 1;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 10g. is_clinic_admin — SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_clinic_admin(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id::text)
      AND role = 'admin'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 10h. is_clinic_pt — SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_clinic_pt(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id::text)
      AND role IN ('pt', 'admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 10i. has_episode_access — SECURITY DEFINER
CREATE OR REPLACE FUNCTION has_episode_access(
  p_user_id UUID,
  p_episode_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_clinic_id UUID;
  v_role clinic_role;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM episodes
  WHERE id = p_episode_id;

  IF v_clinic_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = v_clinic_id OR clinic_id = v_clinic_id::text)
    AND is_active = true
  LIMIT 1;

  IF v_role IN ('admin', 'front_office') THEN
    RETURN TRUE;
  END IF;

  IF v_role IN ('pt', 'pta') THEN
    RETURN EXISTS (
      SELECT 1 FROM episode_care_team
      WHERE episode_id = p_episode_id
        AND user_id = p_user_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 10j. enforce_finalization_rules — SECURITY DEFINER trigger
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

  SELECT role INTO v_user_role
  FROM clinic_memberships
  WHERE user_id = auth.uid()
    AND (clinic_id_ref = NEW.clinic_id OR clinic_id = NEW.clinic_id::text)
    AND is_active = true
  LIMIT 1;

  IF NEW.doc_type IN ('evaluation', 're_evaluation', 'progress_summary', 'discharge_summary') THEN
    IF v_user_role NOT IN ('pt', 'admin') THEN
      RAISE EXCEPTION 'Only PT can finalize %', NEW.doc_type;
    END IF;
  END IF;

  NEW.finalized_at := NOW();
  NEW.finalized_by := auth.uid();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';


-- ============================================================================
-- SECTION 11: HANDLE 'interventions' TABLE (if separate from intervention_library)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'interventions'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "interventions_select" ON interventions';
    EXECUTE 'DROP POLICY IF EXISTS "interventions_insert" ON interventions';
    EXECUTE 'DROP POLICY IF EXISTS "interventions_update" ON interventions';
    EXECUTE 'DROP POLICY IF EXISTS "interventions_delete" ON interventions';

    EXECUTE $policy$
      CREATE POLICY "interventions_select"
      ON interventions FOR SELECT TO authenticated
      USING (true)
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "interventions_insert"
      ON interventions FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
        )
      )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "interventions_update"
      ON interventions FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
        )
      )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "interventions_delete"
      ON interventions FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
        )
      )
    $policy$;
  END IF;
END $$;

COMMIT;
