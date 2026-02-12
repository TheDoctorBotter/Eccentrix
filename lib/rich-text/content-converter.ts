/**
 * Content Converter for PT Notes
 *
 * Converts between different content formats:
 * - AI plain text output → Rich Text Document
 * - Rich Text Document → Plain text
 * - Rich Text Document → HTML
 *
 * Design decisions:
 * 1. Parse section headers (SUBJECTIVE:, OBJECTIVE:, etc.) as headings
 * 2. Detect bullet points (- or •) and convert to bullet lists
 * 3. Preserve paragraph structure
 * 4. Strip markdown artifacts if present
 */

import {
  RichTextDocument,
  BlockNode,
  ParagraphNode,
  HeadingNode,
  BulletListNode,
  ListItemNode,
  TextContent,
  TextMark,
  HardBreak,
  ClinicalSection,
  ParsedAISection,
  ParsedAIOutput,
  RichNoteContent,
  DEFAULT_EXPORT_SETTINGS,
} from './types';

// ============================================================================
// Section Detection
// ============================================================================

/**
 * Known clinical section headers and their variants
 */
const SECTION_PATTERNS: Array<{
  pattern: RegExp;
  section: ClinicalSection;
  title: string;
}> = [
  { pattern: /^(PATIENT\s*DEMOGRAPHIC|DEMOGRAPHICS?)[:\s]*$/i, section: 'patient_demographic', title: 'PATIENT DEMOGRAPHIC' },
  { pattern: /^SUBJECTIVE[:\s]*$/i, section: 'subjective', title: 'SUBJECTIVE' },
  { pattern: /^OBJECTIVE[:\s]*$/i, section: 'objective', title: 'OBJECTIVE' },
  { pattern: /^ASSESSMENT[:\s]*$/i, section: 'assessment', title: 'ASSESSMENT' },
  { pattern: /^PLAN[:\s]*$/i, section: 'plan', title: 'PLAN' },
  { pattern: /^(BILLING|SKILLED)\s*(JUSTIFICATION)?[:\s]*$/i, section: 'billing_justification', title: 'BILLING JUSTIFICATION' },
  { pattern: /^(HEP|HOME\s*EXERCISE\s*PROGRAM)\s*(SUMMARY)?[:\s]*$/i, section: 'hep_summary', title: 'HEP SUMMARY' },
  { pattern: /^INTERVENTIONS?\s*(PERFORMED)?[:\s]*$/i, section: 'objective', title: 'INTERVENTIONS PERFORMED' },
];

/**
 * Detect if a line is a section header (header on its own line, no content after)
 */
function detectSectionHeader(line: string): { section: ClinicalSection; title: string } | null {
  const trimmed = line.trim();
  for (const { pattern, section, title } of SECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { section, title };
    }
  }
  return null;
}

/**
 * Inline header patterns: matches "SUBJECTIVE: content..." on the same line.
 * Returns the header title and any remaining content after the colon.
 */
const INLINE_HEADER_PATTERNS: Array<{
  pattern: RegExp;
  section: ClinicalSection;
  title: string;
}> = [
  { pattern: /^(PATIENT\s*DEMOGRAPHIC|DEMOGRAPHICS?)\s*:\s*(.+)/i, section: 'patient_demographic', title: 'PATIENT DEMOGRAPHIC' },
  { pattern: /^SUBJECTIVE\s*:\s*(.+)/i, section: 'subjective', title: 'SUBJECTIVE' },
  { pattern: /^OBJECTIVE\s*:\s*(.+)/i, section: 'objective', title: 'OBJECTIVE' },
  { pattern: /^ASSESSMENT\s*:\s*(.+)/i, section: 'assessment', title: 'ASSESSMENT' },
  { pattern: /^PLAN\s*:\s*(.+)/i, section: 'plan', title: 'PLAN' },
];

/**
 * Detect if a line starts with a section header but also has content after the colon
 * e.g. "SUBJECTIVE: Patient reports pain in lower back"
 */
function detectInlineSectionHeader(line: string): { section: ClinicalSection; title: string; content: string } | null {
  const trimmed = line.trim();
  for (const { pattern, section, title } of INLINE_HEADER_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      // The last capture group is always the content after the colon
      const content = match[match.length - 1].trim();
      if (content) {
        return { section, title, content };
      }
    }
  }
  return null;
}

/**
 * Detect if a line is a bullet point
 */
function isBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[-•*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);
}

/**
 * Extract bullet content from a bullet line
 */
function extractBulletContent(line: string): string {
  return line.trim().replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, '');
}

// ============================================================================
// Text Parsing
// ============================================================================

/**
 * Parse inline formatting from text (basic markdown-like patterns)
 * Strips markdown and returns clean text with marks
 */
function parseInlineFormatting(text: string): TextContent[] {
  const result: TextContent[] = [];

  // Simplified: for clinical notes, we generally want clean text
  // We'll detect patterns like **bold** or *italic* and convert them
  let remaining = text;

  // Pattern for bold (**text** or __text__)
  const boldPattern = /\*\*(.+?)\*\*|__(.+?)__/g;
  // Pattern for italic (*text* or _text_)
  const italicPattern = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g;

  // For production medical notes, we strip markdown and keep plain text
  // Clinical documents should not have markdown artifacts
  const cleanText = remaining
    .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold markers
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1') // Remove italic markers
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1')
    .replace(/`(.+?)`/g, '$1') // Remove code markers
    .replace(/~~(.+?)~~/g, '$1'); // Remove strikethrough

  if (cleanText.length > 0) {
    result.push({
      type: 'text',
      text: cleanText,
    });
  }

  return result;
}

/**
 * Create a text content node
 */
function createTextContent(text: string, marks?: TextMark[]): TextContent {
  const node: TextContent = { type: 'text', text };
  if (marks && marks.length > 0) {
    node.marks = marks;
  }
  return node;
}

/**
 * Create a paragraph node from text
 */
function createParagraph(text: string): ParagraphNode {
  if (!text || text.trim().length === 0) {
    return { type: 'paragraph' };
  }
  return {
    type: 'paragraph',
    content: parseInlineFormatting(text),
  };
}

/**
 * Create a heading node
 */
function createHeading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 2): HeadingNode {
  return {
    type: 'heading',
    attrs: { level },
    content: text ? [createTextContent(text)] : undefined,
  };
}

/**
 * Create a bullet list from items
 */
function createBulletList(items: string[]): BulletListNode {
  return {
    type: 'bulletList',
    content: items.map((item): ListItemNode => ({
      type: 'listItem',
      content: [createParagraph(item)],
    })),
  };
}

// ============================================================================
// Main Conversion Functions
// ============================================================================

/**
 * Ensure plain text contains all four SOAP section headers before conversion.
 * If headers are missing, attempt to find them with flexible patterns and
 * normalize, or inject them as a last resort.
 */
function ensureSoapHeadersInText(text: string): string {
  const requiredHeaders = ['SUBJECTIVE', 'OBJECTIVE', 'ASSESSMENT', 'PLAN'];

  // Only skip normalization if ALL headers are on their OWN lines
  // (matching what detectSectionHeader expects: header alone on the line)
  const hasAllOnOwnLines = requiredHeaders.every((h) =>
    new RegExp(`^${h}[:\\s]*$`, 'im').test(text)
  );

  if (hasAllOnOwnLines) {
    return text;
  }

  // Try to split the text into sections using flexible header detection
  const headerPattern = /^(?:\*{0,2})(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN(?:\s+OF\s+CARE)?)(?:\*{0,2})\s*:/gim;
  const matches: { header: string; index: number }[] = [];
  let match;
  while ((match = headerPattern.exec(text)) !== null) {
    matches.push({ header: match[1].toUpperCase(), index: match.index });
  }

  if (matches.some((m) => m.header === 'SUBJECTIVE')) {
    // Found at least some headers — extract sections and reassemble with uppercase headers
    const preamble = text.slice(0, matches[0].index).trim();
    const sections: string[] = [];
    if (preamble) sections.push(preamble);

    const sectionMap: Record<string, string> = {};
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const sectionText = text.slice(start, end).replace(/^.*?:\s*\n?/, '').trim();
      const key = matches[i].header.startsWith('PLAN') ? 'PLAN' : matches[i].header;
      sectionMap[key] = sectionText;
    }

    for (const h of requiredHeaders) {
      sections.push(`${h}:\n${sectionMap[h] || 'Not provided.'}`);
    }

    return sections.join('\n\n');
  }

  // No headers found at all — inject default headers before the entire content
  const sections = [
    `SUBJECTIVE:\n${text.trim()}`,
    'OBJECTIVE:\nNot assessed today.',
    'ASSESSMENT:\nNot assessed today.',
    'PLAN:\nNot assessed today.',
  ];
  return sections.join('\n\n');
}

/**
 * Convert plain text AI output to a TipTap-compatible RichTextDocument
 */
export function plainTextToRichDocument(plainText: string): RichTextDocument {
  // Ensure SOAP headers are present before converting
  const normalizedText = ensureSoapHeadersInText(plainText);
  const lines = normalizedText.split('\n');
  const content: BlockNode[] = [];
  let currentBulletItems: string[] = [];

  const flushBulletList = () => {
    if (currentBulletItems.length > 0) {
      content.push(createBulletList(currentBulletItems));
      currentBulletItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines (but flush any pending bullets)
    if (trimmedLine.length === 0) {
      flushBulletList();
      // Add empty paragraph for spacing
      content.push({ type: 'paragraph' });
      continue;
    }

    // Check for section header (header on its own line, e.g. "SUBJECTIVE:")
    const sectionHeader = detectSectionHeader(trimmedLine);
    if (sectionHeader) {
      flushBulletList();
      content.push(createHeading(sectionHeader.title, 2));
      continue;
    }

    // Check for inline section header (e.g. "SUBJECTIVE: Patient reports...")
    const inlineHeader = detectInlineSectionHeader(trimmedLine);
    if (inlineHeader) {
      flushBulletList();
      content.push(createHeading(inlineHeader.title, 2));
      content.push(createParagraph(inlineHeader.content));
      continue;
    }

    // Check for sub-section header (ends with colon, not too long)
    if (trimmedLine.endsWith(':') && trimmedLine.length < 60 && !isBulletLine(trimmedLine)) {
      flushBulletList();
      // This is a sub-header like "Pain Level:" or "Interventions Performed:"
      content.push(createHeading(trimmedLine, 3));
      continue;
    }

    // Check for bullet point
    if (isBulletLine(trimmedLine)) {
      currentBulletItems.push(extractBulletContent(trimmedLine));
      continue;
    }

    // Regular paragraph
    flushBulletList();
    content.push(createParagraph(trimmedLine));
  }

  // Flush any remaining bullets
  flushBulletList();

  // Remove trailing empty paragraphs
  while (
    content.length > 0 &&
    content[content.length - 1].type === 'paragraph' &&
    !('content' in content[content.length - 1])
  ) {
    content.pop();
  }

  // POST-CONVERSION VALIDATION: Guarantee SOAP heading nodes exist
  const soapHeaders = ['SUBJECTIVE', 'OBJECTIVE', 'ASSESSMENT', 'PLAN'];
  const existingHeadings = new Set(
    content
      .filter((n): n is HeadingNode => n.type === 'heading')
      .map((h) => {
        const text = h.content?.[0];
        return text && text.type === 'text' ? text.text.toUpperCase().trim() : '';
      })
  );

  const missingSoap = soapHeaders.filter((h) => !existingHeadings.has(h));
  if (missingSoap.length > 0) {
    // SOAP headings are missing from the document — inject them at the top
    // This is the absolute last resort safety net
    console.warn('[content-converter] Missing SOAP headings after conversion:', missingSoap, '— injecting them');
    const injected: BlockNode[] = [];
    if (missingSoap.length === soapHeaders.length) {
      // None found at all — wrap all existing content under SUBJECTIVE
      injected.push(createHeading('SUBJECTIVE', 2));
      injected.push(...content);
      injected.push({ type: 'paragraph' });
      injected.push(createHeading('OBJECTIVE', 2));
      injected.push(createParagraph('Not assessed today.'));
      injected.push({ type: 'paragraph' });
      injected.push(createHeading('ASSESSMENT', 2));
      injected.push(createParagraph('Not assessed today.'));
      injected.push({ type: 'paragraph' });
      injected.push(createHeading('PLAN', 2));
      injected.push(createParagraph('Not assessed today.'));
      content.length = 0;
      content.push(...injected);
    } else {
      // Some headings found, some missing — append missing ones at end
      for (const h of missingSoap) {
        content.push({ type: 'paragraph' });
        content.push(createHeading(h, 2));
        content.push(createParagraph('Not assessed today.'));
      }
    }
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

/**
 * Convert a RichTextDocument back to plain text
 */
export function richDocumentToPlainText(doc: RichTextDocument): string {
  const lines: string[] = [];

  const extractText = (content: (TextContent | HardBreak)[] | undefined): string => {
    if (!content) return '';
    return content
      .map((node) => {
        if (node.type === 'text') return node.text;
        if (node.type === 'hardBreak') return '\n';
        return '';
      })
      .join('');
  };

  for (const block of doc.content) {
    switch (block.type) {
      case 'paragraph':
        lines.push(extractText(block.content));
        break;
      case 'heading':
        lines.push(extractText(block.content));
        lines.push(''); // Add blank line after heading
        break;
      case 'bulletList':
        for (const item of block.content) {
          const itemText = item.content
            .map((p) => extractText(p.content))
            .join('\n');
          lines.push(`- ${itemText}`);
        }
        lines.push(''); // Add blank line after list
        break;
      case 'orderedList':
        block.content.forEach((item, index) => {
          const itemText = item.content
            .map((p) => extractText(p.content))
            .join('\n');
          lines.push(`${index + 1}. ${itemText}`);
        });
        lines.push('');
        break;
    }
  }

  return lines.join('\n').trim();
}

/**
 * Convert a RichTextDocument to HTML for display/preview
 */
export function richDocumentToHTML(doc: RichTextDocument): string {
  const renderContent = (content: (TextContent | HardBreak)[] | undefined): string => {
    if (!content) return '';
    return content
      .map((node) => {
        if (node.type === 'hardBreak') return '<br />';
        if (node.type === 'text') {
          let text = escapeHTML(node.text);
          if (node.marks) {
            for (const mark of node.marks) {
              switch (mark.type) {
                case 'bold':
                  text = `<strong>${text}</strong>`;
                  break;
                case 'italic':
                  text = `<em>${text}</em>`;
                  break;
                case 'underline':
                  text = `<u>${text}</u>`;
                  break;
              }
            }
          }
          return text;
        }
        return '';
      })
      .join('');
  };

  const renderBlock = (block: BlockNode): string => {
    switch (block.type) {
      case 'paragraph':
        const pContent = renderContent(block.content);
        return pContent ? `<p>${pContent}</p>` : '<p>&nbsp;</p>';
      case 'heading':
        const level = block.attrs.level;
        return `<h${level}>${renderContent(block.content)}</h${level}>`;
      case 'bulletList':
        const ulItems = block.content
          .map((item) => {
            const itemContent = item.content
              .map((p) => renderContent(p.content))
              .join('<br />');
            return `<li>${itemContent}</li>`;
          })
          .join('');
        return `<ul>${ulItems}</ul>`;
      case 'orderedList':
        const olItems = block.content
          .map((item) => {
            const itemContent = item.content
              .map((p) => renderContent(p.content))
              .join('<br />');
            return `<li>${itemContent}</li>`;
          })
          .join('');
        const start = block.attrs?.start;
        return start ? `<ol start="${start}">${olItems}</ol>` : `<ol>${olItems}</ol>`;
    }
  };

  return doc.content.map(renderBlock).join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Complete Note Conversion
// ============================================================================

/**
 * Create a RichNoteContent from AI-generated plain text output
 */
export function createRichNoteContent(
  plainTextNote: string,
  billingJustification?: string,
  hepSummary?: string
): RichNoteContent {
  return {
    version: generateVersion(),
    lastModified: new Date().toISOString(),
    document: plainTextToRichDocument(plainTextNote),
    formatSettings: { ...DEFAULT_EXPORT_SETTINGS },
    billingJustification: billingJustification
      ? plainTextToRichDocument(billingJustification)
      : undefined,
    hepSummary: hepSummary
      ? plainTextToRichDocument(hepSummary)
      : undefined,
  };
}

/**
 * Generate a version identifier
 */
function generateVersion(): string {
  return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Update RichNoteContent with new document content
 */
export function updateRichNoteContent(
  current: RichNoteContent,
  newDocument: RichTextDocument
): RichNoteContent {
  return {
    ...current,
    version: generateVersion(),
    lastModified: new Date().toISOString(),
    document: newDocument,
  };
}

/**
 * Check if content has been modified
 */
export function isContentModified(
  original: RichTextDocument,
  current: RichTextDocument
): boolean {
  return JSON.stringify(original) !== JSON.stringify(current);
}

// ============================================================================
// Legacy Conversion (for existing plain text notes)
// ============================================================================

/**
 * Check if a string is a JSON RichTextDocument
 */
export function isRichTextDocument(content: string | RichNoteContent | null): content is RichNoteContent {
  if (!content) return false;
  if (typeof content === 'object' && 'document' in content && 'version' in content) {
    return true;
  }
  return false;
}

/**
 * Parse content that may be plain text or RichNoteContent
 */
export function parseNoteContent(
  content: string | RichNoteContent | null
): RichNoteContent | null {
  if (!content) return null;

  // Already a RichNoteContent object
  if (isRichTextDocument(content)) {
    return content;
  }

  // Try parsing as JSON
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed.document && parsed.version) {
        return parsed as RichNoteContent;
      }
    } catch {
      // Not JSON, treat as plain text
    }

    // Convert plain text to rich content
    return createRichNoteContent(content);
  }

  return null;
}

/**
 * Serialize RichNoteContent to JSON string for storage
 */
export function serializeRichContent(content: RichNoteContent): string {
  return JSON.stringify(content);
}
