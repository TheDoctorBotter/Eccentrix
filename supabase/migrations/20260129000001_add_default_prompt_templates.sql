-- Add default AI prompt templates for note generation
-- These templates tell the AI how to format the generated notes

-- First, ensure the templates table exists
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  note_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  style_settings JSONB DEFAULT '{}',
  required_sections JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_templates_note_type ON templates(note_type);

-- Insert default Daily SOAP template
INSERT INTO templates (name, note_type, content, style_settings, required_sections, is_default)
VALUES (
  'Standard Daily SOAP',
  'daily_soap',
  'Generate a professional physical therapy Daily SOAP note based on the provided patient information and session data.

FORMAT REQUIREMENTS:
- Use clear section headers: SUBJECTIVE, OBJECTIVE, ASSESSMENT, PLAN
- Write in third person professional clinical language
- Be concise but thorough
- Include all relevant clinical details
- Document skilled interventions and patient response

SUBJECTIVE:
Document the patient''s self-reported symptoms, functional limitations, pain levels, and any relevant history updates. Include caregiver reports if applicable.

OBJECTIVE:
Document all interventions performed with specific parameters (sets, reps, duration, resistance).
Include assist levels, patient tolerance, and any objective measurements.
Note cueing provided and patient response.

ASSESSMENT:
Analyze the patient''s response to treatment and progress toward goals.
Justify the need for continued skilled physical therapy services.
Document any changes in function or impairments.

PLAN:
State frequency/duration of treatment.
Outline focus for next session.
Document home exercise program updates.
Note any patient/caregiver education provided.',
  '{"verbosity": "concise", "tone": "outpatient", "avoid_acronyms": false}',
  '{"subjective": true, "objective": true, "assessment": true, "plan": true, "billing_justification": true, "hep_summary": true}',
  true
)
ON CONFLICT DO NOTHING;

-- Insert default PT Evaluation template
INSERT INTO templates (name, note_type, content, style_settings, required_sections, is_default)
VALUES (
  'Standard PT Evaluation',
  'pt_evaluation',
  'Generate a comprehensive physical therapy Initial Evaluation note based on the provided patient information.

FORMAT REQUIREMENTS:
- Use clear section headers
- Write in third person professional clinical language
- Be detailed and thorough for initial documentation
- Establish baseline measurements
- Justify medical necessity for PT services

PATIENT INFORMATION:
Document demographics, diagnosis, referral source, and relevant medical history.

SUBJECTIVE:
Document chief complaint, history of present illness, prior level of function, patient goals, and relevant social/medical history.

OBJECTIVE:
Document posture, ROM, strength, balance, gait, functional mobility, and any special tests performed.
Include specific measurements and baseline data.

ASSESSMENT:
Provide clinical impression including identified impairments, activity limitations, and participation restrictions.
Establish rehab potential and prognosis.
Justify need for skilled PT intervention.

PLAN OF CARE:
Establish short-term and long-term goals (measurable and time-bound).
State recommended frequency and duration.
Outline planned interventions.
Document initial HEP.',
  '{"verbosity": "detailed", "tone": "outpatient", "avoid_acronyms": false}',
  '{"subjective": true, "objective": true, "assessment": true, "plan": true, "billing_justification": true, "hep_summary": true}',
  true
)
ON CONFLICT DO NOTHING;
