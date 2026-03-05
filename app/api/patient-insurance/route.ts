import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { patientInsuranceSchema } from '@/lib/billing/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patient_id');
  const clinicId = searchParams.get('clinic_id');

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = serviceRoleKey ? supabaseAdmin : supabase;

  let query = client
    .from('patient_insurance')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (patientId) query = query.eq('patient_id', patientId);
  if (clinicId) query = query.eq('clinic_id', clinicId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = patientInsuranceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(', ') },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('patient_insurance')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
