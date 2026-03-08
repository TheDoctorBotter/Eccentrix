-- =============================================================================
-- FIX VISITS RLS POLICIES FOR SUPER_ADMIN AND CLINIC_ADMIN
-- =============================================================================
-- The visits_insert, visits_update, and visits_delete policies were missing
-- is_super_admin() checks and clinic_admin role support. This prevented
-- super_admin and clinic_admin users from creating/editing appointments.
-- =============================================================================

-- VISITS INSERT: allow super_admin, clinic_admin, admin, front_office, and clinical staff
DROP POLICY IF EXISTS "visits_insert" ON visits;
CREATE POLICY "visits_insert"
ON visits FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- VISITS UPDATE: allow super_admin, clinic_admin, admin, front_office, and clinical staff
DROP POLICY IF EXISTS "visits_update" ON visits;
CREATE POLICY "visits_update"
ON visits FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- VISITS DELETE: allow super_admin and clinic_admin in addition to admin
DROP POLICY IF EXISTS "visits_delete" ON visits;
CREATE POLICY "visits_delete"
ON visits FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = visits.clinic_id
           OR clinic_memberships.clinic_id = visits.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
  )
);
