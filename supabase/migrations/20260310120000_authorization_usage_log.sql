-- ============================================================================
-- AUTHORIZATION USAGE LOG TABLE
-- Records every deduction, restore, or adjustment tied to a prior authorization
-- for audit/reconciliation purposes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS authorization_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid NOT NULL REFERENCES prior_authorizations(id) ON DELETE CASCADE,
  visit_id uuid NULL REFERENCES visits(id) ON DELETE SET NULL,
  patient_id uuid NULL,
  clinic_id uuid NULL REFERENCES clinics(id) ON DELETE SET NULL,
  discipline text NOT NULL CHECK (discipline IN ('PT','OT','ST')),
  usage_type text NOT NULL CHECK (usage_type IN ('deduction','restore','adjustment')),
  amount integer NOT NULL,
  amount_kind text NOT NULL CHECK (amount_kind IN ('units','visits')),
  before_balance integer NULL,
  after_balance integer NULL,
  date_of_service date NULL,
  therapist_id uuid NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS auth_usage_log_authorization_id_idx
  ON authorization_usage_log(authorization_id);

CREATE INDEX IF NOT EXISTS auth_usage_log_visit_id_idx
  ON authorization_usage_log(visit_id);

CREATE INDEX IF NOT EXISTS auth_usage_log_clinic_id_idx
  ON authorization_usage_log(clinic_id);

CREATE INDEX IF NOT EXISTS auth_usage_log_created_at_idx
  ON authorization_usage_log(created_at DESC);

-- ============================================================================
-- RLS POLICIES (matches prior_authorizations pattern exactly)
-- ============================================================================

ALTER TABLE authorization_usage_log ENABLE ROW LEVEL SECURITY;

-- SELECT: active clinic members can read log entries for their clinic
CREATE POLICY "auth_usage_log_select"
ON authorization_usage_log FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = authorization_usage_log.clinic_id
           OR clinic_memberships.clinic_id = authorization_usage_log.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- INSERT: active clinic members can create log entries
CREATE POLICY "auth_usage_log_insert"
ON authorization_usage_log FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = authorization_usage_log.clinic_id
           OR clinic_memberships.clinic_id = authorization_usage_log.clinic_id)
      AND clinic_memberships.is_active = true
  )
);

-- UPDATE: admins only — log rows should be immutable except by admin
CREATE POLICY "auth_usage_log_update"
ON authorization_usage_log FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = authorization_usage_log.clinic_id
           OR clinic_memberships.clinic_id = authorization_usage_log.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
  )
);

-- DELETE: admins only
CREATE POLICY "auth_usage_log_delete"
ON authorization_usage_log FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND (clinic_memberships.clinic_id_ref = authorization_usage_log.clinic_id
           OR clinic_memberships.clinic_id = authorization_usage_log.clinic_id)
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role IN ('admin', 'clinic_admin')
  )
);
