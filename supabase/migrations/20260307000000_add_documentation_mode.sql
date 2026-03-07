-- Add documentation_mode to clinics
-- Allows clinics to choose between 'emr' (electronic medical records) and 'paper' documentation
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS documentation_mode TEXT NOT NULL DEFAULT 'emr';

-- Add check constraint to ensure valid values
ALTER TABLE clinics ADD CONSTRAINT clinics_documentation_mode_check
  CHECK (documentation_mode IN ('emr', 'paper'));
