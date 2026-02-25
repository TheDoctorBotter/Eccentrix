/**
 * Buckeye EMR — Claim Submission API Route
 * POST /api/claims/submit
 *
 * Accepts a claim ID, pulls claim data from the database, generates an
 * ANSI X12 837P file, optionally submits to TMHP via SFTP, and stores
 * the generated file and submission status on the claim record.
 *
 * Request body (JSON):
 *   {
 *     "claimId": "uuid-of-claim",
 *     "submitViaSftp": true  // optional, default false
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "ediContent": "ISA*00*...",
 *     "ediContentFormatted": "ISA*00*...\nGS*HC*...",
 *     "claimStatus": "generated" | "submitted",
 *     "sftpResult": { ... }  // only if submitViaSftp was true
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generate837P } from '@/src/lib/edi/generate837P';
import { uploadToTMHP } from '@/src/lib/edi/submitToTMHP';
import type {
  Claim837PInput,
  ClaimSubmitRequest,
  TMHPSftpConfig,
} from '@/src/lib/edi/types';

// ============================================================================
// Supabase Client (server-side)
// ============================================================================

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body: ClaimSubmitRequest = await request.json();
    const { claimId, submitViaSftp = false } = body;

    if (!claimId) {
      return NextResponse.json(
        { success: false, error: 'claimId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // ======================================================================
    // 1. Fetch claim with lines
    // ======================================================================
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('*, claim_lines(*)')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { success: false, error: `Claim not found: ${claimError?.message || 'No data'}` },
        { status: 404 }
      );
    }

    // ======================================================================
    // 2. Fetch clinic (billing provider settings)
    // ======================================================================
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', claim.clinic_id)
      .single();

    if (clinicError || !clinic) {
      return NextResponse.json(
        { success: false, error: `Clinic not found: ${clinicError?.message || 'No data'}` },
        { status: 404 }
      );
    }

    // ======================================================================
    // 3. Fetch patient
    // ======================================================================
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', claim.patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { success: false, error: `Patient not found: ${patientError?.message || 'No data'}` },
        { status: 404 }
      );
    }

    // ======================================================================
    // 4. Validate billing settings
    // ======================================================================
    const missingFields: string[] = [];
    if (!clinic.billing_npi) missingFields.push('Billing NPI');
    if (!clinic.tax_id) missingFields.push('Tax ID');
    if (!clinic.name) missingFields.push('Clinic Name');
    if (!clinic.billing_address) missingFields.push('Billing Address');
    if (!clinic.billing_city) missingFields.push('Billing City');
    if (!clinic.billing_state) missingFields.push('Billing State');
    if (!clinic.billing_zip) missingFields.push('Billing ZIP');

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing billing settings: ${missingFields.join(', ')}. Configure in Settings > Billing.`,
        },
        { status: 400 }
      );
    }

    // ======================================================================
    // 5. Build claim data for 837P generation
    // ======================================================================

    // Parse rendering provider name (stored as "Last, First")
    let renderingLastName = '';
    let renderingFirstName = '';
    if (claim.rendering_provider_name) {
      const parts = claim.rendering_provider_name.split(',').map((s: string) => s.trim());
      renderingLastName = parts[0] || '';
      renderingFirstName = parts[1] || '';
    }

    // Sort claim lines by line_number
    const sortedLines = (claim.claim_lines || []).sort(
      (a: { line_number: number }, b: { line_number: number }) => a.line_number - b.line_number
    );

    // Map gender from database format to EDI format
    const genderMap: Record<string, 'M' | 'F' | 'U'> = {
      male: 'M', female: 'F', M: 'M', F: 'F',
    };
    const patientGender = genderMap[patient.gender?.toLowerCase() || ''] || 'U';

    // Parse patient address (may be a single string or structured)
    const patientAddress = patient.address || '';

    const claimInput: Claim837PInput = {
      submitter: {
        name: clinic.name,
        submitterId: clinic.submitter_id || clinic.billing_npi || '',
        contactName: clinic.name,
        contactPhone: (clinic.phone || '0000000000').replace(/\D/g, ''),
        contactEmail: clinic.email || undefined,
      },
      billingProvider: {
        name: clinic.name,
        npi: clinic.billing_npi || '',
        taxonomyCode: clinic.taxonomy_code || '225100000X',
        address1: clinic.billing_address || '',
        city: clinic.billing_city || '',
        state: clinic.billing_state || 'TX',
        zip: clinic.billing_zip || '',
        taxId: (clinic.tax_id || '').replace(/\D/g, ''),
      },
      renderingProvider: {
        firstName: renderingFirstName || clinic.name,
        lastName: renderingLastName || '',
        npi: claim.rendering_provider_npi || clinic.billing_npi || '',
        taxonomyCode: clinic.taxonomy_code || '225100000X',
      },
      patient: {
        firstName: patient.first_name || '',
        lastName: patient.last_name || '',
        dateOfBirth: patient.date_of_birth
          ? new Date(patient.date_of_birth).toISOString().split('T')[0]
          : '',
        gender: patientGender,
        medicaidId: claim.subscriber_id || patient.medicaid_id || patient.insurance_id || '',
        address1: patientAddress,
        city: '', // Parsed from address if structured
        state: 'TX',
        zip: '',
      },
      claim: {
        claimId: claim.claim_number || claim.id.slice(0, 20),
        totalCharge: Number(claim.total_charges) || 0,
        placeOfService: claim.place_of_service || '11',
        dateOfService: sortedLines[0]?.date_of_service
          ? new Date(sortedLines[0].date_of_service).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        diagnosisCodes: claim.diagnosis_codes || [],
      },
      serviceLines: sortedLines.map((line: {
        line_number: number;
        cpt_code: string;
        modifier_1?: string | null;
        modifier_2?: string | null;
        charge_amount: number;
        units: number;
        diagnosis_pointers?: number[] | null;
        date_of_service: string;
      }) => ({
        cptCode: line.cpt_code,
        modifiers: [line.modifier_1, line.modifier_2].filter(Boolean) as string[],
        units: Number(line.units) || 1,
        chargeAmount: Number(line.charge_amount) || 0,
        dateOfService: line.date_of_service
          ? new Date(line.date_of_service).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        icdPointers: line.diagnosis_pointers || [1],
      })),
    };

    // ======================================================================
    // 6. Generate the 837P file
    // ======================================================================
    const result = generate837P(claimInput);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          validationErrors: result.errors,
        },
        { status: 400 }
      );
    }

    // ======================================================================
    // 7. Store EDI content on the claim record
    // ======================================================================
    let newStatus = 'generated';

    await supabase
      .from('claims')
      .update({
        edi_file_content: result.ediContent,
        edi_generated_at: new Date().toISOString(),
        status: claim.status === 'draft' ? 'generated' : claim.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimId);

    // ======================================================================
    // 8. Optionally submit via SFTP to TMHP
    // ======================================================================
    let sftpResult = undefined;

    if (submitViaSftp && result.ediContent) {
      const sftpConfig: TMHPSftpConfig = {
        host: process.env.TMHP_SFTP_HOST || '',
        port: parseInt(process.env.TMHP_SFTP_PORT || '22', 10),
        username: process.env.TMHP_SFTP_USERNAME || '',
        password: process.env.TMHP_SFTP_PASSWORD || undefined,
        privateKeyPath: process.env.TMHP_SFTP_KEY_PATH || undefined,
        remoteDir: process.env.TMHP_SFTP_REMOTE_DIR || '/inbound',
        responseDir: process.env.TMHP_SFTP_RESPONSE_DIR || '/outbound',
      };

      if (!sftpConfig.host || !sftpConfig.username) {
        return NextResponse.json(
          {
            success: false,
            error: 'TMHP SFTP credentials not configured. Set TMHP_SFTP_HOST, TMHP_SFTP_USERNAME, and TMHP_SFTP_PASSWORD environment variables.',
            ediContent: result.ediContent,
            ediContentFormatted: result.ediContentFormatted,
            claimStatus: 'generated',
          },
          { status: 400 }
        );
      }

      sftpResult = await uploadToTMHP(
        sftpConfig,
        result.ediContent,
        claimInput.submitter.submitterId
      );

      if (sftpResult.success) {
        newStatus = 'submitted';
        await supabase
          .from('claims')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            notes: `Submitted to TMHP via SFTP. File: ${sftpResult.remoteFilePath}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', claimId);
      } else {
        // SFTP failed but EDI was generated
        await supabase
          .from('claims')
          .update({
            notes: `SFTP upload failed: ${sftpResult.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', claimId);
      }
    }

    // ======================================================================
    // 9. Return result
    // ======================================================================
    return NextResponse.json({
      success: true,
      ediContent: result.ediContent,
      ediContentFormatted: result.ediContentFormatted,
      controlNumbers: result.controlNumbers,
      segmentCount: result.segmentCount,
      claimStatus: newStatus,
      sftpResult,
    });
  } catch (error) {
    console.error('Error in POST /api/claims/submit:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
