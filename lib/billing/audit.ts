/**
 * Billing audit log helper.
 * All billing audit writes use the service role client to bypass RLS.
 */

import { supabaseAdmin } from '@/lib/supabase-server';
import type { BillingEntityType } from './types';

interface AuditLogParams {
  actor_user_id: string;
  entity_type: BillingEntityType;
  entity_id: string;
  action: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Write a billing audit log entry using the service role client.
 * Never throws — logs errors to console on failure.
 */
export async function writeBillingAuditLog(params: AuditLogParams): Promise<void> {
  const { error } = await supabaseAdmin
    .from('billing_audit_log')
    .insert({
      actor_user_id: params.actor_user_id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      action: params.action,
      before_state: params.before_state ?? null,
      after_state: params.after_state ?? null,
      metadata: params.metadata ?? null,
    });

  if (error) {
    console.error('[billing_audit_log] Failed to write audit entry:', error.message, params);
  }
}

/**
 * Write multiple audit log entries in a batch.
 */
export async function writeBillingAuditLogBatch(entries: AuditLogParams[]): Promise<void> {
  if (entries.length === 0) return;

  const { error } = await supabaseAdmin
    .from('billing_audit_log')
    .insert(
      entries.map((e) => ({
        actor_user_id: e.actor_user_id,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        action: e.action,
        before_state: e.before_state ?? null,
        after_state: e.after_state ?? null,
        metadata: e.metadata ?? null,
      }))
    );

  if (error) {
    console.error('[billing_audit_log] Failed to write batch audit entries:', error.message);
  }
}
