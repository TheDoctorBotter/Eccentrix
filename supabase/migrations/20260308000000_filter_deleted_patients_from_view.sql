-- Filter out soft-deleted patients from active_episodes_view
-- Patients with deleted_at set should not appear in the caseload
-- Also ensure primary_ot_id and primary_slp_id columns exist on episodes

-- Step 1: Drop the view first (it may reference columns we're about to add)
DROP VIEW IF EXISTS active_episodes_view;

-- Step 2: Add missing columns to episodes table
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS primary_ot_id  uuid,
  ADD COLUMN IF NOT EXISTS primary_slp_id uuid;

-- Step 3: Recreate view with deleted patient filter
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
  e.primary_ot_id,
  e.primary_slp_id,
  e.care_team_ids,
  p.first_name,
  p.last_name,
  p.date_of_birth,
  p.primary_diagnosis,
  p.referring_physician
FROM episodes e
JOIN patients p ON e.patient_id = p.id
WHERE e.status = 'active'
  AND p.deleted_at IS NULL;

COMMENT ON VIEW active_episodes_view IS 'Active episodes with patient demographics, excluding deleted patients (SECURITY INVOKER — respects RLS)';
