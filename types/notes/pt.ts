/**
 * PT-specific form data types for the shared NoteEditor.
 *
 * All four PT note types (daily SOAP, evaluation, re-evaluation, discharge)
 * share this top-level shape. Fields marked optional are only used by specific
 * note types.
 */

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface PTIntervention {
  id: string;
  name: string;
  category?: string;
  bodyRegion: string;
  mode: 'sets_reps' | 'time';
  sets?: number;
  reps?: number;
  timeMinutes?: number;
  assistLevel: AssistLevel;
}

export type AssistLevel =
  | 'independent'
  | 'supervision'
  | 'min_assist'
  | 'mod_assist'
  | 'max_assist'
  | 'dependent';

export const ASSIST_LEVEL_LABELS: Record<AssistLevel, string> = {
  independent: 'Independent',
  supervision: 'Supervision',
  min_assist: 'Min Assist',
  mod_assist: 'Mod Assist',
  max_assist: 'Max Assist',
  dependent: 'Dependent',
};

export type ResponseToTreatment =
  | 'tolerated_well'
  | 'moderate_difficulty'
  | 'significant_difficulty'
  | 'declined';

export const RESPONSE_LABELS: Record<ResponseToTreatment, string> = {
  tolerated_well: 'Tolerated well',
  moderate_difficulty: 'Moderate difficulty',
  significant_difficulty: 'Significant difficulty',
  declined: 'Declined treatment',
};

export type AttendanceLevel = 'full' | 'partial' | 'refused';

export const ATTENDANCE_LABELS: Record<AttendanceLevel, string> = {
  full: 'Full participation',
  partial: 'Partial participation',
  refused: 'Refused',
};

export type PainQuality =
  | 'sharp'
  | 'dull'
  | 'aching'
  | 'burning'
  | 'throbbing'
  | 'shooting';

export const PAIN_QUALITY_LABELS: Record<PainQuality, string> = {
  sharp: 'Sharp',
  dull: 'Dull',
  aching: 'Aching',
  burning: 'Burning',
  throbbing: 'Throbbing',
  shooting: 'Shooting',
};

export interface ROMEntry {
  joint: string;
  movement: string;
  active: string;
  passive: string;
  normal: string;
}

export interface StrengthEntry {
  muscleGroup: string;
  grade: string;
  notes: string;
}

export interface FunctionalMobilityEntry {
  activity: string;
  assistLevel: AssistLevel;
}

export interface BalanceEntry {
  type: string;
  level: AssistLevel;
}

export interface GaitEntry {
  pattern: string;
  deviations: string;
  assistiveDevice: string;
  distance: string;
}

export interface GoalEntry {
  id?: string;
  description: string;
  targetDate: string;
  baselineValue: string;
  targetValue: string;
}

export interface GoalProgressEntry {
  goalId?: string;
  description: string;
  priorBaseline: string;
  currentStatus: string;
  outcome: 'met' | 'partially_met' | 'not_met';
}

export type DischargeReason =
  | 'goals_met'
  | 'patient_request'
  | 'insurance_exhausted'
  | 'non_compliance'
  | 'other';

export const DISCHARGE_REASON_LABELS: Record<DischargeReason, string> = {
  goals_met: 'Goals met',
  patient_request: 'Patient request',
  insurance_exhausted: 'Insurance exhausted',
  non_compliance: 'Non-compliance',
  other: 'Other',
};

export interface FunctionalStatusEntry {
  area: string;
  initialStatus: string;
  dischargeStatus: string;
  change: string;
}

export type EvalComplexity = '97161' | '97162' | '97163';

export const EVAL_COMPLEXITY_LABELS: Record<EvalComplexity, string> = {
  '97161': '97161 — Low complexity',
  '97162': '97162 — Moderate complexity',
  '97163': '97163 — High complexity',
};

// ---------------------------------------------------------------------------
// PT Interventions for selection
// ---------------------------------------------------------------------------

export const PT_INTERVENTION_OPTIONS = [
  { id: 'therapeutic_exercise', name: 'Therapeutic Exercise', category: 'Therapeutic Exercise' },
  { id: 'neuromuscular_reed', name: 'Neuromuscular Re-education', category: 'Neuromuscular Re-education' },
  { id: 'gait_training', name: 'Gait Training', category: 'Gait Training' },
  { id: 'balance_training', name: 'Balance Training', category: 'Balance Training' },
  { id: 'manual_therapy', name: 'Manual Therapy', category: 'Manual Therapy' },
  { id: 'functional_mobility', name: 'Functional Mobility Training', category: 'Functional Training' },
  { id: 'therapeutic_activities', name: 'Therapeutic Activities', category: 'Therapeutic Activities' },
  { id: 'modalities', name: 'Modalities', category: 'Modalities' },
] as const;

// ---------------------------------------------------------------------------
// Main PTFormData interface
// ---------------------------------------------------------------------------

export interface PTFormData {
  subjective: {
    painLevel: number | null;
    subjectiveReport: string;
  };
  objective: {
    interventions: PTIntervention[];
    objectiveMeasurements: string;
    responseToTreatment: ResponseToTreatment | '';
    attendanceParticipation: AttendanceLevel | '';
    rom?: ROMEntry[];
    strength?: StrengthEntry[];
    functionalMobility?: FunctionalMobilityEntry[];
    balance?: BalanceEntry[];
    gait?: GaitEntry;
    specialTests?: string;
  };
  assessment: {
    clinicalImpression?: string;
    progressTowardGoals?: GoalProgressEntry[];
  };
  plan: {
    planNextSession: string;
    frequencyDuration?: string;
    skilledNeedJustification?: string;
    dischargeReason?: DischargeReason | '';
    homeProgram?: string;
    followUpInstructions?: string;
  };
  billing: {
    units: number;
    cptCodes: string[];
    icd10Codes: string[];
    evaluationComplexity?: EvalComplexity;
  };
  goals: {
    shortTermGoals?: GoalEntry[];
    longTermGoals?: GoalEntry[];
    visitsCompletedSinceLastEval?: number;
  };
  meta: {
    noteType: 'daily_soap' | 'evaluation' | 're_evaluation' | 'discharge';
    totalVisitsCompleted?: number;
    priorLevelOfFunction?: string;
    relevantMedicalHistory?: string;
    chiefComplaint?: string;
    referralDiagnosis?: string;
    onsetDate?: string;
    painLocation?: string;
    painQuality?: PainQuality | '';
    aggravatingFactors?: string;
    relievingFactors?: string;
    posture?: string;
    functionalStatus?: FunctionalStatusEntry[];
    changesToTreatmentPlan?: string;
    updatedFrequencyDuration?: string;
    medicalNecessityContinued?: string;
  };
}

// ---------------------------------------------------------------------------
// Factory for creating empty form data per note type
// ---------------------------------------------------------------------------

export function createEmptyPTFormData(
  noteType: PTFormData['meta']['noteType']
): PTFormData {
  return {
    subjective: {
      painLevel: null,
      subjectiveReport: '',
    },
    objective: {
      interventions: [],
      objectiveMeasurements: '',
      responseToTreatment: '',
      attendanceParticipation: '',
      rom: noteType !== 'daily_soap' ? [] : undefined,
      strength: noteType !== 'daily_soap' ? [] : undefined,
      functionalMobility: noteType !== 'daily_soap' ? [] : undefined,
      balance: noteType !== 'daily_soap' ? [] : undefined,
      gait: noteType !== 'daily_soap'
        ? { pattern: '', deviations: '', assistiveDevice: '', distance: '' }
        : undefined,
      specialTests: noteType !== 'daily_soap' ? '' : undefined,
    },
    assessment: {
      clinicalImpression: '',
      progressTowardGoals: noteType === 're_evaluation' || noteType === 'discharge' ? [] : undefined,
    },
    plan: {
      planNextSession: '',
      frequencyDuration: noteType !== 'daily_soap' ? '' : undefined,
      skilledNeedJustification: noteType === 'evaluation' || noteType === 're_evaluation' ? '' : undefined,
      dischargeReason: noteType === 'discharge' ? '' : undefined,
      homeProgram: noteType === 'discharge' ? '' : undefined,
      followUpInstructions: noteType === 'discharge' ? '' : undefined,
    },
    billing: {
      units: 0,
      cptCodes: [],
      icd10Codes: [],
      evaluationComplexity: noteType === 'evaluation' ? '97163' : undefined,
    },
    goals: {
      shortTermGoals: noteType === 'evaluation' || noteType === 're_evaluation' ? [] : undefined,
      longTermGoals: noteType === 'evaluation' || noteType === 're_evaluation' ? [] : undefined,
      visitsCompletedSinceLastEval: noteType === 're_evaluation' ? 0 : undefined,
    },
    meta: {
      noteType,
      chiefComplaint: '',
      referralDiagnosis: '',
      relevantMedicalHistory: '',
      priorLevelOfFunction: '',
      onsetDate: '',
      painLocation: '',
      painQuality: '',
      aggravatingFactors: '',
      relievingFactors: '',
      posture: '',
      functionalStatus: noteType === 'discharge' ? [] : undefined,
      changesToTreatmentPlan: noteType === 're_evaluation' ? '' : undefined,
      updatedFrequencyDuration: noteType === 're_evaluation' ? '' : undefined,
      medicalNecessityContinued: noteType === 're_evaluation' ? '' : undefined,
    },
  };
}
