-- ============================================================================
-- Migration: patient_clinician_assignments + patient_episode_of_care
-- Additive only. All new columns nullable. No existing tables changed.
-- ============================================================================

-- ============================================================================
-- 1. PATIENT_CLINICIAN_ASSIGNMENTS
--    Patient-level therapist assignments (persists across episodes).
--    One row per patient–clinician–discipline combination.
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_clinician_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (discipline IN ('PT', 'OT', 'ST')),
  role clinic_role NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One active assignment per patient + clinician + discipline
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pca_patient_user_discipline_unique'
  ) THEN
    ALTER TABLE patient_clinician_assignments
      ADD CONSTRAINT pca_patient_user_discipline_unique
      UNIQUE (patient_id, user_id, discipline);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_pca_patient ON patient_clinician_assignments(patient_id);
CREATE INDEX IF NOT EXISTS idx_pca_clinic ON patient_clinician_assignments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_pca_user ON patient_clinician_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_pca_active ON patient_clinician_assignments(patient_id, discipline)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trigger_pca_updated_at ON patient_clinician_assignments;
CREATE TRIGGER trigger_pca_updated_at
  BEFORE UPDATE ON patient_clinician_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. PATIENT_EPISODE_OF_CARE
--    Per-discipline frequency tracking within an episode.
--    One row per episode + discipline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_episode_of_care (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (discipline IN ('PT', 'OT', 'ST')),
  frequency TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'on_hold')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per episode + discipline
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'peoc_episode_discipline_unique'
  ) THEN
    ALTER TABLE patient_episode_of_care
      ADD CONSTRAINT peoc_episode_discipline_unique
      UNIQUE (episode_id, discipline);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_peoc_patient ON patient_episode_of_care(patient_id);
CREATE INDEX IF NOT EXISTS idx_peoc_episode ON patient_episode_of_care(episode_id);
CREATE INDEX IF NOT EXISTS idx_peoc_clinic ON patient_episode_of_care(clinic_id);
CREATE INDEX IF NOT EXISTS idx_peoc_active ON patient_episode_of_care(episode_id, discipline)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trigger_peoc_updated_at ON patient_episode_of_care;
CREATE TRIGGER trigger_peoc_updated_at
  BEFORE UPDATE ON patient_episode_of_care FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. RLS POLICIES
--    Follow episode_care_team pattern: clinic members can read,
--    admin/front_office/PT/OT/SLP can write.
-- ============================================================================

ALTER TABLE patient_clinician_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_episode_of_care ENABLE ROW LEVEL SECURITY;

-- patient_clinician_assignments: SELECT
CREATE POLICY "pca_select" ON patient_clinician_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_clinician_assignments.clinic_id
           OR clinic_memberships.clinic_id = patient_clinician_assignments.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- patient_clinician_assignments: INSERT
CREATE POLICY "pca_insert" ON patient_clinician_assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_clinician_assignments.clinic_id
           OR clinic_memberships.clinic_id = patient_clinician_assignments.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- patient_clinician_assignments: UPDATE
CREATE POLICY "pca_update" ON patient_clinician_assignments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_clinician_assignments.clinic_id
           OR clinic_memberships.clinic_id = patient_clinician_assignments.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- patient_clinician_assignments: DELETE
CREATE POLICY "pca_delete" ON patient_clinician_assignments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_clinician_assignments.clinic_id
           OR clinic_memberships.clinic_id = patient_clinician_assignments.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office')
  )
);

-- patient_episode_of_care: SELECT
CREATE POLICY "peoc_select" ON patient_episode_of_care FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_episode_of_care.clinic_id
           OR clinic_memberships.clinic_id = patient_episode_of_care.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- patient_episode_of_care: INSERT
CREATE POLICY "peoc_insert" ON patient_episode_of_care FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_episode_of_care.clinic_id
           OR clinic_memberships.clinic_id = patient_episode_of_care.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- patient_episode_of_care: UPDATE
CREATE POLICY "peoc_update" ON patient_episode_of_care FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_episode_of_care.clinic_id
           OR clinic_memberships.clinic_id = patient_episode_of_care.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- patient_episode_of_care: DELETE
CREATE POLICY "peoc_delete" ON patient_episode_of_care FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = patient_episode_of_care.clinic_id
           OR clinic_memberships.clinic_id = patient_episode_of_care.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office')
  )
);

-- ============================================================================
-- 4. SERVICE ROLE BYPASS (for API routes using supabaseAdmin)
-- ============================================================================

CREATE POLICY "service_role_pca" ON patient_clinician_assignments FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_peoc" ON patient_episode_of_care FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE patient_clinician_assignments IS 'Patient-level therapist assignments, persists across episodes';
COMMENT ON TABLE patient_episode_of_care IS 'Per-discipline frequency and status tracking within an episode';
