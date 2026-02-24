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
  'Increased pain',
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
  primary_diagnosis_codes?: Array<{ code: string; description: string }> | null;
  treatment_diagnosis_codes?: Array<{ code: string; description: string }> | null;
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

// ============================================================================
// Scheduling Types
// ============================================================================

export type AppointmentStatus =
  | 'scheduled'
  | 'checked_in'
  | 'in_progress'
  | 'checked_out'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'rescheduled';

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  checked_in: 'Checked In',
  in_progress: 'In Progress',
  checked_out: 'Checked Out',
  completed: 'Completed',
  no_show: 'No Show',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  checked_in: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  checked_out: 'bg-purple-100 text-purple-700 border-purple-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  no_show: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  rescheduled: 'bg-orange-100 text-orange-700 border-orange-200',
};

export interface Visit {
  id: string;
  clinic_id: string;
  episode_id?: string | null;
  patient_id?: string | null;
  therapist_user_id?: string | null;
  start_time: string;
  end_time: string;
  location?: string | null;
  source: 'manual' | 'google_calendar' | 'buckeye_scheduler';
  external_event_id?: string | null;
  notes?: string | null;
  status: AppointmentStatus;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  recurrence_rule?: string | null;
  recurrence_group_id?: string | null;
  visit_type?: string | null;
  total_treatment_minutes?: number | null;
  total_units?: number | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  patient_name?: string;
  therapist_name?: string;
}

export interface TherapistAvailability {
  id: string;
  clinic_id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  label?: string | null;
  effective_from: string;
  effective_until?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaitlistEntry {
  id: string;
  clinic_id: string;
  patient_id: string;
  episode_id?: string | null;
  preferred_therapist_id?: string | null;
  preferred_days?: number[] | null;
  preferred_time_start?: string | null;
  preferred_time_end?: string | null;
  priority: number;
  notes?: string | null;
  status: 'waiting' | 'offered' | 'scheduled' | 'removed';
  added_at: string;
  removed_at?: string | null;
  // Joined
  patient_name?: string;
}

// ============================================================================
// Outcome Measure Types
// ============================================================================

export interface OutcomeMeasureDefinition {
  id: string;
  name: string;
  abbreviation: string;
  description?: string | null;
  category?: string | null;
  min_score: number;
  max_score: number;
  score_interpretation?: string | null;
  questions?: OutcomeMeasureQuestion[] | null;
  mcid?: number | null;
  higher_is_better: boolean;
  is_active: boolean;
  created_at: string;
}

export interface OutcomeMeasureQuestion {
  id: string;
  text: string;
  options: { value: number; label: string }[];
}

export interface OutcomeMeasureScore {
  id: string;
  patient_id: string;
  episode_id: string;
  clinic_id: string;
  measure_id: string;
  date_administered: string;
  raw_score: number;
  percentage_score?: number | null;
  answers?: Record<string, number> | null;
  administered_by?: string | null;
  notes?: string | null;
  document_id?: string | null;
  created_at: string;
  // Joined
  measure_name?: string;
  measure_abbreviation?: string;
}

// ============================================================================
// Treatment Goal Types
// ============================================================================

export type GoalType = 'short_term' | 'long_term';
export type GoalStatus = 'active' | 'met' | 'not_met' | 'modified' | 'discontinued' | 'deferred';

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: 'Active',
  met: 'Met',
  not_met: 'Not Met',
  modified: 'Modified',
  discontinued: 'Discontinued',
  deferred: 'Deferred',
};

export const GOAL_STATUS_COLORS: Record<GoalStatus, string> = {
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  met: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  not_met: 'bg-red-100 text-red-700 border-red-200',
  modified: 'bg-amber-100 text-amber-700 border-amber-200',
  discontinued: 'bg-slate-100 text-slate-700 border-slate-200',
  deferred: 'bg-purple-100 text-purple-700 border-purple-200',
};

export interface TreatmentGoal {
  id: string;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  goal_type: GoalType;
  goal_number: number;
  description: string;
  baseline_value?: string | null;
  target_value?: string | null;
  current_value?: string | null;
  unit_of_measure?: string | null;
  target_date?: string | null;
  met_date?: string | null;
  status: GoalStatus;
  progress_percentage: number;
  status_notes?: string | null;
  parent_goal_id?: string | null;
  document_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalProgressNote {
  id: string;
  goal_id: string;
  document_id?: string | null;
  date_recorded: string;
  previous_value?: string | null;
  current_value?: string | null;
  progress_percentage?: number | null;
  status?: GoalStatus | null;
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

// ============================================================================
// CPT / Billing Types
// ============================================================================

export interface CptCode {
  id: string;
  code: string;
  description: string;
  category?: string | null;
  is_timed: boolean;
  default_units: number;
  unit_minutes?: number | null;
  is_active: boolean;
  created_at: string;
}

export type ChargeStatus = 'pending' | 'submitted' | 'paid' | 'denied' | 'appealed';

export interface VisitCharge {
  id: string;
  visit_id?: string | null;
  document_id?: string | null;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  cpt_code_id: string;
  cpt_code: string;
  description?: string | null;
  minutes_spent?: number | null;
  units: number;
  modifier_1?: string | null;
  modifier_2?: string | null;
  diagnosis_pointer?: number[] | null;
  charge_amount?: number | null;
  date_of_service: string;
  status: ChargeStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type AuthorizationStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'exhausted';

export interface PriorAuthorization {
  id: string;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  auth_number?: string | null;
  insurance_name?: string | null;
  insurance_phone?: string | null;
  authorized_visits?: number | null;
  used_visits: number;
  remaining_visits?: number | null;
  start_date: string;
  end_date: string;
  requested_date?: string | null;
  approved_date?: string | null;
  status: AuthorizationStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentType = 'copay' | 'coinsurance' | 'deductible' | 'self_pay' | 'other';
export type PaymentMethod = 'cash' | 'check' | 'credit_card' | 'debit_card' | 'other';

export interface PatientPayment {
  id: string;
  patient_id: string;
  clinic_id: string;
  visit_id?: string | null;
  amount: number;
  payment_type: PaymentType;
  payment_method?: PaymentMethod | null;
  reference_number?: string | null;
  date_received: string;
  notes?: string | null;
  collected_by?: string | null;
  created_at: string;
}

// ============================================================================
// Co-Signature Types
// ============================================================================

export type CosignStatus = 'pending' | 'signed' | 'rejected' | 'expired';

export interface DocumentSignature {
  id: string;
  document_id: string;
  signer_user_id: string;
  signer_role: string;
  signer_name: string;
  signer_credentials?: string | null;
  signature_type: 'author' | 'cosigner' | 'reviewer';
  status: CosignStatus;
  signed_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  attestation: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Exercise Library & HEP Types
// ============================================================================

export interface Exercise {
  id: string;
  clinic_id?: string | null;
  name: string;
  description?: string | null;
  category: string;
  body_region?: string | null;
  difficulty: 'easy' | 'moderate' | 'hard' | 'advanced';
  equipment?: string | null;
  default_sets?: string | null;
  default_reps?: string | null;
  default_hold?: string | null;
  default_frequency?: string | null;
  instructions?: string | null;
  precautions?: string | null;
  progression_notes?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const EXERCISE_CATEGORIES = [
  'Stretching',
  'Strengthening',
  'Range of Motion',
  'Stabilization',
  'Balance',
  'Cardio',
  'Functional Training',
  'Neuromuscular Re-education',
  'Proprioception',
] as const;

export const BODY_REGIONS = [
  'Cervical',
  'Shoulder',
  'Elbow',
  'Wrist/Hand',
  'Thoracic',
  'Lumbar',
  'Hip',
  'Knee',
  'Ankle',
  'Lower Extremity',
  'Upper Extremity',
  'Core',
  'Full Body',
] as const;

export interface HepProgram {
  id: string;
  patient_id: string;
  episode_id: string;
  clinic_id: string;
  name: string;
  status: 'active' | 'completed' | 'paused' | 'discontinued';
  start_date: string;
  instructions?: string | null;
  frequency?: string | null;
  assigned_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  exercises?: HepProgramExercise[];
}

export interface HepProgramExercise {
  id: string;
  hep_program_id: string;
  exercise_id: string;
  sort_order: number;
  sets?: string | null;
  reps?: string | null;
  hold?: string | null;
  frequency?: string | null;
  special_instructions?: string | null;
  date_added: string;
  date_progressed?: string | null;
  progression_notes?: string | null;
  is_active: boolean;
  created_at: string;
  // Joined
  exercise?: Exercise;
}

// ============================================================================
// Messaging Types
// ============================================================================

export interface Message {
  id: string;
  clinic_id: string;
  sender_id: string;
  thread_id?: string | null;
  recipient_ids: string[];
  subject?: string | null;
  body: string;
  is_urgent: boolean;
  patient_id?: string | null;
  episode_id?: string | null;
  created_at: string;
  // Joined
  sender_name?: string;
  is_read?: boolean;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export type AuditAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'print' | 'sign' | 'login' | 'logout';

export interface AuditLogEntry {
  id: string;
  clinic_id?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id?: string | null;
  resource_description?: string | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

// ============================================================================
// Provider Profile Types
// ============================================================================

export interface ProviderProfile {
  id: string;
  user_id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  credentials?: string | null;
  npi?: string | null;
  license_number?: string | null;
  license_state?: string | null;
  license_expiry?: string | null;
  specialty?: string | null;
  email?: string | null;
  phone?: string | null;
  default_appointment_duration: number;
  max_daily_patients?: number | null;
  color?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// 8-Minute Rule Calculator
// ============================================================================

export function calculateBillingUnits(totalMinutes: number): number {
  if (totalMinutes < 8) return 0;
  if (totalMinutes <= 22) return 1;
  if (totalMinutes <= 37) return 2;
  if (totalMinutes <= 52) return 3;
  if (totalMinutes <= 67) return 4;
  if (totalMinutes <= 82) return 5;
  if (totalMinutes <= 97) return 6;
  if (totalMinutes <= 112) return 7;
  return Math.ceil(totalMinutes / 15);
}

export const EIGHT_MINUTE_RULE_TABLE = [
  { units: 1, min: 8, max: 22 },
  { units: 2, min: 23, max: 37 },
  { units: 3, min: 38, max: 52 },
  { units: 4, min: 53, max: 67 },
  { units: 5, min: 68, max: 82 },
  { units: 6, min: 83, max: 97 },
  { units: 7, min: 98, max: 112 },
  { units: 8, min: 113, max: 127 },
];

// ============================================================================
// Claims & EDI Types (TMHP / Medicaid)
// ============================================================================

export type ClaimStatus = 'draft' | 'generated' | 'submitted' | 'accepted' | 'rejected' | 'paid' | 'denied';

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: 'Draft',
  generated: 'EDI Generated',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  paid: 'Paid',
  denied: 'Denied',
};

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  generated: 'bg-blue-100 text-blue-700 border-blue-200',
  submitted: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  paid: 'bg-green-100 text-green-700 border-green-200',
  denied: 'bg-red-100 text-red-700 border-red-200',
};

export interface Claim {
  id: string;
  clinic_id: string;
  patient_id: string;
  episode_id?: string | null;
  claim_number?: string | null;
  payer_name: string;
  payer_id: string;
  subscriber_id?: string | null;
  total_charges: number;
  diagnosis_codes?: string[] | null;
  rendering_provider_npi?: string | null;
  rendering_provider_name?: string | null;
  place_of_service: string;
  status: ClaimStatus;
  edi_file_content?: string | null;
  edi_generated_at?: string | null;
  submitted_at?: string | null;
  paid_at?: string | null;
  paid_amount?: number | null;
  denial_reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  patient_name?: string;
  lines?: ClaimLine[];
}

export interface ClaimLine {
  id: string;
  claim_id: string;
  visit_charge_id?: string | null;
  line_number: number;
  cpt_code: string;
  modifier_1?: string | null;
  modifier_2?: string | null;
  units: number;
  charge_amount: number;
  diagnosis_pointers?: number[] | null;
  date_of_service: string;
  description?: string | null;
  created_at: string;
}

export type EligibilityStatus = 'pending' | 'eligible' | 'ineligible' | 'error';

export const ELIGIBILITY_STATUS_LABELS: Record<EligibilityStatus, string> = {
  pending: 'Pending',
  eligible: 'Eligible',
  ineligible: 'Ineligible',
  error: 'Error',
};

export const ELIGIBILITY_STATUS_COLORS: Record<EligibilityStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  eligible: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ineligible: 'bg-red-100 text-red-700 border-red-200',
  error: 'bg-slate-100 text-slate-700 border-slate-200',
};

export interface EligibilityCheck {
  id: string;
  clinic_id: string;
  patient_id: string;
  medicaid_id?: string | null;
  patient_first_name?: string | null;
  patient_last_name?: string | null;
  patient_dob?: string | null;
  check_date: string;
  service_type: string;
  status: EligibilityStatus;
  edi_270_content?: string | null;
  edi_271_content?: string | null;
  response_data?: Record<string, unknown> | null;
  error_message?: string | null;
  checked_by?: string | null;
  created_at: string;
  // Joined
  patient_name?: string;
}

// Clinic billing settings (extends Clinic)
export interface ClinicBillingSettings {
  tax_id?: string | null;
  taxonomy_code?: string | null;
  medicaid_provider_id?: string | null;
  billing_npi?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  submitter_id?: string | null;
}

