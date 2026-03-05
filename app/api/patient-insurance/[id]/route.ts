import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    'payer_type', 'payer_name', 'payer_id', 'member_id', 'group_number',
    'subscriber_name', 'subscriber_dob', 'subscriber_first_name',
    'subscriber_last_name', 'subscriber_gender',
    'subscriber_address_line1', 'subscriber_address_city',
    'subscriber_address_state', 'subscriber_address_zip',
    'relationship_to_subscriber', 'priority', 'is_primary', 'is_active',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await supabaseAdmin
    .from('patient_insurance')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Soft delete: mark as inactive
  const { error } = await supabaseAdmin
    .from('patient_insurance')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
