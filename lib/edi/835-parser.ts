/**
 * EDI 835 (Electronic Remittance Advice) Parser
 * ANSI X12 835 v5010A1 compliant
 *
 * Parses raw 835 EDI files into structured TypeScript objects.
 * Handles commercial payers and Texas Medicaid (TMHP) remittances.
 *
 * Supports:
 * - Multiple claims per 835
 * - Check and EFT payment methods
 * - Claim reversals and corrections
 * - PLB provider-level adjustments (recoupments, interest)
 * - CAS adjustments at both claim and service line level
 * - All standard loops: 1000A/B, 2000, 2100, 2110
 */

import type {
  Parsed835,
  Envelope,
  ISAEnvelope,
  GSEnvelope,
  TransactionInfo,
  PaymentMethodCode,
  PayerIdentification,
  PayeeIdentification,
  PayeeAdditionalId,
  ContactInfo,
  EDI835Address,
  ClaimPayment,
  ClaimAdjustment,
  AdjustmentDetail,
  PatientName,
  ServiceLinePayment,
  ProcedureCode,
  RemarkCode,
  ReferenceNumber,
  SupplementalAmount,
  OutpatientAdjudication,
  InpatientAdjudication,
  ProviderAdjustment,
  ProviderAdjustmentDetail,
  ValidationError835,
} from './835-types';

// ============================================================================
// Segment Tokenizer
// ============================================================================

interface ParseContext {
  segments: string[][];
  pos: number;
  errors: ValidationError835[];
  elementSeparator: string;
  segmentTerminator: string;
  componentSeparator: string;
}

/**
 * Detect delimiters from the ISA segment.
 * ISA is always exactly 106 characters. The element separator is ISA[3],
 * the component separator is the last character before the segment terminator,
 * and the segment terminator follows the ISA.
 */
function detectDelimiters(raw: string): {
  elementSeparator: string;
  segmentTerminator: string;
  componentSeparator: string;
} {
  // ISA element separator is always the 4th character (index 3)
  const elementSeparator = raw[3];

  // Find the first ISA segment — it has exactly 16 elements
  // The component separator is ISA16 (last data element)
  // The segment terminator follows immediately after ISA16
  const isaElements = raw.split(elementSeparator);
  // ISA16 is the 17th element (index 16), but it also contains the
  // component separator + segment terminator
  const isa16AndRest = isaElements[16];

  // ISA16 is exactly 1 char (component separator)
  const componentSeparator = isa16AndRest[0];

  // The segment terminator follows ISA16 — could be ~, \n, \r\n, etc.
  let segmentTerminator = '~';
  // Look for ~ after component separator
  const afterComponent = isa16AndRest.substring(1);
  // The terminator is the first non-whitespace character, or ~ by default
  for (const ch of afterComponent) {
    if (ch === '~' || ch === '\n' || ch === '\r') {
      segmentTerminator = '~'; // Normalize to ~
      break;
    }
    if (ch !== ' ') {
      segmentTerminator = ch;
      break;
    }
  }

  return { elementSeparator, segmentTerminator, componentSeparator };
}

/**
 * Tokenize raw EDI content into an array of segments,
 * where each segment is an array of elements.
 */
function tokenize(raw: string): {
  segments: string[][];
  elementSeparator: string;
  segmentTerminator: string;
  componentSeparator: string;
} {
  const { elementSeparator, segmentTerminator, componentSeparator } = detectDelimiters(raw);

  // Normalize line endings and split on segment terminator
  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Split by segment terminator, then clean up whitespace/newlines
  const rawSegments = normalized.split(segmentTerminator);
  const segments: string[][] = [];

  for (const rawSeg of rawSegments) {
    const trimmed = rawSeg.replace(/^\s+|\s+$/g, '');
    if (trimmed.length === 0) continue;

    // Also handle case where newlines appear within segments
    const cleaned = trimmed.replace(/\n/g, '');
    if (cleaned.length === 0) continue;

    segments.push(cleaned.split(elementSeparator));
  }

  return { segments, elementSeparator, segmentTerminator, componentSeparator };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate 835 file structure before full parsing.
 * Returns validation errors/warnings without parsing the full content.
 */
export function validate835(raw: string): ValidationError835[] {
  const errors: ValidationError835[] = [];

  if (!raw || raw.trim().length === 0) {
    errors.push({ message: 'Empty EDI content', severity: 'error' });
    return errors;
  }

  // Must start with ISA
  const trimmed = raw.trim();
  if (!trimmed.startsWith('ISA')) {
    errors.push({
      message: 'EDI content must start with ISA segment',
      severity: 'error',
      segment: 'ISA',
    });
    return errors;
  }

  let tokenized: ReturnType<typeof tokenize>;
  try {
    tokenized = tokenize(trimmed);
  } catch {
    errors.push({
      message: 'Failed to tokenize EDI content — invalid delimiters or structure',
      severity: 'error',
    });
    return errors;
  }

  const { segments } = tokenized;
  const segIds = segments.map((s) => s[0]);

  // Required envelope segments
  const requiredSegments = ['ISA', 'GS', 'ST', 'BPR', 'TRN', 'SE', 'GE', 'IEA'];
  for (const req of requiredSegments) {
    if (!segIds.includes(req)) {
      errors.push({
        message: `Missing required segment: ${req}`,
        severity: 'error',
        segment: req,
      });
    }
  }

  // ST must be 835
  const stSeg = segments.find((s) => s[0] === 'ST');
  if (stSeg && stSeg[1] !== '835') {
    errors.push({
      message: `Expected transaction set 835, got ${stSeg[1]}`,
      severity: 'error',
      segment: 'ST',
    });
  }

  // GS01 should be HP
  const gsSeg = segments.find((s) => s[0] === 'GS');
  if (gsSeg && gsSeg[1] !== 'HP') {
    errors.push({
      message: `Expected GS01=HP (Health Care Claim Payment/Advice), got ${gsSeg[1]}`,
      severity: 'warning',
      segment: 'GS',
    });
  }

  // Check ISA/IEA control number match
  const isaSeg = segments.find((s) => s[0] === 'ISA');
  const ieaSeg = segments.find((s) => s[0] === 'IEA');
  if (isaSeg && ieaSeg) {
    const isaCtrl = isaSeg[13]?.trim();
    const ieaCtrl = ieaSeg[2]?.trim();
    if (isaCtrl && ieaCtrl && isaCtrl !== ieaCtrl) {
      errors.push({
        message: `ISA/IEA control number mismatch: ISA13=${isaCtrl}, IEA02=${ieaCtrl}`,
        severity: 'error',
        segment: 'IEA',
      });
    }
  }

  // Check GS/GE control number match
  const geSeg = segments.find((s) => s[0] === 'GE');
  if (gsSeg && geSeg) {
    const gsCtrl = gsSeg[6]?.trim();
    const geCtrl = geSeg[2]?.trim();
    if (gsCtrl && geCtrl && gsCtrl !== geCtrl) {
      errors.push({
        message: `GS/GE control number mismatch: GS06=${gsCtrl}, GE02=${geCtrl}`,
        severity: 'error',
        segment: 'GE',
      });
    }
  }

  // Check ST/SE control number match
  const seSeg = segments.find((s) => s[0] === 'SE');
  if (stSeg && seSeg) {
    const stCtrl = stSeg[2]?.trim();
    const seCtrl = seSeg[2]?.trim();
    if (stCtrl && seCtrl && stCtrl !== seCtrl) {
      errors.push({
        message: `ST/SE control number mismatch: ST02=${stCtrl}, SE02=${seCtrl}`,
        severity: 'error',
        segment: 'SE',
      });
    }
  }

  // Must have at least one CLP segment (claim)
  if (!segIds.includes('CLP')) {
    errors.push({
      message: 'No CLP (claim) segments found — 835 has no claim payment data',
      severity: 'warning',
      segment: 'CLP',
    });
  }

  // BPR should have payment amount
  const bprSeg = segments.find((s) => s[0] === 'BPR');
  if (bprSeg) {
    const amount = parseFloat(bprSeg[2] || '');
    if (isNaN(amount)) {
      errors.push({
        message: 'BPR02 payment amount is missing or not numeric',
        severity: 'error',
        segment: 'BPR',
      });
    }
  }

  return errors;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a raw 835 EDI string into structured data.
 *
 * @param raw - The raw 835 EDI file content
 * @returns Parsed835 with all transactions, claims, and service lines
 */
export function parse835(raw: string): Parsed835 {
  const validationErrors = validate835(raw);
  const fatalErrors = validationErrors.filter((e) => e.severity === 'error');

  if (fatalErrors.length > 0) {
    return {
      envelope: createEmptyEnvelope(),
      transactions: [],
      validationErrors,
      rawSegmentCount: 0,
    };
  }

  const { segments, elementSeparator, segmentTerminator, componentSeparator } = tokenize(raw.trim());

  const ctx: ParseContext = {
    segments,
    pos: 0,
    errors: [...validationErrors],
    elementSeparator,
    segmentTerminator,
    componentSeparator,
  };

  const envelope = parseEnvelope(ctx);
  const transactions = parseTransactions(ctx, componentSeparator);

  return {
    envelope,
    transactions,
    validationErrors: ctx.errors,
    rawSegmentCount: segments.length,
  };
}

// ============================================================================
// Envelope Parsing (ISA/GS)
// ============================================================================

function parseEnvelope(ctx: ParseContext): Envelope {
  const isa = parseISA(ctx);
  const gs = parseGS(ctx);
  return { isa, gs };
}

function parseISA(ctx: ParseContext): ISAEnvelope {
  const seg = findSegment(ctx, 'ISA');
  if (!seg) {
    ctx.errors.push({ message: 'ISA segment not found', severity: 'error', segment: 'ISA' });
    return createEmptyISA();
  }

  return {
    authorizationQualifier: el(seg, 1),
    authorizationInfo: el(seg, 2).trim(),
    securityQualifier: el(seg, 3),
    securityInfo: el(seg, 4).trim(),
    senderQualifier: el(seg, 5),
    senderId: el(seg, 6).trim(),
    receiverQualifier: el(seg, 7),
    receiverId: el(seg, 8).trim(),
    date: el(seg, 9),
    time: el(seg, 10),
    repetitionSeparator: el(seg, 11),
    versionNumber: el(seg, 12),
    controlNumber: el(seg, 13).trim(),
    acknowledgmentRequested: el(seg, 14),
    usageIndicator: el(seg, 15) as 'P' | 'T',
    componentSeparator: el(seg, 16),
  };
}

function parseGS(ctx: ParseContext): GSEnvelope {
  const seg = findSegment(ctx, 'GS');
  if (!seg) {
    ctx.errors.push({ message: 'GS segment not found', severity: 'error', segment: 'GS' });
    return createEmptyGS();
  }

  return {
    functionalIdentifierCode: el(seg, 1),
    senderCode: el(seg, 2),
    receiverCode: el(seg, 3),
    date: el(seg, 4),
    time: el(seg, 5),
    controlNumber: el(seg, 6),
    responsibleAgency: el(seg, 7),
    versionCode: el(seg, 8),
  };
}

// ============================================================================
// Transaction Parsing (ST through SE)
// ============================================================================

function parseTransactions(ctx: ParseContext, componentSep: string): TransactionInfo[] {
  const transactions: TransactionInfo[] = [];

  // Find all ST/SE pairs (support multiple transaction sets)
  let i = 0;
  while (i < ctx.segments.length) {
    if (ctx.segments[i][0] === 'ST') {
      const stIdx = i;
      // Find corresponding SE
      let seIdx = -1;
      for (let j = stIdx + 1; j < ctx.segments.length; j++) {
        if (ctx.segments[j][0] === 'SE') {
          seIdx = j;
          break;
        }
      }

      if (seIdx === -1) {
        ctx.errors.push({
          message: `ST at position ${stIdx} has no matching SE`,
          severity: 'error',
          segment: 'ST',
          position: stIdx,
        });
        i++;
        continue;
      }

      const txnSegments = ctx.segments.slice(stIdx, seIdx + 1);
      const txn = parseTransaction(txnSegments, ctx.errors, componentSep);
      if (txn) {
        transactions.push(txn);
      }
      i = seIdx + 1;
    } else {
      i++;
    }
  }

  return transactions;
}

function parseTransaction(
  segments: string[][],
  errors: ValidationError835[],
  componentSep: string
): TransactionInfo | null {
  let pos = 0;

  // Skip ST
  pos++;

  // Parse BPR
  const bprSeg = findInRange(segments, 'BPR', pos);
  if (!bprSeg) {
    errors.push({ message: 'Missing BPR segment in transaction', severity: 'error', segment: 'BPR' });
    return null;
  }

  const totalPaymentAmount = parseAmount(el(bprSeg, 2));
  const creditDebitFlag = el(bprSeg, 3);
  const paymentMethod = (el(bprSeg, 4) || el(bprSeg, 1)) as PaymentMethodCode;

  // Parse TRN
  const trnSeg = findInRange(segments, 'TRN', 0);
  const checkOrEftNumber = trnSeg ? el(trnSeg, 2) : '';
  const traceOriginatorId = trnSeg ? el(trnSeg, 3) : undefined;
  const traceOriginatorSupplementalId = trnSeg ? el(trnSeg, 4) || undefined : undefined;

  // Parse DTM*405 (production date)
  let paymentDate = '';
  for (const seg of segments) {
    if (seg[0] === 'DTM' && el(seg, 1) === '405') {
      paymentDate = el(seg, 2);
      break;
    }
  }

  // Parse Loop 1000A (Payer) and 1000B (Payee)
  const payer = parsePayerIdentification(segments, componentSep);
  const payee = parsePayeeIdentification(segments, componentSep);

  // Parse claims (Loop 2100)
  const claims = parseClaims(segments, errors, componentSep);

  // Parse PLB segments
  const providerAdjustments = parsePLBSegments(segments, componentSep);

  return {
    paymentMethod,
    totalPaymentAmount,
    creditDebitFlag,
    senderBankAccountNumber: el(bprSeg, 9) || undefined,
    senderBankId: el(bprSeg, 7) || undefined,
    receiverBankAccountNumber: el(bprSeg, 15) || undefined,
    receiverBankId: el(bprSeg, 13) || undefined,
    checkOrEftNumber,
    traceOriginatorId,
    traceOriginatorSupplementalId,
    paymentDate,
    payerIdentification: payer,
    payeeIdentification: payee,
    claims,
    providerAdjustments,
  };
}

// ============================================================================
// Loop 1000A - Payer Identification
// ============================================================================

function parsePayerIdentification(segments: string[][], componentSep: string): PayerIdentification {
  const payer: PayerIdentification = {
    name: '',
    identifierCode: '',
  };

  // Find N1*PR
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg[0] === 'N1' && el(seg, 1) === 'PR') {
      payer.name = el(seg, 2);
      payer.identifierCode = el(seg, 4);

      // Look for N3, N4, PER, REF after N1*PR until next N1 or CLP
      for (let j = i + 1; j < segments.length; j++) {
        const next = segments[j];
        if (next[0] === 'N1' || next[0] === 'CLP' || next[0] === 'LX') break;

        if (next[0] === 'N3') {
          payer.address = payer.address || { line1: '', city: '', state: '', zip: '' };
          payer.address.line1 = el(next, 1);
          payer.address.line2 = el(next, 2) || undefined;
        }

        if (next[0] === 'N4') {
          payer.address = payer.address || { line1: '', city: '', state: '', zip: '' };
          payer.address.city = el(next, 1);
          payer.address.state = el(next, 2);
          payer.address.zip = el(next, 3);
        }

        if (next[0] === 'PER') {
          const contact = parseContactSegment(next);
          if (el(next, 1) === 'CX' || el(next, 1) === 'BL') {
            payer.technicalContact = contact;
          } else {
            payer.webContact = contact;
          }
        }

        if (next[0] === 'REF') {
          payer.additionalId = el(next, 2);
        }
      }
      break;
    }
  }

  return payer;
}

// ============================================================================
// Loop 1000B - Payee Identification
// ============================================================================

function parsePayeeIdentification(segments: string[][], componentSep: string): PayeeIdentification {
  const payee: PayeeIdentification = {
    name: '',
    identifierQualifier: '',
    identifierCode: '',
    additionalIds: [],
  };

  // Find N1*PE
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg[0] === 'N1' && el(seg, 1) === 'PE') {
      payee.name = el(seg, 2);
      payee.identifierQualifier = el(seg, 3);
      payee.identifierCode = el(seg, 4);

      // Set NPI or tax ID based on qualifier
      if (payee.identifierQualifier === 'XX') {
        payee.npi = payee.identifierCode;
      } else if (payee.identifierQualifier === 'FI') {
        payee.taxId = payee.identifierCode;
      }

      // Look for subsequent segments
      for (let j = i + 1; j < segments.length; j++) {
        const next = segments[j];
        if (next[0] === 'N1' || next[0] === 'CLP' || next[0] === 'LX') break;

        if (next[0] === 'N3') {
          payee.address = payee.address || { line1: '', city: '', state: '', zip: '' };
          payee.address.line1 = el(next, 1);
          payee.address.line2 = el(next, 2) || undefined;
        }

        if (next[0] === 'N4') {
          payee.address = payee.address || { line1: '', city: '', state: '', zip: '' };
          payee.address.city = el(next, 1);
          payee.address.state = el(next, 2);
          payee.address.zip = el(next, 3);
        }

        if (next[0] === 'REF') {
          const additional: PayeeAdditionalId = {
            qualifier: el(next, 1),
            value: el(next, 2),
          };
          payee.additionalIds.push(additional);

          // Also capture NPI/TaxID from REF
          if (additional.qualifier === 'TJ') {
            payee.taxId = additional.value;
          }
          if (additional.qualifier === 'PQ' || additional.qualifier === 'XX') {
            payee.npi = additional.value;
          }
        }
      }
      break;
    }
  }

  return payee;
}

// ============================================================================
// Claims Parsing (Loop 2100)
// ============================================================================

function parseClaims(
  segments: string[][],
  errors: ValidationError835[],
  componentSep: string
): ClaimPayment[] {
  const claims: ClaimPayment[] = [];

  // Find all CLP segments
  for (let i = 0; i < segments.length; i++) {
    if (segments[i][0] !== 'CLP') continue;

    // Determine end of this claim (next CLP, PLB, or SE)
    let claimEnd = segments.length;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j][0] === 'CLP' || segments[j][0] === 'PLB' || segments[j][0] === 'SE') {
        claimEnd = j;
        break;
      }
    }

    const claimSegments = segments.slice(i, claimEnd);
    const claim = parseSingleClaim(claimSegments, errors, componentSep);
    claims.push(claim);

    i = claimEnd - 1; // -1 because for loop increments
  }

  return claims;
}

function parseSingleClaim(
  segments: string[][],
  errors: ValidationError835[],
  componentSep: string
): ClaimPayment {
  const clpSeg = segments[0]; // First segment is always CLP

  const claim: ClaimPayment = {
    patientAccountNumber: el(clpSeg, 1),
    claimStatus: el(clpSeg, 2),
    totalChargedAmount: parseAmount(el(clpSeg, 3)),
    totalPaidAmount: parseAmount(el(clpSeg, 4)),
    patientResponsibilityAmount: el(clpSeg, 5) ? parseAmount(el(clpSeg, 5)) : undefined,
    claimFilingIndicator: el(clpSeg, 6) || undefined,
    payerClaimControlNumber: el(clpSeg, 7) || undefined,
    facilityCode: el(clpSeg, 8) || undefined,
    frequencyCode: el(clpSeg, 9) || undefined,
    patientName: { entityType: '1', lastName: '', firstName: '' },
    adjustments: [],
    otherReferenceNumbers: [],
    supplementalAmounts: [],
    serviceLines: [],
  };

  // Find the index where SVC segments start (service lines)
  let svcStartIdx = segments.length;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i][0] === 'SVC') {
      svcStartIdx = i;
      break;
    }
  }

  // Parse claim-level data (between CLP and first SVC)
  const claimLevelSegs = segments.slice(1, svcStartIdx);
  parseClaimLevelData(claimLevelSegs, claim, componentSep);

  // Parse service lines (SVC segments and their children)
  const serviceSegs = segments.slice(svcStartIdx);
  claim.serviceLines = parseServiceLines(serviceSegs, errors, componentSep);

  return claim;
}

function parseClaimLevelData(
  segments: string[][],
  claim: ClaimPayment,
  componentSep: string
): void {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    switch (seg[0]) {
      case 'CAS':
        claim.adjustments.push(parseCASSegment(seg));
        break;

      case 'NM1': {
        const qualifier = el(seg, 1);
        const name = parseNM1Segment(seg);
        if (qualifier === 'QC') {
          claim.patientName = name;
        } else if (qualifier === 'IL') {
          claim.insuredName = name;
        } else if (qualifier === '74') {
          claim.correctedPatientName = name;
        } else if (qualifier === '82') {
          claim.renderingProviderNpi = name.identifier;
        } else if (qualifier === 'TT') {
          claim.crossoverCarrier = name.identifier;
        }
        break;
      }

      case 'MIA':
        claim.inpatientAdjudication = parseMIA(seg);
        break;

      case 'MOA':
        claim.outpatientAdjudication = parseMOA(seg);
        break;

      case 'DTM': {
        const dtmQual = el(seg, 1);
        const dtmVal = el(seg, 2);
        if (dtmQual === '232') claim.statementFromDate = dtmVal;
        if (dtmQual === '233') claim.statementToDate = dtmVal;
        if (dtmQual === '036') claim.coverageExpirationDate = dtmVal;
        // Handle date range format (D8 vs RD8)
        if (dtmQual === '232' && el(seg, 2).includes('-')) {
          const parts = el(seg, 2).split('-');
          claim.statementFromDate = parts[0];
          claim.statementToDate = parts[1];
        }
        break;
      }

      case 'REF': {
        const refQual = el(seg, 1);
        const refVal = el(seg, 2);
        if (refQual === 'F8') {
          claim.originalReferenceNumber = refVal;
        } else if (refQual === '1K') {
          claim.payerClaimId = refVal;
        } else if (refQual === 'BLT') {
          claim.institutionalBillType = refVal;
        } else if (refQual === 'EA') {
          claim.medicalRecordNumber = refVal;
        } else {
          claim.otherReferenceNumbers.push({
            qualifier: refQual,
            value: refVal,
            description: el(seg, 3) || undefined,
          });
        }
        break;
      }

      case 'AMT': {
        claim.supplementalAmounts.push({
          qualifier: el(seg, 1),
          amount: parseAmount(el(seg, 2)),
        });
        break;
      }

      case 'QTY':
        // Quantity segments at claim level — not commonly used in PT 835s
        break;

      default:
        break;
    }
  }
}

// ============================================================================
// Service Line Parsing (Loop 2110)
// ============================================================================

function parseServiceLines(
  segments: string[][],
  errors: ValidationError835[],
  componentSep: string
): ServiceLinePayment[] {
  const lines: ServiceLinePayment[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (segments[i][0] !== 'SVC') continue;

    // Find end of this service line (next SVC or end)
    let lineEnd = segments.length;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j][0] === 'SVC') {
        lineEnd = j;
        break;
      }
    }

    const lineSegments = segments.slice(i, lineEnd);
    lines.push(parseSingleServiceLine(lineSegments, componentSep));
    i = lineEnd - 1;
  }

  return lines;
}

function parseSingleServiceLine(segments: string[][], componentSep: string): ServiceLinePayment {
  const svcSeg = segments[0];

  // Parse procedure code from SVC01 (composite: qualifier:code:mod1:mod2:mod3:mod4)
  const procedure = parseProcedureCode(el(svcSeg, 1), componentSep);
  const chargedAmount = parseAmount(el(svcSeg, 2));
  const paidAmount = parseAmount(el(svcSeg, 3));
  const revenueCode = el(svcSeg, 4) || undefined;
  const unitsPaid = el(svcSeg, 5) ? parseFloat(el(svcSeg, 5)) : undefined;
  const originalProcedure = el(svcSeg, 6)
    ? parseProcedureCode(el(svcSeg, 6), componentSep)
    : undefined;
  const unitsBilled = el(svcSeg, 7) ? parseFloat(el(svcSeg, 7)) : undefined;

  const line: ServiceLinePayment = {
    procedure,
    chargedAmount,
    paidAmount,
    revenueCode,
    unitsPaid,
    originalProcedure,
    unitsBilled,
    adjustments: [],
    referenceNumbers: [],
    supplementalAmounts: [],
    remarkCodes: [],
  };

  // Parse child segments
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    switch (seg[0]) {
      case 'CAS':
        line.adjustments.push(parseCASSegment(seg));
        break;

      case 'DTM': {
        const dtmQual = el(seg, 1);
        if (dtmQual === '472') {
          const dateVal = el(seg, 2);
          // Handle date range (RD8 format: YYYYMMDD-YYYYMMDD)
          if (dateVal.includes('-')) {
            const parts = dateVal.split('-');
            line.serviceDate = parts[0];
            line.serviceDateEnd = parts[1];
          } else {
            line.serviceDate = dateVal;
          }
        }
        break;
      }

      case 'REF':
        line.referenceNumbers.push({
          qualifier: el(seg, 1),
          value: el(seg, 2),
          description: el(seg, 3) || undefined,
        });
        break;

      case 'AMT': {
        const amtQual = el(seg, 1);
        const amtVal = parseAmount(el(seg, 2));
        line.supplementalAmounts.push({ qualifier: amtQual, amount: amtVal });

        // B6 = Allowed Amount
        if (amtQual === 'B6') {
          line.allowedAmount = amtVal;
        }
        break;
      }

      case 'LQ':
        line.remarkCodes.push({
          qualifier: el(seg, 1),
          code: el(seg, 2),
        });
        break;

      default:
        break;
    }
  }

  return line;
}

// ============================================================================
// PLB (Provider Level Balance) Parsing
// ============================================================================

function parsePLBSegments(segments: string[][], componentSep: string): ProviderAdjustment[] {
  const adjustments: ProviderAdjustment[] = [];

  for (const seg of segments) {
    if (seg[0] !== 'PLB') continue;

    const providerIdentifier = el(seg, 1);
    const fiscalPeriodDate = el(seg, 2);
    const details: ProviderAdjustmentDetail[] = [];

    // PLB can have up to 6 adjustment reason/amount pairs
    // PLB03/04, PLB05/06, PLB07/08, PLB09/10, PLB11/12, PLB13/14
    for (let idx = 3; idx <= 13; idx += 2) {
      const reasonComposite = el(seg, idx);
      const amount = el(seg, idx + 1);
      if (!reasonComposite && !amount) break;

      const reasonParts = reasonComposite.split(componentSep);
      details.push({
        reasonCode: reasonParts[0] || '',
        referenceId: reasonParts[1] || undefined,
        amount: parseAmount(amount),
      });
    }

    adjustments.push({ providerIdentifier, fiscalPeriodDate, adjustments: details });
  }

  return adjustments;
}

// ============================================================================
// CAS (Claim Adjustment Segment) Parsing
// ============================================================================

function parseCASSegment(seg: string[]): ClaimAdjustment {
  const groupCode = el(seg, 1);
  const details: AdjustmentDetail[] = [];

  // CAS can have up to 6 adjustment reason/amount/quantity triplets
  // CAS02/03/04, CAS05/06/07, CAS08/09/10, CAS11/12/13, CAS14/15/16, CAS17/18/19
  for (let idx = 2; idx <= 17; idx += 3) {
    const reasonCode = el(seg, idx);
    if (!reasonCode) break;

    details.push({
      reasonCode,
      amount: parseAmount(el(seg, idx + 1)),
      quantity: el(seg, idx + 2) ? parseFloat(el(seg, idx + 2)) : undefined,
    });
  }

  return { groupCode, details };
}

// ============================================================================
// NM1 Segment Parsing
// ============================================================================

function parseNM1Segment(seg: string[]): PatientName {
  return {
    entityType: (el(seg, 2) || '1') as '1' | '2',
    lastName: el(seg, 3),
    firstName: el(seg, 4) || undefined,
    middleName: el(seg, 5) || undefined,
    suffix: el(seg, 7) || undefined,
    identifierQualifier: el(seg, 8) || undefined,
    identifier: el(seg, 9) || undefined,
  };
}

// ============================================================================
// MIA / MOA Segment Parsing
// ============================================================================

function parseMIA(seg: string[]): InpatientAdjudication {
  return {
    coveredDays: el(seg, 1) ? parseFloat(el(seg, 1)) : undefined,
    ppsOperatingOutlierAmount: el(seg, 2) ? parseAmount(el(seg, 2)) : undefined,
    lifetimePsychiatricDays: el(seg, 3) ? parseFloat(el(seg, 3)) : undefined,
    claimDrgAmount: el(seg, 4) ? parseAmount(el(seg, 4)) : undefined,
    remarkCodes: [],
  };
}

function parseMOA(seg: string[]): OutpatientAdjudication {
  const remarkCodes: string[] = [];
  // MOA03 through MOA07 can contain remark codes
  for (let i = 3; i <= 7; i++) {
    const code = el(seg, i);
    if (code) remarkCodes.push(code);
  }

  return {
    reimbursementRate: el(seg, 1) ? parseFloat(el(seg, 1)) : undefined,
    claimHcpcsPayableAmount: el(seg, 2) ? parseAmount(el(seg, 2)) : undefined,
    remarkCodes,
    esrdPaymentAmount: el(seg, 8) ? parseAmount(el(seg, 8)) : undefined,
    nonPayableProfessionalAmount: el(seg, 9) ? parseAmount(el(seg, 9)) : undefined,
  };
}

// ============================================================================
// Contact Segment Parsing
// ============================================================================

function parseContactSegment(seg: string[]): ContactInfo {
  const contact: ContactInfo = {};
  contact.name = el(seg, 2) || undefined;

  // PER has pairs: qualifier/value for up to 3 contact methods
  // PER03/04, PER05/06, PER07/08
  for (let idx = 3; idx <= 7; idx += 2) {
    const qual = el(seg, idx);
    const val = el(seg, idx + 1);
    if (!qual || !val) continue;

    switch (qual) {
      case 'TE': contact.phone = val; break;
      case 'EX': contact.phoneExtension = val; break;
      case 'FX': contact.fax = val; break;
      case 'EM': contact.email = val; break;
      case 'UR': contact.url = val; break;
    }
  }

  return contact;
}

// ============================================================================
// Procedure Code Parsing
// ============================================================================

function parseProcedureCode(composite: string, componentSep: string): ProcedureCode {
  const parts = composite.split(componentSep);
  return {
    qualifier: parts[0] || 'HC',
    code: parts[1] || '',
    modifiers: parts.slice(2).filter(Boolean),
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Safely get element at index from a segment array. */
function el(seg: string[], index: number): string {
  return seg[index] ?? '';
}

/** Parse a dollar amount string, returning 0 for invalid/empty values. */
function parseAmount(val: string): number {
  if (!val) return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

/** Find the first segment with the given ID in the context. */
function findSegment(ctx: ParseContext, id: string): string[] | null {
  const seg = ctx.segments.find((s) => s[0] === id);
  return seg ?? null;
}

/** Find the first segment with the given ID in a range. */
function findInRange(segments: string[][], id: string, startIdx: number): string[] | null {
  for (let i = startIdx; i < segments.length; i++) {
    if (segments[i][0] === id) return segments[i];
  }
  return null;
}

// ============================================================================
// Empty/Default Factories
// ============================================================================

function createEmptyEnvelope(): Envelope {
  return { isa: createEmptyISA(), gs: createEmptyGS() };
}

function createEmptyISA(): ISAEnvelope {
  return {
    authorizationQualifier: '',
    authorizationInfo: '',
    securityQualifier: '',
    securityInfo: '',
    senderQualifier: '',
    senderId: '',
    receiverQualifier: '',
    receiverId: '',
    date: '',
    time: '',
    repetitionSeparator: '',
    versionNumber: '',
    controlNumber: '',
    acknowledgmentRequested: '',
    usageIndicator: 'T',
    componentSeparator: '',
  };
}

function createEmptyGS(): GSEnvelope {
  return {
    functionalIdentifierCode: '',
    senderCode: '',
    receiverCode: '',
    date: '',
    time: '',
    controlNumber: '',
    responsibleAgency: '',
    versionCode: '',
  };
}
