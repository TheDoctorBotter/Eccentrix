/**
 * ST (Speech Therapy) form data types for the shared NoteEditor.
 *
 * Mirrors the structural pattern of types/notes/pt.ts and types/notes/ot.ts.
 *
 * KEY DIFFERENCE: ST is billed per visit, not per timed unit.
 * The billing shape uses visitNumber / authorizedVisits / remainingVisitsAfterThis
 * instead of the unit-based model used by PT and OT.
 */

// ---------------------------------------------------------------------------
// Goal category & target sub-types
// ---------------------------------------------------------------------------

export type STGoalCategory =
  | 'articulation'
  | 'expressive_language'
  | 'receptive_language'
  | 'pragmatic'
  | 'aac'
  | 'oral_motor'
  | 'other';

export const ST_GOAL_CATEGORY_LABELS: Record<STGoalCategory, string> = {
  articulation: 'Articulation',
  expressive_language: 'Expressive Language',
  receptive_language: 'Receptive Language',
  pragmatic: 'Pragmatic / Social',
  aac: 'AAC',
  oral_motor: 'Oral Motor',
  other: 'Other',
};

export type STCuingLevel =
  | 'Independent'
  | 'Verbal Model'
  | 'Phonemic Cue'
  | 'Tactile Cue'
  | 'Hand-Over-Hand'
  | 'Full Model';

export const ST_CUING_LEVEL_OPTIONS: STCuingLevel[] = [
  'Independent',
  'Verbal Model',
  'Phonemic Cue',
  'Tactile Cue',
  'Hand-Over-Hand',
  'Full Model',
];

export type STGoalStatus = 'In Progress' | 'Met' | 'Regressed' | 'Not Addressed';

export const ST_GOAL_STATUS_OPTIONS: STGoalStatus[] = [
  'In Progress',
  'Met',
  'Regressed',
  'Not Addressed',
];

export type STResponseToTreatment =
  | 'Tolerated well'
  | 'Required increased modeling'
  | 'Behavioral challenges'
  | 'Short attention span'
  | 'Parent present and participating'
  | 'Refused portions';

export const ST_RESPONSE_OPTIONS: STResponseToTreatment[] = [
  'Tolerated well',
  'Required increased modeling',
  'Behavioral challenges',
  'Short attention span',
  'Parent present and participating',
  'Refused portions',
];

export type STDischargeReason =
  | 'goals_met'
  | 'patient_request'
  | 'insurance_exhausted'
  | 'non_compliance'
  | 'other';

export const ST_DISCHARGE_REASON_LABELS: Record<STDischargeReason, string> = {
  goals_met: 'Goals met',
  patient_request: 'Patient request',
  insurance_exhausted: 'Insurance exhausted',
  non_compliance: 'Non-compliance',
  other: 'Other',
};

export type STEvalComplexity = '92521' | '92522' | '92523' | '92524';

export const ST_EVAL_COMPLEXITY_LABELS: Record<STEvalComplexity, string> = {
  '92521': '92521 — Fluency evaluation',
  '92522': '92522 — Speech sound disorder evaluation',
  '92523': '92523 — Language evaluation (comprehension & expression)',
  '92524': '92524 — Behavioral and qualitative analysis',
};

export type STLanguageOfService = 'English' | 'Spanish' | 'Bilingual';

export const ST_LANGUAGE_OF_SERVICE_OPTIONS: STLanguageOfService[] = [
  'English',
  'Spanish',
  'Bilingual',
];

// ---------------------------------------------------------------------------
// Target entry (child of a goal in daily SOAP)
// ---------------------------------------------------------------------------

export interface STTargetEntry {
  targetName: string;
  cuingLevel: STCuingLevel;
  accuracy: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Goal entries
// ---------------------------------------------------------------------------

export interface STGoalEntry {
  goalId: string;
  goalText: string;
  goalCategory: STGoalCategory;
  status: STGoalStatus;
  targetsWorked: STTargetEntry[];
}

export interface STGoalProgressEntry {
  goalText: string;
  priorStatus: string;
  currentStatus: string;
  outcome: 'Met' | 'Partially Met' | 'Not Met';
}

// ---------------------------------------------------------------------------
// Evaluation-specific goal entry (for inline add/remove)
// ---------------------------------------------------------------------------

export interface STEvalGoalEntry {
  description: string;
  targetDate: string;
  baselineValue: string;
  targetValue: string;
  category: STGoalCategory;
}

// ---------------------------------------------------------------------------
// Oral motor sub-types
// ---------------------------------------------------------------------------

export interface OralMotorExam {
  lips: string;
  tongue: string;
  jaw: string;
  palate: string;
}

// ---------------------------------------------------------------------------
// Communication status comparison (for discharge)
// ---------------------------------------------------------------------------

export interface STFunctionalStatusEntry {
  area: string;
  baseline: string;
  dischargeStatus: string;
  change: string;
}

// ---------------------------------------------------------------------------
// Main STFormData interface
// ---------------------------------------------------------------------------

export interface STFormData {
  subjective: {
    caregiverReport: string;
  };
  objective: {
    goalsAddressed: STGoalEntry[];
    aacAddressedThisSession: boolean;
    responseToTreatment: STResponseToTreatment | '';
    caregiverPresent: boolean;
    caregiverTrainingContent: string;
    // Evaluation-specific objective fields
    oralMotor?: OralMotorExam;
    voiceQuality?: string;
    resonance?: string;
    fluencyObservations?: string;
    receptiveObservations?: string;
    receptiveAgeEquivalent?: string;
    expressiveObservations?: string;
    expressiveMLU?: string;
    expressiveAgeEquivalent?: string;
    articulationErrors?: string;
    stimulabilityNotes?: string;
    pragmaticJointAttention?: string;
    pragmaticTurnTaking?: string;
    pragmaticEyeContact?: string;
    pragmaticTopicMaintenance?: string;
    aacCurrentSystem?: string;
    aacDeviceType?: string;
    aacVocabularyLevel?: string;
    aacObservations?: string;
    aacApplicable?: boolean;
  };
  assessment: {
    clinicalImpression?: string;
    progressTowardGoals?: STGoalProgressEntry[];
  };
  plan: {
    planNextSession: string;
    frequencyDuration?: string;
    skilledNeedJustification?: string;
    languageOfService?: STLanguageOfService;
    dischargeReason?: STDischargeReason | '';
    homeProgram?: string;
    caregiverTrainingSummary?: string;
    followUpInstructions?: string;
    changesToTreatment?: string;
    updatedFrequencyDuration?: string;
    medicalNecessityContinued?: string;
  };
  billing: {
    visitNumber: number;
    authorizedVisits: number;
    remainingVisitsAfterThis: number;
    cptCodes: string[];
    icd10Codes: string[];
    evaluationComplexity?: STEvalComplexity;
  };
  goals: {
    shortTermGoals?: STEvalGoalEntry[];
    longTermGoals?: STEvalGoalEntry[];
    visitsCompletedSinceLastEval?: number;
  };
  meta: {
    noteType: 'daily_soap' | 'evaluation' | 're_evaluation' | 'discharge';
    totalVisitsCompleted?: number;
    referralDiagnosis?: string;
    icd10Codes?: string[];
    chiefComplaint?: string;
    languageExposure?: string;
    priorTherapy?: string;
    birthMedicalHistory?: string;
    standardizedAssessment?: string;
    functionalStatus?: STFunctionalStatusEntry[];
    homeLanguageContext?: string;
    updatedAssessment?: string;
    articulationLanguageChanges?: string;
  };
}

// ---------------------------------------------------------------------------
// Target library by goal category
// ---------------------------------------------------------------------------

export const ST_TARGET_LIBRARY: Record<STGoalCategory, string[]> = {
  articulation: [
    'Target phoneme in isolation',
    'Target phoneme in syllables',
    'Target phoneme in words',
    'Target phoneme in phrases',
    'Target phoneme in sentences',
    'Target phoneme in conversation',
    'Final consonant deletion',
    'Cluster reduction',
    'Syllable structure',
    'Stimulability probes',
  ],
  expressive_language: [
    'Single word requests',
    'Two-word combinations',
    'Three-word phrases',
    'Simple sentences',
    'Complex sentences',
    'Verb tense accuracy',
    'Pronoun use',
    'Question formulation',
    'Narrative retell',
    'Vocabulary targets',
  ],
  receptive_language: [
    'Following one-step directions',
    'Following two-step directions',
    'Following multi-step directions',
    'Identifying vocabulary/concepts',
    'Answering yes/no questions',
    'Answering wh- questions',
    'Understanding spatial concepts',
    'Category identification',
  ],
  pragmatic: [
    'Eye contact during communication',
    'Joint attention tasks',
    'Turn-taking in conversation',
    'Topic maintenance',
    'Initiating communication',
    'Requesting vs commenting',
    'Play-based interaction skills',
  ],
  aac: [
    'Activating device to request',
    'Navigating to correct page/category',
    'Combining symbols for phrases',
    'Generalizing AAC use across contexts',
    'Core vocabulary targeting',
  ],
  oral_motor: [
    'Lip rounding/resting posture',
    'Tongue lateralization',
    'Jaw grading',
    'Texture acceptance',
    'Cup/straw drinking',
    'Spoon/fork use',
  ],
  other: [],
};

// ---------------------------------------------------------------------------
// Factory for creating empty ST form data per note type
// ---------------------------------------------------------------------------

function createEmptyOralMotor(): OralMotorExam {
  return { lips: '', tongue: '', jaw: '', palate: '' };
}

export function createEmptySTFormData(
  noteType: STFormData['meta']['noteType']
): STFormData {
  const isEval = noteType === 'evaluation';
  const isReEval = noteType === 're_evaluation';
  const isDischarge = noteType === 'discharge';

  return {
    subjective: {
      caregiverReport: '',
    },
    objective: {
      goalsAddressed: [],
      aacAddressedThisSession: false,
      responseToTreatment: '',
      caregiverPresent: false,
      caregiverTrainingContent: '',
      oralMotor: isEval || isReEval ? createEmptyOralMotor() : undefined,
      voiceQuality: isEval ? '' : undefined,
      resonance: isEval ? '' : undefined,
      fluencyObservations: isEval ? '' : undefined,
      receptiveObservations: isEval || isReEval ? '' : undefined,
      receptiveAgeEquivalent: isEval ? '' : undefined,
      expressiveObservations: isEval || isReEval ? '' : undefined,
      expressiveMLU: isEval ? '' : undefined,
      expressiveAgeEquivalent: isEval ? '' : undefined,
      articulationErrors: isEval ? '' : undefined,
      stimulabilityNotes: isEval ? '' : undefined,
      pragmaticJointAttention: isEval ? '' : undefined,
      pragmaticTurnTaking: isEval ? '' : undefined,
      pragmaticEyeContact: isEval ? '' : undefined,
      pragmaticTopicMaintenance: isEval ? '' : undefined,
      aacCurrentSystem: isEval ? '' : undefined,
      aacDeviceType: isEval ? '' : undefined,
      aacVocabularyLevel: isEval ? '' : undefined,
      aacObservations: isEval ? '' : undefined,
      aacApplicable: isEval ? false : undefined,
    },
    assessment: {
      clinicalImpression: '',
      progressTowardGoals: isReEval || isDischarge ? [] : undefined,
    },
    plan: {
      planNextSession: '',
      frequencyDuration: isEval || isReEval ? '' : undefined,
      skilledNeedJustification: isEval || isReEval ? '' : undefined,
      languageOfService: isEval || isReEval ? undefined : undefined,
      dischargeReason: isDischarge ? '' : undefined,
      homeProgram: isDischarge ? '' : undefined,
      caregiverTrainingSummary: isDischarge ? '' : undefined,
      followUpInstructions: isDischarge ? '' : undefined,
      changesToTreatment: isReEval ? '' : undefined,
      updatedFrequencyDuration: isReEval ? '' : undefined,
      medicalNecessityContinued: isReEval ? '' : undefined,
    },
    billing: {
      visitNumber: 0,
      authorizedVisits: 0,
      remainingVisitsAfterThis: 0,
      cptCodes: [],
      icd10Codes: [],
      evaluationComplexity: isEval ? '92523' : undefined,
    },
    goals: {
      shortTermGoals: isEval || isReEval ? [] : undefined,
      longTermGoals: isEval || isReEval ? [] : undefined,
      visitsCompletedSinceLastEval: isReEval ? 0 : undefined,
    },
    meta: {
      noteType,
      totalVisitsCompleted: isDischarge ? 0 : undefined,
      referralDiagnosis: isEval ? '' : undefined,
      chiefComplaint: isEval ? '' : undefined,
      languageExposure: isEval ? '' : undefined,
      priorTherapy: isEval ? '' : undefined,
      birthMedicalHistory: isEval ? '' : undefined,
      standardizedAssessment: isEval || isReEval ? '' : undefined,
      functionalStatus: isDischarge ? [] : undefined,
      homeLanguageContext: isDischarge ? '' : undefined,
      updatedAssessment: isReEval ? '' : undefined,
      articulationLanguageChanges: isReEval ? '' : undefined,
    },
  };
}
