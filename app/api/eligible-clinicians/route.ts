/**
 * Eligible Clinicians API — insurance-aware clinician filtering for scheduling
 *
 * GET /api/eligible-clinicians?patient_id=...&clinic_id=...&visit_type=...&discipline=ST
 *
 * Returns clinicians eligible to treat a patient based on:
 *   1. The patient's active primary insurance plan
 *   2. The visit type (evaluation vs treatment)
 *   3. The discipline (currently rules only apply to ST)
 *
 * The visit_type parameter is REQUIRED — the server must know whether this
 * is an evaluation or treatment before applying any rules.
 *
 * For evaluations: Only licensed SLPs are returned regardless of insurance.
 * For treatments: Insurance-based rules determine which clinician types are eligible.
 * For non-ST disciplines: All clinicians are returned with no filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import {
  getSchedulingRule,
  applySchedulingRule,
  InsuranceRuleResult,
} from '@/lib/scheduling/insuranceRules';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patient_id');
    const clinicId = searchParams.get('clinic_id');
    const visitType = searchParams.get('visit_type');
    const discipline = searchParams.get('discipline');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }
    if (!visitType) {
      return NextResponse.json({ error: 'visit_type is required' }, { status: 400 });
    }

    // 1. Get patient's active primary insurance (only needed for ST discipline)
    let insurance: { payer_name: string; payer_type: string } | null = null;

    if (patientId && discipline === 'ST') {
      const { data } = await client
        .from('patient_insurance')
        .select('payer_name, payer_type')
        .eq('patient_id', patientId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .single();

      insurance = data;
    }

    // 2. Determine scheduling rule — evaluation bypasses insurance rules entirely
    let ruleResult: InsuranceRuleResult;

    if (discipline === 'ST') {
      ruleResult = getSchedulingRule(
        insurance?.payer_name ?? '',
        insurance?.payer_type ?? '',
        visitType
      );
    } else {
      // Non-ST disciplines: no insurance rules apply
      ruleResult = {
        hasRule: false,
        rule: null,
        allowedCredentials: [],
        allowedRoles: [],
        warningMessage: null,
        insuranceLabel: null,
        evaluationOverride: false,
        evaluationMessage: null,
      };
    }

    // 3. Fetch all clinic members with provider profiles
    const { data: members, error: membersError } = await client
      .from('clinic_memberships')
      .select('*')
      .or(`clinic_id_ref.eq.${clinicId},clinic_id.eq.${clinicId}`)
      .eq('is_active', true)
      .order('role');

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    const userIds = (members || []).map((m: Record<string, unknown>) => m.user_id as string);

    // Fetch provider profiles for credentials and discipline info
    let providerMap = new Map<string, {
      first_name: string;
      last_name: string;
      credentials: string | null;
      credential: string | null;
      primary_discipline: string | null;
    }>();

    if (userIds.length > 0) {
      const { data: providers } = await client
        .from('provider_profiles')
        .select('user_id, first_name, last_name, credentials, credential, primary_discipline')
        .in('user_id', userIds)
        .eq('is_active', true);

      if (providers) {
        providerMap = new Map(
          providers.map((p: Record<string, unknown>) => [
            p.user_id as string,
            {
              first_name: p.first_name as string,
              last_name: p.last_name as string,
              credentials: p.credentials as string | null,
              credential: p.credential as string | null,
              primary_discipline: p.primary_discipline as string | null,
            },
          ])
        );
      }
    }

    // 4. Build clinician list filtered to the requested discipline
    //    Discipline-to-role mapping: PT→[pt,pta], OT→[ot,ota], ST→[slp,slpa]
    const disciplineRoles: Record<string, string[]> = {
      PT: ['pt', 'pta'],
      OT: ['ot', 'ota'],
      ST: ['slp', 'slpa'],
    };
    const allowedDisciplineRoles = discipline ? (disciplineRoles[discipline] || []) : ['pt', 'pta', 'ot', 'ota', 'slp', 'slpa'];

    const allClinicians = (members || [])
      .filter((m: Record<string, unknown>) => allowedDisciplineRoles.includes(m.role as string))
      .map((m: Record<string, unknown>) => {
        const userId = m.user_id as string;
        const provider = providerMap.get(userId);
        const displayName = provider
          ? `${provider.first_name} ${provider.last_name}${provider.credentials ? `, ${provider.credentials}` : ''}`
          : (userId.slice(0, 8) + '...');

        return {
          user_id: userId,
          display_name: displayName,
          first_name: provider?.first_name || null,
          last_name: provider?.last_name || null,
          primary_discipline: provider?.primary_discipline || 'PT',
          role: m.role as string,
          // Use the canonical credential field if set, otherwise fall back to
          // inferring from the free-text credentials display string
          credential: provider?.credential || provider?.credentials || null,
          is_active: m.is_active as boolean,
        };
      });

    // 5. Apply insurance/evaluation rule filter (only affects ST discipline)
    const { allowed, excluded } = applySchedulingRule(allClinicians, ruleResult);

    return NextResponse.json({
      eligibleClinicians: allowed,
      excludedClinicians: excluded,
      insuranceRule: {
        hasRule: ruleResult.hasRule,
        allowedCredentials: ruleResult.allowedCredentials,
        allowedRoles: ruleResult.allowedRoles,
        warningMessage: ruleResult.warningMessage,
        insuranceLabel: ruleResult.insuranceLabel,
        evaluationOverride: ruleResult.evaluationOverride,
        evaluationMessage: ruleResult.evaluationMessage,
      },
      patientInsurance: insurance,
    });
  } catch (error) {
    console.error('Error in GET /api/eligible-clinicians:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
