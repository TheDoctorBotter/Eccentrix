'use server';

/**
 * Billing server actions.
 * All writes use supabaseAdmin (service role) for consistent RLS bypass + audit logging.
 */

import { supabaseAdmin } from '@/lib/supabase-server';
import { writeBillingAuditLog, writeBillingAuditLogBatch } from './audit';
import { generateSourceKey, calculateEightMinuteRule } from './eight-minute-rule';
import { AUTH_THRESHOLDS } from '@/lib/authorizations';
import {
  confirmChargesSchema,
  generateClaimSchema,
  markInvoicePaidSchema,
  voidClaimSchema,
  resubmitClaimSchema,
} from './types';
import type { ExtendedVisitCharge, ExtendedClaim, Invoice } from './types';
import crypto from 'crypto';

// ============================================================================
// SOAP Finalization → Charge Draft Upsert
// ============================================================================

export async function upsertChargeDraft(params: {
  visit_id: string;
  clinic_id: string;
  actor_user_id: string;
  soap_content: Record<string, unknown>;
}): Promise<{ success: boolean; draft_id?: string; error?: string }> {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params.soap_content))
    .digest('hex')
    .slice(0, 16);

  const { data, error } = await supabaseAdmin
    .from('charge_capture_drafts')
    .upsert(
      {
        visit_id: params.visit_id,
        clinic_id: params.clinic_id,
        draft_state: params.soap_content,
        finalized_hash: hash,
        created_by: params.actor_user_id,
      },
      { onConflict: 'visit_id' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[upsertChargeDraft] Error:', error.message);
    return { success: false, error: error.message };
  }

  await writeBillingAuditLog({
    actor_user_id: params.actor_user_id,
    entity_type: 'charge_draft',
    entity_id: data.id,
    action: 'finalize',
    after_state: { visit_id: params.visit_id, finalized_hash: hash },
  });

  return { success: true, draft_id: data.id };
}

// ============================================================================
// Confirm Charges
// ============================================================================

export async function confirmCharges(input: unknown): Promise<{
  success: boolean;
  charges?: ExtendedVisitCharge[];
  error?: string;
  warnings?: string[];
}> {
  const parsed = confirmChargesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map(i => i.message).join(', ') };
  }
  const data = parsed.data;
  const warnings: string[] = [];

  // Get finalized_hash from draft if available
  const { data: draft } = await supabaseAdmin
    .from('charge_capture_drafts')
    .select('finalized_hash')
    .eq('visit_id', data.visit_id)
    .single();

  const finalizedHash = draft?.finalized_hash ?? null;

  // Get visit discipline
  const { data: visit } = await supabaseAdmin
    .from('visits')
    .select('discipline')
    .eq('id', data.visit_id)
    .single();

  const visitDiscipline = visit?.discipline ?? 'PT';

  // Check prior authorization
  const { data: priorAuths } = await supabaseAdmin
    .from('prior_authorizations')
    .select('*')
    .eq('patient_id', data.patient_id)
    .eq('status', 'approved')
    .or(`discipline.eq.${visitDiscipline},discipline.is.null`);

  if (priorAuths && priorAuths.length > 0) {
    const activeAuth = priorAuths.find(
      (a: { start_date: string; end_date: string }) => {
        const now = new Date().toISOString().split('T')[0];
        return a.start_date <= now && a.end_date >= now;
      }
    );
    if (activeAuth) {
      const remaining = activeAuth.remaining_visits ?? (activeAuth.authorized_visits - activeAuth.used_visits);
      if (remaining !== null && remaining <= 0) {
        warnings.push(`Prior authorization ${activeAuth.auth_number || activeAuth.id} has 0 remaining visits. Charges may be denied.`);
      } else if (remaining !== null && remaining <= (AUTH_THRESHOLDS[visitDiscipline as keyof typeof AUTH_THRESHOLDS] || AUTH_THRESHOLDS.PT).critical) {
        warnings.push(`Prior authorization ${activeAuth.auth_number || activeAuth.id} has only ${remaining} visits remaining.`);
      }
    }
  }

  // Build charge records with source_key for idempotency
  const chargeRecords = data.charges.map((charge, idx) => {
    const discipline = charge.discipline ?? visitDiscipline;
    const sourceKey = generateSourceKey({
      visit_id: data.visit_id,
      cpt_code: charge.cpt_code,
      modifier_1: charge.modifier_1,
      modifier_2: charge.modifier_2,
      discipline,
      finalized_hash: finalizedHash,
    });

    return {
      visit_id: data.visit_id,
      episode_id: data.episode_id,
      patient_id: data.patient_id,
      clinic_id: data.clinic_id,
      cpt_code_id: charge.cpt_code_id,
      cpt_code: charge.cpt_code,
      description: charge.description ?? null,
      units: charge.units,
      minutes_spent: charge.minutes_spent ?? null,
      modifier_1: charge.modifier_1 ?? null,
      modifier_2: charge.modifier_2 ?? null,
      diagnosis_pointer: charge.diagnosis_pointer ?? [1],
      diagnosis_codes: charge.diagnosis_codes ?? null,
      charge_amount: charge.charge_amount,
      rate_per_unit: charge.rate_per_unit ?? charge.charge_amount / Math.max(charge.units, 1),
      date_of_service: charge.date_of_service,
      is_timed: charge.is_timed ?? false,
      discipline,
      place_of_service: charge.place_of_service ?? '11',
      rendering_provider_id: charge.rendering_provider_id ?? null,
      source_key: sourceKey,
      source: 'finalized',
      is_confirmed: true,
      locked: false,
      status: 'pending',
      line_number: idx + 1,
      created_by: data.actor_user_id,
    };
  });

  // Upsert charges using source_key for idempotency
  // We insert one-by-one to handle ON CONFLICT gracefully
  const insertedCharges: ExtendedVisitCharge[] = [];

  for (const record of chargeRecords) {
    const { data: existing } = await supabaseAdmin
      .from('visit_charges')
      .select('id')
      .eq('visit_id', record.visit_id!)
      .eq('source_key', record.source_key)
      .single();

    if (existing) {
      // Update existing charge
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('visit_charges')
        .update({
          units: record.units,
          minutes_spent: record.minutes_spent,
          charge_amount: record.charge_amount,
          rate_per_unit: record.rate_per_unit,
          is_confirmed: true,
          description: record.description,
          diagnosis_pointer: record.diagnosis_pointer,
          diagnosis_codes: record.diagnosis_codes,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) {
        return { success: false, error: `Failed to update charge: ${updateErr.message}` };
      }
      insertedCharges.push(updated as ExtendedVisitCharge);
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('visit_charges')
        .insert(record)
        .select()
        .single();

      if (insertErr) {
        return { success: false, error: `Failed to insert charge: ${insertErr.message}` };
      }
      insertedCharges.push(inserted as ExtendedVisitCharge);
    }
  }

  // Increment prior auth used_visits (guard: only if not already counted for this visit)
  if (priorAuths && priorAuths.length > 0) {
    const activeAuth = priorAuths.find(
      (a: { start_date: string; end_date: string }) => {
        const now = new Date().toISOString().split('T')[0];
        return a.start_date <= now && a.end_date >= now;
      }
    );
    if (activeAuth) {
      // Check if we already counted this visit
      const { data: existingChargesForVisit } = await supabaseAdmin
        .from('visit_charges')
        .select('id')
        .eq('visit_id', data.visit_id)
        .eq('is_confirmed', true)
        .neq('id', insertedCharges[0]?.id);

      const alreadyCounted = existingChargesForVisit && existingChargesForVisit.length > 0;

      if (!alreadyCounted) {
        if (activeAuth.auth_type === 'units') {
          const totalUnits = data.charges.reduce((sum, c) => sum + c.units, 0);
          await supabaseAdmin
            .from('prior_authorizations')
            .update({ units_used: (activeAuth.units_used ?? 0) + totalUnits })
            .eq('id', activeAuth.id);
        } else {
          await supabaseAdmin
            .from('prior_authorizations')
            .update({ used_visits: activeAuth.used_visits + 1 })
            .eq('id', activeAuth.id);
        }

        await writeBillingAuditLog({
          actor_user_id: data.actor_user_id,
          entity_type: 'prior_auth',
          entity_id: activeAuth.id,
          action: 'update',
          after_state: { visit_id: data.visit_id, action: 'visit_counted' },
        });
      }
    }
  }

  // Write audit log for each confirmed charge
  await writeBillingAuditLogBatch(
    insertedCharges.map((c) => ({
      actor_user_id: data.actor_user_id,
      entity_type: 'charge' as const,
      entity_id: c.id,
      action: 'confirm',
      after_state: {
        cpt_code: c.cpt_code,
        units: c.units,
        charge_amount: c.charge_amount,
        visit_id: data.visit_id,
      },
    }))
  );

  return { success: true, charges: insertedCharges, warnings };
}

// ============================================================================
// Generate Claim
// ============================================================================

export async function generateClaim(input: unknown): Promise<{
  success: boolean;
  claim?: ExtendedClaim;
  invoice?: Invoice;
  error?: string;
}> {
  const parsed = generateClaimSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map(i => i.message).join(', ') };
  }
  const data = parsed.data;

  // Fetch confirmed charges
  const { data: charges, error: chargeErr } = await supabaseAdmin
    .from('visit_charges')
    .select('*')
    .in('id', data.charge_ids)
    .eq('is_confirmed', true);

  if (chargeErr || !charges || charges.length === 0) {
    return { success: false, error: 'No confirmed charges found for the provided IDs' };
  }

  // Check none are locked
  const lockedCharges = charges.filter((c: { locked: boolean }) => c.locked);
  if (lockedCharges.length > 0) {
    return { success: false, error: 'Some charges are locked by an existing claim. Void the existing claim first.' };
  }

  // Determine payer type
  let payerType = data.payer_type ?? null;
  let insuranceRecord = null;

  if (data.insurance_id) {
    const { data: ins } = await supabaseAdmin
      .from('patient_insurance')
      .select('*')
      .eq('id', data.insurance_id)
      .single();
    if (ins) {
      insuranceRecord = ins;
      payerType = ins.payer_type;
    }
  }

  // If private pay, create invoice instead of claim
  if (payerType === 'private_pay') {
    return createPrivatePayInvoice(data, charges);
  }

  // Calculate totals
  const totalCharges = charges.reduce(
    (sum: number, c: { charge_amount: number | null }) => sum + (c.charge_amount ?? 0),
    0
  );

  // Get clinic billing settings
  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('name, billing_npi, tax_id, taxonomy_code, medicaid_provider_id, submitter_id, billing_address, billing_city, billing_state, billing_zip')
    .eq('id', data.clinic_id)
    .single();

  if (!clinic) {
    return { success: false, error: 'Clinic not found' };
  }

  // Get patient info
  const { data: patient } = await supabaseAdmin
    .from('patients')
    .select('first_name, last_name, date_of_birth, medicaid_id, subscriber_id, payer_name, payer_id')
    .eq('id', data.patient_id)
    .single();

  // Build claim snapshot of confirmed charges
  const claimSnapshot = {
    charges: charges.map((c: Record<string, unknown>, idx: number) => ({
      charge_id: c.id,
      cpt_code: c.cpt_code,
      description: c.description,
      units: c.units,
      charge_amount: c.charge_amount,
      modifier_1: c.modifier_1,
      modifier_2: c.modifier_2,
      diagnosis_pointer: c.diagnosis_pointer,
      date_of_service: c.date_of_service,
      line_number: idx + 1,
    })),
    snapshot_at: new Date().toISOString(),
  };

  // Determine submission method
  const submissionMethod = payerType === 'medicaid' ? 'tmhp_edi' : 'clearinghouse';

  // Get next claim number from sequence
  const { data: seqResult } = await supabaseAdmin.rpc('nextval_text', { seq_name: 'claim_number_seq' });
  const claimNumber = seqResult ? `CLM-${seqResult}` : `CLM-${Date.now()}`;

  // Create claim record
  const { data: claim, error: claimErr } = await supabaseAdmin
    .from('claims')
    .insert({
      clinic_id: data.clinic_id,
      patient_id: data.patient_id,
      episode_id: data.episode_id,
      claim_number: claimNumber,
      payer_name: insuranceRecord?.payer_name ?? patient?.payer_name ?? 'Texas Medicaid',
      payer_id: insuranceRecord?.payer_id ?? patient?.payer_id ?? '330897513',
      subscriber_id: insuranceRecord?.member_id ?? patient?.medicaid_id ?? patient?.subscriber_id,
      total_charges: totalCharges,
      diagnosis_codes: data.diagnosis_codes ?? null,
      rendering_provider_npi: data.rendering_provider_npi ?? clinic?.billing_npi ?? null,
      rendering_provider_name: data.rendering_provider_name ?? null,
      place_of_service: data.place_of_service,
      status: 'draft',
      payer_type: payerType,
      insurance_id: data.insurance_id ?? null,
      submission_method: submissionMethod,
      frequency_code: '1',
      claim_snapshot: claimSnapshot,
      discipline: charges[0]?.discipline ?? null,
      created_by: data.actor_user_id,
    })
    .select()
    .single();

  if (claimErr || !claim) {
    return { success: false, error: `Failed to create claim: ${claimErr?.message}` };
  }

  // Create claim_lines from charge snapshot
  const claimLines = charges.map((c: Record<string, unknown>, idx: number) => ({
    claim_id: claim.id,
    visit_charge_id: c.id as string,
    line_number: idx + 1,
    cpt_code: c.cpt_code as string,
    modifier_1: c.modifier_1 ?? null,
    modifier_2: c.modifier_2 ?? null,
    units: c.units as number,
    charge_amount: c.charge_amount as number ?? 0,
    rate_per_unit: c.rate_per_unit ?? null,
    diagnosis_pointers: c.diagnosis_pointer ?? [1],
    date_of_service: c.date_of_service as string,
    description: c.description ?? null,
    place_of_service: c.place_of_service ?? '11',
  }));

  const { error: lineErr } = await supabaseAdmin
    .from('claim_lines')
    .insert(claimLines);

  if (lineErr) {
    console.error('[generateClaim] Failed to create claim_lines:', lineErr.message);
  }

  // Lock all confirmed charges for this visit
  const chargeIds = charges.map((c: { id: string }) => c.id);
  await supabaseAdmin
    .from('visit_charges')
    .update({ locked: true })
    .in('id', chargeIds);

  // Audit log
  await writeBillingAuditLogBatch([
    {
      actor_user_id: data.actor_user_id,
      entity_type: 'claim',
      entity_id: claim.id,
      action: 'create',
      after_state: {
        claim_number: claimNumber,
        total_charges: totalCharges,
        payer_type: payerType,
        charge_count: charges.length,
      },
    },
    ...chargeIds.map((cid: string) => ({
      actor_user_id: data.actor_user_id,
      entity_type: 'charge' as const,
      entity_id: cid,
      action: 'lock',
      after_state: { claim_id: claim.id },
    })),
  ]);

  // Fetch claim with lines
  const { data: fullClaim } = await supabaseAdmin
    .from('claims')
    .select('*, claim_lines(*)')
    .eq('id', claim.id)
    .single();

  return { success: true, claim: fullClaim as ExtendedClaim };
}

// ============================================================================
// Private Pay Invoice Creation (internal helper)
// ============================================================================

async function createPrivatePayInvoice(
  data: { clinic_id: string; patient_id: string; episode_id: string; visit_id?: string; actor_user_id: string; charge_ids: string[] },
  charges: Record<string, unknown>[],
): Promise<{ success: boolean; invoice?: Invoice; error?: string }> {
  const totalAmount = charges.reduce(
    (sum: number, c: { charge_amount?: number | null }) =>
      sum + ((c.charge_amount as number) ?? 0),
    0
  );

  const invoiceNumber = `INV-${Date.now()}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const { data: invoice, error: invoiceErr } = await supabaseAdmin
    .from('invoices')
    .insert({
      patient_id: data.patient_id,
      clinic_id: data.clinic_id,
      visit_id: data.visit_id ?? null,
      episode_id: data.episode_id,
      invoice_number: invoiceNumber,
      amount_due: totalAmount,
      amount_paid: 0,
      status: 'unpaid',
      due_date: dueDate.toISOString().split('T')[0],
      created_by: data.actor_user_id,
    })
    .select()
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, error: `Failed to create invoice: ${invoiceErr?.message}` };
  }

  // Create invoice_lines
  const invoiceLines = charges.map((c: Record<string, unknown>) => ({
    invoice_id: invoice.id,
    charge_id: c.id as string,
    cpt_code: c.cpt_code as string,
    description: c.description as string ?? null,
    units: c.units as number,
    rate_per_unit: (c.rate_per_unit as number) ?? ((c.charge_amount as number) ?? 0) / Math.max(c.units as number, 1),
  }));

  await supabaseAdmin.from('invoice_lines').insert(invoiceLines);

  // Lock charges
  const chargeIds = charges.map((c: Record<string, unknown>) => c.id as string);
  await supabaseAdmin
    .from('visit_charges')
    .update({ locked: true })
    .in('id', chargeIds);

  await writeBillingAuditLog({
    actor_user_id: data.actor_user_id,
    entity_type: 'invoice',
    entity_id: invoice.id,
    action: 'create',
    after_state: { invoice_number: invoiceNumber, amount_due: totalAmount },
  });

  return { success: true, invoice: invoice as Invoice };
}

// ============================================================================
// Mark Invoice Paid
// ============================================================================

export async function markInvoicePaid(input: unknown): Promise<{
  success: boolean;
  invoice?: Invoice;
  error?: string;
}> {
  const parsed = markInvoicePaidSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map(i => i.message).join(', ') };
  }
  const data = parsed.data;

  const { data: existing } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', data.invoice_id)
    .single();

  if (!existing) {
    return { success: false, error: 'Invoice not found' };
  }

  const amountPaid = data.amount_paid ?? existing.amount_due;
  const newStatus = amountPaid >= existing.amount_due ? 'paid' : 'partial';

  const { data: updated, error } = await supabaseAdmin
    .from('invoices')
    .update({
      amount_paid: amountPaid,
      status: newStatus,
      paid_at: new Date().toISOString(),
      payment_method: data.payment_method,
    })
    .eq('id', data.invoice_id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await writeBillingAuditLog({
    actor_user_id: data.actor_user_id,
    entity_type: 'invoice',
    entity_id: data.invoice_id,
    action: 'mark_paid',
    before_state: { status: existing.status, amount_paid: existing.amount_paid },
    after_state: { status: newStatus, amount_paid: amountPaid, payment_method: data.payment_method },
  });

  return { success: true, invoice: updated as Invoice };
}

// ============================================================================
// Void Claim
// ============================================================================

export async function voidClaim(input: unknown): Promise<{
  success: boolean;
  error?: string;
}> {
  const parsed = voidClaimSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map(i => i.message).join(', ') };
  }
  const data = parsed.data;

  const { data: claim } = await supabaseAdmin
    .from('claims')
    .select('*, claim_lines(*)')
    .eq('id', data.claim_id)
    .single();

  if (!claim) {
    return { success: false, error: 'Claim not found' };
  }

  if (claim.status === 'void') {
    return { success: false, error: 'Claim is already voided' };
  }

  // Void the claim
  await supabaseAdmin
    .from('claims')
    .update({ status: 'void' })
    .eq('id', data.claim_id);

  // Unlock charges linked through claim_lines
  if (claim.claim_lines && claim.claim_lines.length > 0) {
    const chargeIds = claim.claim_lines
      .filter((l: { visit_charge_id: string | null }) => l.visit_charge_id)
      .map((l: { visit_charge_id: string }) => l.visit_charge_id);

    if (chargeIds.length > 0) {
      await supabaseAdmin
        .from('visit_charges')
        .update({ locked: false })
        .in('id', chargeIds);
    }
  }

  await writeBillingAuditLog({
    actor_user_id: data.actor_user_id,
    entity_type: 'claim',
    entity_id: data.claim_id,
    action: 'void',
    before_state: { status: claim.status },
    after_state: { status: 'void', reason: data.reason },
  });

  return { success: true };
}

// ============================================================================
// Resubmit Claim (Void + Create Replacement)
// ============================================================================

export async function resubmitClaim(input: unknown): Promise<{
  success: boolean;
  newClaim?: ExtendedClaim;
  error?: string;
}> {
  const parsed = resubmitClaimSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map(i => i.message).join(', ') };
  }
  const data = parsed.data;

  // Fetch original claim with lines
  const { data: original } = await supabaseAdmin
    .from('claims')
    .select('*, claim_lines(*)')
    .eq('id', data.original_claim_id)
    .single();

  if (!original) {
    return { success: false, error: 'Original claim not found' };
  }

  if (original.status === 'void') {
    return { success: false, error: 'Original claim is already voided' };
  }

  // 1. Void original
  await supabaseAdmin
    .from('claims')
    .update({ status: 'void' })
    .eq('id', data.original_claim_id);

  // 2. Unlock charges
  if (original.claim_lines && original.claim_lines.length > 0) {
    const chargeIds = original.claim_lines
      .filter((l: { visit_charge_id: string | null }) => l.visit_charge_id)
      .map((l: { visit_charge_id: string }) => l.visit_charge_id);

    if (chargeIds.length > 0) {
      await supabaseAdmin
        .from('visit_charges')
        .update({ locked: false })
        .in('id', chargeIds);
    }
  }

  // 3. Get next claim number
  const { data: seqResult } = await supabaseAdmin.rpc('nextval_text', { seq_name: 'claim_number_seq' });
  const claimNumber = seqResult ? `CLM-${seqResult}` : `CLM-${Date.now()}`;

  // 4. Create replacement claim with frequency_code=7
  const { data: newClaim, error: claimErr } = await supabaseAdmin
    .from('claims')
    .insert({
      clinic_id: original.clinic_id,
      patient_id: original.patient_id,
      episode_id: original.episode_id,
      claim_number: claimNumber,
      payer_name: original.payer_name,
      payer_id: original.payer_id,
      subscriber_id: original.subscriber_id,
      total_charges: original.total_charges,
      diagnosis_codes: original.diagnosis_codes,
      rendering_provider_npi: original.rendering_provider_npi,
      rendering_provider_name: original.rendering_provider_name,
      place_of_service: original.place_of_service,
      status: 'draft',
      payer_type: original.payer_type,
      insurance_id: original.insurance_id,
      submission_method: original.submission_method,
      frequency_code: '7',
      original_claim_id: data.original_claim_id,
      claim_snapshot: original.claim_snapshot,
      discipline: original.discipline,
      created_by: data.actor_user_id,
    })
    .select()
    .single();

  if (claimErr || !newClaim) {
    return { success: false, error: `Failed to create replacement claim: ${claimErr?.message}` };
  }

  // 5. Copy claim_lines from original snapshot
  if (original.claim_lines && original.claim_lines.length > 0) {
    const newLines = original.claim_lines.map((l: Record<string, unknown>) => ({
      claim_id: newClaim.id,
      visit_charge_id: l.visit_charge_id,
      line_number: l.line_number,
      cpt_code: l.cpt_code,
      modifier_1: l.modifier_1,
      modifier_2: l.modifier_2,
      units: l.units,
      charge_amount: l.charge_amount,
      rate_per_unit: l.rate_per_unit,
      diagnosis_pointers: l.diagnosis_pointers,
      date_of_service: l.date_of_service,
      description: l.description,
      place_of_service: l.place_of_service,
    }));

    await supabaseAdmin.from('claim_lines').insert(newLines);

    // Re-lock charges
    const chargeIds = original.claim_lines
      .filter((l: { visit_charge_id: string | null }) => l.visit_charge_id)
      .map((l: { visit_charge_id: string }) => l.visit_charge_id);

    if (chargeIds.length > 0) {
      await supabaseAdmin
        .from('visit_charges')
        .update({ locked: true })
        .in('id', chargeIds);
    }
  }

  // 6. Audit logs
  await writeBillingAuditLogBatch([
    {
      actor_user_id: data.actor_user_id,
      entity_type: 'claim',
      entity_id: data.original_claim_id,
      action: 'void',
      before_state: { status: original.status },
      after_state: { status: 'void', reason: 'Voided for resubmission' },
    },
    {
      actor_user_id: data.actor_user_id,
      entity_type: 'claim',
      entity_id: newClaim.id,
      action: 'resubmit',
      after_state: {
        claim_number: claimNumber,
        frequency_code: '7',
        original_claim_id: data.original_claim_id,
      },
    },
  ]);

  // Fetch full claim with lines
  const { data: fullClaim } = await supabaseAdmin
    .from('claims')
    .select('*, claim_lines(*)')
    .eq('id', newClaim.id)
    .single();

  return { success: true, newClaim: fullClaim as ExtendedClaim };
}

// ============================================================================
// RPC helper: nextval_text
// We need a Postgres function to call nextval and return text.
// If the function doesn't exist yet, we fall back to Date.now().
// ============================================================================
