-- Add ICD-10 diagnosis code support to episodes table
-- Each episode can have:
-- - Primary diagnosis (up to 5 ICD-10 codes)
-- - Treatment diagnosis (up to 5 ICD-10 codes)

-- Add ICD-10 code columns to episodes table
ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS primary_diagnosis_codes jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS treatment_diagnosis_codes jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN episodes.primary_diagnosis_codes IS 'Array of ICD-10 codes for primary diagnosis. Format: [{"code": "M54.5", "description": "Low back pain"}]';
COMMENT ON COLUMN episodes.treatment_diagnosis_codes IS 'Array of ICD-10 codes for treatment diagnosis. Format: [{"code": "M54.5", "description": "Low back pain"}]';

-- Create index for faster ICD-10 code searches
CREATE INDEX IF NOT EXISTS idx_episodes_primary_diagnosis_codes ON episodes USING gin(primary_diagnosis_codes);
CREATE INDEX IF NOT EXISTS idx_episodes_treatment_diagnosis_codes ON episodes USING gin(treatment_diagnosis_codes);
