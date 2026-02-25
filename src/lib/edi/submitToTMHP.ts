/**
 * Buckeye EMR — TMHP EDI Gateway SFTP Upload Module
 *
 * Uploads generated 837P EDI files to TMHP's (Texas Medicaid & Healthcare
 * Partnership) EDI Gateway via SFTP using the ssh2-sftp-client package.
 *
 * Also supports downloading 835 (Electronic Remittance Advice) response
 * files from TMHP for payment reconciliation.
 *
 * TMHP EDI Gateway Information:
 *   - Protocol: SFTP (SSH File Transfer Protocol)
 *   - Credentials: Assigned by TMHP during provider enrollment
 *   - Upload Directory: Typically /inbound or /upload (configured per provider)
 *   - Response Directory: Typically /outbound or /download (835 responses)
 *
 * @module submitToTMHP
 */

import SftpClient from 'ssh2-sftp-client';
import type { TMHPSftpConfig, SftpUploadResult } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Default SFTP port. */
const DEFAULT_PORT = 22;

/** Default remote directory for uploading 837P claim files. */
const DEFAULT_REMOTE_DIR = '/inbound';

/** Default remote directory for downloading 835 response files. */
const DEFAULT_RESPONSE_DIR = '/outbound';

/** Connection timeout in milliseconds (30 seconds). */
const CONNECTION_TIMEOUT = 30_000;

/** Maximum retry attempts for transient connection failures. */
const MAX_RETRIES = 3;

/** Base delay between retries in milliseconds (doubles each attempt). */
const RETRY_BASE_DELAY = 2_000;

// ============================================================================
// File Naming
// ============================================================================

/**
 * Generate a unique filename for an 837P upload.
 * Format: 837P_{submitterId}_{YYYYMMDD}_{HHMMSS}_{random}.edi
 *
 * @param submitterId - The submitter/provider ID for identification
 * @returns Unique filename string
 */
export function generateFileName(submitterId: string): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const cleanId = submitterId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  return `837P_${cleanId}_${date}_${time}_${rand}.edi`;
}

// ============================================================================
// SFTP Upload
// ============================================================================

/**
 * Upload an 837P EDI file to TMHP's EDI Gateway via SFTP.
 *
 * This function:
 *   1. Establishes an SFTP connection to the TMHP gateway
 *   2. Generates a unique filename
 *   3. Uploads the EDI content as a file
 *   4. Verifies the file was written correctly (size check)
 *   5. Closes the connection
 *
 * Supports automatic retry with exponential backoff for transient failures.
 *
 * @param config - SFTP connection configuration (host, credentials, dirs)
 * @param ediContent - The raw 837P EDI file content to upload
 * @param submitterId - Submitter ID for filename generation
 * @returns SftpUploadResult with success status and remote file path
 */
export async function uploadToTMHP(
  config: TMHPSftpConfig,
  ediContent: string,
  submitterId: string
): Promise<SftpUploadResult> {
  const sftp = new SftpClient();
  const fileName = generateFileName(submitterId);
  const remoteDir = config.remoteDir || DEFAULT_REMOTE_DIR;
  const remoteFilePath = `${remoteDir}/${fileName}`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Build connection config
      const connectConfig: SftpClient.ConnectOptions = {
        host: config.host,
        port: config.port || DEFAULT_PORT,
        username: config.username,
        readyTimeout: CONNECTION_TIMEOUT,
        retries: 0, // We handle retries ourselves
      };

      // Auth: password or private key
      if (config.password) {
        connectConfig.password = config.password;
      }
      if (config.privateKeyPath) {
        const fs = await import('fs');
        connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
      }

      // Connect
      await sftp.connect(connectConfig);

      // Ensure remote directory exists
      const dirExists = await sftp.exists(remoteDir);
      if (!dirExists) {
        await sftp.mkdir(remoteDir, true);
      }

      // Upload the file content as a Buffer
      const buffer = Buffer.from(ediContent, 'utf-8');
      await sftp.put(buffer, remoteFilePath);

      // Verify file was written (check size)
      const stat = await sftp.stat(remoteFilePath);
      const fileSize = stat.size;

      if (fileSize === 0) {
        throw new Error('Uploaded file is empty — possible write failure');
      }

      // Close connection
      await sftp.end();

      return {
        success: true,
        remoteFilePath,
        fileSize,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Always try to close on error
      try {
        await sftp.end();
      } catch {
        // Ignore close errors
      }

      // Retry on transient network errors
      if (attempt < MAX_RETRIES && isTransientError(lastError)) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        console.warn(
          `TMHP SFTP upload attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }

      // Non-retryable or max retries exhausted
      break;
    }
  }

  return {
    success: false,
    error: `SFTP upload failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`,
  };
}

// ============================================================================
// Download 835 Responses
// ============================================================================

/**
 * Download 835 (Electronic Remittance Advice) response files from TMHP.
 *
 * Connects to the TMHP SFTP gateway and retrieves all .835 or .edi files
 * from the response directory. Returns file contents as strings.
 *
 * @param config - SFTP connection configuration
 * @returns Array of { fileName, content } objects
 */
export async function download835Responses(
  config: TMHPSftpConfig
): Promise<{ fileName: string; content: string }[]> {
  const sftp = new SftpClient();
  const responseDir = config.responseDir || DEFAULT_RESPONSE_DIR;
  const results: { fileName: string; content: string }[] = [];

  try {
    const connectConfig: SftpClient.ConnectOptions = {
      host: config.host,
      port: config.port || DEFAULT_PORT,
      username: config.username,
      readyTimeout: CONNECTION_TIMEOUT,
      retries: 0,
    };

    if (config.password) {
      connectConfig.password = config.password;
    }
    if (config.privateKeyPath) {
      const fs = await import('fs');
      connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
    }

    await sftp.connect(connectConfig);

    // List files in the response directory
    const dirExists = await sftp.exists(responseDir);
    if (!dirExists) {
      await sftp.end();
      return [];
    }

    const fileList = await sftp.list(responseDir);

    // Filter for 835/EDI files
    const ediFiles = fileList.filter((f) => {
      const name = f.name.toLowerCase();
      return (
        f.type === '-' &&
        (name.endsWith('.835') || name.endsWith('.edi') || name.includes('835'))
      );
    });

    // Download each file
    for (const file of ediFiles) {
      try {
        const remotePath = `${responseDir}/${file.name}`;
        const buffer = await sftp.get(remotePath) as Buffer;
        results.push({
          fileName: file.name,
          content: buffer.toString('utf-8'),
        });
      } catch (err) {
        console.error(`Failed to download ${file.name}:`, err);
      }
    }

    await sftp.end();
  } catch (error) {
    try { await sftp.end(); } catch { /* ignore */ }
    console.error('Failed to download 835 responses:', error);
  }

  return results;
}

// ============================================================================
// Test Connection
// ============================================================================

/**
 * Test the SFTP connection to TMHP's EDI Gateway.
 * Useful for verifying credentials and network connectivity
 * before attempting to upload claims.
 *
 * @param config - SFTP connection configuration
 * @returns Object with success status and error message if failed
 */
export async function testConnection(
  config: TMHPSftpConfig
): Promise<{ success: boolean; error?: string }> {
  const sftp = new SftpClient();

  try {
    const connectConfig: SftpClient.ConnectOptions = {
      host: config.host,
      port: config.port || DEFAULT_PORT,
      username: config.username,
      readyTimeout: CONNECTION_TIMEOUT,
      retries: 0,
    };

    if (config.password) {
      connectConfig.password = config.password;
    }
    if (config.privateKeyPath) {
      const fs = await import('fs');
      connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
    }

    await sftp.connect(connectConfig);

    // Quick sanity check — list root directory
    await sftp.list('/');

    await sftp.end();

    return { success: true };
  } catch (error) {
    try { await sftp.end(); } catch { /* ignore */ }

    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Connection failed: ${message}` };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if an error is likely transient and worth retrying.
 * Transient errors include network timeouts, connection resets, and DNS failures.
 */
function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('enetunreach') ||
    msg.includes('socket') ||
    msg.includes('connection')
  );
}

/** Sleep for the specified number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
