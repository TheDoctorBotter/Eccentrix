/**
 * Integration test: Full billing flow
 *
 * Tests the flow from charge confirmation through claim/invoice generation.
 * Note: This test validates types, schemas, and logic only.
 * Database operations are not tested here since they require a live Supabase connection.
 */

import { describe, it, expect } from 'vitest';
import { confirmChargesSchema, generateClaimSchema, markInvoicePaidSchema, voidClaimSchema, resubmitClaimSchema } from '../types';
import { calculateEightMinuteRule, generateSourceKey } from '../eight-minute-rule';

describe('Billing Integration Flow', () => {
  const visitId = '00000000-0000-0000-0000-000000000001';
  const clinicId = '00000000-0000-0000-0000-000000000002';
  const patientId = '00000000-0000-0000-0000-000000000003';
  const episodeId = '00000000-0000-0000-0000-000000000004';
  const userId = '00000000-0000-0000-0000-000000000005';
  const cptCodeId = '00000000-0000-0000-0000-000000000006';

  describe('Step 1: Confirm charges schema validation', () => {
    it('validates a valid charge confirmation payload', () => {
      const payload = {
        visit_id: visitId,
        clinic_id: clinicId,
        actor_user_id: userId,
        episode_id: episodeId,
        patient_id: patientId,
        charges: [
          {
            cpt_code_id: cptCodeId,
            cpt_code: '97110',
            description: 'Therapeutic Exercise',
            units: 3,
            minutes_spent: 45,
            modifier_1: 'GP',
            charge_amount: 120,
            rate_per_unit: 40,
            date_of_service: '2026-03-05',
            is_timed: true,
            discipline: 'PT',
          },
          {
            cpt_code_id: cptCodeId,
            cpt_code: '97140',
            description: 'Manual Therapy',
            units: 2,
            minutes_spent: 30,
            modifier_1: 'GP',
            modifier_2: '59',
            charge_amount: 80,
            rate_per_unit: 40,
            date_of_service: '2026-03-05',
            is_timed: true,
          },
        ],
      };

      const result = confirmChargesSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects empty charges array', () => {
      const payload = {
        visit_id: visitId,
        clinic_id: clinicId,
        actor_user_id: userId,
        episode_id: episodeId,
        patient_id: patientId,
        charges: [],
      };

      const result = confirmChargesSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      const payload = {
        clinic_id: clinicId,
        charges: [{ cpt_code: '97110', units: 1, charge_amount: 40, date_of_service: '2026-03-05' }],
      };

      const result = confirmChargesSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Step 2: 8-minute rule for charges', () => {
    it('correctly calculates units for PT timed code', () => {
      const result = calculateEightMinuteRule(45, true, '97110', 'PT');
      expect(result.units).toBe(3);
      expect(result.isEligible).toBe(true);
    });

    it('correctly calculates units for OT timed code', () => {
      const result = calculateEightMinuteRule(30, true, '97530', 'OT');
      expect(result.units).toBe(2);
    });

    it('returns 1 unit for ST untimed eval code', () => {
      const result = calculateEightMinuteRule(60, true, '92523', 'ST');
      expect(result.units).toBe(1);
      expect(result.isEligible).toBe(false);
    });
  });

  describe('Step 3: Source key generation for idempotency', () => {
    it('generates consistent source keys', () => {
      const key1 = generateSourceKey({
        visit_id: visitId,
        cpt_code: '97110',
        modifier_1: 'GP',
        discipline: 'PT',
        finalized_hash: 'hash123',
      });
      const key2 = generateSourceKey({
        visit_id: visitId,
        cpt_code: '97110',
        modifier_1: 'GP',
        discipline: 'PT',
        finalized_hash: 'hash123',
      });
      expect(key1).toBe(key2);
    });

    it('generates different keys for different CPT codes on same visit', () => {
      const key1 = generateSourceKey({
        visit_id: visitId,
        cpt_code: '97110',
        discipline: 'PT',
      });
      const key2 = generateSourceKey({
        visit_id: visitId,
        cpt_code: '97140',
        discipline: 'PT',
      });
      expect(key1).not.toBe(key2);
    });

    it('generates different keys when finalized_hash changes', () => {
      const key1 = generateSourceKey({
        visit_id: visitId,
        cpt_code: '97110',
        discipline: 'PT',
        finalized_hash: 'hash1',
      });
      const key2 = generateSourceKey({
        visit_id: visitId,
        cpt_code: '97110',
        discipline: 'PT',
        finalized_hash: 'hash2',
      });
      expect(key1).not.toBe(key2);
    });
  });

  describe('Step 4: Generate claim schema validation', () => {
    it('validates a valid claim generation payload', () => {
      const payload = {
        visit_id: visitId,
        episode_id: episodeId,
        clinic_id: clinicId,
        patient_id: patientId,
        charge_ids: [
          '00000000-0000-0000-0000-000000000010',
          '00000000-0000-0000-0000-000000000011',
        ],
        diagnosis_codes: ['M54.16', 'M51.30'],
        payer_type: 'medicaid' as const,
        actor_user_id: userId,
      };

      const result = generateClaimSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects empty charge_ids', () => {
      const result = generateClaimSchema.safeParse({
        episode_id: episodeId,
        clinic_id: clinicId,
        patient_id: patientId,
        charge_ids: [],
        actor_user_id: userId,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Step 5: Void claim schema validation', () => {
    it('validates a void claim payload', () => {
      const result = voidClaimSchema.safeParse({
        claim_id: '00000000-0000-0000-0000-000000000020',
        actor_user_id: userId,
        reason: 'Incorrect coding',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Step 6: Resubmit claim schema validation', () => {
    it('validates a resubmit payload', () => {
      const result = resubmitClaimSchema.safeParse({
        original_claim_id: '00000000-0000-0000-0000-000000000020',
        actor_user_id: userId,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Step 7: Mark invoice paid schema validation', () => {
    it('validates a mark paid payload', () => {
      const result = markInvoicePaidSchema.safeParse({
        invoice_id: '00000000-0000-0000-0000-000000000030',
        payment_method: 'credit_card',
        actor_user_id: userId,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing payment_method', () => {
      const result = markInvoicePaidSchema.safeParse({
        invoice_id: '00000000-0000-0000-0000-000000000030',
        actor_user_id: userId,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Full flow: source key prevents duplicates', () => {
    it('same visit+cpt+modifier+hash produces same source_key', () => {
      const params = {
        visit_id: visitId,
        cpt_code: '97110',
        modifier_1: 'GP',
        modifier_2: null as string | null,
        discipline: 'PT',
        finalized_hash: 'abc',
      };

      const key1 = generateSourceKey(params);
      const key2 = generateSourceKey(params);

      // If these are the same, the UNIQUE index on (visit_id, source_key)
      // will prevent duplicate charges
      expect(key1).toBe(key2);
    });
  });
});
