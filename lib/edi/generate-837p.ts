/**
 * HIPAA 837P (Professional Claims) EDI X12 Generator
 * Generates 837P files for TMHP (Texas Medicaid) submission.
 *
 * Transaction Set: 837 (Health Care Claim: Professional)
 * Version: 005010X222A1
 */

import {
  segment,
  ediDate,
  ediTime,
  fixedWidth,
  zeroPad,
  generateControlNumber,
  ediDecimal,
  ediClean,
  formatNPI,
  formatTaxId,
  COMPONENT_SEP,
} from './edi-utils';

export interface Claim837PData {
  // Submitter / Billing Provider (clinic)
  submitterId: string;
  submitterName: string;
  submitterContactName: string;
  submitterPhone: string;
  billingProviderNpi: string;
  billingProviderTaxId: string;
  billingProviderTaxonomy: string;
  billingProviderName: string;
  billingProviderAddress: string;
  billingProviderCity: string;
  billingProviderState: string;
  billingProviderZip: string;

  // Receiver
  receiverId: string;
  receiverName: string;

  // Subscriber / Patient
  subscriberId: string;
  patientLastName: string;
  patientFirstName: string;
  patientDob: string;
  patientGender: string;
  patientAddress: string;
  patientCity: string;
  patientState: string;
  patientZip: string;

  // Payer
  payerName: string;
  payerId: string;

  // Claim
  claimId: string;
  totalChargeAmount: number;
  placeOfService: string;
  diagnosisCodes: string[];
  renderingProviderNpi?: string;
  renderingProviderLastName?: string;
  renderingProviderFirstName?: string;

  // Service Lines
  serviceLines: ServiceLine837P[];
}

export interface ServiceLine837P {
  lineNumber: number;
  cptCode: string;
  modifier1?: string;
  modifier2?: string;
  chargeAmount: number;
  units: number;
  diagnosisPointers: number[];
  dateOfService: string;
}

/**
 * Generate a complete 837P X12 EDI file.
 */
export function generate837P(data: Claim837PData): string {
  const now = new Date();
  const isaControlNumber = generateControlNumber();
  const gsControlNumber = zeroPad(Math.floor(Math.random() * 999999) + 1, 6);
  const stControlNumber = zeroPad(Math.floor(Math.random() * 9999) + 1, 4);

  const segments: string[] = [];

  // ================================================================
  // ISA - Interchange Control Header
  // ================================================================
  segments.push(
    segment(
      'ISA',
      '00',                                        // ISA01: Auth Info Qualifier
      fixedWidth('', 10),                           // ISA02: Auth Info
      '00',                                         // ISA03: Security Info Qualifier
      fixedWidth('', 10),                           // ISA04: Security Info
      'ZZ',                                         // ISA05: Sender ID Qualifier (Mutually Defined)
      fixedWidth(data.submitterId, 15),             // ISA06: Sender ID
      'ZZ',                                         // ISA07: Receiver ID Qualifier
      fixedWidth(data.receiverId, 15),              // ISA08: Receiver ID
      ediDate(now).slice(2),                        // ISA09: Date (YYMMDD)
      ediTime(now),                                 // ISA10: Time
      '^',                                          // ISA11: Repetition Separator
      '00501',                                      // ISA12: Version
      isaControlNumber,                             // ISA13: Control Number
      '0',                                          // ISA14: Ack Requested
      'P',                                          // ISA15: Usage (P=Production, T=Test)
      COMPONENT_SEP                                 // ISA16: Component Separator
    )
  );

  // ================================================================
  // GS - Functional Group Header
  // ================================================================
  segments.push(
    segment(
      'GS',
      'HC',                                         // GS01: Functional ID (Health Care)
      data.submitterId,                             // GS02: App Sender Code
      data.receiverId,                              // GS03: App Receiver Code
      ediDate(now),                                 // GS04: Date
      ediTime(now),                                 // GS05: Time
      gsControlNumber,                              // GS06: Group Control Number
      'X',                                          // GS07: Responsible Agency
      '005010X222A1'                                // GS08: Version
    )
  );

  // ================================================================
  // ST - Transaction Set Header
  // ================================================================
  segments.push(
    segment(
      'ST',
      '837',                                        // ST01: Transaction Set ID
      stControlNumber,                              // ST02: Control Number
      '005010X222A1'                                // ST03: Implementation Convention
    )
  );

  // ================================================================
  // BHT - Beginning of Hierarchical Transaction
  // ================================================================
  segments.push(
    segment(
      'BHT',
      '0019',                                       // BHT01: Hierarchical Structure Code
      '00',                                         // BHT02: Transaction Purpose (00=Original)
      data.claimId.slice(0, 30),                    // BHT03: Reference ID
      ediDate(now),                                 // BHT04: Date
      ediTime(now),                                 // BHT05: Time
      'CH'                                          // BHT06: Transaction Type (CH=Chargeable)
    )
  );

  // ================================================================
  // Loop 1000A - Submitter Name
  // ================================================================
  segments.push(
    segment('NM1', '41', '2', ediClean(data.submitterName), '', '', '', '', '46', data.submitterId)
  );
  segments.push(
    segment('PER', 'IC', ediClean(data.submitterContactName), 'TE', data.submitterPhone.replace(/\D/g, ''))
  );

  // ================================================================
  // Loop 1000B - Receiver Name
  // ================================================================
  segments.push(
    segment('NM1', '40', '2', ediClean(data.receiverName), '', '', '', '', '46', data.receiverId)
  );

  // ================================================================
  // Loop 2000A - Billing Provider Hierarchical Level
  // ================================================================
  segments.push(segment('HL', '1', '', '20', '1'));
  segments.push(segment('PRV', 'BI', 'PXC', data.billingProviderTaxonomy));

  // Loop 2010AA - Billing Provider Name
  segments.push(
    segment(
      'NM1', '85', '2',
      ediClean(data.billingProviderName),
      '', '', '', '',
      'XX',
      formatNPI(data.billingProviderNpi)
    )
  );
  segments.push(
    segment(
      'N3',
      ediClean(data.billingProviderAddress)
    )
  );
  segments.push(
    segment(
      'N4',
      ediClean(data.billingProviderCity),
      data.billingProviderState,
      data.billingProviderZip.replace(/\D/g, '')
    )
  );
  segments.push(
    segment('REF', 'EI', formatTaxId(data.billingProviderTaxId))
  );

  // ================================================================
  // Loop 2000B - Subscriber Hierarchical Level
  // ================================================================
  segments.push(segment('HL', '2', '1', '22', '0'));
  segments.push(segment('SBR', 'P', '18', '', '', '', '', '', '', 'MC')); // MC = Medicaid

  // Loop 2010BA - Subscriber Name
  segments.push(
    segment(
      'NM1', 'IL', '1',
      ediClean(data.patientLastName),
      ediClean(data.patientFirstName),
      '', '', '',
      'MI',
      data.subscriberId
    )
  );
  segments.push(segment('N3', ediClean(data.patientAddress || '')));
  segments.push(
    segment(
      'N4',
      ediClean(data.patientCity || ''),
      data.patientState || '',
      (data.patientZip || '').replace(/\D/g, '')
    )
  );
  segments.push(
    segment(
      'DMG',
      'D8',
      ediDate(data.patientDob),
      data.patientGender === 'female' ? 'F' : data.patientGender === 'male' ? 'M' : 'U'
    )
  );

  // Loop 2010BB - Payer Name
  segments.push(
    segment(
      'NM1', 'PR', '2',
      ediClean(data.payerName),
      '', '', '', '',
      'PI',
      data.payerId
    )
  );

  // ================================================================
  // Loop 2300 - Claim Information
  // ================================================================
  const clmValue = `${data.claimId.slice(0, 20)}`;
  segments.push(
    segment(
      'CLM',
      clmValue,
      ediDecimal(data.totalChargeAmount),
      '',
      '',
      `${data.placeOfService}${COMPONENT_SEP}B${COMPONENT_SEP}1`, // Place of service, Frequency Code, Provider Signature
      'Y',                                          // Assignment of benefits
      'A',                                          // Release of info
      'Y',                                          // Patient signature
      'I'                                           // Claim filing indicator (in-network)
    )
  );

  // Diagnosis codes (HI segment)
  if (data.diagnosisCodes && data.diagnosisCodes.length > 0) {
    const hiElements = data.diagnosisCodes.map((code, idx) => {
      const qualifier = idx === 0 ? 'ABK' : 'ABF'; // ABK=Principal, ABF=Other
      return `${qualifier}${COMPONENT_SEP}${code.replace('.', '')}`;
    });
    segments.push(segment('HI', ...hiElements));
  }

  // Rendering Provider (if different from billing)
  if (data.renderingProviderNpi) {
    segments.push(
      segment(
        'NM1', '82', '1',
        ediClean(data.renderingProviderLastName || ''),
        ediClean(data.renderingProviderFirstName || ''),
        '', '', '',
        'XX',
        formatNPI(data.renderingProviderNpi)
      )
    );
    if (data.billingProviderTaxonomy) {
      segments.push(segment('PRV', 'PE', 'PXC', data.billingProviderTaxonomy));
    }
  }

  // ================================================================
  // Loop 2400 - Service Lines
  // ================================================================
  data.serviceLines.forEach((line) => {
    // Build diagnosis pointer string (e.g., "1:2:3")
    const pointers = (line.diagnosisPointers || [1]).map(String).join(COMPONENT_SEP);

    // SV1 - Professional Service
    const modifiers = [line.modifier1, line.modifier2].filter(Boolean);
    const procedureCode = ['HC', line.cptCode, ...modifiers].join(COMPONENT_SEP);

    segments.push(
      segment(
        'SV1',
        procedureCode,
        ediDecimal(line.chargeAmount),
        'UN',                                       // Unit basis (Units)
        String(line.units),
        '',
        '',
        pointers
      )
    );

    // DTP - Date of Service
    segments.push(
      segment('DTP', '472', 'D8', ediDate(line.dateOfService))
    );
  });

  // ================================================================
  // Trailers
  // ================================================================

  // SE - Transaction Set Trailer
  // Count includes ST and SE themselves
  const segCount = segments.length + 1; // +1 for SE itself (ST already counted)
  segments.push(segment('SE', String(segCount), stControlNumber));

  // GE - Functional Group Trailer
  segments.push(segment('GE', '1', gsControlNumber));

  // IEA - Interchange Control Trailer
  segments.push(segment('IEA', '1', isaControlNumber));

  return segments.join('\n');
}
