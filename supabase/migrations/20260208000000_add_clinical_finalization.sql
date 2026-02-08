-- Clinical Finalization System
-- Adds document status, finalization tracking, and role-based permissions

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Document status enum
DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('draft', 'final');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Clinic membership roles
DO $$ BEGIN
  CREATE TYPE clinic_role AS ENUM ('pt', 'pta', 'admin', 'front_office');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Extended document types (for finalization rules)
DO $$ BEGIN
  CREATE TYPE clinical_doc_type AS ENUM (
    'daily_note',
    'evaluation',
    're_evaluation',
    'progress_summary',
    'discharge_summary',
    'uploaded_document'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- CLINIC MEMBERSHIPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinic_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  clinic_id UUID,  -- Can reference a clinics table if you have one
  clinic_name TEXT NOT NULL,
  role clinic_role NOT NULL DEFAULT 'pta',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique membership per user per clinic
  UNIQUE(user_id, clinic_name)
);

-- Index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_clinic_memberships_user
  ON clinic_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_clinic_memberships_clinic
  ON clinic_memberships(clinic_name);
CREATE INDEX IF NOT EXISTS idx_clinic_memberships_role
  ON clinic_memberships(role);

-- ============================================================================
-- ADD FINALIZATION COLUMNS TO NOTES
-- ============================================================================

-- Add status column
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS status document_status DEFAULT 'draft';

-- Add finalization tracking
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS finalized_by UUID;

-- Add clinical doc type (maps to finalization rules)
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS doc_type clinical_doc_type;

-- Update existing notes to have appropriate doc_type based on note_type
UPDATE notes SET doc_type = 'daily_note' WHERE note_type = 'daily_soap' AND doc_type IS NULL;
UPDATE notes SET doc_type = 'evaluation' WHERE note_type = 'pt_evaluation' AND doc_type IS NULL;

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_doc_type ON notes(doc_type);

-- ============================================================================
-- HELPER FUNCTION: Check if user is PT
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_pt(check_user_id UUID, check_clinic_name TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  IF check_clinic_name IS NULL THEN
    -- Check if user is PT in any clinic
    RETURN EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE user_id = check_user_id
        AND role = 'pt'
        AND is_active = TRUE
    );
  ELSE
    -- Check if user is PT in specific clinic
    RETURN EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE user_id = check_user_id
        AND clinic_name = check_clinic_name
        AND role = 'pt'
        AND is_active = TRUE
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Check if doc type requires PT finalization
-- ============================================================================

CREATE OR REPLACE FUNCTION requires_pt_finalization(dtype clinical_doc_type)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN dtype IN ('evaluation', 're_evaluation', 'progress_summary', 'discharge_summary');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- TRIGGER: Validate finalization permissions
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_finalization()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when status is being changed to 'final'
  IF NEW.status = 'final' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN

    -- If doc type requires PT finalization
    IF NEW.doc_type IS NOT NULL AND requires_pt_finalization(NEW.doc_type) THEN
      -- Check if the finalizing user is a PT
      IF NOT is_user_pt(NEW.finalized_by, NEW.clinic_name) THEN
        RAISE EXCEPTION 'Only licensed Physical Therapists (PT) can finalize this document type';
      END IF;
    END IF;

    -- Set finalization timestamp
    NEW.finalized_at := NOW();
  END IF;

  -- If reverting to draft, clear finalization fields
  IF NEW.status = 'draft' AND OLD.status = 'final' THEN
    NEW.finalized_at := NULL;
    NEW.finalized_by := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_validate_finalization ON notes;
CREATE TRIGGER trigger_validate_finalization
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION validate_finalization();

-- ============================================================================
-- RLS POLICIES FOR NOTES FINALIZATION
-- ============================================================================

-- Enable RLS on notes if not already enabled
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read notes (adjust as needed for your auth)
DROP POLICY IF EXISTS "notes_select_policy" ON notes;
CREATE POLICY "notes_select_policy" ON notes
  FOR SELECT USING (true);

-- Policy: Anyone can insert draft notes
DROP POLICY IF EXISTS "notes_insert_policy" ON notes;
CREATE POLICY "notes_insert_policy" ON notes
  FOR INSERT WITH CHECK (status = 'draft' OR status IS NULL);

-- Policy: Update rules for finalization
DROP POLICY IF EXISTS "notes_update_policy" ON notes;
CREATE POLICY "notes_update_policy" ON notes
  FOR UPDATE USING (true);
  -- The trigger handles validation of who can finalize

-- ============================================================================
-- RLS POLICIES FOR CLINIC MEMBERSHIPS
-- ============================================================================

ALTER TABLE clinic_memberships ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own memberships
DROP POLICY IF EXISTS "memberships_select_own" ON clinic_memberships;
CREATE POLICY "memberships_select_own" ON clinic_memberships
  FOR SELECT USING (true);  -- Adjust based on your auth needs

-- Only admins can modify memberships (enforce at API level)
DROP POLICY IF EXISTS "memberships_insert_policy" ON clinic_memberships;
CREATE POLICY "memberships_insert_policy" ON clinic_memberships
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "memberships_update_policy" ON clinic_memberships;
CREATE POLICY "memberships_update_policy" ON clinic_memberships
  FOR UPDATE USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE clinic_memberships IS 'Tracks user roles within clinics (PT, PTA, admin, front_office)';
COMMENT ON COLUMN notes.status IS 'Document status: draft or final';
COMMENT ON COLUMN notes.finalized_at IS 'Timestamp when document was finalized';
COMMENT ON COLUMN notes.finalized_by IS 'User ID who finalized the document';
COMMENT ON COLUMN notes.doc_type IS 'Clinical document type for finalization rules';
COMMENT ON FUNCTION is_user_pt IS 'Check if a user has PT role in a clinic';
COMMENT ON FUNCTION requires_pt_finalization IS 'Check if document type requires PT to finalize';
