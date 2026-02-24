/**
 * HIPAA 270 (Eligibility Inquiry) EDI X12 Generator
 * Generates 270 files for TMHP (Texas Medicaid) eligibility verification.
 *
 * Transaction Set: 270 (Health Care Eligibility Benefit Inquiry)
 * Version: 005010X279A1
 */

import {
  segment,
  ediDate,
  ediTime,
  fixedWidth,
  zeroPad,
  generateControlNumber,
  ediClean,
  formatNPI,
  COMPONENT_SEP,
} from './edi-utils';

export interface Eligibility270Data {
  // Information Source (Payer - TMHP)
  payerName: string;
  payerId: string;

  // Information Receiver (Clinic)
  submitterId: string;
  providerName: string;
  providerNpi: string;

  // Subscriber (Patient)
  subscriberId: string;
  patientLastName: string;
  patientFirstName: string;
  patientDob: string;
  patientGender: string;

  // Inquiry
  dateOfService: string;
  serviceTypeCode: string; // 30 = Health Benefit Plan Coverage
}

/**
 * Generate a complete 270 X12 EDI eligibility inquiry file.
 */
export function generate270(data: Eligibility270Data): string {
  const now = new Date();
  const isaControlNumber = generateControlNumber();
  const gsControlNumber = zeroPad(Math.floor(Math.random() * 999999) + 1, 6);
  const stControlNumber = zeroPad(Math.floor(Math.random() * 9999) + 1, 4);

  const segments_arr: string[] = [];

  // ================================================================
  // ISA - Interchange Control Header
  // ================================================================
  segments_arr.push(
    segment(
      'ISA',
      '00',
      fixedWidth('', 10),
      '00',
      fixedWidth('', 10),
      'ZZ',
      fixedWidth(data.submitterId, 15),
      'ZZ',
      fixedWidth(data.payerId, 15),
      ediDate(now).slice(2),
      ediTime(now),
      '^',
      '00501',
      isaControlNumber,
      '0',
      'P',
      COMPONENT_SEP
    )
  );

  // ================================================================
  // GS - Functional Group Header
  // ================================================================
  segments_arr.push(
    segment(
      'GS',
      'HS',                                         // Functional ID (Health Care Eligibility)
      data.submitterId,
      data.payerId,
      ediDate(now),
      ediTime(now),
      gsControlNumber,
      'X',
      '005010X279A1'
    )
  );

  // ================================================================
  // ST - Transaction Set Header
  // ================================================================
  segments_arr.push(
    segment('ST', '270', stControlNumber, '005010X279A1')
  );

  // ================================================================
  // BHT - Beginning of Hierarchical Transaction
  // ================================================================
  segments_arr.push(
    segment(
      'BHT',
      '0022',                                       // Hierarchical Structure Code
      '13',                                         // Transaction Purpose (13=Request)
      generateControlNumber().slice(0, 9),           // Reference ID
      ediDate(now),
      ediTime(now)
    )
  );

  // ================================================================
  // Loop 2000A - Information Source (Payer)
  // ================================================================
  segments_arr.push(segment('HL', '1', '', '20', '1'));

  // Loop 2100A - Information Source Name
  segments_arr.push(
    segment(
      'NM1', 'PR', '2',
      ediClean(data.payerName),
      '', '', '', '',
      'PI',
      data.payerId
    )
  );

  // ================================================================
  // Loop 2000B - Information Receiver (Provider)
  // ================================================================
  segments_arr.push(segment('HL', '2', '1', '21', '1'));

  // Loop 2100B - Information Receiver Name
  segments_arr.push(
    segment(
      'NM1', '1P', '2',
      ediClean(data.providerName),
      '', '', '', '',
      'XX',
      formatNPI(data.providerNpi)
    )
  );

  // ================================================================
  // Loop 2000C - Subscriber
  // ================================================================
  segments_arr.push(segment('HL', '3', '2', '22', '0'));

  // TRN - Trace Number
  segments_arr.push(
    segment(
      'TRN',
      '1',
      generateControlNumber(),
      `1${formatNPI(data.providerNpi)}`
    )
  );

  // Loop 2100C - Subscriber Name
  segments_arr.push(
    segment(
      'NM1', 'IL', '1',
      ediClean(data.patientLastName),
      ediClean(data.patientFirstName),
      '', '', '',
      'MI',
      data.subscriberId
    )
  );

  // DMG - Subscriber Demographics
  segments_arr.push(
    segment(
      'DMG',
      'D8',
      ediDate(data.patientDob),
      data.patientGender === 'female' ? 'F' : data.patientGender === 'male' ? 'M' : 'U'
    )
  );

  // DTP - Date of Service
  segments_arr.push(
    segment('DTP', '291', 'D8', ediDate(data.dateOfService))
  );

  // EQ - Eligibility or Benefit Inquiry
  segments_arr.push(
    segment('EQ', data.serviceTypeCode)
  );

  // ================================================================
  // Trailers
  // ================================================================
  const segCount = segments_arr.length + 1;
  segments_arr.push(segment('SE', String(segCount), stControlNumber));
  segments_arr.push(segment('GE', '1', gsControlNumber));
  segments_arr.push(segment('IEA', '1', isaControlNumber));

  return segments_arr.join('\n');
}
