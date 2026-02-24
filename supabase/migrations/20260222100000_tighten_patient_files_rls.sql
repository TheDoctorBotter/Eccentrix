-- Migration: Tighten patient_files RLS policies
-- Replace the overly permissive "FOR ALL USING (true)" with proper clinic-scoped policies.
--
-- NOTE: PTBot sync uses supabaseAdmin (service role key) which bypasses RLS entirely,
-- so these policies do NOT affect the PTBot ↔ EMR integration.

-- Drop the old permissive policy
DROP POLICY IF EXISTS "patient_files_all" ON patient_files;

-- Clinic members can read files belonging to their clinic
CREATE POLICY "patient_files_select" ON patient_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE user_id = auth.uid()
        AND (clinic_id_ref = patient_files.clinic_id OR clinic_id = patient_files.clinic_id)
        AND is_active = true
    )
  );

-- PT and Admin can insert files
CREATE POLICY "patient_files_insert" ON patient_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE user_id = auth.uid()
        AND (clinic_id_ref = patient_files.clinic_id OR clinic_id = patient_files.clinic_id)
        AND role IN ('pt', 'admin', 'front_office')
        AND is_active = true
    )
  );

-- PT and Admin can update file metadata (status, notes, etc.)
CREATE POLICY "patient_files_update" ON patient_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE user_id = auth.uid()
        AND (clinic_id_ref = patient_files.clinic_id OR clinic_id = patient_files.clinic_id)
        AND role IN ('pt', 'admin')
        AND is_active = true
    )
  );

-- Only Admin can delete files
CREATE POLICY "patient_files_delete" ON patient_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE user_id = auth.uid()
        AND (clinic_id_ref = patient_files.clinic_id OR clinic_id = patient_files.clinic_id)
        AND role = 'admin'
        AND is_active = true
    )
  );
