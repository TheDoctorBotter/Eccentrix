-- Migration: Add patient_external_ids linking table
-- Purpose: Maps external system patient IDs (e.g. PTBot auth UIDs) to AIDOCS patient records
-- This enables PTBot to push notes and have them linked to the correct patient

CREATE TABLE IF NOT EXISTS patient_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source TEXT NOT NULL,           -- e.g. 'ptbot'
  external_id TEXT NOT NULL,      -- the external system's patient identifier
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, external_id)
);

-- Index for fast lookups by source + external_id (covers the primary query pattern)
CREATE INDEX idx_patient_external_ids_lookup
  ON patient_external_ids(source, external_id);

-- Index for reverse lookups by patient_id
CREATE INDEX idx_patient_external_ids_patient
  ON patient_external_ids(patient_id);

-- Enable RLS
ALTER TABLE patient_external_ids ENABLE ROW LEVEL SECURITY;

-- RLS policy: clinic members can read external IDs for patients in their clinic
CREATE POLICY "patient_external_ids_select"
  ON patient_external_ids FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      JOIN clinic_memberships cm ON cm.clinic_id = p.clinic_id
      WHERE p.id = patient_external_ids.patient_id
        AND cm.user_id = auth.uid()
        AND cm.is_active = TRUE
    )
  );

-- Service-role bypass: the PTBot API route uses the service role client,
-- which bypasses RLS, so no INSERT/UPDATE policies are needed for the API.
-- Clinic admins can manage links through the dashboard if needed.
CREATE POLICY "patient_external_ids_manage"
  ON patient_external_ids FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      JOIN clinic_memberships cm ON cm.clinic_id = p.clinic_id
      WHERE p.id = patient_external_ids.patient_id
        AND cm.user_id = auth.uid()
        AND cm.is_active = TRUE
        AND cm.role IN ('pt', 'admin')
    )
  );
