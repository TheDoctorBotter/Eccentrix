/**
 * Patient Caseload Import API
 * POST: Parse Excel/CSV file and bulk-create patients with episodes
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

interface ImportRow {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  primary_diagnosis?: string;
  referring_physician?: string;
  allergies?: string;
  precautions?: string;
  insurance_id?: string;
  medicaid_id?: string;
  payer_name?: string;
  discipline?: string;
  frequency?: string;
}

interface ImportResult {
  row: number;
  first_name: string;
  last_name: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  patient_id?: string;
}

// Normalize column headers to match expected field names
const COLUMN_ALIASES: Record<string, string> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'first': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last': 'last_name',
  'dob': 'date_of_birth',
  'date of birth': 'date_of_birth',
  'birthdate': 'date_of_birth',
  'birth date': 'date_of_birth',
  'sex': 'gender',
  'telephone': 'phone',
  'phone number': 'phone',
  'cell': 'phone',
  'cell phone': 'phone',
  'email address': 'email',
  'street address': 'address',
  'mailing address': 'address',
  'diagnosis': 'primary_diagnosis',
  'primary diagnosis': 'primary_diagnosis',
  'dx': 'primary_diagnosis',
  'referring md': 'referring_physician',
  'referring doctor': 'referring_physician',
  'referring provider': 'referring_physician',
  'physician': 'referring_physician',
  'ref physician': 'referring_physician',
  'insurance': 'payer_name',
  'insurance name': 'payer_name',
  'payer': 'payer_name',
  'insurance id': 'insurance_id',
  'member id': 'insurance_id',
  'policy number': 'insurance_id',
  'medicaid': 'medicaid_id',
  'medicaid id': 'medicaid_id',
  'allergy': 'allergies',
  'precaution': 'precautions',
  'disc': 'discipline',
  'service': 'discipline',
  'therapy type': 'discipline',
  'freq': 'frequency',
  'visit frequency': 'frequency',
};

function normalizeColumnName(name: string): string {
  const lower = name.toLowerCase().trim();
  return COLUMN_ALIASES[lower] || lower.replace(/\s+/g, '_');
}

function parseDate(value: unknown): string | null {
  if (!value) return null;

  // Handle Excel serial date numbers
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try MM/DD/YYYY or M/D/YYYY
  const mdyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try parsing with Date constructor as last resort
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

function normalizeDiscipline(value: unknown): string | null {
  if (!value) return null;
  const str = String(value).toUpperCase().trim();
  if (['PT', 'PHYSICAL THERAPY', 'PHYSICAL'].includes(str)) return 'PT';
  if (['OT', 'OCCUPATIONAL THERAPY', 'OCCUPATIONAL'].includes(str)) return 'OT';
  if (['ST', 'SLP', 'SPEECH', 'SPEECH THERAPY', 'SPEECH-LANGUAGE'].includes(str)) return 'ST';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const clinicId = formData.get('clinic_id') as string | null;
    const mode = formData.get('mode') as string | null; // 'preview' or 'import'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    // Read file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'Spreadsheet is empty' }, { status: 400 });
    }

    // Normalize column names
    const originalHeaders = Object.keys(rawRows[0]);
    const headerMapping: Record<string, string> = {};
    for (const header of originalHeaders) {
      headerMapping[header] = normalizeColumnName(header);
    }

    // Map rows to normalized field names
    const rows: ImportRow[] = rawRows.map((raw) => {
      const normalized: Record<string, unknown> = {};
      for (const [original, mapped] of Object.entries(headerMapping)) {
        normalized[mapped] = raw[original];
      }
      return normalized as unknown as ImportRow;
    });

    // Preview mode: return parsed data without importing
    if (mode === 'preview') {
      return NextResponse.json({
        headers: originalHeaders,
        mapped_headers: Object.values(headerMapping),
        row_count: rows.length,
        preview: rows.slice(0, 10).map((row, i) => ({
          row_number: i + 1,
          ...row,
          date_of_birth: parseDate(rawRows[i].date_of_birth || rawRows[i].DOB || rawRows[i]['Date of Birth'] || rawRows[i].dob) || row.date_of_birth,
        })),
      });
    }

    // Import mode: create patients and episodes
    const results: ImportResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for 1-indexed + header row

      const firstName = String(row.first_name || '').trim();
      const lastName = String(row.last_name || '').trim();

      if (!firstName || !lastName) {
        results.push({
          row: rowNum,
          first_name: firstName || '(empty)',
          last_name: lastName || '(empty)',
          status: 'error',
          error: 'Missing first_name or last_name',
        });
        errorCount++;
        continue;
      }

      // Check for existing patient with same name in this clinic
      const { data: existing } = await supabaseAdmin
        .from('patients')
        .select('id')
        .eq('clinic_id', clinicId)
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .is('deleted_at', null)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({
          row: rowNum,
          first_name: firstName,
          last_name: lastName,
          status: 'skipped',
          error: 'Patient with this name already exists',
          patient_id: existing[0].id,
        });
        skippedCount++;
        continue;
      }

      // Parse date
      const rawRow = rawRows[i];
      const dobRaw = row.date_of_birth || rawRow['Date of Birth'] || rawRow['DOB'] || rawRow['dob'];
      const dob = parseDate(dobRaw);

      // Create patient
      const { data: patient, error: patientError } = await supabaseAdmin
        .from('patients')
        .insert({
          clinic_id: clinicId,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob,
          gender: row.gender ? String(row.gender).trim() : null,
          phone: row.phone ? String(row.phone).trim() : null,
          email: row.email ? String(row.email).trim() : null,
          address: row.address ? String(row.address).trim() : null,
          primary_diagnosis: row.primary_diagnosis ? String(row.primary_diagnosis).trim() : null,
          referring_physician: row.referring_physician ? String(row.referring_physician).trim() : null,
          allergies: row.allergies ? String(row.allergies).trim() : null,
          precautions: row.precautions ? String(row.precautions).trim() : null,
          insurance_id: row.insurance_id ? String(row.insurance_id).trim() : null,
          medicaid_id: row.medicaid_id ? String(row.medicaid_id).trim() : null,
          payer_name: row.payer_name ? String(row.payer_name).trim() : null,
          is_active: true,
        })
        .select()
        .single();

      if (patientError || !patient) {
        results.push({
          row: rowNum,
          first_name: firstName,
          last_name: lastName,
          status: 'error',
          error: patientError?.message || 'Failed to create patient',
        });
        errorCount++;
        continue;
      }

      // Create episode
      const { data: episode, error: episodeError } = await supabaseAdmin
        .from('episodes')
        .insert({
          patient_id: patient.id,
          clinic_id: clinicId,
          start_date: new Date().toISOString().split('T')[0],
          diagnosis: row.primary_diagnosis ? String(row.primary_diagnosis).trim() : null,
          status: 'active',
        })
        .select()
        .single();

      if (episodeError) {
        console.error(`Episode creation failed for row ${rowNum}:`, episodeError);
      }

      // Create episode-of-care per discipline if provided
      const discipline = normalizeDiscipline(row.discipline);
      if (episode && discipline) {
        await supabaseAdmin
          .from('patient_episode_of_care')
          .upsert(
            {
              patient_id: patient.id,
              episode_id: episode.id,
              clinic_id: clinicId,
              discipline,
              frequency: row.frequency ? String(row.frequency).trim() : null,
              status: 'active',
            },
            { onConflict: 'episode_id,discipline' }
          );
      }

      results.push({
        row: rowNum,
        first_name: firstName,
        last_name: lastName,
        status: 'success',
        patient_id: patient.id,
      });
      successCount++;
    }

    return NextResponse.json({
      total: rows.length,
      success: successCount,
      errors: errorCount,
      skipped: skippedCount,
      results,
    });
  } catch (error) {
    console.error('Error in POST /api/patients/import:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
