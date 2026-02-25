/**
 * Buckeye EMR — EDI Module Public API
 *
 * Central barrel export for all TMHP EDI-related functionality:
 *   - 837P claim generation
 *   - 835 remittance parsing
 *   - SFTP submission to TMHP
 *   - TypeScript interfaces
 *   - Sample test data
 */

// 837P Generator
export { generate837P, validateClaim } from './generate837P';

// 835 Parser
export {
  parse835,
  getClaimStatusDescription,
  getAdjustmentGroupDescription,
  getReasonCodeDescription,
} from './parse835';

// SFTP Upload
export {
  uploadToTMHP,
  download835Responses,
  testConnection,
  generateFileName,
} from './submitToTMHP';

// Sample Data
export { sampleClaim, generateSampleClaim } from './testClaim';

// Types
export type {
  SubmitterInfo,
  BillingProvider,
  RenderingProvider,
  PatientSubscriber,
  ClaimDetails,
  ServiceLine,
  Claim837PInput,
  ValidationError,
  GenerationResult,
  TMHPSftpConfig,
  SftpUploadResult,
  Parsed835Result,
  RemittanceClaim,
  RemittanceServiceLine,
  RemittanceAdjustment,
  RemittanceAdjustmentReason,
  ClaimSubmitRequest,
  ClaimSubmitResponse,
} from './types';
