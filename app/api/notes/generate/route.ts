/**
 * POST /api/notes/generate
 *
 * Generates a clinical narrative + medical necessity statement using AI.
 * Returns { narrative, medicalNecessity, missingFields? }
 *
 * Rate-limited to 10 requests per minute per clinic.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Rate limiter (per clinic, in-memory)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Required-field definitions per note type
// ---------------------------------------------------------------------------

const PT_REQUIRED_FIELDS: Record<string, string[]> = {
  daily_soap: [
    'subjective.subjectiveReport',
    'objective.interventions',
    'objective.responseToTreatment',
    'plan.planNextSession',
  ],
  evaluation: [
    'meta.referralDiagnosis',
    'meta.chiefComplaint',
    'objective.rom',
    'objective.strength',
    'assessment.clinicalImpression',
    'plan.frequencyDuration',
    'plan.skilledNeedJustification',
  ],
  re_evaluation: [
    'assessment.progressTowardGoals',
    'objective.rom',
    'objective.strength',
    'meta.medicalNecessityContinued',
  ],
  discharge: [
    'meta.totalVisitsCompleted',
    'plan.dischargeReason',
    'assessment.progressTowardGoals',
  ],
};

const OT_REQUIRED_FIELDS: Record<string, string[]> = {
  daily_soap: [
    'subjective.caregiverReport',
    'objective.responseToTreatment',
    'plan.planNextSession',
  ],
  evaluation: [
    'meta.referralDiagnosis',
    'meta.chiefComplaint',
    'assessment.clinicalImpression',
    'plan.frequencyDuration',
    'plan.skilledNeedJustification',
  ],
  re_evaluation: [
    'assessment.progressTowardGoals',
    'plan.medicalNecessityContinued',
  ],
  discharge: [
    'meta.totalVisitsCompleted',
    'plan.dischargeReason',
    'assessment.progressTowardGoals',
  ],
};

const ST_REQUIRED_FIELDS: Record<string, string[]> = {
  daily_soap: [
    'subjective.caregiverReport',
    'objective.responseToTreatment',
    'plan.planNextSession',
  ],
  evaluation: [
    'meta.referralDiagnosis',
    'meta.chiefComplaint',
    'assessment.clinicalImpression',
    'plan.frequencyDuration',
    'plan.skilledNeedJustification',
  ],
  re_evaluation: [
    'assessment.progressTowardGoals',
    'plan.medicalNecessityContinued',
  ],
  discharge: [
    'meta.totalVisitsCompleted',
    'plan.dischargeReason',
    'assessment.progressTowardGoals',
  ],
};

const REQUIRED_FIELDS: Record<string, Record<string, string[]>> = {
  PT: PT_REQUIRED_FIELDS,
  OT: OT_REQUIRED_FIELDS,
  ST: ST_REQUIRED_FIELDS,
};

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, key) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function detectMissingFields(
  noteType: string,
  formData: Record<string, unknown>,
  discipline?: string
): string[] {
  const disciplineFields = REQUIRED_FIELDS[discipline || 'PT'] || PT_REQUIRED_FIELDS;
  const required = disciplineFields[noteType] || [];
  return required.filter((path) => {
    const val = getNestedValue(formData, path);
    if (val === undefined || val === null || val === '') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      discipline,
      noteType,
      formData,
      patientContext,
    }: {
      discipline: string;
      noteType: string;
      formData: Record<string, unknown>;
      patientContext: Record<string, unknown>;
    } = body;

    // Validate required fields
    if (!discipline || !noteType) {
      return NextResponse.json(
        { error: 'discipline and noteType are required' },
        { status: 400 }
      );
    }

    // Rate limit per clinic
    const clinicKey = (patientContext?.clinicId as string) || 'unknown';
    if (!checkRateLimit(clinicKey)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 requests per minute per clinic.' },
        { status: 429 }
      );
    }

    // Check for missing fields
    const missingFields = detectMissingFields(noteType, formData || {}, discipline);

    // OpenAI API setup (reuse existing env vars)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

    // Build prompts
    const systemPrompt = buildSystemPrompt(discipline, noteType);
    const userPrompt = buildUserPrompt(discipline, noteType, formData || {}, patientContext || {}, missingFields);

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('[notes/generate] OpenAI error:', response.status, errData);
      return NextResponse.json(
        { error: errData?.error?.message || `OpenAI API error (${response.status})` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';

    // Parse response — expect JSON with "narrative" and "medicalNecessity"
    let narrative = '';
    let medicalNecessity = '';

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        narrative = parsed.narrative || parsed.note || raw;
        medicalNecessity = parsed.medicalNecessity || parsed.medical_necessity || '';
      } else {
        narrative = raw;
      }
    } catch {
      narrative = raw;
    }

    return NextResponse.json({
      narrative,
      medicalNecessity,
      ...(missingFields.length > 0 ? { missingFields } : {}),
    });
  } catch (error) {
    console.error('[notes/generate] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(discipline: string, noteType?: string): string {
  // PT-specific prompt
  if (discipline === 'PT') {
    return `You are a licensed physical therapist writing clinical documentation for a pediatric outpatient clinic serving patients on Texas Medicaid (TMHP) and private insurance.

For daily SOAP notes:
- Subjective: document patient/caregiver report of pain, function, and progress
- Objective: describe each intervention performed, body region, parameters, and patient response using clinical PT terminology
- Assessment: state progress toward goals, response to skilled intervention, and clinical reasoning
- Plan: describe next session focus and any modifications

For evaluations:
- Establish medical necessity by documenting specific functional deficits and how they impact the child's ability to perform age-appropriate activities
- State measurable baselines for all key functional areas
- Justify why skilled PT is required and cannot be achieved through a home program alone

For re-evaluations:
- Document measurable progress since initial evaluation
- Justify continued skilled PT need with specific functional improvements and remaining deficits

For discharge notes:
- Summarize functional gains from initial to discharge
- State goals met and any that were not met with clinical reasoning

For Medicaid (TMHP) reviewers:
- Use specific functional limitation language
- Include measurable baselines and targets
- State why the patient cannot progress without skilled PT intervention

For private insurance reviewers:
- Include functional progress, skilled need, and expected outcomes with timelines

Use the 8-minute rule context only when documenting unit justification.
Never fabricate clinical data, ROM measurements, or strength grades.
If a field is empty, state it was not assessed — never invent a value.
Return missingFields array for any required fields that were empty.

Return your response as a JSON object with exactly two fields:
{
  "narrative": "The full clinical note text",
  "medicalNecessity": "Medical necessity justification statement"
}`;
  }

  // OT-specific prompt
  if (discipline === 'OT') {
    return `You are a licensed occupational therapist writing clinical documentation for a pediatric outpatient clinic serving patients on Texas Medicaid (TMHP) and private insurance.

For daily SOAP notes:
- Subjective: summarize caregiver report in natural clinical language
- Objective: for each goal addressed, describe the skills practiced, cuing level required, and accuracy achieved in flowing clinical narrative — do not list as checkboxes
- Assessment: describe response to treatment, progress trends, sensory or behavioral observations
- Plan: describe next session focus and any modifications to approach

For each goal addressed, connect the specific functional deficit to the child's ability to participate in age-appropriate occupations — self-care, play, school readiness, social participation.

For evaluations and re-evaluations:
- Document sensory processing patterns using clinical OT terminology
- Establish medical necessity by linking deficits to occupational performance limitations
- State measurable baselines for functional performance areas

For Medicaid (TMHP) reviewers:
- Link every skill deficit to a functional limitation in a named daily occupation
- State why skilled OT is required and cannot be met through a home program alone

For private insurance reviewers:
- Include functional progress, skilled need, and expected outcomes with timelines

Never fabricate:
- Accuracy percentages
- Cuing levels
- Developmental history
- Assessment scores
- Sensory processing ratings

If a field is empty, state it was not assessed.
Return missingFields array for any clinically required fields that were empty.

Return your response as a JSON object with exactly two fields:
{
  "narrative": "The full clinical note text",
  "medicalNecessity": "Medical necessity justification statement"
}`;
  }

  // ST-specific prompt
  if (discipline === 'ST') {
    return `You are a licensed speech-language pathologist (SLP) writing clinical documentation for a pediatric outpatient clinic serving patients on Texas Medicaid (TMHP) and private insurance.

CRITICAL: Speech therapy is billed per visit — NEVER reference timed units, the 8-minute rule, or unit-based billing. Use "visit" or "session" language only.

For daily SOAP notes:
- Subjective: summarize caregiver report in natural clinical language
- Objective: for each goal addressed, describe the targets practiced, cuing level required, and accuracy achieved in flowing clinical narrative — do not list as checkboxes
- If AAC was addressed, describe the AAC system/device used, access method, and communication outcomes
- Assessment: describe response to treatment, progress trends, and communication observations
- Plan: describe next session focus, any modifications, and caregiver training provided

For each goal addressed, connect the specific communication deficit to the child's ability to participate in age-appropriate activities — social interaction, academic readiness, daily communication needs, and safety.

For evaluations:
- Document oral motor examination findings using clinical SLP terminology
- Describe receptive language, expressive language, articulation, pragmatic, and fluency observations
- If AAC is applicable, describe the AAC assessment findings and recommendations
- Establish medical necessity by linking deficits to functional communication limitations
- State measurable baselines for all communication areas assessed
- Include language of service context for bilingual populations

For re-evaluations:
- Document measurable progress since last evaluation across all communication domains
- Justify continued skilled ST need with specific functional improvements and remaining deficits

For discharge notes:
- Summarize communication gains from initial evaluation to discharge
- State goals met and any that were not met with clinical reasoning
- Include home program and caregiver training summary

For Medicaid (TMHP) reviewers:
- Link every communication deficit to a functional limitation in daily life
- State why skilled speech-language pathology is required and cannot be met through a home program alone

For private insurance reviewers:
- Include functional progress, skilled need, and expected outcomes with timelines

Never fabricate:
- Accuracy percentages or cuing levels
- Oral motor examination findings
- Assessment scores or standard deviations
- Language sample data
- AAC trial results

If a field is empty, state it was not assessed.
Return missingFields array for any clinically required fields that were empty.

Return your response as a JSON object with exactly two fields:
{
  "narrative": "The full clinical note text",
  "medicalNecessity": "Medical necessity justification statement"
}`;
  }

  // Fallback
  return `You are a licensed clinician writing clinical documentation for a pediatric outpatient therapy clinic.
Write in professional clinical language.
Include medical necessity language appropriate for both Medicaid (TMHP) and private insurance reviewers.
Never fabricate clinical findings, assessment scores, or measurements.
If a required field is missing, note it as "not documented" rather than inventing a value.

Return your response as a JSON object with exactly two fields:
{
  "narrative": "The full clinical note text",
  "medicalNecessity": "Medical necessity justification statement"
}`;
}

function buildUserPrompt(
  discipline: string,
  noteType: string,
  formData: Record<string, unknown>,
  patientContext: Record<string, unknown>,
  missingFields: string[]
): string {
  let prompt = `Generate a ${discipline} ${noteType.replace(/_/g, ' ')} note.\n\n`;

  // For OT/ST daily SOAP, strip goals where status is 'Not Addressed'
  let processedFormData = formData;
  if ((discipline === 'OT' || discipline === 'ST') && noteType === 'daily_soap') {
    const objective = formData.objective as Record<string, unknown> | undefined;
    if (objective?.goalsAddressed && Array.isArray(objective.goalsAddressed)) {
      const addressedGoals = (objective.goalsAddressed as Array<Record<string, unknown>>).filter(
        (g) => g.status !== 'Not Addressed'
      );
      processedFormData = {
        ...formData,
        objective: {
          ...objective,
          goalsAddressed: addressedGoals,
        },
      };
    }
  }

  if (Object.keys(processedFormData).length > 0) {
    prompt += `CLINICAL DATA:\n${JSON.stringify(processedFormData, null, 2)}\n\n`;
  }

  if (Object.keys(patientContext).length > 0) {
    prompt += `PATIENT CONTEXT:\n${JSON.stringify(patientContext, null, 2)}\n\n`;
  }

  if (missingFields.length > 0) {
    prompt += `MISSING REQUIRED FIELDS (note as "not documented"):\n${missingFields.join(', ')}\n\n`;
  }

  prompt += `Return ONLY a JSON object with "narrative" and "medicalNecessity" fields. Do not include any other text outside the JSON.`;

  return prompt;
}
