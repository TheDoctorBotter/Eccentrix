-- Buckeye EMR Core Schema
-- Clinics, Patients, Episodes, and Documents

-- ============================================================================
-- CLINICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  letterhead_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinics_name ON clinics(name);

-- ============================================================================
-- PATIENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

  -- Demographics
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,

  -- Contact
  phone TEXT,
  email TEXT,
  address TEXT,

  -- Medical info
  primary_diagnosis TEXT,
  secondary_diagnoses TEXT[],
  referring_physician TEXT,
  insurance_id TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(is_active);

-- ============================================================================
-- EPISODES TABLE (Episode of Care)
-- ============================================================================

-- Episode status enum
DO $$ BEGIN
  CREATE TYPE episode_status AS ENUM ('active', 'discharged', 'on_hold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Episode details
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status episode_status DEFAULT 'active',

  -- Diagnosis for this episode
  diagnosis TEXT,
  diagnosis_codes TEXT[],

  -- Plan of care
  frequency TEXT,
  duration TEXT,

  -- Care team (user IDs)
  primary_pt_id UUID,
  care_team_ids UUID[] DEFAULT '{}',

  -- Discharge info
  discharged_at TIMESTAMP WITH TIME ZONE,
  discharged_by UUID,
  discharge_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_patient ON episodes(patient_id);
CREATE INDEX IF NOT EXISTS idx_episodes_clinic ON episodes(clinic_id);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
CREATE INDEX IF NOT EXISTS idx_episodes_active ON episodes(clinic_id, status) WHERE status = 'active';

-- ============================================================================
-- DOCUMENTS TABLE (Clinical Documents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Document type (uses clinical_doc_type from finalization migration)
  doc_type clinical_doc_type NOT NULL,

  -- For linking to existing notes table during transition
  legacy_note_id UUID,

  -- Document content
  title TEXT,
  date_of_service DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Content fields (mirrors notes table)
  input_data JSONB DEFAULT '{}',
  output_text TEXT,
  rich_content JSONB,
  billing_justification TEXT,
  hep_summary TEXT,

  -- Template used
  template_id UUID,
  document_template_id UUID,

  -- Status and finalization
  status document_status DEFAULT 'draft',
  finalized_at TIMESTAMP WITH TIME ZONE,
  finalized_by UUID,

  -- For uploaded documents
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,

  -- Audit
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_episode ON documents(episode_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_clinic ON documents(clinic_id);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date_of_service DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- ============================================================================
-- UPDATE CLINIC_MEMBERSHIPS TO REFERENCE CLINICS TABLE
-- ============================================================================

ALTER TABLE clinic_memberships
  ADD COLUMN IF NOT EXISTS clinic_id_ref UUID REFERENCES clinics(id);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Active episodes with patient info
CREATE OR REPLACE VIEW active_episodes_view AS
SELECT
  e.id as episode_id,
  e.patient_id,
  e.clinic_id,
  e.start_date,
  e.diagnosis,
  e.frequency,
  e.primary_pt_id,
  e.care_team_ids,
  p.first_name,
  p.last_name,
  p.date_of_birth,
  p.primary_diagnosis,
  p.referring_physician
FROM episodes e
JOIN patients p ON e.patient_id = p.id
WHERE e.status = 'active';

-- Documents with episode info
CREATE OR REPLACE VIEW documents_with_episode_view AS
SELECT
  d.*,
  e.status as episode_status,
  p.first_name,
  p.last_name
FROM documents d
JOIN episodes e ON d.episode_id = e.id
JOIN patients p ON d.patient_id = p.id;

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clinics_updated_at ON clinics;
CREATE TRIGGER trigger_clinics_updated_at
  BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_patients_updated_at ON patients;
CREATE TRIGGER trigger_patients_updated_at
  BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_episodes_updated_at ON episodes;
CREATE TRIGGER trigger_episodes_updated_at
  BEFORE UPDATE ON episodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;
CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- For now, allow all access (refine based on auth later)
CREATE POLICY "clinics_all" ON clinics FOR ALL USING (true);
CREATE POLICY "patients_all" ON patients FOR ALL USING (true);
CREATE POLICY "episodes_all" ON episodes FOR ALL USING (true);
CREATE POLICY "documents_all" ON documents FOR ALL USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE clinics IS 'Physical therapy clinics/practices';
COMMENT ON TABLE patients IS 'Patient demographics and contact info';
COMMENT ON TABLE episodes IS 'Episodes of care (treatment periods) for patients';
COMMENT ON TABLE documents IS 'Clinical documents (notes, evals, etc.) within episodes';
COMMENT ON VIEW active_episodes_view IS 'Active episodes with patient demographics';
