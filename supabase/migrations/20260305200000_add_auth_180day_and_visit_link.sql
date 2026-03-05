-- ============================================================================
-- Migration: Add 180-day tracking to prior_authorizations + link visits to auths
-- ============================================================================

-- 1. Add 180-day tracking columns to prior_authorizations
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS day_180_date DATE;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS alert_30_dismissed_at TIMESTAMPTZ;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS alert_15_dismissed_at TIMESTAMPTZ;

-- 2. Add auth_id to visits table to link visits to authorizations
ALTER TABLE visits ADD COLUMN IF NOT EXISTS auth_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visits_auth_id_fkey'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_auth_id_fkey
      FOREIGN KEY (auth_id) REFERENCES prior_authorizations(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_visits_auth_id ON visits(auth_id);

-- 3. Index for 180-day alert queries
CREATE INDEX IF NOT EXISTS idx_auth_180day ON prior_authorizations(day_180_date)
  WHERE day_180_date IS NOT NULL AND status = 'approved';

-- 4. Add patient_id index for faster auth lookups during scheduling
CREATE INDEX IF NOT EXISTS idx_auth_patient_discipline ON prior_authorizations(patient_id, discipline)
  WHERE status = 'approved';
