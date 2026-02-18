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
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ENABLE RLS ON ALL TABLES MISSING IT
-- (Errors 1-6: RLS Disabled / Policy Exists RLS Disabled)
-- ============================================================================

-- intervention_library: global reference data, no PHI, but still needs RLS
-- for defense-in-depth on a HIPAA app
ALTER TABLE IF EXISTS intervention_library ENABLE ROW LEVEL SECURITY;

-- interventions: if this table exists separately, enable RLS
-- (Security Advisor showed "public.interventions" — may be same as intervention_library
--  or a separate table; this is safe either way)
DO $$ BEGIN
  EXECUTE 'ALTER TABLE interventions ENABLE ROW LEVEL SECURITY';
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- branding_settings: policies exist but RLS is turned off (Error 6)
ALTER TABLE branding_settings ENABLE ROW LEVEL SECURITY;

-- templates: policies exist but RLS is turned off
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- document_templates: policies exist but RLS is turned off
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- SECTION 2: FIX RLS POLICIES — INTERVENTION_LIBRARY
-- Read-only for all authenticated users (reference data, no PHI).
-- Only admins can modify.
-- ============================================================================

-- Drop any existing policies
DROP POLICY IF EXISTS "intervention_library_select" ON intervention_library;
DROP POLICY IF EXISTS "intervention_library_insert" ON intervention_library;
DROP POLICY IF EXISTS "intervention_library_update" ON intervention_library;
DROP POLICY IF EXISTS "intervention_library_delete" ON intervention_library;

-- All authenticated users can read interventions (shared reference data)
CREATE POLICY "intervention_library_select"
ON intervention_library FOR SELECT TO authenticated
USING (true);

-- Only clinic admins can add interventions
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

-- Only clinic admins can update interventions
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

-- Only clinic admins can delete interventions
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
-- ============================================================================

-- Drop ALL existing notes policies (including the USING(true) ones)
DROP POLICY IF EXISTS "notes_select_policy" ON notes;
DROP POLICY IF EXISTS "notes_insert_policy" ON notes;
DROP POLICY IF EXISTS "notes_update_policy" ON notes;
DROP POLICY IF EXISTS "notes_delete_policy" ON notes;

-- SELECT: users can read notes belonging to their clinic, or notes with no clinic
CREATE POLICY "notes_select"
ON notes FOR SELECT TO authenticated
USING (
  clinic_id IS NULL
  OR clinic_id IN (
    SELECT cm.clinic_id_ref FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true
    UNION
    SELECT cm.clinic_id::uuid FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
  )
);

-- INSERT: users can create notes for their clinic (or with no clinic)
CREATE POLICY "notes_insert"
ON notes FOR INSERT TO authenticated
WITH CHECK (
  clinic_id IS NULL
  OR clinic_id IN (
    SELECT cm.clinic_id_ref FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true
    UNION
    SELECT cm.clinic_id::uuid FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
  )
);

-- UPDATE: users can update notes in their clinic (finalization enforced by trigger)
CREATE POLICY "notes_update"
ON notes FOR UPDATE TO authenticated
USING (
  clinic_id IS NULL
  OR clinic_id IN (
    SELECT cm.clinic_id_ref FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true
    UNION
    SELECT cm.clinic_id::uuid FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.is_active = true AND cm.clinic_id IS NOT NULL
  )
);

-- DELETE: only admins can delete notes
CREATE POLICY "notes_delete"
ON notes FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref = notes.clinic_id OR cm.clinic_id = notes.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);


-- ============================================================================
-- SECTION 4: FIX RLS POLICIES — CLINIC_MEMBERSHIPS
-- Drop the old permissive USING(true) policies that were never cleaned up.
-- The proper policies from the auth migration already exist.
-- ============================================================================

-- Drop the old permissive policies from the finalization migration (20260208000000)
-- These were never dropped and override the proper policies via OR semantics
DROP POLICY IF EXISTS "memberships_select_own" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_insert_policy" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_update_policy" ON clinic_memberships;

-- Verify the proper policies still exist (these were created in 20260208100000)
-- If they got dropped somehow, recreate them:
DO $$ BEGIN
  -- Check if clinic_memberships_select exists; if not, create it
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
-- The old USING(true) policies were supposed to be dropped in 20260208100000.
-- Drop them again in case they still exist (idempotent).
-- ============================================================================

-- Clinics: drop any remaining permissive policies
DROP POLICY IF EXISTS "clinics_all" ON clinics;

-- Patients: drop any remaining permissive policies
DROP POLICY IF EXISTS "patients_all" ON patients;
-- Also drop the older policies that were replaced by soft-delete policies
DROP POLICY IF EXISTS "patients_select" ON patients;
DROP POLICY IF EXISTS "patients_insert" ON patients;
DROP POLICY IF EXISTS "patients_update" ON patients;
DROP POLICY IF EXISTS "patients_delete" ON patients;

-- Episodes: drop any remaining permissive policies
DROP POLICY IF EXISTS "episodes_all" ON episodes;

-- Documents: drop any remaining permissive policies
DROP POLICY IF EXISTS "documents_all" ON documents;


-- ============================================================================
-- SECTION 6: FIX TEMPLATES POLICIES (replace USING(true) SELECT)
-- Templates are shared prompt templates. Authenticated users can read.
-- Only admins can modify.
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "templates_select" ON templates;
DROP POLICY IF EXISTS "templates_all_admin" ON templates;

-- Authenticated users can read all templates (shared reference data, no PHI)
CREATE POLICY "templates_select"
ON templates FOR SELECT TO authenticated
USING (true);

-- Only admins can insert/update/delete templates
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
-- The old policies referenced document_templates.clinic_id which may not have
-- existed when they were created. Drop and recreate with correct column.
-- ============================================================================

DROP POLICY IF EXISTS "document_templates_select" ON document_templates;
DROP POLICY IF EXISTS "document_templates_all_admin" ON document_templates;
DROP POLICY IF EXISTS "document_templates_insert" ON document_templates;
DROP POLICY IF EXISTS "document_templates_update" ON document_templates;
DROP POLICY IF EXISTS "document_templates_delete" ON document_templates;

-- Ensure clinic_id column exists (user confirmed it does, but be safe)
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

-- Authenticated clinic members can read their clinic's templates
CREATE POLICY "document_templates_select"
ON document_templates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref = document_templates.clinic_id
           OR cm.clinic_id = document_templates.clinic_id::text)
      AND cm.is_active = true
  )
);

-- Only admins can insert templates for their clinic
CREATE POLICY "document_templates_insert"
ON document_templates FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref = document_templates.clinic_id
           OR cm.clinic_id = document_templates.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);

-- Only admins can update templates for their clinic
CREATE POLICY "document_templates_update"
ON document_templates FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref = document_templates.clinic_id
           OR cm.clinic_id = document_templates.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);

-- Only admins can delete templates for their clinic
CREATE POLICY "document_templates_delete"
ON document_templates FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid()
      AND (cm.clinic_id_ref = document_templates.clinic_id
           OR cm.clinic_id = document_templates.clinic_id::text)
      AND cm.role = 'admin'
      AND cm.is_active = true
  )
);


-- ============================================================================
-- SECTION 8: FIX BRANDING_SETTINGS POLICIES
-- RLS is now re-enabled (Section 1). The existing policies from migration
-- 20260210000000 should still be in place. Drop the old public ones just in case.
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to branding settings" ON branding_settings;
DROP POLICY IF EXISTS "Allow public insert of branding settings" ON branding_settings;
DROP POLICY IF EXISTS "Allow public update of branding settings" ON branding_settings;
DROP POLICY IF EXISTS "Allow public delete of branding settings" ON branding_settings;

-- Also drop the generic ones from 20260208100000 in favor of named ones
DROP POLICY IF EXISTS "branding_settings_select" ON branding_settings;
DROP POLICY IF EXISTS "branding_settings_all_admin" ON branding_settings;

-- Verify the proper clinic-scoped policies exist; recreate if missing
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
        clinic_id IN (
          SELECT cm.clinic_id_ref FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.is_active = true
          UNION
          SELECT cm.clinic_id::uuid FROM clinic_memberships cm
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
        clinic_id IN (
          SELECT cm.clinic_id_ref FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true
          UNION
          SELECT cm.clinic_id::uuid FROM clinic_memberships cm
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
        clinic_id IN (
          SELECT cm.clinic_id_ref FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true
          UNION
          SELECT cm.clinic_id::uuid FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
      WITH CHECK (
        clinic_id IN (
          SELECT cm.clinic_id_ref FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true
          UNION
          SELECT cm.clinic_id::uuid FROM clinic_memberships cm
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
        clinic_id IN (
          SELECT cm.clinic_id_ref FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true
          UNION
          SELECT cm.clinic_id::uuid FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND cm.is_active = true AND cm.clinic_id IS NOT NULL
        )
      )
    $policy$;
  END IF;
END $$;


-- ============================================================================
-- SECTION 9: RECREATE VIEWS AS SECURITY INVOKER
-- (Errors 7-8: Security Definer Views)
--
-- Current view definitions (for your review before running):
--
-- active_episodes_view:
--   SELECT e.id as episode_id, e.patient_id, e.clinic_id, e.start_date,
--          e.diagnosis, e.frequency, e.primary_pt_id, e.care_team_ids,
--          p.first_name, p.last_name, p.date_of_birth,
--          p.primary_diagnosis, p.referring_physician
--   FROM episodes e JOIN patients p ON e.patient_id = p.id
--   WHERE e.status = 'active';
--
-- documents_with_episode_view:
--   SELECT d.*, e.status as episode_status, p.first_name, p.last_name
--   FROM documents d
--   JOIN episodes e ON d.episode_id = e.id
--   JOIN patients p ON d.patient_id = p.id;
-- ============================================================================

-- Recreate active_episodes_view as SECURITY INVOKER
-- This ensures the view respects the calling user's RLS policies
-- rather than running with the view creator's elevated privileges
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

-- Recreate documents_with_episode_view as SECURITY INVOKER
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
-- Adding SET search_path = '' prevents search path injection attacks.
-- Functions that are SECURITY DEFINER are especially important to fix
-- because they run with elevated privileges.
-- ============================================================================

-- 10a. is_user_pt — SECURITY DEFINER, used for finalization checks
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 10b. requires_pt_finalization — IMMUTABLE, no security context but fix anyway
CREATE OR REPLACE FUNCTION requires_pt_finalization(dtype clinical_doc_type)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN dtype IN ('evaluation', 're_evaluation', 'progress_summary', 'discharge_summary');
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

-- 10c. update_document_templates_updated_at — trigger function
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 10d. validate_finalization — trigger for notes finalization
CREATE OR REPLACE FUNCTION validate_finalization()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'final' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
    IF NEW.doc_type IS NOT NULL AND public.requires_pt_finalization(NEW.doc_type) THEN
      IF NOT public.is_user_pt(NEW.finalized_by, NEW.clinic_name) THEN
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
$$ LANGUAGE plpgsql SET search_path = '';

-- 10e. update_updated_at — generic timestamp trigger (used by multiple tables)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

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
  FROM public.clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id::text)
    AND is_active = true
  LIMIT 1;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 10g. is_clinic_admin — SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_clinic_admin(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id::text)
      AND role = 'admin'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 10h. is_clinic_pt — SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_clinic_pt(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id::text)
      AND role IN ('pt', 'admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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
  FROM public.episodes
  WHERE id = p_episode_id;

  IF v_clinic_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM public.clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = v_clinic_id OR clinic_id = v_clinic_id::text)
    AND is_active = true
  LIMIT 1;

  IF v_role IN ('admin', 'front_office') THEN
    RETURN TRUE;
  END IF;

  IF v_role IN ('pt', 'pta') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.episode_care_team
      WHERE episode_id = p_episode_id
        AND user_id = p_user_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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
  FROM public.clinic_memberships
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ============================================================================
-- SECTION 11: HANDLE 'interventions' TABLE (if separate from intervention_library)
-- Safe to run — skips if table doesn't exist
-- ============================================================================

DO $$ BEGIN
  -- Only create policies if the table exists AND is different from intervention_library
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'interventions'
  ) THEN
    -- Drop any existing policies
    EXECUTE 'DROP POLICY IF EXISTS "interventions_select" ON interventions';
    EXECUTE 'DROP POLICY IF EXISTS "interventions_insert" ON interventions';
    EXECUTE 'DROP POLICY IF EXISTS "interventions_update" ON interventions';
    EXECUTE 'DROP POLICY IF EXISTS "interventions_delete" ON interventions';

    -- Authenticated users can read
    EXECUTE $policy$
      CREATE POLICY "interventions_select"
      ON interventions FOR SELECT TO authenticated
      USING (true)
    $policy$;

    -- Only admins can modify
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


-- ============================================================================
-- VERIFICATION: Run after migration to confirm all issues are resolved
-- (You can run this SELECT separately to check)
-- ============================================================================

-- Check RLS is enabled on all public tables
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;

-- Check all policies
-- SELECT tablename, policyname, permissive, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

COMMIT;

-- ============================================================================
-- MANUAL STEP: LEAKED PASSWORD PROTECTION
-- ============================================================================
-- This cannot be set via SQL. To enable:
--   1. Go to your Supabase Dashboard
--   2. Navigate to: Authentication → Settings → Security
--   3. Find "Leaked Password Protection" and toggle it ON
--   4. Click Save
--
-- This checks passwords against the HaveIBeenPwned database during
-- sign-up and password changes to prevent use of compromised passwords.
-- ============================================================================
