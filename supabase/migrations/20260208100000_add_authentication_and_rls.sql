-- ============================================================================
-- AUTHENTICATION AND AUTHORIZATION
-- Comprehensive RLS policies for role-based access control
-- ============================================================================

-- ============================================================================
-- 1. EPISODE CARE TEAM TABLE
-- Track which users (PT/PTA) are assigned to which episodes
-- ============================================================================

CREATE TABLE IF NOT EXISTS episode_care_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role clinic_role NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),

  UNIQUE(episode_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_episode_care_team_episode ON episode_care_team(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_care_team_user ON episode_care_team(user_id);

COMMENT ON TABLE episode_care_team IS 'Tracks which PT/PTA users are assigned to which patient episodes';

-- ============================================================================
-- 2. HELPER FUNCTIONS FOR ROLE CHECKING
-- ============================================================================

-- Get user's role for a specific clinic
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
    AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id)
    AND is_active = true
  LIMIT 1;

  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin for a clinic
CREATE OR REPLACE FUNCTION is_clinic_admin(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id)
      AND role = 'admin'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is PT for a clinic
CREATE OR REPLACE FUNCTION is_clinic_pt(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id)
      AND role IN ('pt', 'admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to an episode
CREATE OR REPLACE FUNCTION has_episode_access(
  p_user_id UUID,
  p_episode_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_clinic_id UUID;
  v_role clinic_role;
BEGIN
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

  -- Admin and front_office can see all episodes in their clinic
  IF v_role IN ('admin', 'front_office') THEN
    RETURN TRUE;
  END IF;

  -- PT and PTA can only see episodes they're assigned to
  IF v_role IN ('pt', 'pta') THEN
    RETURN EXISTS (
      SELECT 1
      FROM episode_care_team
      WHERE episode_id = p_episode_id
        AND user_id = p_user_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. UPDATE EXISTING RLS POLICIES (DROP OLD "ALL ACCESS" POLICIES)
-- ============================================================================

-- Drop the permissive policies created in the previous migration
DROP POLICY IF EXISTS "clinics_all" ON clinics;
DROP POLICY IF EXISTS "patients_all" ON patients;
DROP POLICY IF EXISTS "episodes_all" ON episodes;
DROP POLICY IF EXISTS "documents_all" ON documents;

-- ============================================================================
-- 4. CLINICS TABLE - RLS POLICIES
-- ============================================================================

-- Users can read clinics they belong to
DROP POLICY IF EXISTS "clinics_select" ON clinics;
CREATE POLICY "clinics_select"
ON clinics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = clinics.id
           OR clinic_memberships.clinic_id = clinics.id)
      AND clinic_memberships.is_active = true
  )
);

-- Only admins can insert clinics
DROP POLICY IF EXISTS "clinics_insert" ON clinics;
CREATE POLICY "clinics_insert"
ON clinics FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND clinic_memberships.role = 'admin'
      AND clinic_memberships.is_active = true
  )
);

-- Only clinic admins can update their clinic
DROP POLICY IF EXISTS "clinics_update" ON clinics;
CREATE POLICY "clinics_update"
ON clinics FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = clinics.id
           OR clinic_memberships.clinic_id = clinics.id)
      AND clinic_memberships.role = 'admin'
      AND clinic_memberships.is_active = true
  )
);

-- Only clinic admins can delete their clinic
DROP POLICY IF EXISTS "clinics_delete" ON clinics;
CREATE POLICY "clinics_delete"
ON clinics FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = clinics.id
           OR clinic_memberships.clinic_id = clinics.id)
      AND clinic_memberships.role = 'admin'
      AND clinic_memberships.is_active = true
  )
);

-- ============================================================================
-- 5. PATIENTS TABLE - RLS POLICIES
-- ============================================================================

-- Users can read patients in their clinic
DROP POLICY IF EXISTS "patients_select" ON patients;
CREATE POLICY "patients_select"
ON patients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- All clinic members can insert patients
DROP POLICY IF EXISTS "patients_insert" ON patients;
CREATE POLICY "patients_insert"
ON patients FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- All clinic members can update patients
DROP POLICY IF EXISTS "patients_update" ON patients;
CREATE POLICY "patients_update"
ON patients FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- Only admins can delete patients
DROP POLICY IF EXISTS "patients_delete" ON patients;
CREATE POLICY "patients_delete"
ON patients FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patients.clinic_id
           OR clinic_memberships.clinic_id = patients.clinic_id)
      AND clinic_memberships.role = 'admin'
      AND clinic_memberships.is_active = true
  )
);

-- ============================================================================
-- 6. EPISODES TABLE - RLS POLICIES
-- ============================================================================

-- Users can read episodes they have access to
DROP POLICY IF EXISTS "episodes_select" ON episodes;
CREATE POLICY "episodes_select"
ON episodes FOR SELECT
USING (
  has_episode_access(auth.uid(), id)
);

-- All clinic members can create episodes
DROP POLICY IF EXISTS "episodes_insert" ON episodes;
CREATE POLICY "episodes_insert"
ON episodes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = episodes.clinic_id
           OR clinic_memberships.clinic_id = episodes.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- Users with episode access can update
DROP POLICY IF EXISTS "episodes_update" ON episodes;
CREATE POLICY "episodes_update"
ON episodes FOR UPDATE
USING (
  has_episode_access(auth.uid(), id)
);

-- Only admins can delete episodes
DROP POLICY IF EXISTS "episodes_delete" ON episodes;
CREATE POLICY "episodes_delete"
ON episodes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = episodes.clinic_id
           OR clinic_memberships.clinic_id = episodes.clinic_id)
      AND clinic_memberships.role = 'admin'
      AND clinic_memberships.is_active = true
  )
);

-- ============================================================================
-- 7. DOCUMENTS TABLE - RLS POLICIES
-- ============================================================================

-- Users can read documents for episodes they have access to
DROP POLICY IF EXISTS "documents_select" ON documents;
CREATE POLICY "documents_select"
ON documents FOR SELECT
USING (
  has_episode_access(auth.uid(), episode_id)
);

-- Users with episode access can create documents
DROP POLICY IF EXISTS "documents_insert" ON documents;
CREATE POLICY "documents_insert"
ON documents FOR INSERT
WITH CHECK (
  has_episode_access(auth.uid(), episode_id)
);

-- Users with episode access can update documents
-- BUT finalization rules are enforced separately (see finalization trigger)
DROP POLICY IF EXISTS "documents_update" ON documents;
CREATE POLICY "documents_update"
ON documents FOR UPDATE
USING (
  has_episode_access(auth.uid(), episode_id)
);

-- Only admins can delete documents
DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_delete"
ON documents FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = documents.clinic_id
           OR clinic_memberships.clinic_id = documents.clinic_id)
      AND clinic_memberships.role = 'admin'
      AND clinic_memberships.is_active = true
  )
);

-- ============================================================================
-- 8. EPISODE CARE TEAM - RLS POLICIES
-- ============================================================================

ALTER TABLE episode_care_team ENABLE ROW LEVEL SECURITY;

-- Users can see care team for episodes they have access to
DROP POLICY IF EXISTS "episode_care_team_select" ON episode_care_team;
CREATE POLICY "episode_care_team_select"
ON episode_care_team FOR SELECT
USING (
  has_episode_access(auth.uid(), episode_id)
);

-- PT and Admin can add users to care team
DROP POLICY IF EXISTS "episode_care_team_insert" ON episode_care_team;
CREATE POLICY "episode_care_team_insert"
ON episode_care_team FOR INSERT
WITH CHECK (
  has_episode_access(auth.uid(), episode_id)
  AND is_clinic_pt(auth.uid(), (SELECT clinic_id FROM episodes WHERE id = episode_id))
);

-- PT and Admin can remove users from care team
DROP POLICY IF EXISTS "episode_care_team_delete" ON episode_care_team;
CREATE POLICY "episode_care_team_delete"
ON episode_care_team FOR DELETE
USING (
  has_episode_access(auth.uid(), episode_id)
  AND is_clinic_pt(auth.uid(), (SELECT clinic_id FROM episodes WHERE id = episode_id))
);

-- ============================================================================
-- 9. CLINIC MEMBERSHIPS - RLS POLICIES
-- IMPORTANT: Policies on clinic_memberships CANNOT reference clinic_memberships
-- in subqueries or function calls — PostgreSQL detects infinite recursion.
-- Only direct column checks (user_id = auth.uid()) are safe here.
-- Admin management of memberships goes through the service role key.
-- ============================================================================

ALTER TABLE clinic_memberships ENABLE ROW LEVEL SECURITY;

-- Users can see their own memberships (direct column check, no recursion)
DROP POLICY IF EXISTS "clinic_memberships_select" ON clinic_memberships;
CREATE POLICY "clinic_memberships_select"
ON clinic_memberships FOR SELECT
USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: managed via service role key (bypasses RLS)
-- No client-side policies needed for membership management

-- ============================================================================
-- 10. TEMPLATES AND BRANDING - RLS POLICIES
-- Wrapped in conditional blocks to avoid errors if tables don't exist yet.
-- These tables are created in earlier migrations (20260129000000, 20260114225337).
-- ============================================================================

-- Templates table (only if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'templates') THEN
    EXECUTE 'ALTER TABLE templates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "templates_select" ON templates';
    EXECUTE 'DROP POLICY IF EXISTS "templates_all_admin" ON templates';
    EXECUTE $policy$
      CREATE POLICY "templates_select" ON templates FOR SELECT USING (true)
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "templates_all_admin" ON templates FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid()
            AND role = 'admin'
            AND is_active = true
        )
      )
    $policy$;
  END IF;
END $$;

-- Document templates table (only if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_templates') THEN
    EXECUTE 'ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "document_templates_select" ON document_templates';
    EXECUTE 'DROP POLICY IF EXISTS "document_templates_all_admin" ON document_templates';
    EXECUTE $policy$
      CREATE POLICY "document_templates_select" ON document_templates FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid()
            AND (clinic_id_ref = document_templates.clinic_id
                 OR clinic_id = document_templates.clinic_id)
            AND is_active = true
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "document_templates_all_admin" ON document_templates FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid()
            AND (clinic_id_ref = document_templates.clinic_id
                 OR clinic_id = document_templates.clinic_id)
            AND role = 'admin'
            AND is_active = true
        )
      )
    $policy$;
  END IF;
END $$;

-- Branding settings table (only if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branding_settings') THEN
    EXECUTE 'ALTER TABLE branding_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "branding_settings_select" ON branding_settings';
    EXECUTE 'DROP POLICY IF EXISTS "branding_settings_all_admin" ON branding_settings';
    EXECUTE $policy$
      CREATE POLICY "branding_settings_select" ON branding_settings FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid()
            AND (clinic_id_ref = branding_settings.clinic_id
                 OR clinic_id = branding_settings.clinic_id)
            AND is_active = true
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "branding_settings_all_admin" ON branding_settings FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE user_id = auth.uid()
            AND (clinic_id_ref = branding_settings.clinic_id
                 OR clinic_id = branding_settings.clinic_id)
            AND role = 'admin'
            AND is_active = true
        )
      )
    $policy$;
  END IF;
END $$;

-- ============================================================================
-- 11. FINALIZATION ENFORCEMENT TRIGGER
-- Enforce PT-only finalization at database level
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_finalization_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_user_role clinic_role;
  v_old_status text;
  v_new_status text;
BEGIN
  -- Get old and new status
  v_old_status := COALESCE(OLD.status, 'draft');
  v_new_status := NEW.status;

  -- If not finalizing, allow
  IF v_new_status != 'final' OR v_old_status = 'final' THEN
    RETURN NEW;
  END IF;

  -- Get user's role for this clinic
  SELECT role INTO v_user_role
  FROM clinic_memberships
  WHERE user_id = auth.uid()
    AND (clinic_id_ref = NEW.clinic_id OR clinic_id = NEW.clinic_id)
    AND is_active = true
  LIMIT 1;

  -- Check if document type requires PT
  IF NEW.doc_type IN ('evaluation', 're_evaluation', 'progress_summary', 'discharge_summary') THEN
    IF v_user_role NOT IN ('pt', 'admin') THEN
      RAISE EXCEPTION 'Only PT can finalize %', NEW.doc_type;
    END IF;
  END IF;

  -- Set finalization metadata
  NEW.finalized_at := NOW();
  NEW.finalized_by := auth.uid();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_enforce_finalization ON documents;

-- Create trigger
CREATE TRIGGER trigger_enforce_finalization
  BEFORE UPDATE ON documents
  FOR EACH ROW
  WHEN (NEW.status = 'final' AND OLD.status != 'final')
  EXECUTE FUNCTION enforce_finalization_rules();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE episode_care_team IS 'Tracks PT/PTA assignment to patient episodes for access control';
COMMENT ON FUNCTION get_user_clinic_role IS 'Returns the user role for a specific clinic';
COMMENT ON FUNCTION is_clinic_admin IS 'Returns true if user is admin for the clinic';
COMMENT ON FUNCTION is_clinic_pt IS 'Returns true if user is PT or admin for the clinic';
COMMENT ON FUNCTION has_episode_access IS 'Returns true if user can access the episode (admin/front_office or assigned care team)';
COMMENT ON FUNCTION enforce_finalization_rules IS 'Enforces PT-only finalization rules at database level';
