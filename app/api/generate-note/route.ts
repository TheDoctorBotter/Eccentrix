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
    console.log('[Generate Note] Payload keys:', Object.keys(body));

    const {
      noteType,
      inputData,
      template,
      styleSettings,
      discipline: rawDiscipline,
    }: {
      noteType: string;
      inputData: NoteInputData;
      template: string;
      styleSettings: StyleSettings;
      discipline?: string;
    } = body;

    const discipline = rawDiscipline === 'OT' ? 'OT' : rawDiscipline === 'ST' ? 'ST' : 'PT';

    if (!noteType) {
      console.error('[Generate Note] Validation failed: Missing noteType');
      return NextResponse.json(
        { error: 'Missing required field: noteType' },
        { status: 400 }
      );
    }

    if (!inputData) {
      console.error('[Generate Note] Validation failed: Missing inputData');
      return NextResponse.json(
        { error: 'Missing required field: inputData' },
        { status: 400 }
      );
    }

    if (!template) {
      console.error('[Generate Note] Validation failed: Missing template');
      return NextResponse.json(
        { error: 'Missing required field: template' },
        { status: 400 }
      );
    }

    if (noteType !== 'daily_soap' && noteType !== 'pt_evaluation') {
      console.error('[Generate Note] Validation failed: Invalid noteType:', noteType);
      return NextResponse.json(
        { error: 'Invalid note type. Only daily_soap and pt_evaluation are supported.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[Generate Note] OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Missing OPENAI_API_KEY. Please configure your OpenAI API key in the .env file.' },
        { status: 500 }
      );
    }

    const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

    console.log(`[Generate Note] Request - Type: ${noteType}, Model: ${model}, API Base: ${apiBase}`);

    const systemPrompt = buildSystemPrompt(styleSettings, discipline);
    const userPrompt = buildUserPrompt(noteType, inputData, template, discipline);

    console.log('[Generate Note] Calling OpenAI API...');

    let response;
    try {
      response = await fetch(`${apiBase}/chat/completions`, {
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
    } catch (fetchError) {
      console.error('[Generate Note] Network error calling OpenAI:', fetchError);
      return NextResponse.json(
        {
          error: 'Network error connecting to OpenAI API',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown network error',
        },
        { status: 500 }
      );
    }

    if (!response.ok) {
      let errorData;
      let errorMessage = `OpenAI API returned status ${response.status}`;

      try {
        errorData = await response.json();
        console.error('[Generate Note] OpenAI API error:', response.status, JSON.stringify(errorData));

        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }

        if (response.status === 401) {
          errorMessage = 'Invalid OpenAI API key. Please check your OPENAI_API_KEY in .env file.';
        } else if (response.status === 429) {
          errorMessage = 'OpenAI rate limit exceeded or insufficient credits. Please check your OpenAI account.';
        } else if (response.status === 404) {
          errorMessage = `Model '${model}' not found. Please check your OPENAI_MODEL setting.`;
        }
      } catch (parseError) {
        const textError = await response.text();
        console.error('[Generate Note] Failed to parse error response:', textError);
      }

      return NextResponse.json(
        {
          error: errorMessage,
          details: errorData?.error?.message || 'Check server logs for details',
        },
        { status: response.status >= 500 ? 500 : 400 }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('[Generate Note] Failed to parse OpenAI response:', parseError);
      return NextResponse.json(
        {
          error: 'Failed to parse OpenAI response',
          details: parseError instanceof Error ? parseError.message : 'JSON parse error',
        },
        { status: 500 }
      );
    }

    const generatedText = data.choices?.[0]?.message?.content || '';

    if (!generatedText) {
      console.error('[Generate Note] No content in response:', JSON.stringify(data));
      return NextResponse.json(
        { error: 'No content generated from AI model. Please try again.' },
        { status: 500 }
      );
    }

    console.log('[Generate Note] Raw AI response (first 500 chars):', generatedText.substring(0, 500));

    const parsedOutput = parseGeneratedOutput(generatedText);

    // Log whether headers ended up in the final note
    const hasHeaders = /^SUBJECTIVE\s*:/m.test(parsedOutput.note);
    console.log('[Generate Note] Success - generated', parsedOutput.note.length, 'characters, SOAP headers present:', hasHeaders);
    console.log('[Generate Note] Final note (first 300 chars):', parsedOutput.note.substring(0, 300));

    return NextResponse.json(parsedOutput);
  } catch (error) {
    console.error('[Generate Note] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error generating note';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[Generate Note] Error stack:', errorStack);

    return NextResponse.json(
      {
        error: errorMessage,
        details: 'An unexpected error occurred. Check server logs for more information.',
      },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(styleSettings: StyleSettings, discipline: string = 'PT'): string {
  const verbosityInstruction =
    styleSettings.verbosity === 'concise'
      ? 'Write in a concise, clinical style. Keep sentences brief and to the point.'
      : 'Write in a detailed, thorough style with complete sentences and comprehensive descriptions.';

  const toneInstruction =
    styleSettings.tone === 'school_based'
      ? 'Use educational/school-based terminology appropriate for IEP documentation. Focus on functional impact in the school environment.'
      : discipline === 'PT'
        ? 'Use standard outpatient physical therapy terminology appropriate for clinic documentation.'
        : discipline === 'OT'
          ? 'Use standard occupational therapy terminology appropriate for clinic documentation.'
          : 'Use standard speech-language pathology terminology appropriate for clinic documentation.';

  const acronymInstruction = styleSettings.avoid_acronyms
    ? 'Avoid using medical acronyms. Spell out all terms.'
    : discipline === 'PT'
      ? 'You may use standard medical and PT acronyms (e.g., ROM, MMT, SBA, etc.).'
      : discipline === 'OT'
        ? 'You may use standard medical and OT acronyms (e.g., ADL, VMI, SBA, etc.).'
        : 'You may use standard medical and SLP acronyms (e.g., AAC, MLU, SSD, etc.).';

  const disciplineContext = getDisciplineContext(discipline);
  const disciplineName = discipline === 'PT' ? 'physical therapy' : discipline === 'OT' ? 'occupational therapy' : 'speech-language pathology';
  const skilledLabel = discipline === 'PT' ? 'PT' : discipline === 'OT' ? 'OT' : 'SLP';

  return `You are an expert pediatric ${disciplineName} documentation assistant. Your role is to generate professional, accurate clinical notes based ONLY on the provided data.

${disciplineContext}

CRITICAL RULES:
1. NEVER invent measurements, findings, or clinical data not provided
2. If a field is missing or empty, write "Not provided" for demographic fields, or "Not assessed today" for clinical sections
3. Use ONLY the information given in the user's input
4. Follow the template structure exactly, replacing placeholders like {{patient_name}}, {{date_of_birth}}, {{diagnosis}}, {{referral_source}}, {{date_of_service}} with actual values or "Not provided"
5. ALWAYS include "Date of Service: [date]" near the top of the note if provided, otherwise write "Date of Service: Not provided"
6. Include a brief "Skilled need" statement when generating daily notes (unless specifically excluded)
7. If red flags are indicated, include appropriate referral language and safety warnings
8. Reference pediatric developmental expectations appropriate for the child's age
9. Structure goals in family-friendly language that parents/caregivers can understand
10. Strengthen skilled care justification by linking deficits to functional impact
11. Mark all notes as DRAFT requiring clinician review

STYLE PREFERENCES:
- ${verbosityInstruction}
- ${toneInstruction}
- ${acronymInstruction}

OUTPUT FORMAT:
Return your response in the following JSON format with EACH SOAP section as a SEPARATE field. Do NOT include section headers like "SUBJECTIVE:" or "OBJECTIVE:" in the content — just the section body text. The application will add headers automatically.

{
  "preamble": "Any content before the SOAP sections (Date of Service, patient demographics, diagnosis, etc.)",
  "subjective": "Content for the SUBJECTIVE section (body text only, NO header)",
  "objective": "Content for the OBJECTIVE section (body text only, NO header)",
  "assessment": "Content for the ASSESSMENT section (body text only, NO header)",
  "plan": "Content for the PLAN section (body text only, NO header)",
  "billing_justification": "2-3 sentences justifying skilled ${skilledLabel} services (only for evaluations and progress notes, NOT daily notes)",
  "hep_summary": "1-2 sentences summarizing home program (only for evaluations and progress notes, NOT daily notes)"
}

CRITICAL: Each section field must contain ONLY the body text. Do NOT repeat the section name/header inside the field value.

For daily SOAP notes: Do NOT include billing_justification or hep_summary. Set them to empty strings. These sections are addressed in progress updates and evaluations only.

Remember: Clinical accuracy and safety are paramount. Never fabricate clinical data.`;
}

function getDisciplineContext(discipline: string): string {
  if (discipline === 'OT') {
    return `DISCIPLINE FOCUS: Occupational Therapy (OT) — Pediatric
Clinical areas of focus: fine motor skills (grasp, pinch, manipulation), sensory processing and integration, activities of daily living (dressing, feeding, grooming), visual motor integration, handwriting, self-care skills, play skills, and upper extremity function.
Typical interventions: sensory integration activities, fine motor activities, ADL training, visual motor tasks, handwriting practice, therapeutic play, self-care training, sensory diet activities.
Use OT-specific outcome measures and developmental milestones. Reference age-appropriate functional expectations for fine motor, self-care, and sensory processing.`;
  }
  if (discipline === 'ST') {
    return `DISCIPLINE FOCUS: Speech-Language Pathology (ST/SLP) — Pediatric
Clinical areas of focus: articulation and phonological processes, expressive language, receptive language, fluency (stuttering), voice disorders, pragmatics (social communication), augmentative and alternative communication (AAC), feeding and swallowing.
Typical interventions: articulation therapy, language intervention, fluency techniques, AAC training and device programming, oral motor exercises, feeding therapy, social skills groups.
Use SLP-specific outcome measures and language developmental milestones. Reference age-appropriate communication expectations. Note: speech therapy evaluation codes (92521-92610) are NOT timed.`;
  }
  // Default: PT
  return `DISCIPLINE FOCUS: Physical Therapy (PT) — Pediatric
Clinical areas of focus: functional mobility, gross motor development, strength, range of motion, pain management, gait and locomotion, balance and coordination, transfers, wheelchair mobility.
Typical interventions: therapeutic exercise, manual therapy, gait training, neuromuscular reeducation, balance training, functional mobility training, modalities.
Use PT-specific outcome measures and gross motor developmental milestones. Reference age-appropriate functional expectations for mobility, strength, and balance.`;
}

function buildUserPrompt(
  noteType: string,
  inputData: NoteInputData,
  template: string,
  discipline: string = 'PT'
): string {
  const disciplineName = discipline === 'PT' ? 'Physical Therapy' : discipline === 'OT' ? 'Occupational Therapy' : 'Speech Therapy';
  let prompt = `Generate a ${disciplineName} ${noteType.replace('_', ' ')} note using the following template and data:\n\n`;

  prompt += `TEMPLATE:\n${template}\n\n`;

  prompt += `INPUT DATA:\n`;

  if (inputData.dateOfService) {
    prompt += `\nDate of Service: ${inputData.dateOfService}\n`;
  }

  if (inputData.patientDemographic) {
    prompt += `\nPatient Demographic:\n`;
    if (inputData.patientDemographic.patientName) {
      prompt += `- Patient Name: ${inputData.patientDemographic.patientName}\n`;
    }
    if (inputData.patientDemographic.dateOfBirth) {
      prompt += `- Date of Birth: ${inputData.patientDemographic.dateOfBirth}\n`;
    }
    if (inputData.patientDemographic.diagnosis) {
      prompt += `- Diagnosis: ${inputData.patientDemographic.diagnosis}\n`;
    }
    if (inputData.patientDemographic.referralSource) {
      prompt += `- Referral Source: ${inputData.patientDemographic.referralSource}\n`;
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
      const impairmentsList = Array.isArray(inputData.assessment.impairments)
        ? inputData.assessment.impairments.join(', ')
        : inputData.assessment.impairments;
      prompt += `- Impairments: ${impairmentsList}\n`;
      if (!inputData.assessment.skilled_need) {
        const skilledLabel = discipline === 'PT' ? 'PT' : discipline === 'OT' ? 'OT' : 'SLP';
        prompt += `- Generate a skilled need statement justifying continued skilled ${skilledLabel} services to address these impairments.\n`;
      }
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
      const focusList = Array.isArray(inputData.plan.next_session_focus)
        ? inputData.plan.next_session_focus.join(', ')
        : inputData.plan.next_session_focus;
      prompt += `- Next Session Focus: ${focusList}\n`;
    }
    if (inputData.plan.hep) {
      prompt += `- Home Exercise Program: ${inputData.plan.hep}\n`;
    }
    if (inputData.plan.education_provided) {
      prompt += `- Education Provided: ${inputData.plan.education_provided}\n`;
    }
  }

  prompt += `\nNow generate the note content for each SOAP section separately. Return as JSON with "preamble", "subjective", "objective", "assessment", "plan", "billing_justification", and "hep_summary" fields. Do NOT include section headers (like "SUBJECTIVE:") inside the field values — the application adds those automatically.`;

  return prompt;
}

/**
 * Strip a SOAP header from the beginning of a section value, in case the AI
 * included it despite instructions (e.g. "SUBJECTIVE:\nPatient reports...").
 */
function stripSectionHeader(value: string, header: string): string {
  const pattern = new RegExp(`^\\s*${header}\\s*:\\s*\\n?`, 'i');
  return value.replace(pattern, '').trim();
}

/**
 * Try to split a flat note string into SOAP sections by finding header-like
 * lines. Returns an object with preamble + sections, or null if we can't find
 * at least the SUBJECTIVE header.
 */
function splitNoteIntoSections(note: string): {
  preamble: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
} | null {
  // Match headers like "SUBJECTIVE:", "Subjective:", "**SUBJECTIVE**:", "S:", etc.
  const headerPattern = /^(?:\*{0,2})(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN(?:\s+OF\s+CARE)?)(?:\*{0,2})\s*:/gim;

  const matches: { header: string; index: number }[] = [];
  let match;
  while ((match = headerPattern.exec(note)) !== null) {
    matches.push({ header: match[1].toUpperCase(), index: match.index });
  }

  // Need at least SUBJECTIVE to consider this parseable
  if (!matches.some((m) => m.header === 'SUBJECTIVE')) {
    return null;
  }

  const result = { preamble: '', subjective: '', objective: '', assessment: '', plan: '' };

  // Everything before the first header is preamble
  result.preamble = note.slice(0, matches[0].index).trim();

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : note.length;
    const sectionText = note.slice(start, end);
    // Remove the header line itself from the content
    const contentOnly = sectionText.replace(/^.*?:\s*\n?/, '').trim();

    const h = matches[i].header;
    if (h === 'SUBJECTIVE') result.subjective = contentOnly;
    else if (h === 'OBJECTIVE') result.objective = contentOnly;
    else if (h === 'ASSESSMENT') result.assessment = contentOnly;
    else if (h.startsWith('PLAN')) result.plan = contentOnly;
  }

  return result;
}

/**
 * Final safety net: ensure the note contains all four SOAP headers.
 * If they're missing, inject them.
 */
function ensureSoapHeaders(note: string): string {
  // Only skip if all four headers are on their OWN lines (no inline content)
  const requiredHeaders = ['SUBJECTIVE', 'OBJECTIVE', 'ASSESSMENT', 'PLAN'];
  const hasAllOnOwnLines = requiredHeaders.every((h) =>
    new RegExp(`^${h}[:\\s]*$`, 'im').test(note)
  );

  if (hasAllOnOwnLines) {
    return note;
  }

  // Try to find headers with flexible casing and normalize them
  const parsed = splitNoteIntoSections(note);
  if (parsed) {
    const sections: string[] = [];
    if (parsed.preamble) sections.push(parsed.preamble);
    sections.push(`SUBJECTIVE:\n${parsed.subjective || 'Not provided.'}`);
    sections.push(`OBJECTIVE:\n${parsed.objective || 'Not provided.'}`);
    sections.push(`ASSESSMENT:\n${parsed.assessment || 'Not provided.'}`);
    sections.push(`PLAN:\n${parsed.plan || 'Not provided.'}`);
    return sections.join('\n\n');
  }

  // Could not parse sections at all — wrap the entire note under SUBJECTIVE
  // and add empty stubs for the rest so headers always appear
  const sections: string[] = [];
  sections.push(`SUBJECTIVE:\n${note.trim()}`);
  sections.push('OBJECTIVE:\nNot assessed today.');
  sections.push('ASSESSMENT:\nNot assessed today.');
  sections.push('PLAN:\nNot assessed today.');
  console.warn('[Generate Note] Could not detect SOAP sections in AI output — injected default headers.');
  return sections.join('\n\n');
}

function parseGeneratedOutput(text: string): {
  note: string;
  billing_justification: string;
  hep_summary: string;
} {
  let note = '';
  let billing_justification = '';
  let hep_summary = '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // If the AI returned structured SOAP sections, assemble with hardcoded headers
      if (parsed.subjective || parsed.objective || parsed.assessment || parsed.plan) {
        const sections: string[] = [];

        if (parsed.preamble) {
          sections.push(stripSectionHeader(parsed.preamble, 'PREAMBLE'));
        }

        sections.push(`SUBJECTIVE:\n${stripSectionHeader(parsed.subjective || 'Not provided.', 'SUBJECTIVE')}`);
        sections.push(`OBJECTIVE:\n${stripSectionHeader(parsed.objective || 'Not provided.', 'OBJECTIVE')}`);
        sections.push(`ASSESSMENT:\n${stripSectionHeader(parsed.assessment || 'Not provided.', 'ASSESSMENT')}`);
        sections.push(`PLAN:\n${stripSectionHeader(parsed.plan || 'Not provided.', 'PLAN')}`);

        note = sections.join('\n\n');
        billing_justification = parsed.billing_justification || '';
        hep_summary = parsed.hep_summary || '';
      } else {
        // Fallback: AI returned a single "note" field
        note = parsed.note || text;
        billing_justification = parsed.billing_justification || '';
        hep_summary = parsed.hep_summary || '';
      }
    } else {
      note = text;
    }
  } catch (e) {
    console.error('Failed to parse JSON from response:', e);
    note = text;
  }

  // SAFETY NET: Always ensure SOAP headers are present in the final note
  note = ensureSoapHeaders(note);

  return { note, billing_justification, hep_summary };
}
