export type NoteType =
  | 'daily_soap'
  | 'pt_evaluation'
  | 'progress_note'
  | 'discharge_summary'
  | 'school_iep';

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  daily_soap: 'Daily SOAP Note',
  pt_evaluation: 'PT Evaluation',
  progress_note: 'Progress Note',
  discharge_summary: 'Discharge Summary',
  school_iep: 'School-Based IEP Note',
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
  patient_context?: {
    identifier?: string;
    diagnosis?: string;
    reason_for_visit?: string;
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
  input_data: NoteInputData;
  output_text: string;
  billing_justification: string | null;
  hep_summary: string | null;
  template_id: string | null;
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
