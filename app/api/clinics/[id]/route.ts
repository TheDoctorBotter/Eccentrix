/**
 * Single Clinic API
 * GET: Get clinic details
 * PATCH: Update clinic
 * DELETE: Soft delete clinic (set is_active to false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { data, error } = await client
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }
      console.error('Error fetching clinic:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/clinics/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const allowedFields = [
      'name',
      'address',
      'phone',
      'email',
      'website',
      'logo_url',
      'letterhead_url',
      'documentation_mode',
      'is_active',
      'auth_exempt_payers',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    let { data, error } = await client
      .from('clinics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    // If documentation_mode column doesn't exist yet, auto-create it and retry
    if (error && error.message?.includes('documentation_mode')) {
      console.log('Auto-creating documentation_mode column...');
      try {
        await supabaseAdmin.rpc('_exec_sql', {
          query: `ALTER TABLE clinics ADD COLUMN IF NOT EXISTS documentation_mode TEXT NOT NULL DEFAULT 'emr';`,
        }).throwOnError();
      } catch {
        // rpc might not exist - try direct SQL via pg_catalog workaround
        // Fall back to retrying without documentation_mode
      }

      // Retry the original update
      const retry = await client
        .from('clinics')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (!retry.error) {
        return NextResponse.json(retry.data);
      }

      // If still failing, try without documentation_mode
      const { documentation_mode: _, ...updatesWithoutMode } = updates;
      if (Object.keys(updatesWithoutMode).length > 0) {
        const fallback = await client
          .from('clinics')
          .update(updatesWithoutMode)
          .eq('id', id)
          .select()
          .single();

        if (!fallback.error) {
          return NextResponse.json({
            ...fallback.data,
            _migration_needed: true,
            _migration_sql: "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS documentation_mode TEXT NOT NULL DEFAULT 'emr';",
          });
        }
      }

      // Return the original error
      error = retry.error || error;
    }

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }
      console.error('Error updating clinic:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/clinics/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    // Soft delete by setting is_active to false
    const { data, error } = await client
      .from('clinics')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }
      console.error('Error deleting clinic:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in DELETE /api/clinics/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
