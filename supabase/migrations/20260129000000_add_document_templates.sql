-- Document Templates Table
-- Stores metadata for uploaded .docx templates with clinic branding

-- Create enum for note types if it doesn't exist
DO $$ BEGIN
  CREATE TYPE document_note_type AS ENUM (
    'DAILY_NOTE',
    'INITIAL_EVAL',
    'RE_EVAL',
    'DISCHARGE',
    'PROGRESS_NOTE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create document_templates table
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clinic/Brand identifier
  clinic_name TEXT NOT NULL,

  -- Note type this template is for
  note_type document_note_type NOT NULL,

  -- Template metadata
  template_name TEXT NOT NULL,
  description TEXT,

  -- Storage reference (Supabase Storage path)
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,

  -- Default flag (one default per clinic + note_type combo)
  is_default BOOLEAN DEFAULT FALSE,

  -- Detected placeholders in the template (for validation)
  placeholders_detected TEXT[] DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint for default templates
-- Only one default template per clinic + note_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_default
  ON document_templates (clinic_name, note_type)
  WHERE is_default = TRUE;

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_document_templates_clinic
  ON document_templates (clinic_name);

CREATE INDEX IF NOT EXISTS idx_document_templates_clinic_note_type
  ON document_templates (clinic_name, note_type);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_document_templates_updated_at ON document_templates;
CREATE TRIGGER trigger_update_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_document_templates_updated_at();

-- Update notes table to reference document template used for export
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS document_template_id UUID REFERENCES document_templates(id),
  ADD COLUMN IF NOT EXISTS clinic_name TEXT;

-- Add comment for documentation
COMMENT ON TABLE document_templates IS 'Stores clinic-branded DOCX templates with placeholders for note generation';
COMMENT ON COLUMN document_templates.file_key IS 'Storage path in Supabase Storage bucket "document-templates"';
COMMENT ON COLUMN document_templates.placeholders_detected IS 'Array of placeholder tokens found in the template (e.g., PATIENT_NAME, SUBJECTIVE)';
