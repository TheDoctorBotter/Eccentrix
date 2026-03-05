/**
 * Billing module shared types.
 * Extends existing types in lib/types.ts with billing-automation-specific types.
 */

import { z } from 'zod';

// ============================================================================
// Patient Insurance
// ============================================================================

export type PayerType = 'medicaid' | 'commercial' | 'private_pay';

export interface PatientInsurance {
  id: string;
  patient_id: string;
  clinic_id: string;
  payer_type: PayerType;
  payer_name?: string | null;
  payer_id?: string | null;
  member_id?: string | null;
  group_number?: string | null;
  subscriber_name?: string | null;
  subscriber_dob?: string | null;
  subscriber_first_name?: string | null;
  subscriber_last_name?: string | null;
  subscriber_gender?: string | null;
  subscriber_address_line1?: string | null;
  subscriber_address_city?: string | null;
  subscriber_address_state?: string | null;
  subscriber_address_zip?: string | null;
  relationship_to_subscriber: string;
  priority: number;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const patientInsuranceSchema = z.object({
  patient_id: z.string().uuid(),
  clinic_id: z.string().uuid(),
  payer_type: z.enum(['medicaid', 'commercial', 'private_pay']),
  payer_name: z.string().optional().nullable(),
  payer_id: z.string().optional().nullable(),
  member_id: z.string().optional().nullable(),
  group_number: z.string().optional().nullable(),
  subscriber_name: z.string().optional().nullable(),
  subscriber_dob: z.string().optional().nullable(),
  subscriber_first_name: z.string().optional().nullable(),
  subscriber_last_name: z.string().optional().nullable(),
  subscriber_gender: z.enum(['M', 'F', 'U']).optional().nullable(),
  subscriber_address_line1: z.string().optional().nullable(),
  subscriber_address_city: z.string().optional().nullable(),
  subscriber_address_state: z.string().optional().nullable(),
  subscriber_address_zip: z.string().optional().nullable(),
  relationship_to_subscriber: z.string().default('self'),
  priority: z.number().int().min(1).default(1),
  is_primary: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

// ============================================================================
// Charge Capture Draft
// ============================================================================

export interface ChargeCaptureDraft {
  id: string;
  visit_id: string;
  clinic_id?: string | null;
  draft_state: Record<string, unknown>;
  finalized_hash?: string | null;
  updated_at: string;
  created_by?: string | null;
  created_at: string;
}

// ============================================================================
// Extended Claim (adds new columns to existing Claim type)
// ============================================================================

export type ExtendedClaimStatus =
  | 'draft' | 'generated' | 'submitted' | 'accepted'
  | 'rejected' | 'paid' | 'denied' | 'void' | 'ready';

export interface ExtendedClaim {
  id: string;
  clinic_id: string;
  patient_id: string;
  episode_id?: string | null;
  claim_number?: string | null;
  payer_name: string;
  payer_id: string;
  subscriber_id?: string | null;
  total_charges: number;
  diagnosis_codes?: string[] | null;
  rendering_provider_npi?: string | null;
  rendering_provider_name?: string | null;
  place_of_service: string;
  status: ExtendedClaimStatus;
  // New fields
  payer_type?: PayerType | null;
  insurance_id?: string | null;
  submission_method?: string | null;
  frequency_code?: string | null;
  original_claim_id?: string | null;
  edi_storage_path?: string | null;
  edi_file_content?: string | null;
  claim_snapshot?: Record<string, unknown> | null;
  response_code?: string | null;
  response_message?: string | null;
  discipline?: string | null;
  //
  edi_generated_at?: string | null;
  submitted_at?: string | null;
  paid_at?: string | null;
  paid_amount?: number | null;
  denial_reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  patient_name?: string;
  lines?: ExtendedClaimLine[];
  claim_lines?: ExtendedClaimLine[];
}

export interface ExtendedClaimLine {
  id: string;
  claim_id: string;
  visit_charge_id?: string | null;
  line_number: number;
  cpt_code: string;
  modifier_1?: string | null;
  modifier_2?: string | null;
  units: number;
  charge_amount: number;
  rate_per_unit?: number | null;
  diagnosis_pointers?: number[] | null;
  diagnosis_codes?: string[] | null;
  date_of_service: string;
  description?: string | null;
  place_of_service?: string | null;
  created_at: string;
}

// ============================================================================
// Invoice
// ============================================================================

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';

export interface Invoice {
  id: string;
  patient_id: string;
  clinic_id: string;
  visit_id?: string | null;
  episode_id?: string | null;
  invoice_number?: string | null;
  amount_due: number;
  amount_paid: number;
  status: InvoiceStatus;
  due_date?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  patient_name?: string;
  lines?: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  charge_id?: string | null;
  cpt_code?: string | null;
  description?: string | null;
  units: number;
  rate_per_unit: number;
  line_total: number;
  created_at: string;
}

// ============================================================================
// Extended Visit Charge (adds new columns)
// ============================================================================

export interface ExtendedVisitCharge {
  id: string;
  visit_id?: string | null;
  document_id?: string | null;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  cpt_code_id: string;
  cpt_code: string;
  description?: string | null;
  minutes_spent?: number | null;
  units: number;
  modifier_1?: string | null;
  modifier_2?: string | null;
  diagnosis_pointer?: number[] | null;
  charge_amount?: number | null;
  date_of_service: string;
  status: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // New fields
  source_key?: string | null;
  locked: boolean;
  is_confirmed: boolean;
  source: string;
  discipline?: string | null;
  is_timed?: boolean | null;
  unit_calc_method?: string | null;
  unit_calc_notes?: string | null;
  diagnosis_codes?: string[] | null;
  place_of_service?: string | null;
  rate_per_unit?: number | null;
  rendering_provider_id?: string | null;
}

// ============================================================================
// Billing Audit Log
// ============================================================================

export type BillingEntityType =
  | 'charge' | 'claim' | 'invoice' | 'prior_auth'
  | 'invoice_line' | 'claim_line' | 'charge_draft' | 'patient_insurance';

export type BillingAction =
  | 'create' | 'confirm' | 'void' | 'resubmit' | 'mark_paid'
  | 'update' | 'delete' | 'lock' | 'unlock' | 'generate_edi'
  | 'submit' | 'finalize';

export interface BillingAuditLogEntry {
  id: string;
  actor_user_id?: string | null;
  entity_type: BillingEntityType;
  entity_id: string;
  action: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================================
// Extended Prior Authorization
// ============================================================================

export type AuthType = 'visits' | 'units';

export interface ExtendedPriorAuth {
  id: string;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  auth_number?: string | null;
  insurance_name?: string | null;
  insurance_phone?: string | null;
  authorized_visits?: number | null;
  used_visits: number;
  remaining_visits?: number | null;
  start_date: string;
  end_date: string;
  requested_date?: string | null;
  approved_date?: string | null;
  status: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // New fields
  insurance_id?: string | null;
  discipline?: string | null;
  auth_type: AuthType;
  units_authorized?: number | null;
  units_used?: number | null;
}

// ============================================================================
// Zod Schemas for Billing Write Endpoints
// ============================================================================

export const confirmChargesSchema = z.object({
  visit_id: z.string().uuid(),
  clinic_id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
  charges: z.array(z.object({
    cpt_code_id: z.string().uuid(),
    cpt_code: z.string(),
    description: z.string().optional(),
    units: z.number().int().min(1),
    minutes_spent: z.number().int().min(0).optional(),
    modifier_1: z.string().optional().nullable(),
    modifier_2: z.string().optional().nullable(),
    diagnosis_pointer: z.array(z.number().int()).optional(),
    diagnosis_codes: z.array(z.string()).optional(),
    charge_amount: z.number().min(0),
    rate_per_unit: z.number().min(0).optional(),
    date_of_service: z.string(),
    is_timed: z.boolean().optional(),
    discipline: z.string().optional(),
    place_of_service: z.string().default('11'),
    rendering_provider_id: z.string().uuid().optional(),
  })).min(1),
  episode_id: z.string().uuid(),
  patient_id: z.string().uuid(),
});

export const generateClaimSchema = z.object({
  visit_id: z.string().uuid().optional(),
  episode_id: z.string().uuid(),
  clinic_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  insurance_id: z.string().uuid().optional(),
  charge_ids: z.array(z.string().uuid()).min(1),
  diagnosis_codes: z.array(z.string()).optional(),
  rendering_provider_npi: z.string().optional(),
  rendering_provider_name: z.string().optional(),
  payer_type: z.enum(['medicaid', 'commercial', 'private_pay']).optional(),
  place_of_service: z.string().default('11'),
  actor_user_id: z.string().uuid(),
});

export const markInvoicePaidSchema = z.object({
  invoice_id: z.string().uuid(),
  payment_method: z.string(),
  actor_user_id: z.string().uuid(),
  amount_paid: z.number().min(0).optional(),
});

export const voidClaimSchema = z.object({
  claim_id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
  reason: z.string().optional(),
});

export const resubmitClaimSchema = z.object({
  original_claim_id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
});
