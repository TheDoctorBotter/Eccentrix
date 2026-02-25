/**
 * EDI 835 Payment Summary Generator
 *
 * Takes parsed 835 data and produces a human-readable payment posting summary.
 * Flags underpayments, denials, unusual adjustments, and common PT denial scenarios.
 */

import type {
  Parsed835,
  TransactionInfo,
  ClaimPayment,
  ServiceLinePayment,
  ClaimAdjustment,
  PaymentSummary,
  ClaimSummary,
  ServiceLineSummary,
  AdjustmentSummaryDetail,
  DenialReasonSummary,
  ProviderAdjustmentSummary,
  SummaryFlag,
} from './835-types';
import { CLAIM_STATUS_DESCRIPTIONS, ADJUSTMENT_GROUP_DESCRIPTIONS } from './835-types';
import { lookupCARC, lookupRARC, lookupPLBReason, isPTDenialCode } from './reason-codes';

// ============================================================================
// Main Summary Generator
// ============================================================================

/**
 * Generate a human-readable payment summary from parsed 835 data.
 * Produces one summary per transaction (check/EFT).
 */
export function generatePaymentSummaries(parsed: Parsed835): PaymentSummary[] {
  return parsed.transactions.map(generateTransactionSummary);
}

/**
 * Generate a summary for a single transaction.
 */
export function generateTransactionSummary(txn: TransactionInfo): PaymentSummary {
  const claimSummaries = txn.claims.map(generateClaimSummary);

  const totalChargedAmount = claimSummaries.reduce((sum, c) => sum + c.chargedAmount, 0);
  const totalAllowedAmount = claimSummaries.reduce((sum, c) => sum + c.allowedAmount, 0);
  const totalPatientResponsibility = claimSummaries.reduce((sum, c) => sum + c.patientResponsibility, 0);
  const totalContractualAdjustment = claimSummaries.reduce((sum, c) => sum + c.contractualAdjustment, 0);
  const totalOtherAdjustments = claimSummaries.reduce((sum, c) => sum + c.otherAdjustments, 0);

  const paidClaimCount = txn.claims.filter((c) => c.claimStatus !== '4' && c.claimStatus !== '22').length;
  const deniedClaimCount = txn.claims.filter((c) => c.claimStatus === '4').length;
  const reversalCount = txn.claims.filter((c) => c.claimStatus === '22').length;

  // Provider-level adjustments
  const providerAdjustments = flattenProviderAdjustments(txn);
  const providerAdjustmentTotal = providerAdjustments.reduce((sum, a) => sum + a.amount, 0);

  // Collect all flags from claims and add transaction-level flags
  const flags: SummaryFlag[] = [];
  for (const cs of claimSummaries) {
    flags.push(...cs.flags);
  }

  // Flag provider-level recoupments
  for (const pa of providerAdjustments) {
    if (pa.reasonCode === 'WO' || pa.reasonCode === 'WU') {
      flags.push({
        type: 'RECOUPMENT',
        message: `Provider-level recoupment: ${pa.reasonDescription} ($${Math.abs(pa.amount).toFixed(2)})`,
        severity: 'warning',
      });
    }
  }

  // Flag if total payment is zero but there were charges
  if (txn.totalPaymentAmount === 0 && totalChargedAmount > 0) {
    flags.push({
      type: 'ZERO_PAYMENT',
      message: 'Total payment amount is $0.00 — all claims may be denied or adjusted',
      severity: 'critical',
    });
  }

  return {
    checkOrEftNumber: txn.checkOrEftNumber,
    paymentMethod: formatPaymentMethod(txn.paymentMethod),
    paymentDate: formatDate(txn.paymentDate),
    payerName: txn.payerIdentification.name,
    payerId: txn.payerIdentification.identifierCode,
    payeeName: txn.payeeIdentification.name,
    payeeNpi: txn.payeeIdentification.npi,
    totalPaymentAmount: txn.totalPaymentAmount,
    totalChargedAmount,
    totalAllowedAmount,
    totalPatientResponsibility,
    totalContractualAdjustment,
    totalOtherAdjustments,
    providerAdjustmentTotal,
    claimCount: txn.claims.length,
    paidClaimCount,
    deniedClaimCount,
    reversalCount,
    claims: claimSummaries,
    providerAdjustments,
    flags,
  };
}

// ============================================================================
// Claim Summary
// ============================================================================

function generateClaimSummary(claim: ClaimPayment): ClaimSummary {
  const serviceLines = claim.serviceLines.map((sl) => generateServiceLineSummary(sl, claim.patientAccountNumber));

  // Calculate totals from adjustments
  const contractualAdjustment = sumAdjustmentsByGroup(claim.adjustments, 'CO')
    + serviceLines.reduce((sum, sl) => sum + sl.contractualAdjustment, 0);

  const patientResponsibility = (claim.patientResponsibilityAmount ?? 0)
    || (sumAdjustmentsByGroup(claim.adjustments, 'PR')
      + serviceLines.reduce((sum, sl) => sum + sl.patientResponsibility, 0));

  const otherAdjustments = sumAdjustmentsByGroup(claim.adjustments, 'OA')
    + sumAdjustmentsByGroup(claim.adjustments, 'PI')
    + serviceLines.reduce((sum, sl) => sum + sl.otherAdjustments, 0);

  // Allowed amount: try AMT*AU from claim supplemental amounts, then compute from service lines
  const claimAllowedAmt = claim.supplementalAmounts.find((a) => a.qualifier === 'AU');
  const allowedAmount = claimAllowedAmt?.amount
    ?? (serviceLines.reduce((sum, sl) => sum + sl.allowedAmount, 0)
      || (claim.totalChargedAmount - contractualAdjustment));

  // Collect denial reasons from claim-level and service-level
  const denialReasons = collectDenialReasons(claim);

  // Build flags
  const flags = buildClaimFlags(claim, serviceLines, allowedAmount, contractualAdjustment);

  // Date range
  let statementDateRange: string | undefined;
  if (claim.statementFromDate) {
    statementDateRange = formatDate(claim.statementFromDate);
    if (claim.statementToDate && claim.statementToDate !== claim.statementFromDate) {
      statementDateRange += ` - ${formatDate(claim.statementToDate)}`;
    }
  }

  return {
    patientAccountNumber: claim.patientAccountNumber,
    patientName: formatPatientName(claim),
    claimStatus: claim.claimStatus,
    claimStatusDescription: CLAIM_STATUS_DESCRIPTIONS[claim.claimStatus] ?? `Status ${claim.claimStatus}`,
    chargedAmount: claim.totalChargedAmount,
    allowedAmount,
    paidAmount: claim.totalPaidAmount,
    patientResponsibility,
    contractualAdjustment,
    otherAdjustments,
    payerClaimControlNumber: claim.payerClaimControlNumber,
    statementDateRange,
    serviceLines,
    denialReasons,
    flags,
  };
}

// ============================================================================
// Service Line Summary
// ============================================================================

function generateServiceLineSummary(
  line: ServiceLinePayment,
  claimId: string
): ServiceLineSummary {
  const contractualAdjustment = sumAdjustmentsByGroup(line.adjustments, 'CO');
  const patientResponsibility = sumAdjustmentsByGroup(line.adjustments, 'PR');
  const otherAdjustments = sumAdjustmentsByGroup(line.adjustments, 'OA')
    + sumAdjustmentsByGroup(line.adjustments, 'PI');

  // Allowed amount: from AMT*B6 or compute
  const allowedAmount = line.allowedAmount
    ?? ((line.chargedAmount - contractualAdjustment) || 0);

  const isDenied = line.paidAmount === 0 && line.chargedAmount > 0;

  // Build per-adjustment detail
  const adjustmentDetails: AdjustmentSummaryDetail[] = [];
  for (const adj of line.adjustments) {
    for (const detail of adj.details) {
      adjustmentDetails.push({
        groupCode: adj.groupCode,
        groupDescription: ADJUSTMENT_GROUP_DESCRIPTIONS[adj.groupCode] ?? adj.groupCode,
        reasonCode: detail.reasonCode,
        reasonDescription: lookupCARC(detail.reasonCode),
        amount: detail.amount,
      });
    }
  }

  // Denial reasons for this line
  const denialReasons: DenialReasonSummary[] = [];
  if (isDenied) {
    // Get denial CARCs
    for (const adj of line.adjustments) {
      for (const detail of adj.details) {
        if (detail.amount > 0 || adj.groupCode !== 'CO') {
          denialReasons.push({
            reasonCode: detail.reasonCode,
            description: lookupCARC(detail.reasonCode),
            remarkCodes: line.remarkCodes.map((r) => r.code),
            remarkDescriptions: line.remarkCodes.map((r) => lookupRARC(r.code)),
          });
        }
      }
    }
  }

  const modifiers = line.procedure.modifiers;
  const cptCode = line.procedure.code;

  return {
    cptCode,
    modifiers,
    serviceDate: line.serviceDate ? formatDate(line.serviceDate) : undefined,
    chargedAmount: line.chargedAmount,
    allowedAmount,
    paidAmount: line.paidAmount,
    unitsBilled: line.unitsBilled,
    unitsPaid: line.unitsPaid,
    patientResponsibility,
    contractualAdjustment,
    otherAdjustments,
    adjustmentDetails,
    isDenied,
    denialReasons,
  };
}

// ============================================================================
// Flag Detection
// ============================================================================

function buildClaimFlags(
  claim: ClaimPayment,
  serviceLines: ServiceLineSummary[],
  allowedAmount: number,
  contractualAdjustment: number
): SummaryFlag[] {
  const flags: SummaryFlag[] = [];
  const claimId = claim.patientAccountNumber;

  // Full denial
  if (claim.claimStatus === '4') {
    flags.push({
      type: 'DENIAL',
      message: `Claim ${claimId} was fully denied`,
      severity: 'critical',
      claimId,
    });
  }

  // Reversal
  if (claim.claimStatus === '22') {
    flags.push({
      type: 'REVERSAL',
      message: `Claim ${claimId} is a reversal of a previous payment`,
      severity: 'warning',
      claimId,
    });
  }

  // Partial denial (some lines denied, some paid)
  const deniedLines = serviceLines.filter((sl) => sl.isDenied);
  const paidLines = serviceLines.filter((sl) => !sl.isDenied);
  if (deniedLines.length > 0 && paidLines.length > 0) {
    flags.push({
      type: 'PARTIAL_DENIAL',
      message: `Claim ${claimId}: ${deniedLines.length} of ${serviceLines.length} service lines denied`,
      severity: 'warning',
      claimId,
    });
  }

  // Units reduced
  for (let i = 0; i < claim.serviceLines.length; i++) {
    const sl = claim.serviceLines[i];
    if (sl.unitsBilled && sl.unitsPaid && sl.unitsPaid < sl.unitsBilled) {
      flags.push({
        type: 'UNITS_REDUCED',
        message: `Claim ${claimId}, CPT ${sl.procedure.code}: ${sl.unitsBilled} units billed, ${sl.unitsPaid} units paid`,
        severity: 'warning',
        claimId,
        lineIndex: i,
      });
    }
  }

  // PT-specific denial detection from CARC codes
  const allAdjustments = [
    ...claim.adjustments,
    ...claim.serviceLines.flatMap((sl) => sl.adjustments),
  ];

  for (const adj of allAdjustments) {
    for (const detail of adj.details) {
      const ptDenial = isPTDenialCode(detail.reasonCode);
      if (ptDenial.isDenial && ptDenial.category) {
        const flagType = ({
          'VISIT_LIMIT': 'VISIT_LIMIT_EXCEEDED' as const,
          'NO_PRIOR_AUTH': 'NO_PRIOR_AUTH' as const,
          'BUNDLED': 'BUNDLED_SERVICE' as const,
          'MEDICAL_NECESSITY': 'MEDICAL_NECESSITY' as const,
          'NOT_COVERED': 'DENIAL' as const,
          'OTHER': 'DENIAL' as const,
        })[ptDenial.category];

        // Avoid duplicate flags of the same type for the same claim
        if (!flags.some((f) => f.type === flagType && f.claimId === claimId)) {
          flags.push({
            type: flagType,
            message: `Claim ${claimId}: ${lookupCARC(detail.reasonCode)} (CARC ${detail.reasonCode})`,
            severity: flagType === 'DENIAL' ? 'critical' : 'warning',
            claimId,
          });
        }
      }
    }
  }

  // Underpayment check: if paid < allowed (and not denied)
  if (claim.claimStatus !== '4' && claim.claimStatus !== '22') {
    if (claim.totalPaidAmount > 0 && allowedAmount > 0) {
      const expectedPaid = allowedAmount - sumAdjustmentsByGroup(claim.adjustments, 'PR');
      if (expectedPaid > 0 && claim.totalPaidAmount < expectedPaid - 0.01) {
        flags.push({
          type: 'UNDERPAYMENT',
          message: `Claim ${claimId}: Paid $${claim.totalPaidAmount.toFixed(2)} but expected $${expectedPaid.toFixed(2)} based on allowed amount`,
          severity: 'warning',
          claimId,
        });
      }
    }
  }

  return flags;
}

// ============================================================================
// Denial Reason Collection
// ============================================================================

function collectDenialReasons(claim: ClaimPayment): DenialReasonSummary[] {
  const reasons: DenialReasonSummary[] = [];

  // Claim-level remark codes (from MOA)
  const claimRemarkCodes = claim.outpatientAdjudication?.remarkCodes ?? [];

  // Collect from claim-level CAS where the claim is denied or adjusted
  if (claim.claimStatus === '4' || claim.totalPaidAmount === 0) {
    for (const adj of claim.adjustments) {
      for (const detail of adj.details) {
        if (detail.amount > 0) {
          reasons.push({
            reasonCode: detail.reasonCode,
            description: lookupCARC(detail.reasonCode),
            remarkCodes: claimRemarkCodes,
            remarkDescriptions: claimRemarkCodes.map(lookupRARC),
          });
        }
      }
    }
  }

  // Collect from service-line denials
  for (const sl of claim.serviceLines) {
    if (sl.paidAmount === 0 && sl.chargedAmount > 0) {
      const lineRemarks = sl.remarkCodes.map((r) => r.code);
      for (const adj of sl.adjustments) {
        for (const detail of adj.details) {
          if (detail.amount > 0) {
            reasons.push({
              reasonCode: detail.reasonCode,
              description: lookupCARC(detail.reasonCode),
              remarkCodes: lineRemarks,
              remarkDescriptions: lineRemarks.map(lookupRARC),
            });
          }
        }
      }
    }
  }

  // Deduplicate by reason code
  const seen = new Set<string>();
  return reasons.filter((r) => {
    if (seen.has(r.reasonCode)) return false;
    seen.add(r.reasonCode);
    return true;
  });
}

// ============================================================================
// Provider Adjustment Flattening
// ============================================================================

function flattenProviderAdjustments(txn: TransactionInfo): ProviderAdjustmentSummary[] {
  const summaries: ProviderAdjustmentSummary[] = [];

  for (const plb of txn.providerAdjustments) {
    for (const detail of plb.adjustments) {
      summaries.push({
        reasonCode: detail.reasonCode,
        reasonDescription: lookupPLBReason(detail.reasonCode),
        amount: detail.amount,
        referenceId: detail.referenceId,
      });
    }
  }

  return summaries;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatPaymentMethod(code: string): string {
  const methods: Record<string, string> = {
    'CHK': 'Check',
    'ACH': 'EFT/ACH',
    'FWT': 'Federal Wire Transfer',
    'BOP': 'Financial Institution Option',
    'NON': 'Non-Payment Data',
  };
  return methods[code] ?? code;
}

function formatDate(ediDate: string): string {
  if (!ediDate || ediDate.length < 8) return ediDate;
  const year = ediDate.substring(0, 4);
  const month = ediDate.substring(4, 6);
  const day = ediDate.substring(6, 8);
  return `${month}/${day}/${year}`;
}

function formatPatientName(claim: ClaimPayment): string {
  const name = claim.patientName;
  if (!name.lastName) return 'Unknown Patient';
  const parts = [name.lastName];
  if (name.firstName) parts.push(name.firstName);
  if (name.middleName) parts.push(name.middleName);
  return parts.join(', ');
}

function sumAdjustmentsByGroup(adjustments: ClaimAdjustment[], groupCode: string): number {
  return adjustments
    .filter((a) => a.groupCode === groupCode)
    .reduce((sum, a) => sum + a.details.reduce((s, d) => s + d.amount, 0), 0);
}

// ============================================================================
// Text Report Generator
// ============================================================================

/**
 * Generate a formatted text report from a payment summary.
 * Useful for human review and payment posting verification.
 */
export function formatPaymentReport(summary: PaymentSummary): string {
  const lines: string[] = [];

  lines.push('='.repeat(80));
  lines.push('ELECTRONIC REMITTANCE ADVICE (835) - PAYMENT POSTING SUMMARY');
  lines.push('='.repeat(80));
  lines.push('');

  // Header info
  lines.push(`Payment Method:    ${summary.paymentMethod}`);
  lines.push(`Check/EFT #:       ${summary.checkOrEftNumber}`);
  lines.push(`Payment Date:      ${summary.paymentDate}`);
  lines.push(`Payer:             ${summary.payerName} (${summary.payerId})`);
  lines.push(`Payee:             ${summary.payeeName}${summary.payeeNpi ? ` (NPI: ${summary.payeeNpi})` : ''}`);
  lines.push('');

  // Payment totals
  lines.push('-'.repeat(80));
  lines.push('PAYMENT TOTALS');
  lines.push('-'.repeat(80));
  lines.push(`Total Charged:              $${summary.totalChargedAmount.toFixed(2)}`);
  lines.push(`Total Allowed:              $${summary.totalAllowedAmount.toFixed(2)}`);
  lines.push(`Total Contractual Adj:     -$${summary.totalContractualAdjustment.toFixed(2)}`);
  lines.push(`Total Patient Resp:         $${summary.totalPatientResponsibility.toFixed(2)}`);
  lines.push(`Total Other Adj:           -$${summary.totalOtherAdjustments.toFixed(2)}`);
  lines.push(`Total Payment:              $${summary.totalPaymentAmount.toFixed(2)}`);
  if (summary.providerAdjustmentTotal !== 0) {
    lines.push(`Provider Adjustments:       $${summary.providerAdjustmentTotal.toFixed(2)}`);
  }
  lines.push('');
  lines.push(`Claims: ${summary.claimCount} total, ${summary.paidClaimCount} paid, ${summary.deniedClaimCount} denied, ${summary.reversalCount} reversals`);
  lines.push('');

  // Flags
  if (summary.flags.length > 0) {
    lines.push('-'.repeat(80));
    lines.push('FLAGS / ALERTS');
    lines.push('-'.repeat(80));
    for (const flag of summary.flags) {
      const icon = flag.severity === 'critical' ? '[!!]' : flag.severity === 'warning' ? '[!]' : '[i]';
      lines.push(`  ${icon} ${flag.message}`);
    }
    lines.push('');
  }

  // Per-claim breakdown
  for (const claim of summary.claims) {
    lines.push('-'.repeat(80));
    lines.push(`CLAIM: ${claim.patientAccountNumber}`);
    lines.push('-'.repeat(80));
    lines.push(`  Patient:         ${claim.patientName}`);
    lines.push(`  Status:          ${claim.claimStatusDescription}`);
    if (claim.payerClaimControlNumber) {
      lines.push(`  Payer Ctrl #:    ${claim.payerClaimControlNumber}`);
    }
    if (claim.statementDateRange) {
      lines.push(`  Date Range:      ${claim.statementDateRange}`);
    }
    lines.push(`  Charged:         $${claim.chargedAmount.toFixed(2)}`);
    lines.push(`  Allowed:         $${claim.allowedAmount.toFixed(2)}`);
    lines.push(`  Paid:            $${claim.paidAmount.toFixed(2)}`);
    lines.push(`  Patient Resp:    $${claim.patientResponsibility.toFixed(2)}`);
    lines.push(`  Contractual Adj: $${claim.contractualAdjustment.toFixed(2)}`);
    if (claim.otherAdjustments > 0) {
      lines.push(`  Other Adj:       $${claim.otherAdjustments.toFixed(2)}`);
    }
    lines.push('');

    // Denial reasons
    if (claim.denialReasons.length > 0) {
      lines.push('  DENIAL REASONS:');
      for (const dr of claim.denialReasons) {
        lines.push(`    CARC ${dr.reasonCode}: ${dr.description}`);
        for (let i = 0; i < dr.remarkCodes.length; i++) {
          lines.push(`      RARC ${dr.remarkCodes[i]}: ${dr.remarkDescriptions[i]}`);
        }
      }
      lines.push('');
    }

    // Service line detail
    if (claim.serviceLines.length > 0) {
      lines.push('  SERVICE LINES:');
      lines.push(`  ${'CPT'.padEnd(8)}${'Mods'.padEnd(12)}${'Charged'.padStart(10)}${'Allowed'.padStart(10)}${'Paid'.padStart(10)}${'Pt Resp'.padStart(10)}${'Status'.padStart(10)}`);
      lines.push(`  ${'─'.repeat(70)}`);

      for (const sl of claim.serviceLines) {
        const modsStr = sl.modifiers.length > 0 ? sl.modifiers.join(',') : '-';
        const status = sl.isDenied ? 'DENIED' : 'PAID';
        lines.push(
          `  ${sl.cptCode.padEnd(8)}${modsStr.padEnd(12)}${('$' + sl.chargedAmount.toFixed(2)).padStart(10)}${('$' + sl.allowedAmount.toFixed(2)).padStart(10)}${('$' + sl.paidAmount.toFixed(2)).padStart(10)}${('$' + sl.patientResponsibility.toFixed(2)).padStart(10)}${status.padStart(10)}`
        );

        // Show units if reduced
        if (sl.unitsBilled && sl.unitsPaid && sl.unitsPaid < sl.unitsBilled) {
          lines.push(`           Units: ${sl.unitsBilled} billed -> ${sl.unitsPaid} paid`);
        }

        // Show date if available
        if (sl.serviceDate) {
          lines.push(`           Date: ${sl.serviceDate}`);
        }

        // Show denied line adjustments
        if (sl.isDenied && sl.denialReasons.length > 0) {
          for (const dr of sl.denialReasons) {
            lines.push(`           Denial: CARC ${dr.reasonCode} - ${dr.description}`);
          }
        }

        // Show all adjustment details for non-denied lines
        if (!sl.isDenied && sl.adjustmentDetails.length > 0) {
          for (const ad of sl.adjustmentDetails) {
            lines.push(`           ${ad.groupCode} ${ad.reasonCode}: -$${ad.amount.toFixed(2)} (${ad.reasonDescription})`);
          }
        }
      }
      lines.push('');
    }
  }

  // Provider adjustments
  if (summary.providerAdjustments.length > 0) {
    lines.push('-'.repeat(80));
    lines.push('PROVIDER-LEVEL ADJUSTMENTS (PLB)');
    lines.push('-'.repeat(80));
    for (const pa of summary.providerAdjustments) {
      lines.push(`  ${pa.reasonCode}: ${pa.reasonDescription} - $${pa.amount.toFixed(2)}${pa.referenceId ? ` (Ref: ${pa.referenceId})` : ''}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(80));
  lines.push('END OF REMITTANCE SUMMARY');
  lines.push('='.repeat(80));

  return lines.join('\n');
}
