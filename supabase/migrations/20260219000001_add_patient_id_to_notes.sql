-- Add optional patient_id to notes table for PTBot telehealth sync.
-- Nullable so existing notes (created without a patient context) are unaffected.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_patient ON notes(patient_id);
