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
  patient_name?: string;
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
  status: 'success' | 'error' | 'skipped' | 'needs_review';
  error?: string;
  auth_id?: string;
  matched_name?: string;
  candidates?: { id: string; name: string }[];
  row_data?: Partial<ImportRow>;
}

interface PatientRecord {
  id: string;
  first_name: string;
  last_name: string;
  deleted_at: string | null;
  clinic_id: string;
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
  'patient name': 'patient_name',
  'patient': 'patient_name',
  'name': 'patient_name',
  'member name': 'patient_name',
  'member': 'patient_name',
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

/** Strip punctuation, collapse whitespace, lowercase for name comparison */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Parse a combined name field — handle "Last, First" and "First Last" formats */
function parseFullName(raw: string): { first: string; last: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes(',')) {
    // "Garcia, Justin" or "GARCIA, JUSTIN M."
    const [lastPart, ...rest] = trimmed.split(',');
    const firstPart = rest.join(',').trim().split(/\s+/)[0]; // first word after comma
    if (firstPart && lastPart.trim()) {
      return { first: firstPart, last: lastPart.trim() };
    }
  }

  // "Justin Garcia" — assume first last (take first word and last word)
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return { first: parts[0], last: parts[parts.length - 1] };
  }

  return null;
}

type MatchResult =
  | { type: 'exact'; patient: PatientRecord }
  | { type: 'normalized'; patient: PatientRecord }
  | { type: 'partial'; patient: PatientRecord; note: string }
  | { type: 'last_only'; patients: PatientRecord[] }
  | { type: 'ambiguous'; patients: PatientRecord[] }
  | { type: 'deleted'; patient: PatientRecord }
  | { type: 'other_clinic'; patient: PatientRecord }
  | { type: 'none' };

function findPatientMatch(
  firstName: string,
  lastName: string,
  activePatients: PatientRecord[],
  deletedPatients: PatientRecord[],
  otherClinicPatients: PatientRecord[],
): MatchResult {
  const normFirst = normalizeName(firstName);
  const normLast = normalizeName(lastName);

  // 1) Exact case-insensitive match
  const exact = activePatients.find(
    (p) => p.first_name.toLowerCase() === firstName.toLowerCase() &&
           p.last_name.toLowerCase() === lastName.toLowerCase()
  );
  if (exact) return { type: 'exact', patient: exact };

  // 2) Normalized match (strips punctuation, extra spaces, etc.)
  const normalized = activePatients.find(
    (p) => normalizeName(p.first_name) === normFirst &&
           normalizeName(p.last_name) === normLast
  );
  if (normalized) return { type: 'normalized', patient: normalized };

  // 3) Partial first name match with exact last name
  //    Handles "John" matching "John Michael" or "Johnny" matching "John"
  const partialFirst = activePatients.filter((p) => {
    const pFirst = normalizeName(p.first_name);
    const pLast = normalizeName(p.last_name);
    return pLast === normLast && (
      pFirst.startsWith(normFirst) || normFirst.startsWith(pFirst) ||
      pFirst.includes(normFirst) || normFirst.includes(pFirst)
    );
  });
  if (partialFirst.length === 1) {
    return {
      type: 'partial',
      patient: partialFirst[0],
      note: `Matched "${partialFirst[0].first_name} ${partialFirst[0].last_name}" (spreadsheet: "${firstName} ${lastName}")`,
    };
  }
  if (partialFirst.length > 1) {
    return { type: 'ambiguous', patients: partialFirst };
  }

  // 4) Last name only match — flag for review
  const lastOnly = activePatients.filter(
    (p) => normalizeName(p.last_name) === normLast
  );
  if (lastOnly.length > 0) {
    return { type: 'last_only', patients: lastOnly };
  }

  // 5) Check deleted patients
  const deleted = deletedPatients.find(
    (p) => normalizeName(p.first_name) === normFirst &&
           normalizeName(p.last_name) === normLast
  ) || deletedPatients.find(
    (p) => normalizeName(p.last_name) === normLast
  );
  if (deleted) return { type: 'deleted', patient: deleted };

  // 6) Check other clinics
  const other = otherClinicPatients.find(
    (p) => normalizeName(p.first_name) === normFirst &&
           normalizeName(p.last_name) === normLast
  ) || otherClinicPatients.find(
    (p) => normalizeName(p.last_name) === normLast
  );
  if (other) return { type: 'other_clinic', patient: other };

  return { type: 'none' };
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

    // Parse manual_matches from formData (JSON string mapping row numbers to patient IDs)
    let manualMatches: Record<string, string> = {};
    const manualMatchesRaw = formData.get('manual_matches') as string | null;
    if (manualMatchesRaw) {
      try { manualMatches = JSON.parse(manualMatchesRaw); } catch { /* ignore */ }
    }

    // Pre-fetch ALL patients for this clinic (and also cross-clinic for diagnostics)
    const { data: clinicPatients } = await supabaseAdmin
      .from('patients')
      .select('id, first_name, last_name, deleted_at, clinic_id')
      .eq('clinic_id', clinicId);

    const activePatients = (clinicPatients || []).filter(p => !p.deleted_at) as PatientRecord[];
    const deletedPatients = (clinicPatients || []).filter(p => p.deleted_at) as PatientRecord[];

    // Fetch patients from other clinics for diagnostic messages
    const { data: allOtherPatients } = await supabaseAdmin
      .from('patients')
      .select('id, first_name, last_name, deleted_at, clinic_id')
      .neq('clinic_id', clinicId)
      .is('deleted_at', null)
      .limit(500);
    const otherClinicPatients = (allOtherPatients || []) as PatientRecord[];

    // Pre-fetch episodes for all active patients
    const { data: allEpisodes } = await supabaseAdmin
      .from('episodes')
      .select('id, patient_id')
      .eq('clinic_id', clinicId)
      .eq('status', 'active');
    const episodeMap = new Map<string, string>();
    for (const ep of allEpisodes || []) {
      if (!episodeMap.has(ep.patient_id)) {
        episodeMap.set(ep.patient_id, ep.id);
      }
    }

    // Pre-fetch existing auth numbers for duplicate detection
    const { data: existingAuths } = await supabaseAdmin
      .from('prior_authorizations')
      .select('patient_id, auth_number')
      .eq('clinic_id', clinicId);
    const existingAuthSet = new Set(
      (existingAuths || [])
        .filter(a => a.auth_number)
        .map(a => `${a.patient_id}::${a.auth_number}`)
    );

    // Import mode
    const results: ImportResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let reviewCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawRow = rawRows[i];
      const rowNum = i + 2; // Excel row (header = row 1)

      // --- Resolve first/last name ---
      let firstName = String(row.patient_first_name || '').trim();
      let lastName = String(row.patient_last_name || '').trim();

      // If we have a combined "patient_name" column and no separate first/last, parse it
      if ((!firstName || !lastName) && row.patient_name) {
        const parsed = parseFullName(String(row.patient_name));
        if (parsed) {
          if (!firstName) firstName = parsed.first;
          if (!lastName) lastName = parsed.last;
        }
      }

      // Handle comma in first_name field (e.g. someone put "Garcia, Justin" in first name)
      if (firstName.includes(',') && !lastName) {
        const parsed = parseFullName(firstName);
        if (parsed) {
          firstName = parsed.first;
          lastName = parsed.last;
        }
      }

      // Handle comma in last_name field (e.g. "Garcia, Justin" put in last name)
      if (lastName.includes(',') && !firstName) {
        const parsed = parseFullName(lastName);
        if (parsed) {
          firstName = parsed.first;
          lastName = parsed.last;
        }
      }

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

      const displayName = `${lastName}, ${firstName}`;

      // --- Check for manual match override ---
      let patientId: string | null = manualMatches[String(rowNum)] || null;
      let matchNote = '';

      if (patientId) {
        // Validate the manual match exists
        const manualPat = activePatients.find(p => p.id === patientId);
        if (manualPat) {
          matchNote = ` (manually matched to "${manualPat.first_name} ${manualPat.last_name}")`;
        } else {
          patientId = null; // Invalid manual match, fall through to auto-match
        }
      }

      // --- Auto-match if no manual match ---
      if (!patientId) {
        const match = findPatientMatch(firstName, lastName, activePatients, deletedPatients, otherClinicPatients);

        switch (match.type) {
          case 'exact':
            patientId = match.patient.id;
            break;

          case 'normalized':
            patientId = match.patient.id;
            matchNote = ` (matched "${match.patient.first_name} ${match.patient.last_name}")`;
            break;

          case 'partial':
            patientId = match.patient.id;
            matchNote = ` (${match.note})`;
            break;

          case 'last_only': {
            // Single last-name match → flag for review, not auto-import
            const candidates = match.patients.map(p => ({
              id: p.id,
              name: `${p.first_name} ${p.last_name}`,
            }));
            if (match.patients.length === 1) {
              results.push({
                row: rowNum,
                patient_name: displayName,
                auth_number: String(row.auth_number || ''),
                status: 'needs_review',
                error: `Last name matched "${match.patients[0].first_name} ${match.patients[0].last_name}" but first name didn't match. Please confirm.`,
                candidates,
                row_data: row,
              });
            } else {
              results.push({
                row: rowNum,
                patient_name: displayName,
                auth_number: String(row.auth_number || ''),
                status: 'needs_review',
                error: `Multiple patients with last name "${lastName}" found. Please select the correct one.`,
                candidates,
                row_data: row,
              });
            }
            reviewCount++;
            continue;
          }

          case 'ambiguous': {
            const candidates = match.patients.map(p => ({
              id: p.id,
              name: `${p.first_name} ${p.last_name}`,
            }));
            results.push({
              row: rowNum,
              patient_name: displayName,
              auth_number: String(row.auth_number || ''),
              status: 'needs_review',
              error: `Multiple matches found. Please select the correct patient.`,
              candidates,
              row_data: row,
            });
            reviewCount++;
            continue;
          }

          case 'deleted':
            results.push({
              row: rowNum,
              patient_name: displayName,
              auth_number: String(row.auth_number || ''),
              status: 'error',
              error: `Patient "${match.patient.first_name} ${match.patient.last_name}" was found but has been deleted. Restore the patient first.`,
            });
            errorCount++;
            continue;

          case 'other_clinic':
            results.push({
              row: rowNum,
              patient_name: displayName,
              auth_number: String(row.auth_number || ''),
              status: 'error',
              error: `Patient "${match.patient.first_name} ${match.patient.last_name}" exists but belongs to a different clinic.`,
            });
            errorCount++;
            continue;

          case 'none': {
            // No match at all — show closest last-name matches as suggestions
            const normLast = normalizeName(lastName);
            const suggestions = activePatients
              .filter(p => {
                const pLast = normalizeName(p.last_name);
                return pLast.startsWith(normLast.slice(0, 3)) || normLast.startsWith(pLast.slice(0, 3));
              })
              .slice(0, 5)
              .map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));

            results.push({
              row: rowNum,
              patient_name: displayName,
              auth_number: String(row.auth_number || ''),
              status: suggestions.length > 0 ? 'needs_review' : 'error',
              error: suggestions.length > 0
                ? `No exact match for "${firstName} ${lastName}". Did you mean one of these?`
                : `Patient "${firstName} ${lastName}" not found in this clinic or anywhere in the system.`,
              candidates: suggestions.length > 0 ? suggestions : undefined,
              row_data: suggestions.length > 0 ? row : undefined,
            });
            if (suggestions.length > 0) {
              reviewCount++;
            } else {
              errorCount++;
            }
            continue;
          }
        }
      }

      // --- Look up active episode ---
      const episodeId = episodeMap.get(patientId!);
      if (!episodeId) {
        results.push({
          row: rowNum,
          patient_name: displayName,
          auth_number: String(row.auth_number || ''),
          status: 'error',
          error: 'No active episode found for patient. Please create an episode first.',
        });
        errorCount++;
        continue;
      }

      // --- Parse dates ---
      const startDateRaw = row.start_date || rawRow['Start Date'] || rawRow['start'];
      const endDateRaw = row.end_date || rawRow['End Date'] || rawRow['end'];
      const startDate = parseDate(startDateRaw);
      const endDate = parseDate(endDateRaw);

      if (!startDate || !endDate) {
        results.push({
          row: rowNum,
          patient_name: displayName,
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

      // --- Check for duplicate auth_number ---
      const authNumber = String(row.auth_number || '').trim();
      if (authNumber && existingAuthSet.has(`${patientId}::${authNumber}`)) {
        results.push({
          row: rowNum,
          patient_name: displayName,
          auth_number: authNumber,
          status: 'skipped',
          error: `Auth #${authNumber} already exists for this patient`,
        });
        skippedCount++;
        continue;
      }

      // --- Build insert data ---
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
          patient_name: displayName,
          auth_number: authNumber,
          status: 'error',
          error: createError?.message || 'Failed to create authorization',
        });
        errorCount++;
        continue;
      }

      // Track the new auth for duplicate detection within this import
      if (authNumber) {
        existingAuthSet.add(`${patientId}::${authNumber}`);
      }

      results.push({
        row: rowNum,
        patient_name: `${displayName}${matchNote}`,
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
      needs_review: reviewCount,
      results,
    });
  } catch (error) {
    console.error('Error in POST /api/authorizations/import-export:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
