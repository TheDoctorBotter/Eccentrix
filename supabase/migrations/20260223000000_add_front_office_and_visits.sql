-- ============================================================================
-- FRONT OFFICE MODULE + VISITS SCAFFOLD
-- Additive migration: no existing tables/columns/policies are changed.
-- ============================================================================

-- ============================================================================
-- 1. VISITS (APPOINTMENTS) TABLE  – scheduling scaffold
-- ============================================================================

-- Source enum for visit origin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visit_source') THEN
    CREATE TYPE visit_source AS ENUM ('buckeye_scheduler', 'google_calendar', 'manual');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  therapist_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  source visit_source NOT NULL DEFAULT 'manual',
  external_event_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visits_clinic ON visits(clinic_id);
CREATE INDEX IF NOT EXISTS idx_visits_episode ON visits(episode_id);
CREATE INDEX IF NOT EXISTS idx_visits_therapist ON visits(therapist_user_id);
CREATE INDEX IF NOT EXISTS idx_visits_start_time ON visits(start_time);

COMMENT ON TABLE visits IS 'Appointment / visit records – scaffold for Buckeye Scheduler and Google Calendar integration';

-- ============================================================================
-- 2. VISITS – RLS POLICIES
-- ============================================================================

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- PT / admin / front_office can see all clinic visits
DROP POLICY IF EXISTS "visits_select" ON visits;
CREATE POLICY "visits_select"
ON visits FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'pt', 'front_office')
  )
  OR (
    -- PTA can only see visits where they are the therapist
    EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE clinic_memberships.user_id = auth.uid()
        AND (clinic_memberships.clinic_id_ref = visits.clinic_id
             OR clinic_memberships.clinic_id = visits.clinic_id)
        AND clinic_memberships.is_active = true
        AND clinic_memberships.role = 'pta'
    )
    AND visits.therapist_user_id = auth.uid()
  )
);

-- Admin / front_office can insert visits (manual add)
DROP POLICY IF EXISTS "visits_insert" ON visits;
CREATE POLICY "visits_insert"
ON visits FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt')
  )
);

-- Admin / front_office / PT can update visits
DROP POLICY IF EXISTS "visits_update" ON visits;
CREATE POLICY "visits_update"
ON visits FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt')
  )
);

-- Admin only can delete visits
DROP POLICY IF EXISTS "visits_delete" ON visits;
CREATE POLICY "visits_delete"
ON visits FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role = 'admin'
  )
);

-- ============================================================================
-- 3. ALLOW FRONT OFFICE TO MANAGE EPISODE CARE TEAM
-- The existing RLS on episode_care_team only allows PT/admin (via is_clinic_pt).
-- We add a parallel INSERT/DELETE policy for front_office role.
-- ============================================================================

DROP POLICY IF EXISTS "episode_care_team_insert_front_office" ON episode_care_team;
CREATE POLICY "episode_care_team_insert_front_office"
ON episode_care_team FOR INSERT
WITH CHECK (
  has_episode_access(auth.uid(), episode_id)
  AND EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = (SELECT clinic_id FROM episodes WHERE id = episode_id)
           OR clinic_memberships.clinic_id = (SELECT clinic_id FROM episodes WHERE id = episode_id))
      AND clinic_memberships.role = 'front_office'
      AND clinic_memberships.is_active = true
  )
);

DROP POLICY IF EXISTS "episode_care_team_delete_front_office" ON episode_care_team;
CREATE POLICY "episode_care_team_delete_front_office"
ON episode_care_team FOR DELETE
USING (
  has_episode_access(auth.uid(), episode_id)
  AND EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = (SELECT clinic_id FROM episodes WHERE id = episode_id)
           OR clinic_memberships.clinic_id = (SELECT clinic_id FROM episodes WHERE id = episode_id))
      AND clinic_memberships.role = 'front_office'
      AND clinic_memberships.is_active = true
  )
);

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON POLICY "visits_select" ON visits IS 'Admin/PT/front_office see all clinic visits; PTA only their own';
COMMENT ON POLICY "episode_care_team_insert_front_office" ON episode_care_team IS 'Front office can assign care team members';
COMMENT ON POLICY "episode_care_team_delete_front_office" ON episode_care_team IS 'Front office can remove care team members';
