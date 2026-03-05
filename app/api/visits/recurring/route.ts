/**
 * Recurring Visits API – POST to create a series of visits
 * Accepts an iCal RRULE string (e.g. "FREQ=WEEKLY;COUNT=12;BYDAY=MO,WE")
 * and generates individual visit rows sharing the same recurrence_group_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

// ---- RRULE helpers (lightweight, no external dep) ----

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface ParsedRule {
  freq: string;
  count: number;
  byDay: number[];
  interval: number;
  until: Date | null;
}

function parseRRule(rule: string): ParsedRule {
  const parts = rule.replace(/^RRULE:/i, '').split(';');
  const map: Record<string, string> = {};
  for (const p of parts) {
    const [key, val] = p.split('=');
    if (key && val) map[key.toUpperCase()] = val;
  }

  const freq = map['FREQ'] || 'WEEKLY';
  const count = map['COUNT'] ? parseInt(map['COUNT'], 10) : 12;
  const interval = map['INTERVAL'] ? parseInt(map['INTERVAL'], 10) : 1;
  const byDay = map['BYDAY']
    ? map['BYDAY'].split(',').map((d) => DAY_MAP[d.trim().toUpperCase()] ?? -1).filter((n) => n >= 0)
    : [];
  const until = map['UNTIL'] ? new Date(map['UNTIL']) : null;

  return { freq, count, byDay, interval, until };
}

/**
 * Generate occurrence dates from an RRULE anchored at a start date.
 * Returns an array of Date objects (date-only, time will be applied later).
 */
function expandOccurrences(startDate: Date, rule: ParsedRule): Date[] {
  const dates: Date[] = [];

  if (rule.freq !== 'WEEKLY') {
    // For non-weekly, just repeat at interval
    for (let i = 0; i < rule.count; i++) {
      const d = new Date(startDate);
      if (rule.freq === 'DAILY') {
        d.setDate(d.getDate() + i * rule.interval);
      } else if (rule.freq === 'MONTHLY') {
        d.setMonth(d.getMonth() + i * rule.interval);
      }
      if (rule.until && d > rule.until) break;
      dates.push(d);
    }
    return dates;
  }

  // Weekly with optional BYDAY
  const daysOfWeek = rule.byDay.length > 0 ? rule.byDay : [startDate.getDay()];
  let currentWeekStart = new Date(startDate);
  // Move to the Monday of the start week (or Sunday depending on locale – use Monday)
  const dayOfWeek = currentWeekStart.getDay();
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  currentWeekStart.setDate(currentWeekStart.getDate() + diffToMonday);

  let collected = 0;
  const maxIterations = rule.count * 7 * rule.interval + 52; // safety limit

  for (let iter = 0; iter < maxIterations && collected < rule.count; iter++) {
    for (const dow of daysOfWeek) {
      if (collected >= rule.count) break;
      // Calculate the date for this day-of-week in the current week
      const d = new Date(currentWeekStart);
      // currentWeekStart is Monday (dow=1), offset = dow - 1
      const offset = dow === 0 ? 6 : dow - 1; // Sunday is end of week
      d.setDate(d.getDate() + offset);

      // Skip dates before the start date
      if (d < startDate) continue;
      if (rule.until && d > rule.until) break;

      dates.push(new Date(d));
      collected++;
    }

    // Advance by interval weeks
    currentWeekStart.setDate(currentWeekStart.getDate() + 7 * rule.interval);
  }

  return dates;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      clinic_id,
      episode_id,
      patient_id,
      therapist_user_id,
      start_time,
      end_time,
      location,
      notes,
      recurrence_rule,
      visit_type,
      discipline,
    } = body;

    if (!clinic_id || !start_time || !end_time || !recurrence_rule) {
      return NextResponse.json(
        { error: 'clinic_id, start_time, end_time, and recurrence_rule are required' },
        { status: 400 }
      );
    }

    const parsedRule = parseRRule(recurrence_rule);
    const startDt = new Date(start_time);
    const endDt = new Date(end_time);
    const durationMs = endDt.getTime() - startDt.getTime();

    if (durationMs <= 0) {
      return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 });
    }

    const occurrences = expandOccurrences(startDt, parsedRule);

    if (occurrences.length === 0) {
      return NextResponse.json({ error: 'No occurrences generated from recurrence rule' }, { status: 400 });
    }

    const recurrenceGroupId = generateUUID();

    // Build visit rows
    const visits = occurrences.map((occDate) => {
      // Keep the same time-of-day from the original start_time
      const occStart = new Date(occDate);
      occStart.setHours(startDt.getHours(), startDt.getMinutes(), startDt.getSeconds(), 0);
      const occEnd = new Date(occStart.getTime() + durationMs);

      return {
        clinic_id,
        episode_id: episode_id || null,
        patient_id: patient_id || null,
        therapist_user_id: therapist_user_id || null,
        start_time: occStart.toISOString(),
        end_time: occEnd.toISOString(),
        location: location || null,
        source: 'manual' as const,
        notes: notes || null,
        status: 'scheduled' as const,
        visit_type: visit_type || null,
        discipline: discipline || 'PT',
        recurrence_rule: recurrence_rule,
        recurrence_group_id: recurrenceGroupId,
      };
    });

    const { data, error } = await client
      .from('visits')
      .insert(visits)
      .select();

    if (error) {
      console.error('Error creating recurring visits:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        recurrence_group_id: recurrenceGroupId,
        count: data?.length || 0,
        visits: data || [],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/visits/recurring:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
