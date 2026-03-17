-- Add phone, caregiver_phone, caregiver_name, and preferred_contact
-- to active_episodes_view so the front office dashboard can display them.

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
  p.referring_physician,
  p.phone,
  p.caregiver_phone,
  p.caregiver_name,
  p.preferred_contact
FROM episodes e
JOIN patients p ON e.patient_id = p.id
WHERE e.status = 'active'
  AND p.deleted_at IS NULL;

COMMENT ON VIEW active_episodes_view IS 'Active episodes with patient demographics and contact info, excluding deleted patients (SECURITY INVOKER — respects RLS)';
