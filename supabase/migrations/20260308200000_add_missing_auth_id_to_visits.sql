-- ============================================================================
-- Fix: Add auth_id column to visits table
-- This column was defined in migration 20260305200000_add_auth_180day_and_visit_link.sql
-- but that migration likely was not applied due to a duplicate timestamp conflict
-- with 20260305200000_fix_admin_and_discipline_access.sql.
-- This migration re-applies the missing changes idempotently.
-- ============================================================================

-- 1. Add auth_id column to visits (links a visit to its prior authorization)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS auth_id UUID;

-- 2. Add foreign key constraint (idempotent — skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visits_auth_id_fkey'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_auth_id_fkey
      FOREIGN KEY (auth_id) REFERENCES prior_authorizations(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 3. Index for efficient auth lookups on visits
CREATE INDEX IF NOT EXISTS idx_visits_auth_id ON visits(auth_id);

-- 4. Re-apply 180-day tracking columns on prior_authorizations (also from the same migration)
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS day_180_date DATE;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS alert_30_dismissed_at TIMESTAMPTZ;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS alert_15_dismissed_at TIMESTAMPTZ;

-- 5. Indexes for 180-day alert queries
CREATE INDEX IF NOT EXISTS idx_auth_180day ON prior_authorizations(day_180_date)
  WHERE day_180_date IS NOT NULL AND status = 'approved';

CREATE INDEX IF NOT EXISTS idx_auth_patient_discipline ON prior_authorizations(patient_id, discipline)
  WHERE status = 'approved';

-- 6. Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
