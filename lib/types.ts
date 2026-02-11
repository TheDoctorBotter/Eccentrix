export type NoteType =
  | 'daily_soap'
  | 'pt_evaluation';

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  daily_soap: 'Physical Therapy Daily Note',
  pt_evaluation: 'PT Evaluation',
};

// ============================================================================
// Clinical Finalization Types
// ============================================================================

// Clinical document types for finalization rules
export type ClinicalDocType =
  | 'daily_note'
  | 'evaluation'
  | 're_evaluation'
  | 'progress_summary'
  | 'discharge_summary'
  | 'uploaded_document';

export const CLINICAL_DOC_TYPE_LABELS: Record<ClinicalDocType, string> = {
  daily_note: 'Daily Note',
  evaluation: 'Initial Evaluation',
  re_evaluation: 'Re-Evaluation',
  progress_summary: 'Progress Summary',
  discharge_summary: 'Discharge Summary',
  uploaded_document: 'Uploaded Document',
};

// Document types that require PT to finalize
export const PT_ONLY_FINALIZATION_TYPES: ClinicalDocType[] = [
  'evaluation',
  're_evaluation',
  'progress_summary',
  'discharge_summary',
];

// Document status
export type DocumentStatus = 'draft' | 'final';

// Clinic roles
export type ClinicRole = 'pt' | 'pta' | 'admin' | 'front_office';

export const CLINIC_ROLE_LABELS: Record<ClinicRole, string> = {
  pt: 'Physical Therapist',
  pta: 'Physical Therapist Assistant',
  admin: 'Administrator',
  front_office: 'Front Office',
};

// Clinic membership
export interface ClinicMembership {
  id: string;
  user_id: string;
  clinic_id?: string | null;
  clinic_name: string;
  role: ClinicRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to check if user can finalize a doc type
export function canUserFinalize(role: ClinicRole, docType: ClinicalDocType): boolean {
  if (role === 'pt') return true;
  if (PT_ONLY_FINALIZATION_TYPES.includes(docType)) return false;
  // PTA can finalize daily notes only (not implemented yet - return false for now)
  return false;
}

export interface Template {
  id: string;
  name: string;
  note_type: NoteType;
  content: string;
  style_settings: StyleSettings;
  required_sections: RequiredSections;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface StyleSettings {
  verbosity: 'concise' | 'detailed';
  tone: 'outpatient' | 'school_based';
  avoid_acronyms: boolean;
}

export interface RequiredSections {
  subjective: boolean;
  objective: boolean;
  assessment: boolean;
  plan: boolean;
  billing_justification: boolean;
  hep_summary: boolean;
}

export interface NoteInputData {
  dateOfService?: string;
  startTime?: string;
  endTime?: string;
  patientDemographic?: {
    patientName?: string;
    dateOfBirth?: string;
    diagnosis?: string;
    treatmentDiagnosis?: string;
    referralSource?: string;
    insuranceId?: string;
    allergies?: string;
    precautions?: string;
  };
  subjective?: {
    symptoms?: string;
    pain_level?: number;
    functional_limits?: string;
    goals?: string;
    red_flags?: boolean;
    red_flag_description?: string;
  };
  objective?: {
    interventions?: InterventionDetail[];
    assist_level?: AssistLevel;
    tolerance?: ToleranceLevel;
    key_measures?: string;
  };
  assessment?: {
    progression?: ProgressionStatus;
    impairments?: string[];
    skilled_need?: string;
    response_to_treatment?: string;
  };
  plan?: {
    frequency_duration?: string;
    next_session_focus?: string[];
    hep?: string;
    education_provided?: string;
  };
}

// ============================================================================
// Checkbox Option Constants
// ============================================================================

export type ToleranceLevel = 'Good' | 'Fair' | 'Poor';

export const TOLERANCE_OPTIONS: { value: ToleranceLevel; label: string }[] = [
  { value: 'Good', label: 'Good - minimal symptoms, tolerated well' },
  { value: 'Fair', label: 'Fair - moderate symptoms, required rest breaks' },
  { value: 'Poor', label: 'Poor - significant symptoms, limited participation' },
];

export type ProgressionStatus = 'better' | 'same' | 'worse';

export const PROGRESSION_OPTIONS: { value: ProgressionStatus; label: string }[] = [
  { value: 'better', label: 'Improved - showing progress toward goals' },
  { value: 'same', label: 'Plateau - no significant change' },
  { value: 'worse', label: 'Regression - increased symptoms or decline' },
];

export const IMPAIRMENT_OPTIONS = [
  'Decreased range of motion',
  'Decreased functional strength',
  'Impaired balance/postural control',
  'Impaired gross motor coordination',
  'Impaired fine motor coordination',
  'Decreased endurance/activity tolerance',
  'Impaired gait pattern',
  'Impaired functional mobility',
  'Impaired sensory processing',
  'Decreased core stability',
  'Impaired weight bearing tolerance',
  'Delayed developmental milestones',
  'Impaired body awareness/proprioception',
  'Decreased flexibility',
  'Abnormal muscle tone',
] as const;

export const NEXT_SESSION_FOCUS_OPTIONS = [
  'Progressing functional transitions',
  'Progressing weight bearing',
  'Progressing gait training',
  'Improving proximal strength',
  'Improving range of motion',
  'Improving pain tolerance',
  'Improving balance and coordination',
  'Improving core stability',
  'Improving endurance',
  'Progressing gross motor skills',
  'Progressing home exercise program',
] as const;

export interface InterventionDetail {
  id: string;
  name: string;
  category?: string;
  dosage?: string;
  cues?: string;
}

export type AssistLevel =
  | 'Independent'
  | 'SBA'
  | 'CGA'
  | 'Min'
  | 'Mod'
  | 'Max'
  | 'Dependent';

export interface Note {
  id: string;
  note_type: NoteType;
  title?: string | null;
  date_of_service?: string | null;
  input_data: NoteInputData;
  output_text: string;
  /** Rich text content (JSON) - stores formatted note content for editing/export */
  rich_content?: string | null;
  billing_justification: string | null;
  hep_summary: string | null;
  template_id: string | null;
  /** Clinic/brand name for template-based export */
  clinic_name?: string | null;
  /** Document template used for export */
  document_template_id?: string | null;
  created_at: string;

  // Finalization fields
  /** Document status: draft or final */
  status?: DocumentStatus;
  /** Clinical document type for finalization rules */
  doc_type?: ClinicalDocType | null;
  /** Timestamp when document was finalized */
  finalized_at?: string | null;
  /** User ID who finalized the document */
  finalized_by?: string | null;
}

export interface Intervention {
  id: string;
  name: string;
  category: string;
  default_dosage: string | null;
  default_cues: string | null;
  created_at: string;
}

export const INTERVENTION_CATEGORIES = [
  'Therapeutic Exercise',
  'Manual Therapy',
  'Modalities',
  'Gait Training',
  'Balance Training',
  'Neuromuscular Re-education',
  'Functional Training',
  'Patient Education',
  'Other',
] as const;

export interface BrandingSettings {
  id?: string;
  clinic_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string | null;
  letterhead_url: string | null;
  show_in_notes: boolean;
  provider_name: string;
  provider_credentials: string;
  provider_license: string;
  signature_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// EMR Core Types
// ============================================================================

export interface Clinic {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  letterhead_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  primary_diagnosis?: string | null;
  secondary_diagnoses?: string[] | null;
  referring_physician?: string | null;
  insurance_id?: string | null;
  allergies?: string | null;
  precautions?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EpisodeStatus = 'active' | 'discharged' | 'on_hold';

export interface Episode {
  id: string;
  patient_id: string;
  clinic_id: string;
  start_date: string;
  end_date?: string | null;
  status: EpisodeStatus;
  diagnosis?: string | null;
  diagnosis_codes?: string[] | null;
  frequency?: string | null;
  duration?: string | null;
  primary_pt_id?: string | null;
  care_team_ids?: string[] | null;
  discharged_at?: string | null;
  discharged_by?: string | null;
  discharge_reason?: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields from views
  patient?: Patient;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  primary_diagnosis?: string;
  referring_physician?: string;
  insurance_id?: string;
  allergies?: string;
  precautions?: string;
}

export interface Document {
  id: string;
  episode_id: string;
  clinic_id: string;
  patient_id: string;
  doc_type: ClinicalDocType;
  legacy_note_id?: string | null;
  title?: string | null;
  date_of_service: string;
  input_data?: NoteInputData | null;
  output_text?: string | null;
  rich_content?: unknown | null;
  billing_justification?: string | null;
  hep_summary?: string | null;
  template_id?: string | null;
  document_template_id?: string | null;
  status: DocumentStatus;
  finalized_at?: string | null;
  finalized_by?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields
  episode?: Episode;
  patient?: Patient;
  first_name?: string;
  last_name?: string;
}

// Alert types for documentation due
export type AlertType =
  | 'daily_note_due'
  | 'eval_draft'
  | 're_eval_due'
  | 'progress_note_due';

export interface DocumentationAlert {
  id: string;
  patient_id: string;
  episode_id: string;
  patient_name: string;
  alert_type: AlertType;
  alert_message: string;
  due_date?: string;
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  daily_note_due: 'Daily note due today',
  eval_draft: 'Evaluation draft not finalized',
  re_eval_due: 'Re-evaluation due',
  progress_note_due: 'Progress note due',
};

