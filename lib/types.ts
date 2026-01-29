export type NoteType =
  | 'daily_soap'
  | 'pt_evaluation';

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  daily_soap: 'Daily SOAP Note',
  pt_evaluation: 'PT Evaluation',
};

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
  patientDemographic?: {
    patientName?: string;
    dateOfBirth?: string;
    diagnosis?: string;
    referralSource?: string;
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
    tolerance?: string;
    key_measures?: string;
  };
  assessment?: {
    progression?: 'better' | 'same' | 'worse';
    impairments?: string;
    skilled_need?: string;
    response_to_treatment?: string;
  };
  plan?: {
    frequency_duration?: string;
    next_session_focus?: string;
    hep?: string;
    education_provided?: string;
  };
}

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
