/**
 * Prior Authorizations Import/Export API
 * GET:  Export authorizations as JSON (for client-side XLSX generation)
 * POST: Import authorizations from Excel/CSV file
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

interface ImportRow {
  patient_first_name: string;
  patient_last_name: string;
  auth_number?: string;
  insurance_name?: string;
  insurance_phone?: string;
  discipline?: string;
  auth_type?: string;
  authorized_visits?: string | number;
  units_authorized?: string | number;
  start_date?: string;
  end_date?: string;
  status?: string;
  notes?: string;
}

interface ImportResult {
  row: number;
  patient_name: string;
  auth_number: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  auth_id?: string;
}

const COLUMN_ALIASES: Record<string, string> = {
  'patient first name': 'patient_first_name',
  'patient firstname': 'patient_first_name',
  'first name': 'patient_first_name',
  'firstname': 'patient_first_name',
  'first': 'patient_first_name',
  'patient last name': 'patient_last_name',
  'patient lastname': 'patient_last_name',
  'last name': 'patient_last_name',
  'lastname': 'patient_last_name',
  'last': 'patient_last_name',
  'auth number': 'auth_number',
  'auth #': 'auth_number',
  'authorization number': 'auth_number',
  'auth_number': 'auth_number',
  'auth no': 'auth_number',
  'insurance name': 'insurance_name',
  'insurance': 'insurance_name',
  'payer': 'insurance_name',
  'payer name': 'insurance_name',
  'insurance phone': 'insurance_phone',
  'ins phone': 'insurance_phone',
  'disc': 'discipline',
  'service': 'discipline',
  'therapy type': 'discipline',
  'auth type': 'auth_type',
  'type': 'auth_type',
  'authorized visits': 'authorized_visits',
  'visits': 'authorized_visits',
  'total visits': 'authorized_visits',
  'visit count': 'authorized_visits',
  'units authorized': 'units_authorized',
  'authorized units': 'units_authorized',
  'units': 'units_authorized',
  'total units': 'units_authorized',
  'start date': 'start_date',
  'start': 'start_date',
  'effective date': 'start_date',
  'end date': 'end_date',
  'end': 'end_date',
  'expiration date': 'end_date',
  'expiry date': 'end_date',
  'expiration': 'end_date',
  'note': 'notes',
  'comment': 'notes',
  'comments': 'notes',
};

function normalizeColumnName(name: string): string {
  const lower = name.toLowerCase().trim();
  return COLUMN_ALIASES[lower] || lower.replace(/\s+/g, '_');
}

function parseDate(value: unknown): string | null {
  if (!value) return null;

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

  const mdyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().split('T')[0];
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

function normalizeAuthType(value: unknown): string {
  if (!value) return 'visits';
  const str = String(value).toLowerCase().trim();
  if (str === 'units' || str === 'unit') return 'units';
  return 'visits';
}

function normalizeStatus(value: unknown): string {
  if (!value) return 'pending';
  const str = String(value).toLowerCase().trim();
  if (['approved', 'active'].includes(str)) return 'approved';
  if (['denied', 'rejected'].includes(str)) return 'denied';
  return 'pending';
}

// GET: Export authorizations for a clinic
export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    // Fetch all authorizations for this clinic
    const { data: auths, error: authError } = await client
      .from('prior_authorizations')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    if (!auths || auths.length === 0) {
      return NextResponse.json({ auths: [], patients: {} });
    }

    // Fetch patients to resolve names
    const patientIds = Array.from(new Set(auths.map((a: Record<string, unknown>) => a.patient_id))) as string[];
    const { data: patients } = await client
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);

    const patientMap: Record<string, { first_name: string; last_name: string }> = {};
    if (patients) {
      for (const p of patients) {
        patientMap[p.id] = { first_name: p.first_name, last_name: p.last_name };
      }
    }

    return NextResponse.json({ auths, patients: patientMap });
  } catch (error) {
    console.error('Error in GET /api/authorizations/import-export:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Import authorizations from file
export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const clinicId = formData.get('clinic_id') as string | null;
    const mode = formData.get('mode') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

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

    const rows: ImportRow[] = rawRows.map((raw) => {
      const normalized: Record<string, unknown> = {};
      for (const [original, mapped] of Object.entries(headerMapping)) {
        normalized[mapped] = raw[original];
      }
      return normalized as unknown as ImportRow;
    });

    // Preview mode
    if (mode === 'preview') {
      return NextResponse.json({
        headers: originalHeaders,
        mapped_headers: Object.values(headerMapping),
        row_count: rows.length,
        preview: rows.slice(0, 10).map((row, i) => ({
          row_number: i + 1,
          ...row,
          start_date: parseDate(rawRows[i].start_date || rawRows[i]['Start Date'] || rawRows[i]['start']) || row.start_date,
          end_date: parseDate(rawRows[i].end_date || rawRows[i]['End Date'] || rawRows[i]['end']) || row.end_date,
        })),
      });
    }

    // Import mode
    const results: ImportResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawRow = rawRows[i];
      const rowNum = i + 2;

      const firstName = String(row.patient_first_name || '').trim();
      const lastName = String(row.patient_last_name || '').trim();

      if (!firstName || !lastName) {
        results.push({
          row: rowNum,
          patient_name: `${firstName || '(empty)'} ${lastName || '(empty)'}`,
          auth_number: String(row.auth_number || ''),
          status: 'error',
          error: 'Missing patient first or last name',
        });
        errorCount++;
        continue;
      }

      // Look up patient — try exact match first, then partial/fuzzy match
      let patientId: string | null = null;
      let matchNote = '';

      // 1) Exact case-insensitive match
      const { data: exactMatch } = await supabaseAdmin
        .from('patients')
        .select('id, first_name, last_name')
        .eq('clinic_id', clinicId)
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .is('deleted_at', null)
        .limit(1);

      if (exactMatch && exactMatch.length > 0) {
        patientId = exactMatch[0].id;
      } else {
        // 2) Partial match: first_name starts with / contains the search term, or vice versa
        const { data: partialMatch } = await supabaseAdmin
          .from('patients')
          .select('id, first_name, last_name')
          .eq('clinic_id', clinicId)
          .or(`first_name.ilike.%${firstName}%,first_name.ilike.${firstName}%`)
          .ilike('last_name', lastName)
          .is('deleted_at', null)
          .limit(5);

        if (partialMatch && partialMatch.length === 1) {
          patientId = partialMatch[0].id;
          matchNote = ` (fuzzy matched "${partialMatch[0].first_name} ${partialMatch[0].last_name}")`;
        } else if (partialMatch && partialMatch.length > 1) {
          // Multiple partial matches on first name — try last name partial too
          const names = partialMatch.map(p => `${p.first_name} ${p.last_name}`).join(', ');
          results.push({
            row: rowNum,
            patient_name: `${lastName}, ${firstName}`,
            auth_number: String(row.auth_number || ''),
            status: 'error',
            error: `Multiple partial matches found: ${names}. Please use the exact name from the system.`,
          });
          errorCount++;
          continue;
        } else {
          // 3) Try last name partial match as well (both names fuzzy)
          const { data: broadMatch } = await supabaseAdmin
            .from('patients')
            .select('id, first_name, last_name')
            .eq('clinic_id', clinicId)
            .or(`first_name.ilike.%${firstName}%,first_name.ilike.${firstName}%`)
            .or(`last_name.ilike.%${lastName}%,last_name.ilike.${lastName}%`)
            .is('deleted_at', null)
            .limit(5);

          if (broadMatch && broadMatch.length === 1) {
            patientId = broadMatch[0].id;
            matchNote = ` (fuzzy matched "${broadMatch[0].first_name} ${broadMatch[0].last_name}")`;
          } else if (broadMatch && broadMatch.length > 1) {
            const names = broadMatch.map(p => `${p.first_name} ${p.last_name}`).join(', ');
            results.push({
              row: rowNum,
              patient_name: `${lastName}, ${firstName}`,
              auth_number: String(row.auth_number || ''),
              status: 'error',
              error: `Multiple partial matches found: ${names}. Please use the exact name from the system.`,
            });
            errorCount++;
            continue;
          }
        }
      }

      if (!patientId) {
        // Check if patient exists but is soft-deleted
        const { data: deletedMatch } = await supabaseAdmin
          .from('patients')
          .select('id, first_name, last_name, deleted_at')
          .eq('clinic_id', clinicId)
          .ilike('first_name', `%${firstName}%`)
          .ilike('last_name', `%${lastName}%`)
          .not('deleted_at', 'is', null)
          .limit(1);

        if (deletedMatch && deletedMatch.length > 0) {
          results.push({
            row: rowNum,
            patient_name: `${lastName}, ${firstName}`,
            auth_number: String(row.auth_number || ''),
            status: 'error',
            error: `Patient "${deletedMatch[0].first_name} ${deletedMatch[0].last_name}" was found but has been deleted. Restore the patient first.`,
          });
        } else {
          // Check if patient exists under a different clinic
          const { data: otherClinic } = await supabaseAdmin
            .from('patients')
            .select('id, first_name, last_name, clinic_id')
            .ilike('first_name', `%${firstName}%`)
            .ilike('last_name', `%${lastName}%`)
            .is('deleted_at', null)
            .limit(1);

          if (otherClinic && otherClinic.length > 0) {
            results.push({
              row: rowNum,
              patient_name: `${lastName}, ${firstName}`,
              auth_number: String(row.auth_number || ''),
              status: 'error',
              error: `Patient "${otherClinic[0].first_name} ${otherClinic[0].last_name}" exists but belongs to a different clinic.`,
            });
          } else {
            results.push({
              row: rowNum,
              patient_name: `${lastName}, ${firstName}`,
              auth_number: String(row.auth_number || ''),
              status: 'error',
              error: 'Patient not found anywhere in the system. Please add the patient first.',
            });
          }
        }
        errorCount++;
        continue;
      }

      // Look up active episode
      const { data: episodes } = await supabaseAdmin
        .from('episodes')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .limit(1);

      if (!episodes || episodes.length === 0) {
        results.push({
          row: rowNum,
          patient_name: `${lastName}, ${firstName}`,
          auth_number: String(row.auth_number || ''),
          status: 'error',
          error: 'No active episode found for patient. Please create an episode first.',
        });
        errorCount++;
        continue;
      }

      const episodeId = episodes[0].id;

      // Parse dates
      const startDateRaw = row.start_date || rawRow['Start Date'] || rawRow['start'];
      const endDateRaw = row.end_date || rawRow['End Date'] || rawRow['end'];
      const startDate = parseDate(startDateRaw);
      const endDate = parseDate(endDateRaw);

      if (!startDate || !endDate) {
        results.push({
          row: rowNum,
          patient_name: `${lastName}, ${firstName}`,
          auth_number: String(row.auth_number || ''),
          status: 'error',
          error: `Invalid or missing dates (start: ${startDateRaw || 'empty'}, end: ${endDateRaw || 'empty'})`,
        });
        errorCount++;
        continue;
      }

      const discipline = normalizeDiscipline(row.discipline);
      const authType = normalizeAuthType(row.auth_type);
      const status = normalizeStatus(row.status);

      // Check for duplicate auth_number for same patient
      const authNumber = String(row.auth_number || '').trim();
      if (authNumber) {
        const { data: existing } = await supabaseAdmin
          .from('prior_authorizations')
          .select('id')
          .eq('patient_id', patientId)
          .eq('clinic_id', clinicId)
          .eq('auth_number', authNumber)
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({
            row: rowNum,
            patient_name: `${lastName}, ${firstName}`,
            auth_number: authNumber,
            status: 'skipped',
            error: `Auth #${authNumber} already exists for this patient`,
          });
          skippedCount++;
          continue;
        }
      }

      // Build insert data
      const insertData: Record<string, unknown> = {
        episode_id: episodeId,
        patient_id: patientId,
        clinic_id: clinicId,
        auth_number: authNumber || null,
        insurance_name: row.insurance_name ? String(row.insurance_name).trim() : null,
        insurance_phone: row.insurance_phone ? String(row.insurance_phone).trim() : null,
        used_visits: 0,
        start_date: startDate,
        end_date: endDate,
        status,
        notes: row.notes ? String(row.notes).trim() : null,
        discipline: discipline || null,
        auth_type: authType,
      };

      if (authType === 'units') {
        const units = row.units_authorized ? parseInt(String(row.units_authorized), 10) : null;
        insertData.units_authorized = units;
        insertData.units_used = 0;
        insertData.authorized_visits = null;
      } else {
        const visits = row.authorized_visits ? parseInt(String(row.authorized_visits), 10) : null;
        insertData.authorized_visits = visits;
      }

      // Auto-calculate 180-day date
      const d = new Date(startDate);
      d.setDate(d.getDate() + 180);
      insertData.day_180_date = d.toISOString().split('T')[0];

      const { data: created, error: createError } = await supabaseAdmin
        .from('prior_authorizations')
        .insert(insertData)
        .select()
        .single();

      if (createError || !created) {
        results.push({
          row: rowNum,
          patient_name: `${lastName}, ${firstName}`,
          auth_number: authNumber,
          status: 'error',
          error: createError?.message || 'Failed to create authorization',
        });
        errorCount++;
        continue;
      }

      results.push({
        row: rowNum,
        patient_name: `${lastName}, ${firstName}${matchNote}`,
        auth_number: authNumber,
        status: 'success',
        auth_id: created.id,
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
    console.error('Error in POST /api/authorizations/import-export:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
