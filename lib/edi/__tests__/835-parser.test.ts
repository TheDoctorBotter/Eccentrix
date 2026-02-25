/**
 * Unit Tests for EDI 835 Parser, Validator, Reason Code Lookup, and Payment Summary
 *
 * Tests cover:
 * - Validation of 835 file structure
 * - Parsing ISA/GS envelope data
 * - Loop 1000A (Payer) and 1000B (Payee) identification
 * - Loop 2000 transaction info (check/EFT, payment method, dates)
 * - Loop 2100 claim payment info (CLP, CAS, NM1, REF, DTM)
 * - Loop 2110 service line detail (SVC, CAS, DTM, AMT, LQ)
 * - CAS segment parsing for all group codes (CO, PR, OA, PI)
 * - PLB provider-level adjustments
 * - Multiple claims in a single 835
 * - Claim reversals and corrections
 * - Payment summary generation with flag detection
 * - CARC/RARC reason code lookups
 * - PT-specific denial scenario detection
 */

import { describe, it, expect } from 'vitest';
import { parse835, validate835 } from '../835-parser';
import { generatePaymentSummaries, generateTransactionSummary, formatPaymentReport } from '../payment-summary';
import { lookupCARC, lookupRARC, lookupPLBReason, isPTDenialCode, describeAdjustment } from '../reason-codes';

// ============================================================================
// Sample 835 EDI Data
// ============================================================================

/**
 * Sample 835 with 2 claims:
 *   Claim 1: PT eval (97161) + 3 treatment codes, partially paid with CO/PR adjustments
 *   Claim 2: Fully denied (no prior auth)
 * Includes: PLB provider-level recoupment, EFT payment, TMHP-style payer
 */
const SAMPLE_835_MULTI_CLAIM = [
  'ISA*00*          *00*          *ZZ*TMHP           *ZZ*1234567890     *240115*1230*^*00501*000000123*0*P*:~',
  'GS*HP*TMHP*1234567890*20240115*1230*000123*X*005010X221A1~',
  'ST*835*0001~',
  'BPR*C*450.00*C*ACH*CCP*01*111000025*DA*123456789*9876543210**01*222000050*DA*987654321*20240115~',
  'TRN*1*EFT20240115001*1234567890~',
  'DTM*405*20240115~',
  'N1*PR*TEXAS MEDICAID*PI*TXMCD~',
  'N3*12357 RIATA TRACE PKWY~',
  'N4*AUSTIN*TX*78727~',
  'PER*BL*TMHP PROVIDER SERVICES*TE*8005551234*UR*WWW.TMHP.COM~',
  'N1*PE*SOUTH TEXAS PT CLINIC*XX*1234567890~',
  'N3*1200 S 10TH ST~',
  'N4*MCALLEN*TX*78501~',
  'REF*TJ*741234567~',
  'CLP*CLAIM001*1*350.00*280.00*35.00*MC*TXMCD20240001*11*1~',
  'CAS*CO*45*70.00~',
  'CAS*PR*2*25.00*1*3*10.00~',
  'NM1*QC*1*DOE*JOHN*A***MI*123456789~',
  'NM1*IL*1*DOE*JOHN*A***MI*123456789~',
  'NM1*82*1*GARCIA*MARIA****XX*9876543210~',
  'MOA***MA01*MA18~',
  'DTM*232*20240115~',
  'DTM*233*20240115~',
  'REF*F8*ORIG835REF001~',
  'REF*1K*TXMCD20240001~',
  'AMT*AU*280.00~',
  'SVC*HC:97161:GP*150.00*120.00**1*1~',
  'DTM*472*20240115~',
  'CAS*CO*45*30.00~',
  'AMT*B6*120.00~',
  'SVC*HC:97110:GP*80.00*65.00**2**2~',
  'DTM*472*20240115~',
  'CAS*CO*45*15.00~',
  'AMT*B6*65.00~',
  'SVC*HC:97140:GP:59*70.00*55.00**1*1~',
  'DTM*472*20240115~',
  'CAS*CO*45*15.00~',
  'AMT*B6*55.00~',
  'SVC*HC:97530:GP*50.00*40.00**1*1~',
  'DTM*472*20240115~',
  'CAS*CO*45*10.00~',
  'AMT*B6*40.00~',
  'CLP*CLAIM002*4*200.00*0.00*0.00*MC*TXMCD20240002*11*1~',
  'CAS*CO*197*200.00~',
  'NM1*QC*1*SMITH*JANE*M***MI*987654321~',
  'DTM*232*20240110~',
  'DTM*233*20240110~',
  'REF*F8*ORIG835REF002~',
  'SVC*HC:97161:GP*150.00*0.00**1*1~',
  'DTM*472*20240110~',
  'CAS*CO*197*150.00~',
  'LQ*HE*N700~',
  'SVC*HC:97110:GP*50.00*0.00**1*1~',
  'DTM*472*20240110~',
  'CAS*CO*197*50.00~',
  'LQ*HE*N700~',
  'PLB*741234567*20240115*WO:RECOUP001*-75.00~',
  'SE*52*0001~',
  'GE*1*000123~',
  'IEA*1*000000123~',
].join('\n');

/**
 * Sample 835 with check payment and single claim (commercial payer).
 * Includes patient responsibility (copay, deductible, coinsurance).
 */
const SAMPLE_835_CHECK_SINGLE = [
  'ISA*00*          *00*          *ZZ*BCBSTX         *ZZ*1234567890     *240201*0900*^*00501*000000456*0*P*:~',
  'GS*HP*BCBSTX*1234567890*20240201*0900*000456*X*005010X221A1~',
  'ST*835*0002~',
  'BPR*C*185.00*C*CHK*****9876543210~',
  'TRN*1*CHK000789*BCBSTX~',
  'DTM*405*20240201~',
  'N1*PR*BLUE CROSS BLUE SHIELD TX*PI*BCBSTX~',
  'N1*PE*SOUTH TEXAS PT CLINIC*XX*1234567890~',
  'REF*TJ*741234567~',
  'CLP*CLAIM003*1*350.00*185.00*95.00*BL*BCBS20240003*11*1~',
  'CAS*CO*45*70.00~',
  'CAS*PR*1*50.00*1*2*20.00*1*3*25.00~',
  'NM1*QC*1*JOHNSON*ROBERT*L***MI*JRX1234567~',
  'DTM*232*20240125~',
  'DTM*233*20240125~',
  'REF*F8*ORIG835REF003~',
  'AMT*AU*280.00~',
  'SVC*HC:97161:GP*150.00*95.00**1*1~',
  'DTM*472*20240125~',
  'CAS*CO*45*30.00~',
  'CAS*PR*1*25.00~',
  'AMT*B6*120.00~',
  'SVC*HC:97110:GP*80.00*45.00**2*2~',
  'DTM*472*20240125~',
  'CAS*CO*45*15.00~',
  'CAS*PR*2*20.00~',
  'AMT*B6*65.00~',
  'SVC*HC:97530:GP*70.00*25.00**1*1~',
  'DTM*472*20240125~',
  'CAS*CO*45*15.00~',
  'CAS*PR*1*25.00*1*2*5.00~',
  'AMT*B6*55.00~',
  'SVC*HC:97140:GP:59*50.00*20.00**1*1~',
  'DTM*472*20240125~',
  'CAS*CO*45*10.00~',
  'CAS*PR*2*20.00~',
  'AMT*B6*40.00~',
  'SE*36*0002~',
  'GE*1*000456~',
  'IEA*1*000000456~',
].join('\n');

/**
 * Sample 835 with a claim reversal (status 22) and a corrected claim.
 */
const SAMPLE_835_REVERSAL = [
  'ISA*00*          *00*          *ZZ*AETNA          *ZZ*1234567890     *240301*1400*^*00501*000000789*0*P*:~',
  'GS*HP*AETNA*1234567890*20240301*1400*000789*X*005010X221A1~',
  'ST*835*0003~',
  'BPR*C*65.00*C*ACH*CCP*01*333000075*DA*555555555*9876543210**01*444000080*DA*666666666*20240301~',
  'TRN*1*EFT20240301002*AETNA~',
  'DTM*405*20240301~',
  'N1*PR*AETNA*PI*60054~',
  'N1*PE*SOUTH TEXAS PT CLINIC*XX*1234567890~',
  'CLP*CLAIM004*22*200.00*-200.00*0.00*CI*AETNA20240004*11*7~',
  'NM1*QC*1*WILLIAMS*LISA****MI*AET9999999~',
  'DTM*232*20240215~',
  'REF*F8*ORIG835REF004~',
  'SVC*HC:97161:GP*150.00*-150.00**1~',
  'DTM*472*20240215~',
  'SVC*HC:97110:GP*50.00*-50.00**1~',
  'DTM*472*20240215~',
  'CLP*CLAIM004C*1*200.00*265.00*0.00*CI*AETNA20240004C*11*7~',
  'CAS*CO*45*-65.00~',
  'NM1*QC*1*WILLIAMS*LISA****MI*AET9999999~',
  'DTM*232*20240215~',
  'REF*F8*ORIG835REF004C~',
  'SVC*HC:97161:GP*150.00*165.00**1~',
  'DTM*472*20240215~',
  'CAS*CO*45*-15.00~',
  'SVC*HC:97110:GP*50.00*100.00**1~',
  'DTM*472*20240215~',
  'CAS*CO*45*-50.00~',
  'SE*26*0003~',
  'GE*1*000789~',
  'IEA*1*000000789~',
].join('\n');

/**
 * Sample 835 with visit limit exceeded and bundled service denials.
 */
const SAMPLE_835_PT_DENIALS = [
  'ISA*00*          *00*          *ZZ*UNITEDHC       *ZZ*1234567890     *240315*1000*^*00501*000000999*0*T*:~',
  'GS*HP*UHC*1234567890*20240315*1000*000999*X*005010X221A1~',
  'ST*835*0004~',
  'BPR*C*65.00*C*CHK*****9876543210~',
  'TRN*1*CHK001234*UHC~',
  'DTM*405*20240315~',
  'N1*PR*UNITED HEALTHCARE*PI*87726~',
  'N1*PE*SOUTH TEXAS PT CLINIC*XX*1234567890~',
  'CLP*CLAIM005*1*280.00*65.00*0.00*CI*UHC20240005*11*1~',
  'CAS*CO*45*65.00~',
  'CAS*CO*119*100.00~',
  'CAS*CO*97*50.00~',
  'NM1*QC*1*MARTINEZ*CARLOS****MI*UHC5551234~',
  'DTM*232*20240310~',
  'REF*F8*ORIG835REF005~',
  'SVC*HC:97110:GP*80.00*65.00**2**2~',
  'DTM*472*20240310~',
  'CAS*CO*45*15.00~',
  'AMT*B6*65.00~',
  'SVC*HC:97140:GP:59*70.00*0.00**1*1~',
  'DTM*472*20240310~',
  'CAS*CO*119*70.00~',
  'LQ*HE*N362~',
  'SVC*HC:97530:GP*50.00*0.00**1*1~',
  'DTM*472*20240310~',
  'CAS*CO*97*50.00~',
  'LQ*HE*M15~',
  'SVC*HC:97150:GP*80.00*0.00**2**4~',
  'DTM*472*20240310~',
  'CAS*CO*119*80.00~',
  'LQ*HE*N362~',
  'SE*30*0004~',
  'GE*1*000999~',
  'IEA*1*000000999~',
].join('\n');

// ============================================================================
// Validation Tests
// ============================================================================

describe('835 Validation', () => {
  it('should reject empty content', () => {
    const errors = validate835('');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].severity).toBe('error');
  });

  it('should reject content not starting with ISA', () => {
    const errors = validate835('GS*HP*SENDER*RECEIVER~');
    expect(errors.some((e) => e.message.includes('ISA'))).toBe(true);
  });

  it('should reject 835 missing required segments', () => {
    const minimal = 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *240101*1200*^*00501*000000001*0*P*:~IEA*1*000000001~';
    const errors = validate835(minimal);
    expect(errors.some((e) => e.message.includes('Missing required segment: GS'))).toBe(true);
    expect(errors.some((e) => e.message.includes('Missing required segment: ST'))).toBe(true);
    expect(errors.some((e) => e.message.includes('Missing required segment: BPR'))).toBe(true);
  });

  it('should detect non-835 transaction set', () => {
    const wrong = [
      'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *240101*1200*^*00501*000000001*0*P*:~',
      'GS*HP*SENDER*RECEIVER*20240101*1200*000001*X*005010X221A1~',
      'ST*837*0001~',
      'BPR*C*100.00*C*CHK~',
      'TRN*1*CHK001~',
      'SE*3*0001~',
      'GE*1*000001~',
      'IEA*1*000000001~',
    ].join('');
    const errors = validate835(wrong);
    expect(errors.some((e) => e.message.includes('Expected transaction set 835'))).toBe(true);
  });

  it('should detect ISA/IEA control number mismatch', () => {
    const mismatch = [
      'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *240101*1200*^*00501*000000001*0*P*:~',
      'GS*HP*SENDER*RECEIVER*20240101*1200*000001*X*005010X221A1~',
      'ST*835*0001~',
      'BPR*C*100.00*C*CHK~',
      'TRN*1*CHK001~',
      'SE*3*0001~',
      'GE*1*000001~',
      'IEA*1*000000999~',
    ].join('');
    const errors = validate835(mismatch);
    expect(errors.some((e) => e.message.includes('ISA/IEA control number mismatch'))).toBe(true);
  });

  it('should pass validation for well-formed 835', () => {
    const errors = validate835(SAMPLE_835_MULTI_CLAIM);
    const fatalErrors = errors.filter((e) => e.severity === 'error');
    expect(fatalErrors.length).toBe(0);
  });

  it('should warn when no CLP segments exist', () => {
    const noClaims = [
      'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *240101*1200*^*00501*000000001*0*P*:~',
      'GS*HP*SENDER*RECEIVER*20240101*1200*000001*X*005010X221A1~',
      'ST*835*0001~',
      'BPR*C*0.00*C*CHK~',
      'TRN*1*CHK001~',
      'SE*3*0001~',
      'GE*1*000001~',
      'IEA*1*000000001~',
    ].join('');
    const errors = validate835(noClaims);
    expect(errors.some((e) => e.message.includes('No CLP'))).toBe(true);
  });
});

// ============================================================================
// Envelope Parsing Tests
// ============================================================================

describe('835 Envelope Parsing', () => {
  it('should parse ISA envelope data', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const { isa } = result.envelope;

    expect(isa.senderQualifier).toBe('ZZ');
    expect(isa.senderId).toBe('TMHP');
    expect(isa.receiverQualifier).toBe('ZZ');
    expect(isa.receiverId).toBe('1234567890');
    expect(isa.date).toBe('240115');
    expect(isa.time).toBe('1230');
    expect(isa.versionNumber).toBe('00501');
    expect(isa.controlNumber).toBe('000000123');
    expect(isa.usageIndicator).toBe('P');
    expect(isa.componentSeparator).toBe(':');
  });

  it('should parse GS envelope data', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const { gs } = result.envelope;

    expect(gs.functionalIdentifierCode).toBe('HP');
    expect(gs.senderCode).toBe('TMHP');
    expect(gs.receiverCode).toBe('1234567890');
    expect(gs.date).toBe('20240115');
    expect(gs.controlNumber).toBe('000123');
    expect(gs.versionCode).toBe('005010X221A1');
  });
});

// ============================================================================
// Loop 1000A - Payer Identification
// ============================================================================

describe('Loop 1000A - Payer Identification', () => {
  it('should parse payer name and ID', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const payer = result.transactions[0].payerIdentification;

    expect(payer.name).toBe('TEXAS MEDICAID');
    expect(payer.identifierCode).toBe('TXMCD');
  });

  it('should parse payer address', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const payer = result.transactions[0].payerIdentification;

    expect(payer.address).toBeDefined();
    expect(payer.address!.line1).toBe('12357 RIATA TRACE PKWY');
    expect(payer.address!.city).toBe('AUSTIN');
    expect(payer.address!.state).toBe('TX');
    expect(payer.address!.zip).toBe('78727');
  });

  it('should parse payer contact info', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const payer = result.transactions[0].payerIdentification;

    expect(payer.technicalContact).toBeDefined();
    expect(payer.technicalContact!.name).toBe('TMHP PROVIDER SERVICES');
    expect(payer.technicalContact!.phone).toBe('8005551234');
    expect(payer.technicalContact!.url).toBe('WWW.TMHP.COM');
  });

  it('should parse commercial payer without address', () => {
    const result = parse835(SAMPLE_835_CHECK_SINGLE);
    const payer = result.transactions[0].payerIdentification;

    expect(payer.name).toBe('BLUE CROSS BLUE SHIELD TX');
    expect(payer.identifierCode).toBe('BCBSTX');
  });
});

// ============================================================================
// Loop 1000B - Payee Identification
// ============================================================================

describe('Loop 1000B - Payee Identification', () => {
  it('should parse payee name and NPI', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const payee = result.transactions[0].payeeIdentification;

    expect(payee.name).toBe('SOUTH TEXAS PT CLINIC');
    expect(payee.identifierQualifier).toBe('XX');
    expect(payee.identifierCode).toBe('1234567890');
    expect(payee.npi).toBe('1234567890');
  });

  it('should parse payee address', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const payee = result.transactions[0].payeeIdentification;

    expect(payee.address).toBeDefined();
    expect(payee.address!.line1).toBe('1200 S 10TH ST');
    expect(payee.address!.city).toBe('MCALLEN');
    expect(payee.address!.state).toBe('TX');
    expect(payee.address!.zip).toBe('78501');
  });

  it('should parse payee tax ID from REF*TJ', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const payee = result.transactions[0].payeeIdentification;

    expect(payee.taxId).toBe('741234567');
  });
});

// ============================================================================
// Loop 2000 - Transaction Info
// ============================================================================

describe('Loop 2000 - Transaction Info', () => {
  it('should parse EFT payment method', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const txn = result.transactions[0];

    expect(txn.paymentMethod).toBe('ACH');
    expect(txn.totalPaymentAmount).toBe(450.00);
    expect(txn.creditDebitFlag).toBe('C');
    expect(txn.checkOrEftNumber).toBe('EFT20240115001');
    expect(txn.traceOriginatorId).toBe('1234567890');
  });

  it('should parse check payment method', () => {
    const result = parse835(SAMPLE_835_CHECK_SINGLE);
    const txn = result.transactions[0];

    expect(txn.paymentMethod).toBe('CHK');
    expect(txn.totalPaymentAmount).toBe(185.00);
    expect(txn.checkOrEftNumber).toBe('CHK000789');
  });

  it('should parse payment date from DTM*405', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    expect(result.transactions[0].paymentDate).toBe('20240115');
  });

  it('should parse EFT bank routing info', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const txn = result.transactions[0];

    expect(txn.senderBankId).toBe('111000025');
    expect(txn.senderBankAccountNumber).toBe('123456789');
    expect(txn.receiverBankId).toBe('222000050');
    expect(txn.receiverBankAccountNumber).toBe('987654321');
  });
});

// ============================================================================
// Loop 2100 - Claim Payment Info
// ============================================================================

describe('Loop 2100 - Claim Payment Info', () => {
  it('should parse multiple claims in a single 835', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    expect(result.transactions[0].claims.length).toBe(2);
  });

  it('should parse CLP segment for paid claim', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.patientAccountNumber).toBe('CLAIM001');
    expect(claim1.claimStatus).toBe('1');
    expect(claim1.totalChargedAmount).toBe(350.00);
    expect(claim1.totalPaidAmount).toBe(280.00);
    expect(claim1.patientResponsibilityAmount).toBe(35.00);
    expect(claim1.claimFilingIndicator).toBe('MC');
    expect(claim1.payerClaimControlNumber).toBe('TXMCD20240001');
    expect(claim1.facilityCode).toBe('11');
    expect(claim1.frequencyCode).toBe('1');
  });

  it('should parse CLP segment for denied claim', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim2 = result.transactions[0].claims[1];

    expect(claim2.patientAccountNumber).toBe('CLAIM002');
    expect(claim2.claimStatus).toBe('4');
    expect(claim2.totalChargedAmount).toBe(200.00);
    expect(claim2.totalPaidAmount).toBe(0.00);
  });

  it('should parse patient name from NM1*QC', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.patientName.lastName).toBe('DOE');
    expect(claim1.patientName.firstName).toBe('JOHN');
    expect(claim1.patientName.middleName).toBe('A');
    expect(claim1.patientName.identifierQualifier).toBe('MI');
    expect(claim1.patientName.identifier).toBe('123456789');
  });

  it('should parse insured name from NM1*IL', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.insuredName).toBeDefined();
    expect(claim1.insuredName!.lastName).toBe('DOE');
  });

  it('should parse rendering provider NPI from NM1*82', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.renderingProviderNpi).toBe('9876543210');
  });

  it('should parse claim dates (DTM*232/233)', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.statementFromDate).toBe('20240115');
    expect(claim1.statementToDate).toBe('20240115');
  });

  it('should parse original reference number (REF*F8)', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.originalReferenceNumber).toBe('ORIG835REF001');
  });

  it('should parse payer claim ID (REF*1K)', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.payerClaimId).toBe('TXMCD20240001');
  });

  it('should parse supplemental amounts (AMT*AU)', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    const allowed = claim1.supplementalAmounts.find((a) => a.qualifier === 'AU');
    expect(allowed).toBeDefined();
    expect(allowed!.amount).toBe(280.00);
  });

  it('should parse MOA remark codes', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.outpatientAdjudication).toBeDefined();
    expect(claim1.outpatientAdjudication!.remarkCodes).toContain('MA01');
    expect(claim1.outpatientAdjudication!.remarkCodes).toContain('MA18');
  });
});

// ============================================================================
// CAS Segment Parsing
// ============================================================================

describe('CAS Segment Parsing', () => {
  it('should parse CO (Contractual Obligation) adjustments', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    const coAdj = claim1.adjustments.find((a) => a.groupCode === 'CO');
    expect(coAdj).toBeDefined();
    expect(coAdj!.details[0].reasonCode).toBe('45');
    expect(coAdj!.details[0].amount).toBe(70.00);
  });

  it('should parse PR (Patient Responsibility) with multiple reasons', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    const prAdj = claim1.adjustments.find((a) => a.groupCode === 'PR');
    expect(prAdj).toBeDefined();
    expect(prAdj!.details.length).toBe(2);

    // Coinsurance
    expect(prAdj!.details[0].reasonCode).toBe('2');
    expect(prAdj!.details[0].amount).toBe(25.00);
    expect(prAdj!.details[0].quantity).toBe(1);

    // Copay
    expect(prAdj!.details[1].reasonCode).toBe('3');
    expect(prAdj!.details[1].amount).toBe(10.00);
  });

  it('should parse PR with deductible, coinsurance, and copay', () => {
    const result = parse835(SAMPLE_835_CHECK_SINGLE);
    const claim = result.transactions[0].claims[0];

    const prAdj = claim.adjustments.find((a) => a.groupCode === 'PR');
    expect(prAdj).toBeDefined();

    // Deductible (CARC 1)
    expect(prAdj!.details[0].reasonCode).toBe('1');
    expect(prAdj!.details[0].amount).toBe(50.00);

    // Coinsurance (CARC 2)
    expect(prAdj!.details[1].reasonCode).toBe('2');
    expect(prAdj!.details[1].amount).toBe(20.00);

    // Copay (CARC 3)
    expect(prAdj!.details[2].reasonCode).toBe('3');
    expect(prAdj!.details[2].amount).toBe(25.00);
  });

  it('should parse no-auth denial (CARC 197)', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim2 = result.transactions[0].claims[1];

    const coAdj = claim2.adjustments.find((a) => a.groupCode === 'CO');
    expect(coAdj).toBeDefined();
    expect(coAdj!.details[0].reasonCode).toBe('197');
    expect(coAdj!.details[0].amount).toBe(200.00);
  });

  it('should parse visit limit and bundled denials', () => {
    const result = parse835(SAMPLE_835_PT_DENIALS);
    const claim = result.transactions[0].claims[0];

    const coAdjs = claim.adjustments.filter((a) => a.groupCode === 'CO');
    const allDetails = coAdjs.flatMap((a) => a.details);

    // CARC 119 = visit limit
    expect(allDetails.some((d) => d.reasonCode === '119')).toBe(true);
    // CARC 97 = bundled
    expect(allDetails.some((d) => d.reasonCode === '97')).toBe(true);
  });
});

// ============================================================================
// Loop 2110 - Service Line Detail
// ============================================================================

describe('Loop 2110 - Service Line Detail', () => {
  it('should parse service lines for a claim', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim1 = result.transactions[0].claims[0];

    expect(claim1.serviceLines.length).toBe(4);
  });

  it('should parse CPT code and modifiers from SVC', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line1 = result.transactions[0].claims[0].serviceLines[0];

    expect(line1.procedure.qualifier).toBe('HC');
    expect(line1.procedure.code).toBe('97161');
    expect(line1.procedure.modifiers).toEqual(['GP']);
  });

  it('should parse multiple modifiers', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line3 = result.transactions[0].claims[0].serviceLines[2];

    expect(line3.procedure.code).toBe('97140');
    expect(line3.procedure.modifiers).toEqual(['GP', '59']);
  });

  it('should parse billed vs paid amounts', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line1 = result.transactions[0].claims[0].serviceLines[0];

    expect(line1.chargedAmount).toBe(150.00);
    expect(line1.paidAmount).toBe(120.00);
  });

  it('should parse units billed vs paid', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line2 = result.transactions[0].claims[0].serviceLines[1];

    expect(line2.unitsPaid).toBe(2);
    expect(line2.unitsBilled).toBe(2);
  });

  it('should parse service date (DTM*472)', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line1 = result.transactions[0].claims[0].serviceLines[0];

    expect(line1.serviceDate).toBe('20240115');
  });

  it('should parse line-level CAS adjustments', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line1 = result.transactions[0].claims[0].serviceLines[0];

    expect(line1.adjustments.length).toBeGreaterThan(0);
    const coAdj = line1.adjustments.find((a) => a.groupCode === 'CO');
    expect(coAdj).toBeDefined();
    expect(coAdj!.details[0].reasonCode).toBe('45');
    expect(coAdj!.details[0].amount).toBe(30.00);
  });

  it('should parse allowed amount from AMT*B6', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const line1 = result.transactions[0].claims[0].serviceLines[0];

    expect(line1.allowedAmount).toBe(120.00);
  });

  it('should parse remark codes from LQ segments', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const deniedLine = result.transactions[0].claims[1].serviceLines[0];

    expect(deniedLine.remarkCodes.length).toBeGreaterThan(0);
    expect(deniedLine.remarkCodes[0].qualifier).toBe('HE');
    expect(deniedLine.remarkCodes[0].code).toBe('N700');
  });

  it('should parse denied service lines correctly', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim2 = result.transactions[0].claims[1];

    expect(claim2.serviceLines.length).toBe(2);
    expect(claim2.serviceLines[0].paidAmount).toBe(0);
    expect(claim2.serviceLines[0].chargedAmount).toBe(150.00);
    expect(claim2.serviceLines[1].paidAmount).toBe(0);
  });
});

// ============================================================================
// PLB (Provider Level Balance) Tests
// ============================================================================

describe('PLB Provider Adjustments', () => {
  it('should parse PLB recoupment segment', () => {
    const result = parse835(SAMPLE_835_MULTI_CLAIM);
    const txn = result.transactions[0];

    expect(txn.providerAdjustments.length).toBe(1);
    const plb = txn.providerAdjustments[0];
    expect(plb.providerIdentifier).toBe('741234567');
    expect(plb.fiscalPeriodDate).toBe('20240115');
    expect(plb.adjustments[0].reasonCode).toBe('WO');
    expect(plb.adjustments[0].referenceId).toBe('RECOUP001');
    expect(plb.adjustments[0].amount).toBe(-75.00);
  });
});

// ============================================================================
// Claim Reversals and Corrections
// ============================================================================

describe('Claim Reversals and Corrections', () => {
  it('should parse reversal claim (status 22)', () => {
    const result = parse835(SAMPLE_835_REVERSAL);
    const claims = result.transactions[0].claims;

    expect(claims.length).toBe(2);

    // Reversal
    const reversal = claims[0];
    expect(reversal.claimStatus).toBe('22');
    expect(reversal.totalPaidAmount).toBe(-200.00);
    expect(reversal.patientAccountNumber).toBe('CLAIM004');
  });

  it('should parse negative payment on reversed service lines', () => {
    const result = parse835(SAMPLE_835_REVERSAL);
    const reversal = result.transactions[0].claims[0];

    expect(reversal.serviceLines[0].paidAmount).toBe(-150.00);
    expect(reversal.serviceLines[1].paidAmount).toBe(-50.00);
  });

  it('should parse corrected claim following reversal', () => {
    const result = parse835(SAMPLE_835_REVERSAL);
    const corrected = result.transactions[0].claims[1];

    expect(corrected.claimStatus).toBe('1');
    expect(corrected.totalPaidAmount).toBe(265.00);
    expect(corrected.frequencyCode).toBe('7'); // Replacement claim
  });

  it('should have net positive payment for reversal + correction', () => {
    const result = parse835(SAMPLE_835_REVERSAL);
    const txn = result.transactions[0];

    const netPayment = txn.claims.reduce((sum, c) => sum + c.totalPaidAmount, 0);
    expect(netPayment).toBe(65.00); // -200 + 265 = 65
    expect(txn.totalPaymentAmount).toBe(65.00);
  });
});

// ============================================================================
// Reason Code Lookups
// ============================================================================

describe('CARC/RARC Reason Code Lookups', () => {
  it('should look up common CARC codes', () => {
    expect(lookupCARC('1')).toContain('Deductible');
    expect(lookupCARC('2')).toContain('Coinsurance');
    expect(lookupCARC('3')).toContain('Copayment');
    expect(lookupCARC('45')).toContain('fee schedule');
    expect(lookupCARC('50')).toContain('medical necessity');
    expect(lookupCARC('197')).toContain('Precertification');
  });

  it('should return default message for unknown CARC', () => {
    expect(lookupCARC('ZZZZZ')).toContain('Unknown');
  });

  it('should look up common RARC codes', () => {
    expect(lookupRARC('MA01')).toContain('appeal');
    expect(lookupRARC('N700')).toContain('Prior authorization');
    expect(lookupRARC('M15')).toContain('bundled');
    expect(lookupRARC('N362')).toContain('Units of Service');
  });

  it('should return default message for unknown RARC', () => {
    expect(lookupRARC('ZZZZZ')).toContain('Unknown');
  });

  it('should look up PLB reason codes', () => {
    expect(lookupPLBReason('WO')).toContain('Overpayment Recovery');
    expect(lookupPLBReason('L6')).toContain('Interest');
  });

  it('should detect PT denial scenarios', () => {
    // Visit limit
    expect(isPTDenialCode('119').isDenial).toBe(true);
    expect(isPTDenialCode('119').category).toBe('VISIT_LIMIT');

    // No prior auth
    expect(isPTDenialCode('197').isDenial).toBe(true);
    expect(isPTDenialCode('197').category).toBe('NO_PRIOR_AUTH');

    // Bundled
    expect(isPTDenialCode('97').isDenial).toBe(true);
    expect(isPTDenialCode('97').category).toBe('BUNDLED');

    // Medical necessity
    expect(isPTDenialCode('50').isDenial).toBe(true);
    expect(isPTDenialCode('50').category).toBe('MEDICAL_NECESSITY');

    // Non-denial
    expect(isPTDenialCode('45').isDenial).toBe(false);
  });

  it('should describe adjustments with group + reason', () => {
    const desc = describeAdjustment('CO', '45');
    expect(desc).toContain('Contractual Obligation');
    expect(desc).toContain('fee schedule');
  });
});

// ============================================================================
// Payment Summary Generation
// ============================================================================

describe('Payment Summary Generation', () => {
  it('should generate summary for multi-claim 835', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summaries = generatePaymentSummaries(parsed);

    expect(summaries.length).toBe(1);
    const summary = summaries[0];

    expect(summary.checkOrEftNumber).toBe('EFT20240115001');
    expect(summary.paymentMethod).toBe('EFT/ACH');
    expect(summary.paymentDate).toBe('01/15/2024');
    expect(summary.payerName).toBe('TEXAS MEDICAID');
    expect(summary.totalPaymentAmount).toBe(450.00);
    expect(summary.claimCount).toBe(2);
    expect(summary.paidClaimCount).toBe(1);
    expect(summary.deniedClaimCount).toBe(1);
  });

  it('should generate per-claim breakdown', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];

    // Paid claim
    const claim1 = summary.claims[0];
    expect(claim1.patientName).toBe('DOE, JOHN, A');
    expect(claim1.claimStatusDescription).toBe('Processed as Primary');
    expect(claim1.chargedAmount).toBe(350.00);
    expect(claim1.paidAmount).toBe(280.00);

    // Denied claim
    const claim2 = summary.claims[1];
    expect(claim2.patientName).toBe('SMITH, JANE, M');
    expect(claim2.claimStatusDescription).toContain('Denied');
    expect(claim2.paidAmount).toBe(0);
  });

  it('should generate per-service-line breakdown', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];
    const claim1 = summary.claims[0];

    expect(claim1.serviceLines.length).toBe(4);

    const line1 = claim1.serviceLines[0];
    expect(line1.cptCode).toBe('97161');
    expect(line1.modifiers).toEqual(['GP']);
    expect(line1.chargedAmount).toBe(150.00);
    expect(line1.paidAmount).toBe(120.00);
    expect(line1.allowedAmount).toBe(120.00);
    expect(line1.isDenied).toBe(false);
  });

  it('should flag denied claims', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];

    const denialFlags = summary.flags.filter((f) => f.type === 'DENIAL' || f.type === 'NO_PRIOR_AUTH');
    expect(denialFlags.length).toBeGreaterThan(0);
  });

  it('should flag PT-specific denials (visit limit, bundling)', () => {
    const parsed = parse835(SAMPLE_835_PT_DENIALS);
    const summary = generatePaymentSummaries(parsed)[0];

    const visitLimitFlags = summary.flags.filter((f) => f.type === 'VISIT_LIMIT_EXCEEDED');
    expect(visitLimitFlags.length).toBeGreaterThan(0);

    const bundledFlags = summary.flags.filter((f) => f.type === 'BUNDLED_SERVICE');
    expect(bundledFlags.length).toBeGreaterThan(0);
  });

  it('should flag claim reversals', () => {
    const parsed = parse835(SAMPLE_835_REVERSAL);
    const summary = generatePaymentSummaries(parsed)[0];

    const reversalFlags = summary.flags.filter((f) => f.type === 'REVERSAL');
    expect(reversalFlags.length).toBeGreaterThan(0);
  });

  it('should flag provider-level recoupments', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];

    const recoupFlags = summary.flags.filter((f) => f.type === 'RECOUPMENT');
    expect(recoupFlags.length).toBeGreaterThan(0);
  });

  it('should detect denied lines with denial reasons', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];
    const deniedClaim = summary.claims[1];

    expect(deniedClaim.denialReasons.length).toBeGreaterThan(0);
    expect(deniedClaim.denialReasons[0].reasonCode).toBe('197');
    expect(deniedClaim.denialReasons[0].description).toContain('Precertification');
  });

  it('should generate summary for check payment', () => {
    const parsed = parse835(SAMPLE_835_CHECK_SINGLE);
    const summary = generatePaymentSummaries(parsed)[0];

    expect(summary.paymentMethod).toBe('Check');
    expect(summary.checkOrEftNumber).toBe('CHK000789');
    expect(summary.claimCount).toBe(1);
    expect(summary.paidClaimCount).toBe(1);
    expect(summary.deniedClaimCount).toBe(0);
  });

  it('should calculate patient responsibility from PR adjustments', () => {
    const parsed = parse835(SAMPLE_835_CHECK_SINGLE);
    const summary = generatePaymentSummaries(parsed)[0];
    const claim = summary.claims[0];

    // PR adjustments: deductible $50 + coinsurance $20 + copay $25 = $95
    expect(claim.patientResponsibility).toBe(95.00);
  });

  it('should show partial denial flag', () => {
    const parsed = parse835(SAMPLE_835_PT_DENIALS);
    const summary = generatePaymentSummaries(parsed)[0];

    const partialFlags = summary.flags.filter((f) => f.type === 'PARTIAL_DENIAL');
    expect(partialFlags.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Text Report Generation
// ============================================================================

describe('Text Report Generation', () => {
  it('should generate a formatted text report', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];
    const report = formatPaymentReport(summary);

    expect(report).toContain('ELECTRONIC REMITTANCE ADVICE');
    expect(report).toContain('EFT20240115001');
    expect(report).toContain('TEXAS MEDICAID');
    expect(report).toContain('SOUTH TEXAS PT CLINIC');
    expect(report).toContain('CLAIM001');
    expect(report).toContain('CLAIM002');
    expect(report).toContain('97161');
    expect(report).toContain('DENIED');
    expect(report).toContain('END OF REMITTANCE SUMMARY');
  });

  it('should include denial reasons in report', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];
    const report = formatPaymentReport(summary);

    expect(report).toContain('DENIAL REASONS');
    expect(report).toContain('CARC 197');
  });

  it('should include flags/alerts in report', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];
    const report = formatPaymentReport(summary);

    expect(report).toContain('FLAGS / ALERTS');
  });

  it('should include provider adjustments in report', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const summary = generatePaymentSummaries(parsed)[0];
    const report = formatPaymentReport(summary);

    expect(report).toContain('PROVIDER-LEVEL ADJUSTMENTS');
    expect(report).toContain('Overpayment Recovery');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle 835 with zero payment amount', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    const claim2 = parsed.transactions[0].claims[1];

    expect(claim2.totalPaidAmount).toBe(0);
    expect(claim2.claimStatus).toBe('4');
  });

  it('should handle negative payment amounts (reversals)', () => {
    const parsed = parse835(SAMPLE_835_REVERSAL);
    const reversal = parsed.transactions[0].claims[0];

    expect(reversal.totalPaidAmount).toBe(-200.00);
    expect(reversal.serviceLines[0].paidAmount).toBe(-150.00);
  });

  it('should handle service line with reduced units', () => {
    const parsed = parse835(SAMPLE_835_PT_DENIALS);
    const claim = parsed.transactions[0].claims[0];

    // 97150: 4 units billed, 2 units paid
    const line97150 = claim.serviceLines.find((sl) => sl.procedure.code === '97150');
    expect(line97150).toBeDefined();
    expect(line97150!.unitsBilled).toBe(4);
    expect(line97150!.unitsPaid).toBe(2);
  });

  it('should handle test mode indicator', () => {
    const parsed = parse835(SAMPLE_835_PT_DENIALS);
    expect(parsed.envelope.isa.usageIndicator).toBe('T');
  });

  it('should return raw segment count', () => {
    const parsed = parse835(SAMPLE_835_MULTI_CLAIM);
    expect(parsed.rawSegmentCount).toBeGreaterThan(40);
  });

  it('should handle all 4 sample 835 files without errors', () => {
    const samples = [
      SAMPLE_835_MULTI_CLAIM,
      SAMPLE_835_CHECK_SINGLE,
      SAMPLE_835_REVERSAL,
      SAMPLE_835_PT_DENIALS,
    ];

    for (const sample of samples) {
      const parsed = parse835(sample);
      const fatalErrors = parsed.validationErrors.filter((e) => e.severity === 'error');
      expect(fatalErrors.length).toBe(0);
      expect(parsed.transactions.length).toBeGreaterThan(0);
    }
  });
});
