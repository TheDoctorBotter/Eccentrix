/**
 * CPT Code Suggestion Engine
 * POST: Analyze a finalized note's visit type, documented interventions, and treatment
 *       time to suggest the correct CPT codes with units, modifiers, and charge amounts.
 *
 * Input:  { visit_type, interventions, total_minutes, start_time, end_time, diagnosis_codes }
 * Output: { suggestions: Array<{ cpt_code, cpt_code_id, description, units, minutes, modifier_1, modifier_2, charge_amount, is_timed, category }> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { calculateBillingUnits } from '@/lib/types';

// Map intervention categories to CPT codes
const CATEGORY_TO_CPT: Record<string, string> = {
  'Therapeutic Exercise': '97110',
  'Manual Therapy': '97140',
  'Therapeutic Activities': '97530',
  'Neuromuscular Re-education': '97112',
  'Gait Training': '97116',
  'Balance Training': '97110', // Often billed under 97110
  'Functional Training': '97530',
  'Aquatic Therapy': '97113',
  'Group Therapy': '97150',
};

// Map intervention names to CPT codes (more specific than category)
const INTERVENTION_NAME_TO_CPT: Record<string, string> = {
  // Therapeutic Exercise (97110)
  'stretching': '97110',
  'rom exercises': '97110',
  'strengthening': '97110',
  'core stabilization': '97110',
  'flexibility': '97110',
  'resistance training': '97110',
  'home exercise instruction': '97110',
  // Manual Therapy (97140)
  'soft tissue mobilization': '97140',
  'joint mobilization': '97140',
  'manual stretching': '97140',
  'myofascial release': '97140',
  'trigger point release': '97140',
  'manual traction': '97140',
  'massage': '97140',
  // Therapeutic Activities (97530)
  'functional mobility training': '97530',
  'dynamic balance activities': '97530',
  'task-specific training': '97530',
  'body mechanics training': '97530',
  'transfer training': '97530',
  'activity modification': '97530',
  // Neuromuscular Re-education (97112)
  'proprioceptive training': '97112',
  'balance training': '97112',
  'postural re-education': '97112',
  'coordination exercises': '97112',
  'motor control training': '97112',
  // Gait Training (97116)
  'gait training': '97116',
  'ambulation training': '97116',
  'stair training': '97116',
  // Modalities - Untimed
  'hot pack': '97010',
  'cold pack': '97010',
  'ice': '97010',
  'mechanical traction': '97012',
  'electrical stimulation unattended': '97014',
  'paraffin bath': '97018',
  // Modalities - Timed
  'electrical stimulation': '97032',
  'e-stim': '97032',
  'iontophoresis': '97033',
  'ultrasound': '97035',
  // Orthotic
  'orthotic fitting': '97760',
  'orthotic training': '97760',
};

// Map visit types to evaluation CPT codes by discipline
const EVAL_CPT_BY_DISCIPLINE: Record<string, Record<string, string>> = {
  PT: {
    evaluation: '97163',
    eval_low: '97161',
    eval_moderate: '97162',
    eval_high: '97163',
    re_evaluation: '97164',
    're-evaluation': '97164',
  },
  OT: {
    evaluation: '97167',
    eval_low: '97165',
    eval_moderate: '97166',
    eval_high: '97167',
    re_evaluation: '97168',
    're-evaluation': '97168',
  },
  ST: {
    evaluation: '92523',
    eval_fluency: '92521',
    eval_sound: '92522',
    eval_sound_lang: '92523',
    eval_voice: '92524',
    eval_swallow: '92610',
    eval_aac: '92605',
    re_evaluation: '92523',
    're-evaluation': '92523',
  },
};

// Discipline-to-modifier mapping
const DISCIPLINE_MODIFIER: Record<string, string> = {
  PT: 'GP',
  OT: 'GO',
  ST: 'GN',
};

interface InterventionInput {
  id: string;
  name: string;
  category?: string;
  dosage?: string;
}

function matchInterventionToCpt(intervention: InterventionInput): string | null {
  const name = intervention.name.toLowerCase().trim();

  // Try exact name match first
  for (const [key, cpt] of Object.entries(INTERVENTION_NAME_TO_CPT)) {
    if (name.includes(key)) {
      return cpt;
    }
  }

  // Fall back to category match
  if (intervention.category) {
    return CATEGORY_TO_CPT[intervention.category] || null;
  }

  return null;
}

function parseDosageMinutes(dosage?: string): number {
  if (!dosage) return 15; // default to 1 unit
  const match = dosage.match(/(\d+)\s*(?:min|minutes?|m)/i);
  if (match) return parseInt(match[1], 10);

  // Try just a number (assume minutes)
  const numMatch = dosage.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return 15;
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      visit_type,
      interventions,
      total_minutes,
      start_time,
      end_time,
      discipline: rawDiscipline,
      actual_duration_minutes,
    } = body as {
      visit_type?: string;
      interventions?: InterventionInput[];
      total_minutes?: number;
      start_time?: string;
      end_time?: string;
      discipline?: string;
      actual_duration_minutes?: number | null;
    };

    const discipline = rawDiscipline === 'OT' ? 'OT' : rawDiscipline === 'ST' ? 'ST' : 'PT';
    const modifier = DISCIPLINE_MODIFIER[discipline] || 'GP';

    // Fetch active CPT codes filtered by discipline
    const { data: cptCodes, error: cptError } = await client
      .from('cpt_codes')
      .select('*')
      .eq('is_active', true)
      .eq('discipline', discipline);

    if (cptError) {
      return NextResponse.json({ error: cptError.message }, { status: 500 });
    }

    const cptMap = new Map(
      (cptCodes || []).map((c: { code: string; id: string; description: string; is_timed: boolean; category: string; default_units: number; unit_minutes: number }) => [c.code, c])
    );

    // Calculate total session time — use actual_duration_minutes when present,
    // falling back to total_minutes or start/end calculation
    let scheduledMinutes = total_minutes || 0;
    if (!scheduledMinutes && start_time && end_time) {
      const [sH, sM] = start_time.split(':').map(Number);
      const [eH, eM] = end_time.split(':').map(Number);
      scheduledMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    }
    const sessionMinutes = actual_duration_minutes ?? scheduledMinutes;

    const suggestions: Array<{
      cpt_code: string;
      cpt_code_id: string;
      description: string;
      units: number;
      minutes: number;
      modifier_1: string | null;
      modifier_2: string | null;
      charge_amount: number;
      is_timed: boolean;
      category: string;
    }> = [];

    // 1. Add evaluation code if visit type is evaluation/re-evaluation
    if (visit_type && (visit_type.includes('eval') || visit_type === 're_evaluation' || visit_type === 're-evaluation')) {
      const evalMap = EVAL_CPT_BY_DISCIPLINE[discipline] || EVAL_CPT_BY_DISCIPLINE['PT'];
      const evalCpt = evalMap[visit_type] || evalMap['evaluation'];
      const cptRecord = cptMap.get(evalCpt) as { id: string; code: string; description: string; is_timed: boolean; category: string } | undefined;

      if (cptRecord) {
        suggestions.push({
          cpt_code: evalCpt,
          cpt_code_id: cptRecord.id,
          description: cptRecord.description,
          units: 1,
          minutes: 0,
          modifier_1: modifier,
          modifier_2: null,
          charge_amount: 0,
          is_timed: false,
          category: cptRecord.category || 'Evaluation',
        });
      }
    }

    // 2. Map documented interventions to CPT codes
    if (interventions && interventions.length > 0) {
      // Group interventions by their mapped CPT code
      const cptGroups = new Map<string, { minutes: number; names: string[] }>();

      for (const intervention of interventions) {
        const cptCode = matchInterventionToCpt(intervention);
        if (!cptCode) continue;

        const mins = parseDosageMinutes(intervention.dosage);
        const existing = cptGroups.get(cptCode);
        if (existing) {
          existing.minutes += mins;
          existing.names.push(intervention.name);
        } else {
          cptGroups.set(cptCode, { minutes: mins, names: [intervention.name] });
        }
      }

      // Convert groups to suggestions
      for (const [code, group] of Array.from(cptGroups.entries())) {
        const cptRecord = cptMap.get(code) as { id: string; code: string; description: string; is_timed: boolean; category: string } | undefined;
        if (!cptRecord) continue;

        const isTimed = cptRecord.is_timed;
        const units = isTimed ? calculateBillingUnits(group.minutes) : 1;

        // Skip if timed code but minutes too low for a unit
        if (isTimed && units === 0) continue;

        suggestions.push({
          cpt_code: code,
          cpt_code_id: cptRecord.id,
          description: cptRecord.description,
          units,
          minutes: group.minutes,
          modifier_1: modifier,
          modifier_2: null,
          charge_amount: 0,
          is_timed: isTimed,
          category: cptRecord.category || 'Treatment',
        });
      }
    }

    // 3. If no interventions but we have session time and it's a treatment visit,
    //    suggest a generic 97110 (Therapeutic Exercise) as a starting point
    if (suggestions.length === 0 && visit_type === 'treatment' && sessionMinutes >= 8) {
      const defaultCpt = cptMap.get('97110') as { id: string; code: string; description: string; is_timed: boolean; category: string } | undefined;
      if (defaultCpt) {
        suggestions.push({
          cpt_code: '97110',
          cpt_code_id: defaultCpt.id,
          description: defaultCpt.description,
          units: calculateBillingUnits(sessionMinutes),
          minutes: sessionMinutes,
          modifier_1: modifier,
          modifier_2: null,
          charge_amount: 0,
          is_timed: true,
          category: defaultCpt.category || 'Therapeutic Exercise',
        });
      }
    }

    return NextResponse.json({
      suggestions,
      session_minutes: sessionMinutes,
      total_units: suggestions.reduce((sum, s) => sum + s.units, 0),
    });
  } catch (error) {
    console.error('Error in POST /api/billing/suggest-cpt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
