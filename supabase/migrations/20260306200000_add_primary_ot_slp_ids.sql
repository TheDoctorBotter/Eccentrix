-- Add primary_ot_id and primary_slp_id to episodes table
-- so each discipline can track its own primary evaluating therapist.

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS primary_ot_id  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS primary_slp_id uuid REFERENCES auth.users(id);

-- Back-fill from existing episode_care_team records
UPDATE episodes e
SET primary_ot_id = sub.user_id
FROM (
  SELECT DISTINCT ON (episode_id) episode_id, user_id
  FROM episode_care_team
  WHERE role = 'ot'
  ORDER BY episode_id, assigned_at ASC
) sub
WHERE e.id = sub.episode_id AND e.primary_ot_id IS NULL;

UPDATE episodes e
SET primary_slp_id = sub.user_id
FROM (
  SELECT DISTINCT ON (episode_id) episode_id, user_id
  FROM episode_care_team
  WHERE role = 'slp'
  ORDER BY episode_id, assigned_at ASC
) sub
WHERE e.id = sub.episode_id AND e.primary_slp_id IS NULL;

-- Recreate the active_episodes_view to include the new columns
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
WHERE e.status = 'active';

COMMENT ON VIEW active_episodes_view IS 'Active episodes with patient demographics (SECURITY INVOKER — respects RLS)';
