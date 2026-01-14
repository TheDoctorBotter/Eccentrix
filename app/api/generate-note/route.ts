import { NextRequest, NextResponse } from 'next/server';
import { NoteInputData, StyleSettings } from '@/lib/types';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW = 60 * 1000;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 requests per minute. Please wait and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      noteType,
      inputData,
      template,
      styleSettings,
    }: {
      noteType: string;
      inputData: NoteInputData;
      template: string;
      styleSettings: StyleSettings;
    } = body;

    if (!noteType || !inputData || !template) {
      return NextResponse.json(
        { error: 'Missing required fields: noteType, inputData, template' },
        { status: 400 }
      );
    }

    if (noteType !== 'daily_soap' && noteType !== 'pt_evaluation') {
      return NextResponse.json(
        { error: 'Invalid note type. Only daily_soap and pt_evaluation are supported.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not configured in environment variables');
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.' },
        { status: 500 }
      );
    }

    const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

    console.log(`[Generate Note] Type: ${noteType}, Model: ${model}`);

    const systemPrompt = buildSystemPrompt(styleSettings);
    const userPrompt = buildUserPrompt(noteType, inputData, template);

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
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status}. Check your API key and credits.` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const generatedText = data.choices[0]?.message?.content || '';

    if (!generatedText) {
      console.error('No content generated from OpenAI');
      return NextResponse.json(
        { error: 'No content generated from AI model' },
        { status: 500 }
      );
    }

    const parsedOutput = parseGeneratedOutput(generatedText);

    console.log('[Generate Note] Success - generated', parsedOutput.note.length, 'characters');

    return NextResponse.json(parsedOutput);
  } catch (error) {
    console.error('Error generating note:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error generating note' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(styleSettings: StyleSettings): string {
  const verbosityInstruction =
    styleSettings.verbosity === 'concise'
      ? 'Write in a concise, clinical style. Keep sentences brief and to the point.'
      : 'Write in a detailed, thorough style with complete sentences and comprehensive descriptions.';

  const toneInstruction =
    styleSettings.tone === 'school_based'
      ? 'Use educational/school-based terminology appropriate for IEP documentation. Focus on functional impact in the school environment.'
      : 'Use standard outpatient physical therapy terminology appropriate for clinic documentation.';

  const acronymInstruction = styleSettings.avoid_acronyms
    ? 'Avoid using medical acronyms. Spell out all terms.'
    : 'You may use standard medical and PT acronyms (e.g., ROM, MMT, SBA, etc.).';

  return `You are an expert physical therapy documentation assistant. Your role is to generate professional, accurate clinical notes based ONLY on the provided data.

CRITICAL RULES:
1. NEVER invent measurements, findings, or clinical data not provided
2. If a field is missing or empty, write "Not assessed today" or omit that section
3. Use ONLY the information given in the user's input
4. Follow the template structure exactly
5. Include a brief "Skilled need" statement when generating daily notes (unless specifically excluded)
6. If red flags are indicated, include appropriate referral language and safety warnings

STYLE PREFERENCES:
- ${verbosityInstruction}
- ${toneInstruction}
- ${acronymInstruction}

OUTPUT FORMAT:
Return your response in the following JSON format:
{
  "note": "The complete formatted note",
  "billing_justification": "2-3 sentences justifying skilled PT services (if applicable)",
  "hep_summary": "1-2 sentences summarizing home exercise program (if applicable)"
}

Remember: Clinical accuracy and safety are paramount. Never fabricate clinical data.`;
}

function buildUserPrompt(
  noteType: string,
  inputData: NoteInputData,
  template: string
): string {
  let prompt = `Generate a ${noteType.replace('_', ' ')} note using the following template and data:\n\n`;

  prompt += `TEMPLATE:\n${template}\n\n`;

  prompt += `INPUT DATA:\n`;

  if (inputData.patient_context) {
    prompt += `\nPatient Context:\n`;
    if (inputData.patient_context.identifier) {
      prompt += `- Identifier: ${inputData.patient_context.identifier}\n`;
    }
    if (inputData.patient_context.diagnosis) {
      prompt += `- Diagnosis: ${inputData.patient_context.diagnosis}\n`;
    }
    if (inputData.patient_context.reason_for_visit) {
      prompt += `- Reason for Visit: ${inputData.patient_context.reason_for_visit}\n`;
    }
  }

  if (inputData.subjective) {
    prompt += `\nSubjective:\n`;
    if (inputData.subjective.symptoms) {
      prompt += `- Symptoms: ${inputData.subjective.symptoms}\n`;
    }
    if (inputData.subjective.pain_level !== undefined) {
      prompt += `- Pain Level: ${inputData.subjective.pain_level}/10\n`;
    }
    if (inputData.subjective.functional_limits) {
      prompt += `- Functional Limitations: ${inputData.subjective.functional_limits}\n`;
    }
    if (inputData.subjective.goals) {
      prompt += `- Goals: ${inputData.subjective.goals}\n`;
    }
    if (inputData.subjective.red_flags) {
      prompt += `- RED FLAGS PRESENT: ${inputData.subjective.red_flag_description || 'See description'}\n`;
      prompt += `- IMPORTANT: Include referral recommendation and safety precautions\n`;
    }
  }

  if (inputData.objective) {
    prompt += `\nObjective:\n`;
    if (inputData.objective.interventions && inputData.objective.interventions.length > 0) {
      prompt += `- Interventions Performed:\n`;
      inputData.objective.interventions.forEach((intervention) => {
        prompt += `  * ${intervention.name}`;
        if (intervention.dosage) {
          prompt += ` - ${intervention.dosage}`;
        }
        if (intervention.cues) {
          prompt += ` - Cues: ${intervention.cues}`;
        }
        prompt += `\n`;
      });
    }
    if (inputData.objective.assist_level) {
      prompt += `- Assist Level: ${inputData.objective.assist_level}\n`;
    }
    if (inputData.objective.tolerance) {
      prompt += `- Tolerance: ${inputData.objective.tolerance}\n`;
    }
    if (inputData.objective.key_measures) {
      prompt += `- Key Measures: ${inputData.objective.key_measures}\n`;
    }
  }

  if (inputData.assessment) {
    prompt += `\nAssessment:\n`;
    if (inputData.assessment.progression) {
      prompt += `- Progression since last visit: ${inputData.assessment.progression}\n`;
    }
    if (inputData.assessment.impairments) {
      prompt += `- Impairments: ${inputData.assessment.impairments}\n`;
    }
    if (inputData.assessment.skilled_need) {
      prompt += `- Skilled Need: ${inputData.assessment.skilled_need}\n`;
    }
    if (inputData.assessment.response_to_treatment) {
      prompt += `- Response to Treatment: ${inputData.assessment.response_to_treatment}\n`;
    }
  }

  if (inputData.plan) {
    prompt += `\nPlan:\n`;
    if (inputData.plan.frequency_duration) {
      prompt += `- Frequency/Duration: ${inputData.plan.frequency_duration}\n`;
    }
    if (inputData.plan.next_session_focus) {
      prompt += `- Next Session Focus: ${inputData.plan.next_session_focus}\n`;
    }
    if (inputData.plan.hep) {
      prompt += `- Home Exercise Program: ${inputData.plan.hep}\n`;
    }
    if (inputData.plan.education_provided) {
      prompt += `- Education Provided: ${inputData.plan.education_provided}\n`;
    }
  }

  prompt += `\nNow generate the complete note following the template structure. Return as JSON with "note", "billing_justification", and "hep_summary" fields.`;

  return prompt;
}

function parseGeneratedOutput(text: string): {
  note: string;
  billing_justification: string;
  hep_summary: string;
} {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        note: parsed.note || text,
        billing_justification: parsed.billing_justification || '',
        hep_summary: parsed.hep_summary || '',
      };
    }
  } catch (e) {
    console.error('Failed to parse JSON from response:', e);
  }

  return {
    note: text,
    billing_justification: '',
    hep_summary: '',
  };
}
