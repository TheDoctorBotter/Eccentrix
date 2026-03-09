-- ============================================================================
-- Lock down multi-tenant RLS for appointments, prior_authorizations, waitlist
-- These tables currently have open "FOR ALL USING (true)" policies that allow
-- any authenticated user to see all clinic data.
-- ============================================================================

-- ============================================================================
-- PRE-FLIGHT: Ensure appointments table has clinic_id
-- (appointments is managed externally by Buckeye Scheduler)
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN
    EXECUTE 'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id)';
  END IF;
END $$;

-- ============================================================================
-- PART 0: Ensure RLS is enabled on all three tables
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN
    EXECUTE 'ALTER TABLE appointments ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
ALTER TABLE prior_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 1: APPOINTMENTS POLICIES
-- (Conditional because table is externally managed by Buckeye Scheduler)
-- ============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN

    -- Drop any existing open policies
    EXECUTE 'DROP POLICY IF EXISTS "Staff full access" ON appointments';
    EXECUTE 'DROP POLICY IF EXISTS "appointments_all" ON appointments';
    EXECUTE 'DROP POLICY IF EXISTS "appointments_select" ON appointments';
    EXECUTE 'DROP POLICY IF EXISTS "appointments_insert" ON appointments';
    EXECUTE 'DROP POLICY IF EXISTS "appointments_update" ON appointments';
    EXECUTE 'DROP POLICY IF EXISTS "appointments_delete" ON appointments';

    -- SELECT: active clinic members can read their clinic's appointments
    EXECUTE $policy$
      CREATE POLICY "appointments_select"
      ON appointments FOR SELECT
      USING (
        is_super_admin(auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE clinic_memberships.user_id = auth.uid()
            AND (clinic_memberships.clinic_id_ref = appointments.clinic_id
                 OR clinic_memberships.clinic_id = appointments.clinic_id)
            AND clinic_memberships.is_active = true
        )
      )
    $policy$;

    -- INSERT: active clinic members can create appointments
    EXECUTE $policy$
      CREATE POLICY "appointments_insert"
      ON appointments FOR INSERT
      WITH CHECK (
        is_super_admin(auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE clinic_memberships.user_id = auth.uid()
            AND (clinic_memberships.clinic_id_ref = appointments.clinic_id
                 OR clinic_memberships.clinic_id = appointments.clinic_id)
            AND clinic_memberships.is_active = true
        )
      )
    $policy$;

    -- UPDATE: staff roles can update appointments in their clinic
    EXECUTE $policy$
      CREATE POLICY "appointments_update"
      ON appointments FOR UPDATE
      USING (
        is_super_admin(auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE clinic_memberships.user_id = auth.uid()
            AND (clinic_memberships.clinic_id_ref = appointments.clinic_id
                 OR clinic_memberships.clinic_id = appointments.clinic_id)
            AND clinic_memberships.is_active = true
            AND clinic_memberships.role IN ('admin', 'clinic_admin', 'front_office', 'pt', 'ot', 'slp')
        )
      )
    $policy$;

    -- DELETE: admins only
    EXECUTE $policy$
      CREATE POLICY "appointments_delete"
      ON appointments FOR DELETE
      USING (
        is_super_admin(auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM clinic_memberships
          WHERE clinic_memberships.user_id = auth.uid()
            AND (clinic_memberships.clinic_id_ref = appointments.clinic_id
                 OR clinic_memberships.clinic_id = appointments.clinic_id)
            AND clinic_memberships.is_active = true
            AND clinic_memberships.role IN ('admin', 'clinic_admin')
        )
      )
    $policy$;

  END IF;
END $$;

-- ============================================================================
-- PART 2: PRIOR_AUTHORIZATIONS POLICIES
-- ============================================================================

-- Drop open policy
DROP POLICY IF EXISTS "prior_auth_all" ON prior_authorizations;
DROP POLICY IF EXISTS "prior_auth_select" ON prior_authorizations;
DROP POLICY IF EXISTS "prior_auth_insert" ON prior_authorizations;
DROP POLICY IF EXISTS "prior_auth_update" ON prior_authorizations;
DROP POLICY IF EXISTS "prior_auth_delete" ON prior_authorizations;

-- SELECT: active clinic members can read their clinic's prior auths
CREATE POLICY "prior_auth_select"
ON prior_authorizations FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = prior_authorizations.clinic_id
           OR clinic_memberships.clinic_id = prior_authorizations.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- INSERT: active clinic members can create prior auths
CREATE POLICY "prior_auth_insert"
ON prior_authorizations FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = prior_authorizations.clinic_id
           OR clinic_memberships.clinic_id = prior_authorizations.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- UPDATE: staff roles can update prior auths in their clinic
CREATE POLICY "prior_auth_update"
ON prior_authorizations FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = prior_authorizations.clinic_id
           OR clinic_memberships.clinic_id = prior_authorizations.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- DELETE: admins only
CREATE POLICY "prior_auth_delete"
ON prior_authorizations FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = prior_authorizations.clinic_id
           OR clinic_memberships.clinic_id = prior_authorizations.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
  )
);

-- ============================================================================
-- PART 3: WAITLIST POLICIES
-- ============================================================================

-- Drop open policy
DROP POLICY IF EXISTS "waitlist_all" ON waitlist;
DROP POLICY IF EXISTS "waitlist_select" ON waitlist;
DROP POLICY IF EXISTS "waitlist_insert" ON waitlist;
DROP POLICY IF EXISTS "waitlist_update" ON waitlist;
DROP POLICY IF EXISTS "waitlist_delete" ON waitlist;

-- SELECT: active clinic members can read their clinic's waitlist
CREATE POLICY "waitlist_select"
ON waitlist FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = waitlist.clinic_id
           OR clinic_memberships.clinic_id = waitlist.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- INSERT: active clinic members can add to their clinic's waitlist
CREATE POLICY "waitlist_insert"
ON waitlist FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = waitlist.clinic_id
           OR clinic_memberships.clinic_id = waitlist.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- UPDATE: staff roles can update waitlist entries in their clinic
CREATE POLICY "waitlist_update"
ON waitlist FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = waitlist.clinic_id
           OR clinic_memberships.clinic_id = waitlist.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- DELETE: admins only
CREATE POLICY "waitlist_delete"
ON waitlist FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = waitlist.clinic_id
           OR clinic_memberships.clinic_id = waitlist.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
  )
);
