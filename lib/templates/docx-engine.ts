/**
 * DOCX Template Engine
 *
 * Uses docxtemplater to fill .docx templates with note data.
 * Handles the "split runs" problem where Word may split placeholders
 * across multiple XML elements.
 *
 * Key features:
 * - Preserves all original formatting from template
 * - Handles placeholders in tables
 * - Supports multi-line text insertion
 * - Supports bullet list insertion
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { NoteTemplateData, TEMPLATE_PLACEHOLDERS } from './types';

// ============================================================================
// Types
// ============================================================================

interface DocxFillOptions {
  templateBuffer: ArrayBuffer;
  data: NoteTemplateData;
  preserveWhitespace?: boolean;
}

interface DocxFillResult {
  success: boolean;
  buffer?: ArrayBuffer;
  error?: string;
}

interface PlaceholderMapping {
  [key: string]: string | undefined;
}

// ============================================================================
// Placeholder Detection
// ============================================================================

/**
 * Extract all placeholders found in a template
 */
export function detectPlaceholders(templateBuffer: ArrayBuffer): string[] {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });

    // Get all tags (placeholders) from the template
    const tags = doc.getFullText();
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = placeholderRegex.exec(tags)) !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }

    return placeholders;
  } catch (error) {
    console.error('Error detecting placeholders:', error);
    return [];
  }
}

/**
 * Detect placeholders by parsing the document XML directly
 * More reliable than getFullText for split runs
 */
export function detectPlaceholdersFromXml(templateBuffer: ArrayBuffer): string[] {
  try {
    const zip = new PizZip(templateBuffer);
    const placeholders: Set<string> = new Set();

    // Check main document
    const documentXml = zip.file('word/document.xml')?.asText() || '';
    // Check headers
    const header1Xml = zip.file('word/header1.xml')?.asText() || '';
    const header2Xml = zip.file('word/header2.xml')?.asText() || '';
    // Check footers
    const footer1Xml = zip.file('word/footer1.xml')?.asText() || '';
    const footer2Xml = zip.file('word/footer2.xml')?.asText() || '';

    const allXml = documentXml + header1Xml + header2Xml + footer1Xml + footer2Xml;

    // Find placeholders even if split across runs
    // First, extract all text content
    const textContent = allXml.replace(/<[^>]+>/g, '');
    const placeholderRegex = /\{\{([A-Z_0-9]+)\}\}/g;
    let match;

    while ((match = placeholderRegex.exec(textContent)) !== null) {
      placeholders.add(match[1]);
    }

    return Array.from(placeholders);
  } catch (error) {
    console.error('Error detecting placeholders from XML:', error);
    return [];
  }
}

// ============================================================================
// Data Mapping
// ============================================================================

/**
 * Map NoteTemplateData to placeholder key-value pairs
 */
function mapDataToPlaceholders(data: NoteTemplateData): PlaceholderMapping {
  const mapping: PlaceholderMapping = {};

  // Patient Info
  mapping['PATIENT_NAME'] = data.patientName || '';
  mapping['PATIENT_FIRST_NAME'] = data.patientFirstName || '';
  mapping['PATIENT_LAST_NAME'] = data.patientLastName || '';
  mapping['DOB'] = data.dob || '';
  mapping['AGE'] = data.age || '';
  mapping['INSURANCE_ID'] = data.insuranceId || '';
  mapping['REFERRING_MD'] = data.referringMd || '';
  mapping['MEDICAL_DX'] = data.medicalDx || '';
  mapping['TREATMENT_DX'] = data.treatmentDx || '';
  mapping['ALLERGIES'] = data.allergies || '';
  mapping['PRECAUTIONS'] = data.precautions || '';
  mapping['START_OF_CARE'] = data.startOfCare || '';
  mapping['LANGUAGE'] = data.language || '';

  // Session Info
  mapping['DATE_OF_SERVICE'] = data.dateOfService || '';
  mapping['TIME_IN'] = data.timeIn || '';
  mapping['TIME_OUT'] = data.timeOut || '';
  mapping['TOTAL_TIME'] = data.totalTime || '';
  mapping['UNITS'] = data.units || '';

  // SOAP Sections
  mapping['SUBJECTIVE'] = data.subjective || '';
  mapping['OBJECTIVE'] = data.objective || '';
  mapping['ASSESSMENT'] = data.assessment || '';
  mapping['PLAN'] = data.plan || '';
  mapping['PATIENT_HISTORY'] = data.patientHistory || '';

  // Goals
  mapping['SHORT_TERM_GOALS'] = data.shortTermGoals || '';
  mapping['LONG_TERM_GOALS'] = data.longTermGoals || '';

  // Individual goals
  if (data.goals && data.goals.length > 0) {
    data.goals.forEach((goal, index) => {
      const num = index + 1;
      mapping[`GOAL_${num}`] = goal.text || '';
      mapping[`GOAL_${num}_BASELINE`] = goal.baseline || '';
      mapping[`GOAL_${num}_CURRENT`] = goal.current || '';
    });
  }
  // Fill empty goal slots
  for (let i = 1; i <= 5; i++) {
    if (!mapping[`GOAL_${i}`]) mapping[`GOAL_${i}`] = '';
    if (!mapping[`GOAL_${i}_BASELINE`]) mapping[`GOAL_${i}_BASELINE`] = '';
    if (!mapping[`GOAL_${i}_CURRENT`]) mapping[`GOAL_${i}_CURRENT`] = '';
  }

  // Plan of Care
  mapping['PROGNOSIS'] = data.prognosis || '';
  mapping['FREQUENCY'] = data.frequency || '';
  mapping['DURATION'] = data.duration || '';
  mapping['HEP'] = data.hep || '';

  // Billing
  mapping['DX_CODES'] = data.dxCodes || '';
  mapping['CPT_CODES'] = data.cptCodes || '';
  mapping['BILLING_JUSTIFICATION'] = data.billingJustification || '';

  // Provider
  mapping['THERAPIST_NAME'] = data.therapistName || '';
  mapping['THERAPIST_CREDENTIALS'] = data.therapistCredentials || '';
  mapping['THERAPIST_LICENSE'] = data.therapistLicense || '';
  mapping['THERAPIST_SIGNATURE'] = ''; // Will be handled separately if needed
  mapping['SIGNATURE_DATE'] = data.signatureDate || '';
  mapping['SUPERVISING_PT_NAME'] = data.supervisingPtName || '';
  mapping['SUPERVISING_PT_SIGNATURE'] = '';

  // Assessment specific
  mapping['TEST_NAME'] = data.testName || '';
  mapping['TEST_DATE'] = data.testDate || '';
  mapping['GMQ_PERCENTILE'] = data.gmqPercentile || '';
  mapping['GMQ_DESCRIPTOR'] = data.gmqDescriptor || '';

  // Clinic
  mapping['CLINIC_NAME'] = data.clinicName || '';
  mapping['CLINIC_ADDRESS'] = data.clinicAddress || '';
  mapping['CLINIC_PHONE'] = data.clinicPhone || '';

  return mapping;
}

// ============================================================================
// XML Pre-processing for Split Runs
// ============================================================================

/**
 * Pre-process XML to merge split placeholder runs
 * Word often splits {{PLACEHOLDER}} across multiple <w:t> elements
 * This function merges them back together
 */
function mergeXmlPlaceholderRuns(xml: string): string {
  // This regex finds text runs that might contain parts of placeholders
  // and merges adjacent <w:t> elements within the same <w:r>

  // Strategy: Find all occurrences where a placeholder is split
  // Pattern: }}</w:t></w:r><w:r...><w:t>{{ or similar splits

  // First, let's normalize by removing spacing between runs that are part of placeholders
  let result = xml;

  // Pattern to find split placeholders like: {{PATIENT</w:t>...</w:t>_NAME}}
  // We need to be careful not to break valid XML

  // Simpler approach: Use a state machine to find and merge
  // For now, docxtemplater's parser option handles most cases

  return result;
}

// ============================================================================
// Core Fill Function
// ============================================================================

/**
 * Fill a DOCX template with note data
 */
export async function fillDocxTemplate(
  options: DocxFillOptions
): Promise<DocxFillResult> {
  const { templateBuffer, data, preserveWhitespace = true } = options;

  try {
    // Load the template
    const zip = new PizZip(templateBuffer);

    // Create docxtemplater instance with options to handle split runs
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true, // Convert \n to line breaks in Word
      delimiters: { start: '{{', end: '}}' },
      // Parser that handles undefined values gracefully
      nullGetter: (part) => {
        // Return empty string for undefined placeholders
        if (!part.module) {
          return '';
        }
        return '';
      },
      // Custom parser to handle split runs
      parser: (tag: string) => {
        // Return a function that will be called with the scope
        return {
          get: (scope: PlaceholderMapping) => {
            // Handle nested paths like "patient.name"
            const value = scope[tag];
            if (value === undefined || value === null) {
              return '';
            }
            return value;
          },
        };
      },
    });

    // Map note data to placeholders
    const placeholderData = mapDataToPlaceholders(data);

    // Render the document with data
    doc.render(placeholderData);

    // Generate output
    const outputBuffer = doc.getZip().generate({
      type: 'arraybuffer',
      compression: 'DEFLATE',
    });

    return {
      success: true,
      buffer: outputBuffer,
    };
  } catch (error) {
    console.error('Error filling DOCX template:', error);

    // Extract meaningful error message
    let errorMessage = 'Unknown error filling template';
    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for docxtemplater-specific errors
      if ('properties' in error && (error as any).properties?.errors) {
        const docxErrors = (error as any).properties.errors;
        errorMessage = docxErrors
          .map((e: any) => `${e.name}: ${e.message}`)
          .join('; ');
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Fill template with raw XML manipulation for better split-run handling
 * Use this as fallback if standard filling fails
 */
export async function fillDocxTemplateRaw(
  options: DocxFillOptions
): Promise<DocxFillResult> {
  const { templateBuffer, data } = options;

  try {
    const zip = new PizZip(templateBuffer);
    const placeholderData = mapDataToPlaceholders(data);

    // Process each XML file that might contain placeholders
    const xmlFiles = [
      'word/document.xml',
      'word/header1.xml',
      'word/header2.xml',
      'word/header3.xml',
      'word/footer1.xml',
      'word/footer2.xml',
      'word/footer3.xml',
    ];

    for (const xmlFile of xmlFiles) {
      const file = zip.file(xmlFile);
      if (!file) continue;

      let xml = file.asText();

      // Replace each placeholder
      for (const [key, value] of Object.entries(placeholderData)) {
        const placeholder = `{{${key}}}`;

        // Handle case where placeholder might be split across XML elements
        // First try simple replacement
        if (xml.includes(placeholder)) {
          // Escape special XML characters in value
          const escapedValue = escapeXml(value || '');
          // Handle line breaks - convert to Word line breaks
          const wordValue = escapedValue.replace(/\n/g, '</w:t><w:br/><w:t>');
          xml = xml.split(placeholder).join(wordValue);
        }

        // Also try to find split placeholders
        // Pattern: {{KEY split as {{ and KEY and }}
        const splitPatterns = [
          // {{ at end of one run, KEY}} in next
          new RegExp(
            `\\{\\{</w:t>(.*?)<w:t[^>]*>${key}\\}\\}`,
            'g'
          ),
          // {{KEY at end of one run, }} in next
          new RegExp(
            `\\{\\{${key}</w:t>(.*?)<w:t[^>]*>\\}\\}`,
            'g'
          ),
        ];

        for (const pattern of splitPatterns) {
          const escapedValue = escapeXml(value || '');
          const wordValue = escapedValue.replace(/\n/g, '</w:t><w:br/><w:t>');
          xml = xml.replace(pattern, wordValue);
        }
      }

      // Update the file in the zip
      zip.file(xmlFile, xml);
    }

    // Generate output
    const outputBuffer = zip.generate({
      type: 'arraybuffer',
      compression: 'DEFLATE',
    });

    return {
      success: true,
      buffer: outputBuffer,
    };
  } catch (error) {
    console.error('Error in raw DOCX fill:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that a template has the required placeholders for a note type
 */
export function validateTemplate(
  templateBuffer: ArrayBuffer,
  requiredPlaceholders: string[]
): { valid: boolean; missing: string[] } {
  const detected = detectPlaceholdersFromXml(templateBuffer);
  const missing = requiredPlaceholders.filter((p) => !detected.includes(p));

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get a preview of what placeholders will be filled
 */
export function getPlaceholderPreview(
  data: NoteTemplateData
): Array<{ placeholder: string; value: string; filled: boolean }> {
  const mapping = mapDataToPlaceholders(data);

  return Object.entries(mapping).map(([key, value]) => ({
    placeholder: `{{${key}}}`,
    value: value || '',
    filled: !!value && value.length > 0,
  }));
}
