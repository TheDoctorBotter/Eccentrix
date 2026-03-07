/**
 * One-time migration endpoint to add documentation_mode column to clinics table.
 * POST /api/migrate/documentation-mode
 *
 * Safe to run multiple times. Checks if column exists first.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST() {
  try {
    // First, check if the column already exists by trying to read it
    const { error: testError } = await supabaseAdmin
      .from('clinics')
      .select('documentation_mode')
      .limit(1);

    if (!testError) {
      return NextResponse.json({
        success: true,
        message: 'documentation_mode column already exists',
        already_existed: true,
      });
    }

    // Column doesn't exist - try to add it via SQL
    // Supabase admin can execute SQL via the rpc method if a function exists,
    // or via the raw SQL endpoint
    const migrationSQL = `ALTER TABLE clinics ADD COLUMN IF NOT EXISTS documentation_mode TEXT NOT NULL DEFAULT 'emr';`;

    // Try using supabase-js .rpc() with a known SQL execution function
    // Many Supabase projects have an exec_sql or similar function
    let created = false;
    const rpcNames = ['exec_sql', '_exec_sql', 'run_sql', 'execute_sql'];

    for (const rpcName of rpcNames) {
      try {
        const { error } = await supabaseAdmin.rpc(rpcName, {
          sql: migrationSQL,
          query: migrationSQL,
        });
        if (!error) {
          created = true;
          break;
        }
      } catch {
        // Try next rpc name
      }
    }

    if (!created) {
      // Can't auto-create - provide instructions
      return NextResponse.json({
        success: false,
        message: 'Could not auto-create column. Please run the SQL manually.',
        sql: migrationSQL,
        instructions: [
          '1. Go to your Supabase Dashboard',
          '2. Navigate to SQL Editor',
          '3. Run this SQL:',
          migrationSQL,
        ],
      }, { status: 422 });
    }

    // Verify it was created
    const { error: verifyError } = await supabaseAdmin
      .from('clinics')
      .select('documentation_mode')
      .limit(1);

    return NextResponse.json({
      success: !verifyError,
      message: verifyError
        ? 'Column may not have been created properly'
        : 'documentation_mode column created successfully',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({
      error: 'Migration failed',
      details: String(error),
      sql: "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS documentation_mode TEXT NOT NULL DEFAULT 'emr';",
    }, { status: 500 });
  }
}

export async function GET() {
  // Check if migration is needed
  try {
    const { error } = await supabaseAdmin
      .from('clinics')
      .select('documentation_mode')
      .limit(1);

    if (error) {
      return NextResponse.json({
        migrated: false,
        message: 'documentation_mode column does not exist',
        sql: "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS documentation_mode TEXT NOT NULL DEFAULT 'emr';",
      });
    }

    return NextResponse.json({
      migrated: true,
      message: 'documentation_mode column exists',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
