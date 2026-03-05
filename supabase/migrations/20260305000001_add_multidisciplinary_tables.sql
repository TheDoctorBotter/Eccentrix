-- ============================================================================
-- Multi-Disciplinary Support: Step 2 — Schema changes, CPT seeds, RLS
-- Adds discipline columns, extends CPT codes, and updates provider profiles.
-- All changes are additive. NULL discipline values default to PT in app logic.
-- ============================================================================

-- ============================================================================
-- A) Add discipline column to visits table
-- ============================================================================

ALTER TABLE visits ADD COLUMN IF NOT EXISTS discipline TEXT DEFAULT 'PT';

-- Constraint (safe — existing rows have NULL or 'PT', both are allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visits_discipline_check'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_discipline_check
      CHECK (discipline IS NULL OR discipline IN ('PT', 'OT', 'ST'));
  END IF;
END$$;

-- ============================================================================
-- B) Add discipline column to appointments table (Buckeye Scheduler)
--    This table is managed externally; NULL must remain allowed.
-- ============================================================================

DO $$
BEGIN
  -- Only add if the appointments table exists (managed by Buckeye Scheduler)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'appointments') THEN
    EXECUTE 'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discipline TEXT DEFAULT ''PT''';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'appointments_discipline_check'
    ) THEN
      EXECUTE 'ALTER TABLE appointments ADD CONSTRAINT appointments_discipline_check
        CHECK (discipline IS NULL OR discipline IN (''PT'', ''OT'', ''ST''))';
    END IF;
  END IF;
END$$;

-- ============================================================================
-- C) Add discipline fields to provider_profiles
-- ============================================================================

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS primary_discipline TEXT DEFAULT 'PT';
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS disciplines TEXT[] DEFAULT ARRAY['PT'];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_profiles_primary_discipline_check'
  ) THEN
    ALTER TABLE provider_profiles ADD CONSTRAINT provider_profiles_primary_discipline_check
      CHECK (primary_discipline IN ('PT', 'OT', 'ST'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_profiles_disciplines_check'
  ) THEN
    ALTER TABLE provider_profiles ADD CONSTRAINT provider_profiles_disciplines_check
      CHECK (disciplines <@ ARRAY['PT', 'OT', 'ST']::text[]);
  END IF;
END$$;

-- ============================================================================
-- D) Extend cpt_codes table for multi-discipline support
--    The existing table has UNIQUE(code). We need to allow the same code
--    for different disciplines, so we add discipline + is_evaluation columns,
--    drop the old unique constraint, and add a composite unique.
-- ============================================================================

-- Add new columns
ALTER TABLE cpt_codes ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'PT';
ALTER TABLE cpt_codes ADD COLUMN IF NOT EXISTS is_evaluation BOOLEAN DEFAULT FALSE;
ALTER TABLE cpt_codes ADD COLUMN IF NOT EXISTS minutes_per_unit INTEGER DEFAULT 15;

-- Drop old unique constraint on code (so same code can exist for multiple disciplines)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cpt_codes_code_key' AND conrelid = 'cpt_codes'::regclass
  ) THEN
    ALTER TABLE cpt_codes DROP CONSTRAINT cpt_codes_code_key;
  END IF;
END$$;

-- Add composite unique on (code, discipline)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cpt_codes_code_discipline_key'
  ) THEN
    ALTER TABLE cpt_codes ADD CONSTRAINT cpt_codes_code_discipline_key UNIQUE (code, discipline);
  END IF;
END$$;

-- Add discipline check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cpt_codes_discipline_check'
  ) THEN
    ALTER TABLE cpt_codes ADD CONSTRAINT cpt_codes_discipline_check
      CHECK (discipline IN ('PT', 'OT', 'ST'));
  END IF;
END$$;

-- Update existing PT codes: set is_evaluation based on category
UPDATE cpt_codes SET is_evaluation = TRUE
WHERE category IN ('Evaluation', 'Re-Evaluation') AND discipline = 'PT';

UPDATE cpt_codes SET is_evaluation = FALSE
WHERE category NOT IN ('Evaluation', 'Re-Evaluation') AND discipline = 'PT';

-- Set minutes_per_unit from existing unit_minutes where available
UPDATE cpt_codes SET minutes_per_unit = unit_minutes WHERE unit_minutes IS NOT NULL;
UPDATE cpt_codes SET minutes_per_unit = NULL WHERE is_timed = FALSE;

-- ============================================================================
-- D.2) Seed additional PT codes (idempotent)
-- ============================================================================

INSERT INTO cpt_codes (code, description, discipline, category, is_timed, is_evaluation, default_units, minutes_per_unit) VALUES
  ('97750', 'Physical Performance Test', 'PT', 'Assessment', TRUE, FALSE, 1, 15)
ON CONFLICT (code, discipline) DO NOTHING;

-- ============================================================================
-- D.3) Seed OT codes
-- ============================================================================

INSERT INTO cpt_codes (code, description, discipline, category, is_timed, is_evaluation, default_units, minutes_per_unit) VALUES
  ('97165', 'OT Evaluation - Low Complexity',      'OT', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('97166', 'OT Evaluation - Moderate Complexity',  'OT', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('97167', 'OT Evaluation - High Complexity',      'OT', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('97168', 'OT Re-Evaluation',                     'OT', 'Re-Evaluation', FALSE, TRUE, 1, NULL),
  ('97110', 'Therapeutic Exercise',                  'OT', 'Therapeutic Exercise', TRUE, FALSE, 1, 15),
  ('97129', 'Cognitive Function Intervention',       'OT', 'Cognitive', TRUE, FALSE, 1, 15),
  ('97150', 'Therapeutic Activities - Group',        'OT', 'Group Therapy', FALSE, FALSE, 1, NULL),
  ('97530', 'Therapeutic Activities',                'OT', 'Therapeutic Activities', TRUE, FALSE, 1, 15),
  ('97535', 'Self-Care Training',                    'OT', 'ADL Training', TRUE, FALSE, 1, 15)
ON CONFLICT (code, discipline) DO NOTHING;

-- ============================================================================
-- D.4) Seed ST codes
-- ============================================================================

INSERT INTO cpt_codes (code, description, discipline, category, is_timed, is_evaluation, default_units, minutes_per_unit) VALUES
  ('92507', 'Speech Language Treatment',             'ST', 'Treatment', FALSE, FALSE, 1, NULL),
  ('92508', 'Speech Group Treatment',                'ST', 'Group Therapy', FALSE, FALSE, 1, NULL),
  ('92521', 'Speech Fluency Evaluation',             'ST', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('92522', 'Speech Sound Production Evaluation',    'ST', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('92523', 'Speech Sound Production with Language Evaluation', 'ST', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('92524', 'Voice Evaluation',                      'ST', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('92526', 'Swallowing Treatment',                  'ST', 'Treatment', FALSE, FALSE, 1, NULL),
  ('92597', 'Voice Prosthesis Evaluation',           'ST', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('92605', 'AAC Device Evaluation',                 'ST', 'Evaluation', FALSE, TRUE, 1, NULL),
  ('92610', 'Swallowing Function Evaluation',        'ST', 'Evaluation', FALSE, TRUE, 1, NULL)
ON CONFLICT (code, discipline) DO NOTHING;

-- ============================================================================
-- E) Indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS visits_discipline_idx ON visits(discipline);
CREATE INDEX IF NOT EXISTS visits_patient_discipline_idx ON visits(patient_id, discipline);

-- Index on cpt_codes discipline for filtered lookups
CREATE INDEX IF NOT EXISTS cpt_codes_discipline_idx ON cpt_codes(discipline);
CREATE INDEX IF NOT EXISTS cpt_codes_discipline_eval_idx ON cpt_codes(discipline, is_evaluation);

-- ============================================================================
-- F) Update RLS policies to include OT and SLP roles
-- ============================================================================

-- Visits SELECT: allow OT/SLP roles same access as PT
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
      AND clinic_memberships.role IN ('admin', 'pt', 'ot', 'slp', 'front_office')
  )
  OR (
    EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE clinic_memberships.user_id = auth.uid()
        AND (clinic_memberships.clinic_id_ref = visits.clinic_id
             OR clinic_memberships.clinic_id = visits.clinic_id)
        AND clinic_memberships.is_active = true
        AND clinic_memberships.role IN ('pta', 'ota', 'slpa')
    )
    AND visits.therapist_user_id = auth.uid()
  )
);

-- Visits INSERT
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
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt', 'ot', 'slp')
  )
);

-- Visits UPDATE
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
      AND clinic_memberships.role IN ('admin', 'front_office', 'pt', 'ot', 'slp')
  )
);
