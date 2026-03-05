'use server';

/**
 * EDI file storage and download.
 * EDI files are stored in Supabase Storage private bucket.
 * Only admin and biller roles may download raw EDI.
 */

import { supabaseAdmin } from '@/lib/supabase-server';
import { writeBillingAuditLog } from './audit';
import { generate837P } from '@/lib/edi/837p-generator';
import type { Claim837PInput } from '@/lib/edi/types';

const EDI_BUCKET = 'edi-files';

/**
 * Ensure the EDI storage bucket exists.
 */
async function ensureBucket(): Promise<void> {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === EDI_BUCKET);
  if (!exists) {
    await supabaseAdmin.storage.createBucket(EDI_BUCKET, {
      public: false,
      fileSizeLimit: 1024 * 1024, // 1MB max for EDI files
    });
  }
}

/**
 * Generate 837P EDI, upload to Storage, and update claim record.
 */
export async function generateAndStoreEDI(params: {
  claim_id: string;
  edi_input: Claim837PInput;
  actor_user_id: string;
}): Promise<{
  success: boolean;
  edi_storage_path?: string;
  edi_content?: string;
  error?: string;
}> {
  // Generate EDI
  const result = generate837P(params.edi_input);

  if (!result.success || !result.ediContent) {
    return {
      success: false,
      error: `EDI generation failed: ${result.errors.map((e) => e.message).join(', ')}`,
    };
  }

  // Upload to storage
  await ensureBucket();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const storagePath = `claims/${params.claim_id}/${timestamp}_837p.edi`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(EDI_BUCKET)
    .upload(storagePath, result.ediContent, {
      contentType: 'text/plain',
      upsert: false,
    });

  if (uploadError) {
    return { success: false, error: `Storage upload failed: ${uploadError.message}` };
  }

  // Update claim with storage path and status
  const { error: updateError } = await supabaseAdmin
    .from('claims')
    .update({
      edi_storage_path: storagePath,
      edi_generated_at: new Date().toISOString(),
      status: 'generated',
    })
    .eq('id', params.claim_id);

  if (updateError) {
    return { success: false, error: `Failed to update claim: ${updateError.message}` };
  }

  await writeBillingAuditLog({
    actor_user_id: params.actor_user_id,
    entity_type: 'claim',
    entity_id: params.claim_id,
    action: 'generate_edi',
    after_state: {
      edi_storage_path: storagePath,
      control_numbers: result.controlNumbers,
    },
  });

  return {
    success: true,
    edi_storage_path: storagePath,
    edi_content: result.ediContent,
  };
}

/**
 * Generate a signed download URL for an EDI file.
 * Restricted to admin and biller roles.
 */
export async function getEDIDownloadUrl(params: {
  claim_id: string;
  actor_user_id: string;
}): Promise<{ success: boolean; url?: string; error?: string }> {
  // Check user role
  const { data: memberships } = await supabaseAdmin
    .from('clinic_memberships')
    .select('role')
    .eq('user_id', params.actor_user_id)
    .eq('is_active', true);

  const roles = memberships?.map((m) => m.role) ?? [];
  const canAccess = roles.some((r) => r === 'admin' || r === 'biller');

  if (!canAccess) {
    return { success: false, error: 'Only admin and biller roles may download EDI files' };
  }

  // Get the storage path from the claim
  const { data: claim } = await supabaseAdmin
    .from('claims')
    .select('edi_storage_path')
    .eq('id', params.claim_id)
    .single();

  if (!claim?.edi_storage_path) {
    return { success: false, error: 'No EDI file found for this claim' };
  }

  // Generate signed URL (expires in 5 minutes)
  const { data, error } = await supabaseAdmin.storage
    .from(EDI_BUCKET)
    .createSignedUrl(claim.edi_storage_path, 300);

  if (error || !data?.signedUrl) {
    return { success: false, error: `Failed to generate download URL: ${error?.message}` };
  }

  return { success: true, url: data.signedUrl };
}

/**
 * Submit claim placeholder — sets status to submitted.
 */
export async function submitClaimToTMHP(params: {
  claim_id: string;
  actor_user_id: string;
}): Promise<{ success: boolean; error?: string }> {
  // TODO: INSERT TMHP SFTP OR API SUBMISSION CALL HERE — DO NOT REMOVE THIS COMMENT

  const { error } = await supabaseAdmin
    .from('claims')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', params.claim_id);

  if (error) {
    return { success: false, error: error.message };
  }

  await writeBillingAuditLog({
    actor_user_id: params.actor_user_id,
    entity_type: 'claim',
    entity_id: params.claim_id,
    action: 'submit',
    after_state: { status: 'submitted', submitted_at: new Date().toISOString() },
  });

  return { success: true };
}

/**
 * Submit claim to Claim.MD placeholder — sets status to ready.
 */
export async function submitClaimToClaimMD(params: {
  claim_id: string;
  actor_user_id: string;
}): Promise<{ success: boolean; error?: string }> {
  // TODO: CLAIM.MD API INTEGRATION POINT — DO NOT REMOVE THIS COMMENT

  const { error } = await supabaseAdmin
    .from('claims')
    .update({
      status: 'ready',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', params.claim_id);

  if (error) {
    return { success: false, error: error.message };
  }

  await writeBillingAuditLog({
    actor_user_id: params.actor_user_id,
    entity_type: 'claim',
    entity_id: params.claim_id,
    action: 'submit',
    after_state: { status: 'ready', method: 'claimmd_placeholder' },
  });

  return { success: true };
}
