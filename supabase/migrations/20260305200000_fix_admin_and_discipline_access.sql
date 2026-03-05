-- ============================================================================
-- Fix has_episode_access to support all discipline roles and give admin
-- full access without requiring care team assignment.
-- ============================================================================

-- Recreate has_episode_access with full discipline support
CREATE OR REPLACE FUNCTION has_episode_access(
  p_user_id UUID,
  p_episode_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_clinic_id UUID;
  v_role clinic_role;
BEGIN
  -- Get episode's clinic
  SELECT clinic_id INTO v_clinic_id
  FROM episodes
  WHERE id = p_episode_id;

  IF v_clinic_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user's role in that clinic
  SELECT role INTO v_role
  FROM clinic_memberships
  WHERE user_id = p_user_id
    AND (clinic_id_ref = v_clinic_id OR clinic_id = v_clinic_id)
    AND is_active = true
  LIMIT 1;

  -- Admin and front_office can see all episodes in their clinic
  IF v_role IN ('admin', 'front_office', 'biller') THEN
    RETURN TRUE;
  END IF;

  -- All clinical staff (PT, PTA, OT, OTA, SLP, SLPA) need care team assignment
  IF v_role IN ('pt', 'pta', 'ot', 'ota', 'slp', 'slpa') THEN
    RETURN EXISTS (
      SELECT 1 FROM episode_care_team
      WHERE episode_id = p_episode_id
        AND user_id = p_user_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Also fix is_clinic_pt to recognize all primary clinician roles
CREATE OR REPLACE FUNCTION is_clinic_pt(
  p_user_id UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM clinic_memberships
    WHERE user_id = p_user_id
      AND (clinic_id_ref = p_clinic_id OR clinic_id = p_clinic_id)
      AND role IN ('pt', 'ot', 'slp', 'admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';
