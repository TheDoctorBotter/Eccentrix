-- Add visit_id column to notes table for linking SOAP notes to visits
ALTER TABLE notes ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES visits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notes_visit_id ON notes(visit_id);
