import { describe, it, expect } from 'vitest';
import { calculateEightMinuteRule, generateSourceKey } from '../eight-minute-rule';

describe('8-Minute Rule Calculator', () => {
  describe('timed codes', () => {
    it('returns 0 units for less than 8 minutes', () => {
      const result = calculateEightMinuteRule(7, true);
      expect(result.units).toBe(0);
      expect(result.isEligible).toBe(true);
      expect(result.calculation).toContain('< 8 minute minimum');
    });

    it('returns 0 units for 0 minutes', () => {
      expect(calculateEightMinuteRule(0, true).units).toBe(0);
    });

    it('returns 1 unit for 8 minutes', () => {
      expect(calculateEightMinuteRule(8, true).units).toBe(1);
    });

    it('returns 1 unit for 22 minutes', () => {
      expect(calculateEightMinuteRule(22, true).units).toBe(1);
    });

    it('returns 2 units for 23 minutes', () => {
      expect(calculateEightMinuteRule(23, true).units).toBe(2);
    });

    it('returns 2 units for 37 minutes', () => {
      expect(calculateEightMinuteRule(37, true).units).toBe(2);
    });

    it('returns 3 units for 38 minutes', () => {
      expect(calculateEightMinuteRule(38, true).units).toBe(3);
    });

    it('returns 3 units for 52 minutes', () => {
      expect(calculateEightMinuteRule(52, true).units).toBe(3);
    });

    it('returns 4 units for 53 minutes', () => {
      expect(calculateEightMinuteRule(53, true).units).toBe(4);
    });

    it('returns 4 units for 67 minutes', () => {
      expect(calculateEightMinuteRule(67, true).units).toBe(4);
    });

    it('returns 5 units for 68 minutes', () => {
      expect(calculateEightMinuteRule(68, true).units).toBe(5);
    });

    it('returns 8 units for 113 minutes', () => {
      expect(calculateEightMinuteRule(113, true).units).toBe(8);
    });

    it('returns correct units for >127 minutes using ceiling division', () => {
      expect(calculateEightMinuteRule(128, true).units).toBe(9);
      expect(calculateEightMinuteRule(135, true).units).toBe(9);
      expect(calculateEightMinuteRule(150, true).units).toBe(10);
    });

    it('includes calculation description', () => {
      const result = calculateEightMinuteRule(30, true);
      expect(result.calculation).toContain('23-37 minute range');
      expect(result.calculation).toContain('2 units');
    });
  });

  describe('untimed codes', () => {
    it('returns 1 unit regardless of minutes', () => {
      expect(calculateEightMinuteRule(0, false).units).toBe(1);
      expect(calculateEightMinuteRule(60, false).units).toBe(1);
      expect(calculateEightMinuteRule(120, false).units).toBe(1);
    });

    it('marks as not eligible for 8-minute rule', () => {
      const result = calculateEightMinuteRule(30, false);
      expect(result.isEligible).toBe(false);
      expect(result.ineligibleReason).toContain('Untimed codes');
    });
  });

  describe('ST evaluation codes', () => {
    const stEvalCodes = ['92521', '92522', '92523', '92524', '92526', '92597', '92605', '92610'];

    for (const code of stEvalCodes) {
      it(`never uses 8-minute rule for ST code ${code}`, () => {
        const result = calculateEightMinuteRule(45, true, code, 'ST');
        expect(result.units).toBe(1);
        expect(result.isEligible).toBe(false);
        expect(result.ineligibleReason).toContain('ST evaluation codes');
      });
    }

    it('does NOT treat PT timed codes as ST untimed', () => {
      const result = calculateEightMinuteRule(45, true, '97110', 'PT');
      expect(result.units).toBe(3);
      expect(result.isEligible).toBe(true);
    });
  });
});

describe('generateSourceKey', () => {
  it('generates deterministic key from inputs', () => {
    const key1 = generateSourceKey({
      visit_id: 'visit-1',
      cpt_code: '97110',
      modifier_1: 'GP',
      modifier_2: null,
      discipline: 'PT',
      finalized_hash: 'abc123',
    });
    const key2 = generateSourceKey({
      visit_id: 'visit-1',
      cpt_code: '97110',
      modifier_1: 'GP',
      modifier_2: null,
      discipline: 'PT',
      finalized_hash: 'abc123',
    });
    expect(key1).toBe(key2);
  });

  it('produces different keys for different inputs', () => {
    const key1 = generateSourceKey({
      visit_id: 'visit-1',
      cpt_code: '97110',
      discipline: 'PT',
    });
    const key2 = generateSourceKey({
      visit_id: 'visit-1',
      cpt_code: '97140',
      discipline: 'PT',
    });
    expect(key1).not.toBe(key2);
  });

  it('includes all components in the key', () => {
    const key = generateSourceKey({
      visit_id: 'v1',
      cpt_code: '97110',
      modifier_1: 'GP',
      modifier_2: '59',
      discipline: 'OT',
      finalized_hash: 'hash1',
    });
    expect(key).toContain('v1');
    expect(key).toContain('97110');
    expect(key).toContain('GP');
    expect(key).toContain('59');
    expect(key).toContain('OT');
    expect(key).toContain('hash1');
  });

  it('defaults null values to empty strings', () => {
    const key = generateSourceKey({
      visit_id: 'v1',
      cpt_code: '97110',
    });
    expect(key).toBe('v1|97110|||PT|');
  });
});
