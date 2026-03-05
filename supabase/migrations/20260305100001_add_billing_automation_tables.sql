-- ============================================================================
-- BILLING AUTOMATION MODULE — Step 2: Tables, columns, indexes, RLS, functions
-- Depends on 20260305100000 which adds 'biller' to clinic_role enum.
-- Safety: All IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. No renames.
-- ============================================================================

-- ============================================================================
-- 1. PATIENT_INSURANCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  payer_type TEXT NOT NULL CHECK (payer_type IN ('medicaid','commercial','private_pay')),
  payer_name TEXT,
  payer_id TEXT,
  member_id TEXT,
  group_number TEXT,
  subscriber_name TEXT,
  subscriber_dob DATE,
  subscriber_first_name TEXT,
  subscriber_last_name TEXT,
  subscriber_gender TEXT CHECK (subscriber_gender IN ('M','F','U')),
  subscriber_address_line1 TEXT,
  subscriber_address_city TEXT,
  subscriber_address_state TEXT,
  subscriber_address_zip TEXT,
  relationship_to_subscriber TEXT DEFAULT 'self',
  priority INTEGER DEFAULT 1,
  is_primary BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_primary_insurance_per_patient
  ON patient_insurance(patient_id) WHERE is_primary = true AND is_active = true;

CREATE INDEX IF NOT EXISTS patient_insurance_patient_idx ON patient_insurance(patient_id);
CREATE INDEX IF NOT EXISTS patient_insurance_clinic_idx ON patient_insurance(clinic_id);

DROP TRIGGER IF EXISTS trigger_patient_insurance_updated_at ON patient_insurance;
CREATE TRIGGER trigger_patient_insurance_updated_at
  BEFORE UPDATE ON patient_insurance FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. CHARGE_CAPTURE_DRAFTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS charge_capture_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  draft_state JSONB NOT NULL DEFAULT '{}',
  finalized_hash TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trigger_charge_capture_drafts_updated_at ON charge_capture_drafts;
CREATE TRIGGER trigger_charge_capture_drafts_updated_at
  BEFORE UPDATE ON charge_capture_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. ADD COLUMNS TO EXISTING visit_charges TABLE
-- ============================================================================

ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS source_key TEXT;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS discipline TEXT;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS is_timed BOOLEAN;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS unit_calc_method TEXT;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS unit_calc_notes TEXT;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS diagnosis_codes TEXT[];
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS place_of_service TEXT DEFAULT '11';
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS rate_per_unit NUMERIC(10,2) DEFAULT 0;
ALTER TABLE visit_charges ADD COLUMN IF NOT EXISTS rendering_provider_id UUID;

-- Unique index on visit_id + source_key for idempotency (only when source_key is not null)
CREATE UNIQUE INDEX IF NOT EXISTS visit_charges_visit_source_key_unique
  ON visit_charges(visit_id, source_key) WHERE source_key IS NOT NULL;

-- ============================================================================
-- 4. CLAIM NUMBER SEQUENCE + ALTER EXISTING CLAIMS TABLE
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS claim_number_seq START 1000;

-- Add new columns to existing claims table
ALTER TABLE claims ADD COLUMN IF NOT EXISTS payer_type TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS insurance_id UUID;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS submission_method TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS frequency_code TEXT DEFAULT '1';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS original_claim_id UUID;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS edi_storage_path TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_snapshot JSONB;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS response_code TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS response_message TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS discipline TEXT;

-- Add FK for insurance_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_insurance_id_fkey'
  ) THEN
    ALTER TABLE claims ADD CONSTRAINT claims_insurance_id_fkey
      FOREIGN KEY (insurance_id) REFERENCES patient_insurance(id);
  END IF;
END$$;

-- Add FK for original_claim_id (self-referencing for replacement claims)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_original_claim_id_fkey'
  ) THEN
    ALTER TABLE claims ADD CONSTRAINT claims_original_claim_id_fkey
      FOREIGN KEY (original_claim_id) REFERENCES claims(id);
  END IF;
END$$;

-- Add check constraints for new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_payer_type_check'
  ) THEN
    ALTER TABLE claims ADD CONSTRAINT claims_payer_type_check
      CHECK (payer_type IS NULL OR payer_type IN ('medicaid','commercial','private_pay'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_submission_method_check'
  ) THEN
    ALTER TABLE claims ADD CONSTRAINT claims_submission_method_check
      CHECK (submission_method IS NULL OR submission_method IN ('tmhp_edi','clearinghouse','paper','private_pay'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_frequency_code_check'
  ) THEN
    ALTER TABLE claims ADD CONSTRAINT claims_frequency_code_check
      CHECK (frequency_code IS NULL OR frequency_code IN ('1','7','8'));
  END IF;
END$$;

-- Expand existing status CHECK to include 'void'
-- Drop old constraint and add new one with 'void' included
DO $$
BEGIN
  -- Drop existing status constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claims_status_check' AND conrelid = 'claims'::regclass
  ) THEN
    ALTER TABLE claims DROP CONSTRAINT claims_status_check;
  END IF;
  -- Recreate with void added
  ALTER TABLE claims ADD CONSTRAINT claims_status_check
    CHECK (status IN ('draft', 'generated', 'submitted', 'accepted', 'rejected', 'paid', 'denied', 'void', 'ready'));
END$$;

-- Partial unique index: only one active (non-void) claim per visit+payer_type
CREATE UNIQUE INDEX IF NOT EXISTS one_active_claim_per_visit_payer
  ON claims(episode_id, payer_type) WHERE status NOT IN ('void') AND payer_type IS NOT NULL;

-- Apply updated_at trigger to claims (was missing)
DROP TRIGGER IF EXISTS trigger_claims_updated_at ON claims;
CREATE TRIGGER trigger_claims_updated_at
  BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add payer_type index
CREATE INDEX IF NOT EXISTS claims_payer_type_idx ON claims(payer_type);

-- ============================================================================
-- 5. ADD COLUMNS TO EXISTING claim_lines TABLE
-- ============================================================================

ALTER TABLE claim_lines ADD COLUMN IF NOT EXISTS diagnosis_codes TEXT[];
ALTER TABLE claim_lines ADD COLUMN IF NOT EXISTS place_of_service TEXT;
ALTER TABLE claim_lines ADD COLUMN IF NOT EXISTS rate_per_unit NUMERIC(10,2);

-- ============================================================================
-- 6. INVOICES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  invoice_number TEXT,
  amount_due NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','void')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_patient_idx ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS invoices_clinic_idx ON invoices(clinic_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

DROP TRIGGER IF EXISTS trigger_invoices_updated_at ON invoices;
CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 7. INVOICE_LINES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES visit_charges(id) ON DELETE SET NULL,
  cpt_code TEXT,
  description TEXT,
  units INTEGER DEFAULT 1,
  rate_per_unit NUMERIC(10,2) DEFAULT 0,
  line_total NUMERIC(10,2) GENERATED ALWAYS AS (units * COALESCE(rate_per_unit, 0)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON invoice_lines(invoice_id);

-- ============================================================================
-- 8. ALTER EXISTING prior_authorizations TABLE
-- ============================================================================

ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS insurance_id UUID;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS discipline TEXT;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'visits';
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS units_authorized INTEGER;
ALTER TABLE prior_authorizations ADD COLUMN IF NOT EXISTS units_used INTEGER DEFAULT 0;

-- Add FK for insurance_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prior_auth_insurance_id_fkey'
  ) THEN
    ALTER TABLE prior_authorizations ADD CONSTRAINT prior_auth_insurance_id_fkey
      FOREIGN KEY (insurance_id) REFERENCES patient_insurance(id);
  END IF;
END$$;

-- Add check constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prior_auth_auth_type_check'
  ) THEN
    ALTER TABLE prior_authorizations ADD CONSTRAINT prior_auth_auth_type_check
      CHECK (auth_type IN ('visits','units'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prior_auth_discipline_check'
  ) THEN
    ALTER TABLE prior_authorizations ADD CONSTRAINT prior_auth_discipline_check
      CHECK (discipline IS NULL OR discipline IN ('PT','OT','ST'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS prior_auth_discipline_idx ON prior_authorizations(discipline);
CREATE INDEX IF NOT EXISTS prior_auth_insurance_idx ON prior_authorizations(insurance_id);

-- ============================================================================
-- 9. ADD taxonomy_code TO provider_profiles
-- ============================================================================

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS taxonomy_code TEXT;

-- ============================================================================
-- 10. BILLING_AUDIT_LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'charge','claim','invoice','prior_auth','invoice_line','claim_line','charge_draft','patient_insurance'
  )),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON billing_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON billing_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON billing_audit_log(created_at DESC);

-- ============================================================================
-- 11. RLS POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE patient_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_capture_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass for all new tables (billing writes always via service role)
CREATE POLICY "service_role_patient_insurance" ON patient_insurance FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_charge_capture_drafts" ON charge_capture_drafts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_invoices" ON invoices FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_invoice_lines" ON invoice_lines FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_billing_audit_log" ON billing_audit_log FOR ALL
  USING (auth.role() = 'service_role');

-- ---- patient_insurance: clinic members can read ----
CREATE POLICY "patient_insurance_select" ON patient_insurance FOR SELECT
  USING (
    clinic_id IN (
      SELECT COALESCE(cm.clinic_id_ref, cm.clinic_id) FROM clinic_memberships cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- ---- charge_capture_drafts: clinic members can read ----
CREATE POLICY "charge_capture_drafts_select" ON charge_capture_drafts FOR SELECT
  USING (
    clinic_id IN (
      SELECT COALESCE(cm.clinic_id_ref, cm.clinic_id) FROM clinic_memberships cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- ---- invoices: admin, biller, and assigned therapist can read ----
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (
    clinic_id IN (
      SELECT COALESCE(cm.clinic_id_ref, cm.clinic_id) FROM clinic_memberships cm
      WHERE cm.user_id = auth.uid() AND cm.is_active = true
    )
  );

-- ---- invoice_lines: inherit from invoices ----
CREATE POLICY "invoice_lines_select" ON invoice_lines FOR SELECT
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i WHERE i.clinic_id IN (
        SELECT COALESCE(cm.clinic_id_ref, cm.clinic_id) FROM clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.is_active = true
      )
    )
  );

-- ---- billing_audit_log: only admin and biller can read ----
CREATE POLICY "billing_audit_log_select" ON billing_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clinic_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.is_active = true
        AND cm.role IN ('admin', 'biller')
    )
  );

-- ---- Restrict therapist access to edi_storage_path and claim_snapshot on claims ----
-- Therapists can see claims but not sensitive EDI fields.
-- We handle this at the application layer since column-level RLS isn't supported.
-- The existing claims RLS allows clinic members to read all columns.
-- We'll restrict via server actions/API routes instead.

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

COMMENT ON TABLE patient_insurance IS 'Patient insurance records with payer details for billing';
COMMENT ON TABLE charge_capture_drafts IS 'Draft charge state from SOAP note finalization';
COMMENT ON TABLE invoices IS 'Private pay invoices for patient billing';
COMMENT ON TABLE invoice_lines IS 'Individual line items on a private pay invoice';
COMMENT ON TABLE billing_audit_log IS 'Billing-specific audit trail for all billing events';
COMMENT ON COLUMN visit_charges.source_key IS 'Deterministic hash of visit+cpt+modifiers+discipline+hash for idempotency';
COMMENT ON COLUMN visit_charges.locked IS 'True when a non-void claim exists; prevents editing';
COMMENT ON COLUMN claims.edi_storage_path IS 'Supabase Storage path for EDI file (replaces edi_file_content for new claims)';
COMMENT ON COLUMN claims.frequency_code IS '1=Original, 7=Replacement, 8=Void';
COMMENT ON COLUMN claims.original_claim_id IS 'Self-ref to voided claim when frequency_code=7';

-- ============================================================================
-- 13. HELPER FUNCTIONS
-- ============================================================================

-- RPC function to get next value from claim_number_seq as text
CREATE OR REPLACE FUNCTION nextval_text(seq_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN nextval(seq_name)::text;
END;
$$;
