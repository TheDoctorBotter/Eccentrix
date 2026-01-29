/**
 * Document Template System Types
 *
 * This module defines types for the clinic-branded template system.
 * Templates are .docx files with placeholders that get filled with note data.
 */

// ============================================================================
// Note Types (expanded for template system)
// ============================================================================

export type DocumentNoteType =
  | 'DAILY_NOTE'
  | 'INITIAL_EVAL'
  | 'RE_EVAL'
  | 'DISCHARGE'
  | 'PROGRESS_NOTE';

export const DOCUMENT_NOTE_TYPE_LABELS: Record<DocumentNoteType, string> = {
  DAILY_NOTE: 'Daily Note',
  INITIAL_EVAL: 'Initial Evaluation',
  RE_EVAL: 'Re-Evaluation',
  DISCHARGE: 'Discharge Summary',
  PROGRESS_NOTE: 'Progress Note',
};

// ============================================================================
// Template Placeholders
// ============================================================================

/**
 * Standard placeholder tokens supported in templates
 * These will be replaced with actual note data during export
 */
export const TEMPLATE_PLACEHOLDERS = {
  // Patient Info
  PATIENT_NAME: '{{PATIENT_NAME}}',
  PATIENT_FIRST_NAME: '{{PATIENT_FIRST_NAME}}',
  PATIENT_LAST_NAME: '{{PATIENT_LAST_NAME}}',
  DOB: '{{DOB}}',
  AGE: '{{AGE}}',
  INSURANCE_ID: '{{INSURANCE_ID}}',
  REFERRING_MD: '{{REFERRING_MD}}',
  MEDICAL_DX: '{{MEDICAL_DX}}',
  TREATMENT_DX: '{{TREATMENT_DX}}',
  ALLERGIES: '{{ALLERGIES}}',
  PRECAUTIONS: '{{PRECAUTIONS}}',
  START_OF_CARE: '{{START_OF_CARE}}',
  LANGUAGE: '{{LANGUAGE}}',

  // Session Info
  DATE_OF_SERVICE: '{{DATE_OF_SERVICE}}',
  TIME_IN: '{{TIME_IN}}',
  TIME_OUT: '{{TIME_OUT}}',
  TOTAL_TIME: '{{TOTAL_TIME}}',
  UNITS: '{{UNITS}}',

  // SOAP Sections
  SUBJECTIVE: '{{SUBJECTIVE}}',
  OBJECTIVE: '{{OBJECTIVE}}',
  ASSESSMENT: '{{ASSESSMENT}}',
  PLAN: '{{PLAN}}',
  PATIENT_HISTORY: '{{PATIENT_HISTORY}}',

  // Goals
  SHORT_TERM_GOALS: '{{SHORT_TERM_GOALS}}',
  LONG_TERM_GOALS: '{{LONG_TERM_GOALS}}',
  GOAL_1: '{{GOAL_1}}',
  GOAL_2: '{{GOAL_2}}',
  GOAL_3: '{{GOAL_3}}',
  GOAL_1_BASELINE: '{{GOAL_1_BASELINE}}',
  GOAL_2_BASELINE: '{{GOAL_2_BASELINE}}',
  GOAL_3_BASELINE: '{{GOAL_3_BASELINE}}',
  GOAL_1_CURRENT: '{{GOAL_1_CURRENT}}',
  GOAL_2_CURRENT: '{{GOAL_2_CURRENT}}',
  GOAL_3_CURRENT: '{{GOAL_3_CURRENT}}',

  // Plan of Care
  PROGNOSIS: '{{PROGNOSIS}}',
  FREQUENCY: '{{FREQUENCY}}',
  DURATION: '{{DURATION}}',
  HEP: '{{HEP}}',

  // Billing
  DX_CODES: '{{DX_CODES}}',
  CPT_CODES: '{{CPT_CODES}}',
  BILLING_JUSTIFICATION: '{{BILLING_JUSTIFICATION}}',

  // Provider/Signature
  THERAPIST_NAME: '{{THERAPIST_NAME}}',
  THERAPIST_CREDENTIALS: '{{THERAPIST_CREDENTIALS}}',
  THERAPIST_LICENSE: '{{THERAPIST_LICENSE}}',
  THERAPIST_SIGNATURE: '{{THERAPIST_SIGNATURE}}',
  SIGNATURE_DATE: '{{SIGNATURE_DATE}}',
  SUPERVISING_PT_NAME: '{{SUPERVISING_PT_NAME}}',
  SUPERVISING_PT_SIGNATURE: '{{SUPERVISING_PT_SIGNATURE}}',

  // Clinic Info (from template, but can be overridden)
  CLINIC_NAME: '{{CLINIC_NAME}}',
  CLINIC_ADDRESS: '{{CLINIC_ADDRESS}}',
  CLINIC_PHONE: '{{CLINIC_PHONE}}',

  // Assessment specific
  TEST_NAME: '{{TEST_NAME}}',
  TEST_DATE: '{{TEST_DATE}}',
  GMQ_PERCENTILE: '{{GMQ_PERCENTILE}}',
  GMQ_DESCRIPTOR: '{{GMQ_DESCRIPTOR}}',
} as const;

export type PlaceholderKey = keyof typeof TEMPLATE_PLACEHOLDERS;

// ============================================================================
// Document Template
// ============================================================================

/**
 * Document template stored in the database
 */
export interface DocumentTemplate {
  id: string;
  clinic_name: string;
  note_type: DocumentNoteType;
  template_name: string;
  description?: string | null;
  file_key: string; // Storage path in Supabase
  file_name: string; // Original filename
  file_size: number;
  is_default: boolean;
  placeholders_detected: string[]; // List of placeholders found in template
  created_at: string;
  updated_at: string;
}

/**
 * Template upload request
 */
export interface TemplateUploadRequest {
  clinic_name: string;
  note_type: DocumentNoteType;
  template_name: string;
  description?: string;
  file: File;
}

/**
 * Template metadata (without file content)
 */
export interface TemplateMetadata {
  id: string;
  clinic_name: string;
  note_type: DocumentNoteType;
  template_name: string;
  description?: string | null;
  is_default: boolean;
  created_at: string;
}

// ============================================================================
// Note Data for Template Filling
// ============================================================================

/**
 * Structured note data that maps to template placeholders
 */
export interface NoteTemplateData {
  // Patient Info
  patientName?: string;
  patientFirstName?: string;
  patientLastName?: string;
  dob?: string;
  age?: string;
  insuranceId?: string;
  referringMd?: string;
  medicalDx?: string;
  treatmentDx?: string;
  allergies?: string;
  precautions?: string;
  startOfCare?: string;
  language?: string;

  // Session Info
  dateOfService?: string;
  timeIn?: string;
  timeOut?: string;
  totalTime?: string;
  units?: string;

  // SOAP Sections
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  patientHistory?: string;

  // Goals
  shortTermGoals?: string;
  longTermGoals?: string;
  goals?: Array<{
    text: string;
    baseline?: string;
    current?: string;
  }>;

  // Plan of Care
  prognosis?: string;
  frequency?: string;
  duration?: string;
  hep?: string;

  // Billing
  dxCodes?: string;
  cptCodes?: string;
  billingJustification?: string;

  // Provider
  therapistName?: string;
  therapistCredentials?: string;
  therapistLicense?: string;
  signatureDate?: string;
  supervisingPtName?: string;

  // Assessment specific
  testName?: string;
  testDate?: string;
  gmqPercentile?: string;
  gmqDescriptor?: string;

  // Clinic (usually from template, but can override)
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
}

// ============================================================================
// Export Options
// ============================================================================

/**
 * Export format options
 */
export type ExportFormat = 'docx' | 'pdf';

/**
 * Export request
 */
export interface DocumentExportRequest {
  noteId: string;
  templateId: string;
  format: ExportFormat;
  noteData: NoteTemplateData;
}

/**
 * Export result
 */
export interface DocumentExportResult {
  success: boolean;
  filename: string;
  mimeType: string;
  data?: Blob;
  error?: string;
}

// ============================================================================
// Clinic/Brand
// ============================================================================

/**
 * Clinic with its available templates
 */
export interface ClinicWithTemplates {
  clinic_name: string;
  templates: TemplateMetadata[];
  noteTypes: DocumentNoteType[];
}

/**
 * Get available clinics from templates
 */
export function getClinicList(templates: DocumentTemplate[]): string[] {
  const clinics = new Set(templates.map((t) => t.clinic_name));
  return Array.from(clinics).sort();
}

/**
 * Get templates for a specific clinic
 */
export function getTemplatesForClinic(
  templates: DocumentTemplate[],
  clinicName: string
): DocumentTemplate[] {
  return templates.filter((t) => t.clinic_name === clinicName);
}

/**
 * Get available note types for a clinic
 */
export function getNoteTypesForClinic(
  templates: DocumentTemplate[],
  clinicName: string
): DocumentNoteType[] {
  const types = new Set(
    templates
      .filter((t) => t.clinic_name === clinicName)
      .map((t) => t.note_type)
  );
  return Array.from(types);
}

/**
 * Get default template for clinic + note type
 */
export function getDefaultTemplate(
  templates: DocumentTemplate[],
  clinicName: string,
  noteType: DocumentNoteType
): DocumentTemplate | undefined {
  return templates.find(
    (t) =>
      t.clinic_name === clinicName && t.note_type === noteType && t.is_default
  );
}
