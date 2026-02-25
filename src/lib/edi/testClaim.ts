/**
 * Buckeye EMR — Sample Test Claim Data
 *
 * Realistic physical therapy claim data for testing the 837P generator.
 * Uses common PT CPT codes, GP modifier, and ICD-10 diagnosis code M54.5
 * (Low back pain) — the most common outpatient PT diagnosis.
 *
 * Service Lines:
 *   - 97110: Therapeutic Exercise (GP modifier) — 3 units
 *   - 97140: Manual Therapy Techniques (GP modifier) — 2 units
 *   - 97530: Therapeutic Activities (GP modifier) — 2 units
 *
 * Place of Service: 11 (Office)
 * Payer: Texas Medicaid (TMHP) — Payer ID 330897513
 *
 * @module testClaim
 */

import type { Claim837PInput } from './types';
import { generate837P } from './generate837P';

/**
 * Sample claim input with realistic physical therapy data.
 * All charges use approximate Texas Medicaid fee schedule rates.
 */
export const sampleClaim: Claim837PInput = {
  // ========================================================================
  // Submitter — The entity submitting the EDI transaction
  // ========================================================================
  submitter: {
    name: 'BUCKEYE PHYSICAL THERAPY',
    submitterId: '1234567890',     // Medicaid provider ID / ETIN
    contactName: 'JANE SMITH',
    contactPhone: '5125551234',
    contactEmail: 'billing@buckeyept.com',
  },

  // ========================================================================
  // Billing Provider — The practice/clinic billing for services
  // ========================================================================
  billingProvider: {
    name: 'BUCKEYE PHYSICAL THERAPY LLC',
    npi: '1234567890',              // 10-digit NPI
    taxonomyCode: '225100000X',     // Physical Therapist
    address1: '1234 MAIN STREET',
    address2: 'SUITE 100',
    city: 'AUSTIN',
    state: 'TX',
    zip: '78701',
    taxId: '123456789',             // 9-digit EIN
  },

  // ========================================================================
  // Rendering Provider — The individual therapist who performed services
  // ========================================================================
  renderingProvider: {
    firstName: 'JOHN',
    lastName: 'DOE',
    npi: '9876543210',              // Individual NPI
    taxonomyCode: '225100000X',     // Physical Therapist
  },

  // ========================================================================
  // Patient / Subscriber — The Medicaid beneficiary
  // ========================================================================
  patient: {
    firstName: 'MARIA',
    lastName: 'GARCIA',
    dateOfBirth: '1985-03-15',
    gender: 'F',
    medicaidId: '123456789012',     // Texas Medicaid ID
    address1: '5678 OAK AVENUE',
    address2: 'APT 2B',
    city: 'AUSTIN',
    state: 'TX',
    zip: '78702',
  },

  // ========================================================================
  // Claim Details
  // ========================================================================
  claim: {
    claimId: 'BPT-2026-001234',
    totalCharge: 285.00,            // Sum of all service line charges
    placeOfService: '11',           // 11 = Office
    dateOfService: '2026-02-20',
    diagnosisCodes: ['M54.5'],      // Low back pain (most common PT Dx)
    frequencyCode: '1',             // Original claim
  },

  // ========================================================================
  // Service Lines — Individual CPT codes billed
  // ========================================================================
  serviceLines: [
    {
      // 97110: Therapeutic Exercise
      // Each to improve strength, flexibility, endurance, or range of motion.
      // Timed code — each unit = 15 minutes.
      cptCode: '97110',
      modifiers: ['GP'],            // GP = Services delivered under a PT plan of care
      units: 3,                     // 45 minutes of therapeutic exercise
      chargeAmount: 120.00,         // $40.00 per unit × 3 units
      dateOfService: '2026-02-20',
      icdPointers: [1],             // Points to M54.5
    },
    {
      // 97140: Manual Therapy Techniques
      // Skilled hands-on techniques (mobilization, manipulation, manual traction).
      // Timed code — each unit = 15 minutes.
      cptCode: '97140',
      modifiers: ['GP'],
      units: 2,                     // 30 minutes of manual therapy
      chargeAmount: 90.00,          // $45.00 per unit × 2 units
      dateOfService: '2026-02-20',
      icdPointers: [1],             // Points to M54.5
    },
    {
      // 97530: Therapeutic Activities
      // Dynamic activities to improve functional performance.
      // Timed code — each unit = 15 minutes.
      cptCode: '97530',
      modifiers: ['GP'],
      units: 2,                     // 30 minutes of therapeutic activities
      chargeAmount: 75.00,          // $37.50 per unit × 2 units
      dateOfService: '2026-02-20',
      icdPointers: [1],             // Points to M54.5
    },
  ],
};

/**
 * Generate a sample 837P file using the test claim data.
 * Useful for testing the generator without a database connection.
 *
 * @returns GenerationResult with the complete 837P EDI file
 */
export function generateSampleClaim() {
  return generate837P(sampleClaim);
}

/**
 * Print the sample 837P to console (for development/debugging).
 */
export function printSampleClaim(): void {
  const result = generateSampleClaim();

  if (!result.success) {
    console.error('Sample claim generation failed:');
    result.errors.forEach((e) => console.error(`  [${e.severity}] ${e.field}: ${e.message}`));
    return;
  }

  console.log('=== Sample 837P (Formatted) ===');
  console.log(result.ediContentFormatted);
  console.log('');
  console.log('=== Control Numbers ===');
  console.log(`  ISA: ${result.controlNumbers.isa}`);
  console.log(`  GS:  ${result.controlNumbers.gs}`);
  console.log(`  ST:  ${result.controlNumbers.st}`);
  console.log(`  Segments: ${result.segmentCount}`);
}
