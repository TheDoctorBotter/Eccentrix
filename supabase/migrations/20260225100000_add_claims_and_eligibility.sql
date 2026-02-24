-- ============================================================================
-- TMHP CLAIMS & ELIGIBILITY MIGRATION
-- Adds: Electronic claims tracking, eligibility verification,
--        clinic billing fields, patient Medicaid/insurance fields
-- ============================================================================

-- ============================================================================
-- 1. CLINIC BILLING FIELDS
-- ============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS taxonomy_code TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS medicaid_provider_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS billing_npi TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS billing_city TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS billing_state TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS billing_zip TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS submitter_id TEXT;

-- ============================================================================
-- 2. PATIENT INSURANCE FIELDS
-- ============================================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS medicaid_id TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS subscriber_id TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS payer_id TEXT;

-- ============================================================================
-- 3. CLAIMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  claim_number TEXT,
  payer_name TEXT DEFAULT 'Texas Medicaid',
  payer_id TEXT DEFAULT '330897513',
  subscriber_id TEXT,
  total_charges NUMERIC(10,2) DEFAULT 0,
  diagnosis_codes TEXT[], -- ICD-10 codes from episode
  rendering_provider_npi TEXT,
  rendering_provider_name TEXT,
  place_of_service TEXT DEFAULT '11',
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'generated', 'submitted', 'accepted', 'rejected', 'paid', 'denied'
  )),
  edi_file_content TEXT, -- Generated 837P file content
  edi_generated_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(10,2),
  denial_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_clinic ON claims(clinic_id);
CREATE INDEX IF NOT EXISTS idx_claims_patient ON claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at DESC);

-- ============================================================================
-- 4. CLAIM LINES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS claim_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  visit_charge_id UUID REFERENCES visit_charges(id) ON DELETE SET NULL,
  line_number INTEGER NOT NULL,
  cpt_code TEXT NOT NULL,
  modifier_1 TEXT,
  modifier_2 TEXT,
  units NUMERIC(5,2) NOT NULL DEFAULT 1,
  charge_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  diagnosis_pointers INTEGER[], -- pointers to claim.diagnosis_codes array
  date_of_service DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_lines_claim ON claim_lines(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_lines_charge ON claim_lines(visit_charge_id);

-- ============================================================================
-- 5. ELIGIBILITY CHECKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS eligibility_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medicaid_id TEXT,
  patient_first_name TEXT,
  patient_last_name TEXT,
  patient_dob DATE,
  check_date DATE DEFAULT CURRENT_DATE,
  service_type TEXT DEFAULT '30', -- 30 = Health Benefit Plan Coverage
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'eligible', 'ineligible', 'error'
  )),
  edi_270_content TEXT, -- Generated 270 file
  edi_271_content TEXT, -- Response 271 file (if received)
  response_data JSONB, -- Parsed eligibility response
  error_message TEXT,
  checked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eligibility_clinic ON eligibility_checks(clinic_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_patient ON eligibility_checks(patient_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_date ON eligibility_checks(check_date DESC);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_checks ENABLE ROW LEVEL SECURITY;

-- Claims: users can manage claims in their clinic
CREATE POLICY "Users can view claims in their clinic"
  ON claims FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can insert claims in their clinic"
  ON claims FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can update claims in their clinic"
  ON claims FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can delete claims in their clinic"
  ON claims FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Claim lines: inherit access from claims
CREATE POLICY "Users can view claim lines"
  ON claim_lines FOR SELECT
  USING (
    claim_id IN (
      SELECT id FROM claims WHERE clinic_id IN (
        SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can insert claim lines"
  ON claim_lines FOR INSERT
  WITH CHECK (
    claim_id IN (
      SELECT id FROM claims WHERE clinic_id IN (
        SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can update claim lines"
  ON claim_lines FOR UPDATE
  USING (
    claim_id IN (
      SELECT id FROM claims WHERE clinic_id IN (
        SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can delete claim lines"
  ON claim_lines FOR DELETE
  USING (
    claim_id IN (
      SELECT id FROM claims WHERE clinic_id IN (
        SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- Eligibility checks
CREATE POLICY "Users can view eligibility checks in their clinic"
  ON eligibility_checks FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can insert eligibility checks in their clinic"
  ON eligibility_checks FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can update eligibility checks in their clinic"
  ON eligibility_checks FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_memberships WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Service role bypass for all new tables
CREATE POLICY "Service role full access to claims"
  ON claims FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to claim_lines"
  ON claim_lines FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to eligibility_checks"
  ON eligibility_checks FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE claims IS 'Electronic claims for TMHP/Medicaid submission with 837P EDI generation';
COMMENT ON TABLE claim_lines IS 'Individual service lines within a claim, linked to visit charges';
COMMENT ON TABLE eligibility_checks IS 'Patient eligibility verification checks for TMHP/Medicaid';
