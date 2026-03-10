/**
 * OT-specific form data types for the shared NoteEditor.
 *
 * Mirrors the structural pattern of types/notes/pt.ts so that NoteEditor
 * can treat both disciplines symmetrically.
 */

// ---------------------------------------------------------------------------
// Goal category & skill sub-types
// ---------------------------------------------------------------------------

export type OTGoalCategory =
  | 'fine_motor'
  | 'sensory_processing'
  | 'adl'
  | 'visual_motor'
  | 'cognitive_play'
  | 'other';

export const OT_GOAL_CATEGORY_LABELS: Record<OTGoalCategory, string> = {
  fine_motor: 'Fine Motor',
  sensory_processing: 'Sensory Processing',
  adl: 'ADL / Self-Care',
  visual_motor: 'Visual Motor',
  cognitive_play: 'Cognitive / Play',
  other: 'Other',
};

export type OTCuingLevel =
  | 'Independent'
  | 'Verbal Cue'
  | 'Gestural Cue'
  | 'Hand-Over-Hand'
  | 'Physical Assist';

export const OT_CUING_LEVEL_OPTIONS: OTCuingLevel[] = [
  'Independent',
  'Verbal Cue',
  'Gestural Cue',
  'Hand-Over-Hand',
  'Physical Assist',
];

export type OTGoalStatus = 'In Progress' | 'Met' | 'Regressed' | 'Not Addressed';

export const OT_GOAL_STATUS_OPTIONS: OTGoalStatus[] = [
  'In Progress',
  'Met',
  'Regressed',
  'Not Addressed',
];

export type OTResponseToTreatment =
  | 'Tolerated well'
  | 'Required increased cueing'
  | 'Sensory seeking behavior noted'
  | 'Avoidance behavior noted'
  | 'Behavioral challenges'
  | 'Refused portions';

export const OT_RESPONSE_OPTIONS: OTResponseToTreatment[] = [
  'Tolerated well',
  'Required increased cueing',
  'Sensory seeking behavior noted',
  'Avoidance behavior noted',
  'Behavioral challenges',
  'Refused portions',
];

export type OTDischargeReason =
  | 'goals_met'
  | 'patient_request'
  | 'insurance_exhausted'
  | 'non_compliance'
  | 'other';

export const OT_DISCHARGE_REASON_LABELS: Record<OTDischargeReason, string> = {
  goals_met: 'Goals met',
  patient_request: 'Patient request',
  insurance_exhausted: 'Insurance exhausted',
  non_compliance: 'Non-compliance',
  other: 'Other',
};

export type OTEvalComplexity = '97165' | '97166' | '97167';

export const OT_EVAL_COMPLEXITY_LABELS: Record<OTEvalComplexity, string> = {
  '97165': '97165 — Low complexity',
  '97166': '97166 — Moderate complexity',
  '97167': '97167 — High complexity',
};

// ---------------------------------------------------------------------------
// Sensory processing sub-types
// ---------------------------------------------------------------------------

export type SensoryDomain = 'tactile' | 'vestibular' | 'proprioceptive' | 'auditory' | 'visual';

export const SENSORY_DOMAIN_LABELS: Record<SensoryDomain, string> = {
  tactile: 'Tactile',
  vestibular: 'Vestibular',
  proprioceptive: 'Proprioceptive',
  auditory: 'Auditory',
  visual: 'Visual',
};

export type SensoryRating = 'Typical' | 'Seeking' | 'Avoiding' | 'Mixed';

export const SENSORY_RATING_OPTIONS: SensoryRating[] = [
  'Typical',
  'Seeking',
  'Avoiding',
  'Mixed',
];

export interface SensoryEntry {
  domain: SensoryDomain;
  rating: SensoryRating | '';
  notes: string;
}

// ---------------------------------------------------------------------------
// ADL sub-types
// ---------------------------------------------------------------------------

export type ADLArea = 'dressing' | 'feeding' | 'grooming' | 'toileting';

export const ADL_AREA_LABELS: Record<ADLArea, string> = {
  dressing: 'Dressing',
  feeding: 'Feeding',
  grooming: 'Grooming',
  toileting: 'Toileting',
};

export type ADLAssistLevel =
  | 'Independent'
  | 'Supervision'
  | 'Min Assist'
  | 'Mod Assist'
  | 'Max Assist';

export const ADL_ASSIST_LEVEL_OPTIONS: ADLAssistLevel[] = [
  'Independent',
  'Supervision',
  'Min Assist',
  'Mod Assist',
  'Max Assist',
];

export interface ADLEntry {
  area: ADLArea;
  assistLevel: ADLAssistLevel | '';
}

// ---------------------------------------------------------------------------
// Skill entry (child of a goal in daily SOAP)
// ---------------------------------------------------------------------------

export interface OTSkillEntry {
  skillName: string;
  cuingLevel: OTCuingLevel;
  accuracy: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Goal entries
// ---------------------------------------------------------------------------

export interface OTGoalEntry {
  goalId: string;
  goalText: string;
  goalCategory: OTGoalCategory;
  status: OTGoalStatus;
  skillsWorked: OTSkillEntry[];
}

export interface OTGoalProgressEntry {
  goalText: string;
  priorStatus: string;
  currentStatus: string;
  outcome: 'Met' | 'Partially Met' | 'Not Met';
}

// ---------------------------------------------------------------------------
// Evaluation-specific goal entry (for inline add/remove)
// ---------------------------------------------------------------------------

export interface OTEvalGoalEntry {
  description: string;
  targetDate: string;
  baselineValue: string;
  targetValue: string;
  category: OTGoalCategory;
}

// ---------------------------------------------------------------------------
// Developmental history
// ---------------------------------------------------------------------------

export interface OTDevelopmentalHistory {
  birthHistory: string;
  milestones: string;
  diagnoses: string;
}

// ---------------------------------------------------------------------------
// Functional status comparison (for discharge)
// ---------------------------------------------------------------------------

export interface OTFunctionalStatusEntry {
  area: string;
  initialStatus: string;
  dischargeStatus: string;
  change: string;
}

// ---------------------------------------------------------------------------
// Main OTFormData interface
// ---------------------------------------------------------------------------

export interface OTFormData {
  subjective: {
    caregiverReport: string;
  };
  objective: {
    goalsAddressed: OTGoalEntry[];
    responseToTreatment: OTResponseToTreatment | '';
    caregiverPresent: boolean;
    caregiverTrainingContent: string;
    // Evaluation-specific objective fields
    graspPatterns?: string;
    inHandManipulation?: string;
    bilateralCoordination?: string;
    ageEquivalents?: string;
    vmiObservations?: string;
    sensoryProcessing?: SensoryEntry[];
    adlStatus?: ADLEntry[];
    playSkills?: {
      parallel: string;
      associative: string;
      cooperative: string;
    };
  };
  assessment: {
    clinicalImpression?: string;
    progressTowardGoals?: OTGoalProgressEntry[];
  };
  plan: {
    planNextSession: string;
    frequencyDuration?: string;
    skilledNeedJustification?: string;
    dischargeReason?: OTDischargeReason | '';
    homeProgram?: string;
    caregiverTrainingSummary?: string;
    followUpInstructions?: string;
    changesToTreatment?: string;
    updatedFrequencyDuration?: string;
    medicalNecessityContinued?: string;
  };
  billing: {
    cptCodes: string[];
    icd10Codes: string[];
    evaluationComplexity?: OTEvalComplexity;
  };
  goals: {
    shortTermGoals?: OTEvalGoalEntry[];
    longTermGoals?: OTEvalGoalEntry[];
    visitsCompletedSinceLastEval?: number;
  };
  meta: {
    noteType: 'daily_soap' | 'evaluation' | 're_evaluation' | 'discharge';
    totalVisitsCompleted?: number;
    referralDiagnosis?: string;
    icd10Codes?: string[];
    chiefComplaint?: string;
    onsetDate?: string;
    developmentalHistory?: OTDevelopmentalHistory;
    standardizedAssessment?: string;
    functionalStatus?: OTFunctionalStatusEntry[];
    progressFunctionalAreas?: string;
  };
}

// ---------------------------------------------------------------------------
// Skill library by goal category
// ---------------------------------------------------------------------------

export const OT_SKILL_LIBRARY: Record<OTGoalCategory, string[]> = {
  fine_motor: [
    'Pincer grasp',
    'Tripod grasp',
    'Cylindrical grasp',
    'In-hand manipulation',
    'Bilateral hand use',
    'Scissor skills',
    'Fastener management',
    'Handwriting / pre-writing strokes',
    'Bead stringing / lacing',
    'Peg board activities',
  ],
  sensory_processing: [
    'Tactile desensitization',
    'Vestibular input activities',
    'Proprioceptive input activities',
    'Sensory diet activities',
    'Tolerance of textures',
    'Response to auditory input',
  ],
  adl: [
    'Dressing upper body',
    'Dressing lower body',
    'Shoe management',
    'Feeding / utensil use',
    'Oral hygiene',
    'Grooming tasks',
  ],
  visual_motor: [
    'Copying shapes',
    'Tracing activities',
    'Puzzles',
    'Ball skills / eye-hand coordination',
    'Visual scanning activities',
  ],
  cognitive_play: [
    'Following multi-step directions',
    'Imitation skills',
    'Turn-taking',
    'Problem solving activities',
    'Attention to task duration',
  ],
  other: [],
};

// ---------------------------------------------------------------------------
// Factory for creating empty OT form data per note type
// ---------------------------------------------------------------------------

function createEmptySensoryEntries(): SensoryEntry[] {
  return (['tactile', 'vestibular', 'proprioceptive', 'auditory', 'visual'] as SensoryDomain[]).map(
    (domain) => ({ domain, rating: '' as const, notes: '' })
  );
}

function createEmptyADLEntries(): ADLEntry[] {
  return (['dressing', 'feeding', 'grooming', 'toileting'] as ADLArea[]).map((area) => ({
    area,
    assistLevel: '' as const,
  }));
}

export function createEmptyOTFormData(
  noteType: OTFormData['meta']['noteType']
): OTFormData {
  const isEval = noteType === 'evaluation';
  const isReEval = noteType === 're_evaluation';
  const isDischarge = noteType === 'discharge';

  return {
    subjective: {
      caregiverReport: '',
    },
    objective: {
      goalsAddressed: [],
      responseToTreatment: '',
      caregiverPresent: false,
      caregiverTrainingContent: '',
      graspPatterns: isEval || isReEval ? '' : undefined,
      inHandManipulation: isEval || isReEval ? '' : undefined,
      bilateralCoordination: isEval || isReEval ? '' : undefined,
      ageEquivalents: isEval || isReEval ? '' : undefined,
      vmiObservations: isEval || isReEval ? '' : undefined,
      sensoryProcessing: isEval || isReEval ? createEmptySensoryEntries() : undefined,
      adlStatus: isEval || isReEval ? createEmptyADLEntries() : undefined,
      playSkills: isEval ? { parallel: '', associative: '', cooperative: '' } : undefined,
    },
    assessment: {
      clinicalImpression: '',
      progressTowardGoals: isReEval || isDischarge ? [] : undefined,
    },
    plan: {
      planNextSession: noteType !== 'discharge' ? '' : '',
      frequencyDuration: isEval || isReEval ? '' : undefined,
      skilledNeedJustification: isEval || isReEval ? '' : undefined,
      dischargeReason: isDischarge ? '' : undefined,
      homeProgram: isDischarge ? '' : undefined,
      caregiverTrainingSummary: isDischarge ? '' : undefined,
      followUpInstructions: isDischarge ? '' : undefined,
      changesToTreatment: isReEval ? '' : undefined,
      updatedFrequencyDuration: isReEval ? '' : undefined,
      medicalNecessityContinued: isReEval ? '' : undefined,
    },
    billing: {
      cptCodes: [],
      icd10Codes: [],
      evaluationComplexity: isEval ? '97167' : undefined,
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
      onsetDate: isEval ? '' : undefined,
      developmentalHistory: isEval
        ? { birthHistory: '', milestones: '', diagnoses: '' }
        : undefined,
      standardizedAssessment: isEval ? '' : undefined,
      functionalStatus: isDischarge ? [] : undefined,
      progressFunctionalAreas: isReEval ? '' : undefined,
    },
  };
}
