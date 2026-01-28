/**
 * Word Document Generator for PT Notes
 *
 * Generates clean, editable Microsoft Word (.docx) documents from rich text content.
 * The output is designed for clinical/medical documentation with:
 * - Professional formatting (Times New Roman, consistent margins)
 * - Section headers (bold, larger font)
 * - Bullet points and numbered lists
 * - Paragraph spacing
 * - No markdown artifacts or raw formatting codes
 *
 * Uses the 'docx' library for reliable cross-platform Word generation.
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertInchesToTwip,
  PageNumber,
  NumberFormat,
  Footer,
  Header,
  Packer,
  INumberingOptions,
  LevelFormat,
} from 'docx';
import { saveAs } from 'file-saver';
import {
  RichTextDocument,
  BlockNode,
  TextContent,
  HardBreak,
  ExportFormatSettings,
  DEFAULT_EXPORT_SETTINGS,
  RichNoteContent,
} from './rich-text/types';
import { Note, NOTE_TYPE_LABELS, BrandingSettings } from './types';
import { formatNoteTitle, formatSafePDFFilename } from './note-utils';
import { format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface WordGenerationOptions {
  note: Note;
  richContent: RichNoteContent;
  branding?: BrandingSettings | null;
  withBranding?: boolean;
}

interface TextRunOptions {
  bold?: boolean;
  italics?: boolean;
  underline?: { type: 'single' };
  size?: number; // in half-points (24 = 12pt)
  font?: string;
}

// ============================================================================
// Font Size Helpers
// ============================================================================

/**
 * Convert points to half-points (docx uses half-points)
 */
function ptToHalfPt(pt: number): number {
  return pt * 2;
}

/**
 * Convert inches to twips (1 inch = 1440 twips)
 */
function inchesToTwip(inches: number): number {
  return convertInchesToTwip(inches);
}

// ============================================================================
// Content Conversion
// ============================================================================

/**
 * Convert rich text marks to TextRun options
 */
function marksToTextRunOptions(
  marks: Array<{ type: string }> | undefined,
  baseSize: number,
  fontFamily: string
): TextRunOptions {
  const options: TextRunOptions = {
    size: ptToHalfPt(baseSize),
    font: fontFamily,
  };

  if (marks) {
    for (const mark of marks) {
      switch (mark.type) {
        case 'bold':
          options.bold = true;
          break;
        case 'italic':
          options.italics = true;
          break;
        case 'underline':
          options.underline = { type: 'single' };
          break;
      }
    }
  }

  return options;
}

/**
 * Convert inline content (text + marks) to TextRun array
 */
function contentToTextRuns(
  content: (TextContent | HardBreak)[] | undefined,
  settings: ExportFormatSettings
): TextRun[] {
  if (!content || content.length === 0) {
    return [];
  }

  const runs: TextRun[] = [];

  for (const node of content) {
    if (node.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }));
    } else if (node.type === 'text') {
      const options = marksToTextRunOptions(
        node.marks,
        settings.baseFontSize,
        settings.fontFamily
      );
      runs.push(new TextRun({ text: node.text, ...options }));
    }
  }

  return runs;
}

/**
 * Create a paragraph with proper spacing
 */
function createParagraph(
  runs: TextRun[],
  settings: ExportFormatSettings,
  options?: {
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    bullet?: boolean;
    numberedList?: { reference: string; level: number };
  }
): Paragraph {
  const spacing = {
    before: settings.paragraphSpacing.before * 20, // Convert pt to twips (approx)
    after: settings.paragraphSpacing.after * 20,
    line: Math.round(settings.paragraphSpacing.lineSpacing * 240), // 240 = single spacing
  };

  const paragraphOptions: {
    children: TextRun[];
    spacing: typeof spacing;
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    bullet?: { level: number };
    numbering?: { reference: string; level: number };
  } = {
    children: runs,
    spacing,
  };

  if (options?.heading) {
    paragraphOptions.heading = options.heading;
  }

  if (options?.bullet) {
    paragraphOptions.bullet = { level: 0 };
  }

  if (options?.numberedList) {
    paragraphOptions.numbering = options.numberedList;
  }

  return new Paragraph(paragraphOptions);
}

/**
 * Convert a heading node to a Paragraph
 */
function convertHeadingNode(
  node: { type: 'heading'; attrs: { level: number }; content?: (TextContent | HardBreak)[] },
  settings: ExportFormatSettings
): Paragraph {
  const headingSize = settings.headingFontSize;

  // Extract text content
  const textContent = node.content
    ?.filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('') || '';

  // Create bold heading text run
  const textRun = new TextRun({
    text: textContent,
    bold: true,
    size: ptToHalfPt(headingSize),
    font: settings.fontFamily,
  });

  // Map heading levels: 2 -> Heading 1, 3 -> Heading 2 in Word
  const headingLevel =
    node.attrs.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;

  return createParagraph([textRun], settings, { heading: headingLevel });
}

/**
 * Convert a paragraph node to a Paragraph
 */
function convertParagraphNode(
  node: { type: 'paragraph'; content?: (TextContent | HardBreak)[] },
  settings: ExportFormatSettings
): Paragraph {
  const runs = contentToTextRuns(node.content, settings);

  // Empty paragraph for spacing
  if (runs.length === 0) {
    return new Paragraph({
      spacing: {
        before: settings.paragraphSpacing.before * 20,
        after: settings.paragraphSpacing.after * 20,
      },
    });
  }

  return createParagraph(runs, settings);
}

/**
 * Convert a bullet list to Paragraphs
 */
function convertBulletListNode(
  node: { type: 'bulletList'; content: Array<{ type: 'listItem'; content: Array<{ type: 'paragraph'; content?: (TextContent | HardBreak)[] }> }> },
  settings: ExportFormatSettings
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const listItem of node.content) {
    for (let i = 0; i < listItem.content.length; i++) {
      const itemPara = listItem.content[i];
      const runs = contentToTextRuns(itemPara.content, settings);

      // First paragraph in list item gets the bullet
      if (i === 0) {
        paragraphs.push(createParagraph(runs, settings, { bullet: true }));
      } else {
        // Continuation paragraphs (indented but no bullet)
        paragraphs.push(createParagraph(runs, settings));
      }
    }
  }

  return paragraphs;
}

/**
 * Convert an ordered list to Paragraphs
 */
function convertOrderedListNode(
  node: { type: 'orderedList'; attrs?: { start?: number }; content: Array<{ type: 'listItem'; content: Array<{ type: 'paragraph'; content?: (TextContent | HardBreak)[] }> }> },
  settings: ExportFormatSettings,
  numberingRef: string
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (let itemIndex = 0; itemIndex < node.content.length; itemIndex++) {
    const listItem = node.content[itemIndex];

    for (let i = 0; i < listItem.content.length; i++) {
      const itemPara = listItem.content[i];
      const runs = contentToTextRuns(itemPara.content, settings);

      // First paragraph in list item gets the number
      if (i === 0) {
        paragraphs.push(
          createParagraph(runs, settings, {
            numberedList: { reference: numberingRef, level: 0 },
          })
        );
      } else {
        paragraphs.push(createParagraph(runs, settings));
      }
    }
  }

  return paragraphs;
}

/**
 * Convert a RichTextDocument to an array of Word Paragraphs
 */
function convertRichDocumentToParagraphs(
  doc: RichTextDocument,
  settings: ExportFormatSettings,
  numberingRef: string
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const block of doc.content) {
    switch (block.type) {
      case 'heading':
        paragraphs.push(convertHeadingNode(block, settings));
        break;
      case 'paragraph':
        paragraphs.push(convertParagraphNode(block, settings));
        break;
      case 'bulletList':
        paragraphs.push(...convertBulletListNode(block, settings));
        break;
      case 'orderedList':
        paragraphs.push(...convertOrderedListNode(block, settings, numberingRef));
        break;
    }
  }

  return paragraphs;
}

// ============================================================================
// Document Assembly
// ============================================================================

/**
 * Create branding header paragraphs
 */
function createBrandingParagraphs(
  branding: BrandingSettings,
  settings: ExportFormatSettings
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Clinic name (centered, bold, larger)
  if (branding.clinic_name) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: branding.clinic_name,
            bold: true,
            size: ptToHalfPt(16),
            font: settings.fontFamily,
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // Address
  if (branding.address) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: branding.address,
            size: ptToHalfPt(10),
            font: settings.fontFamily,
          }),
        ],
        spacing: { after: 50 },
      })
    );
  }

  // Contact info line
  const contactParts: string[] = [];
  if (branding.phone) contactParts.push(`Phone: ${branding.phone}`);
  if (branding.email) contactParts.push(`Email: ${branding.email}`);
  if (branding.website) contactParts.push(`Web: ${branding.website}`);

  if (contactParts.length > 0) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: contactParts.join(' | '),
            size: ptToHalfPt(10),
            font: settings.fontFamily,
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Separator line
  paragraphs.push(
    new Paragraph({
      border: {
        bottom: { color: '1E293B', size: 1, style: 'single' },
      },
      spacing: { after: 300 },
    })
  );

  return paragraphs;
}

/**
 * Create draft warning paragraph
 */
function createDraftWarning(settings: ExportFormatSettings): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: 'FEF3C7' }, // Light yellow
    children: [
      new TextRun({
        text: 'DRAFT DOCUMENTATION - This note must be reviewed and approved by a licensed clinician before use.',
        bold: true,
        size: ptToHalfPt(9),
        font: settings.fontFamily,
        color: 'B45309', // Amber/orange
      }),
    ],
    spacing: { before: 100, after: 300 },
  });
}

/**
 * Create document title paragraph
 */
function createTitleParagraph(
  note: Note,
  settings: ExportFormatSettings
): Paragraph {
  const titleText = NOTE_TYPE_LABELS[note.note_type];

  return new Paragraph({
    children: [
      new TextRun({
        text: titleText,
        bold: true,
        size: ptToHalfPt(18),
        font: settings.fontFamily,
      }),
    ],
    spacing: { after: 200 },
  });
}

/**
 * Create metadata paragraphs (date of service, created date)
 */
function createMetadataParagraphs(
  note: Note,
  settings: ExportFormatSettings
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  const dateOfService = note.date_of_service || note.input_data?.dateOfService;
  if (dateOfService) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Date of Service: ${format(new Date(dateOfService), 'MMMM d, yyyy')}`,
            size: ptToHalfPt(10),
            font: settings.fontFamily,
            color: '64748B', // Slate gray
          }),
        ],
        spacing: { after: 50 },
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${format(new Date(note.created_at), 'MMMM d, yyyy h:mm a')}`,
          size: ptToHalfPt(10),
          font: settings.fontFamily,
          color: '64748B',
        }),
      ],
      spacing: { after: 300 },
    })
  );

  return paragraphs;
}

/**
 * Create patient demographic paragraphs
 */
function createDemographicParagraphs(
  note: Note,
  settings: ExportFormatSettings
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const demographic = note.input_data?.patientDemographic;

  if (!demographic) return paragraphs;

  // Section header
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'PATIENT DEMOGRAPHIC',
          bold: true,
          size: ptToHalfPt(14),
          font: settings.fontFamily,
        }),
      ],
      spacing: { before: 200, after: 150 },
    })
  );

  // Demographic fields
  const fields: Array<{ label: string; value: string | undefined }> = [
    { label: 'Name', value: demographic.patientName },
    { label: 'DOB', value: demographic.dateOfBirth },
    { label: 'Diagnosis', value: demographic.diagnosis },
    { label: 'Referral Source', value: demographic.referralSource },
  ];

  for (const field of fields) {
    if (field.value) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${field.label}: `,
              bold: true,
              size: ptToHalfPt(settings.baseFontSize),
              font: settings.fontFamily,
            }),
            new TextRun({
              text: field.value,
              size: ptToHalfPt(settings.baseFontSize),
              font: settings.fontFamily,
            }),
          ],
          spacing: { after: 50 },
        })
      );
    }
  }

  // Separator
  paragraphs.push(
    new Paragraph({
      border: {
        bottom: { color: 'E2E8F0', size: 1, style: 'single' },
      },
      spacing: { before: 150, after: 200 },
    })
  );

  return paragraphs;
}

/**
 * Create a section with header (e.g., Billing Justification, HEP Summary)
 */
function createSectionParagraphs(
  title: string,
  content: RichTextDocument | undefined,
  settings: ExportFormatSettings,
  numberingRef: string
): Paragraph[] {
  if (!content) return [];

  const paragraphs: Paragraph[] = [];

  // Separator
  paragraphs.push(
    new Paragraph({
      border: {
        bottom: { color: 'E2E8F0', size: 1, style: 'single' },
      },
      spacing: { before: 200, after: 150 },
    })
  );

  // Section header
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: ptToHalfPt(14),
          font: settings.fontFamily,
        }),
      ],
      spacing: { after: 150 },
    })
  );

  // Section content
  paragraphs.push(...convertRichDocumentToParagraphs(content, settings, numberingRef));

  return paragraphs;
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Generate a Word document from a note with rich content
 */
export async function generateNoteWord({
  note,
  richContent,
  branding,
  withBranding = false,
}: WordGenerationOptions): Promise<void> {
  const settings = richContent.formatSettings || DEFAULT_EXPORT_SETTINGS;

  // Define numbering for ordered lists
  const numbering: INumberingOptions = {
    config: [
      {
        reference: 'ordered-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: { left: inchesToTwip(0.5), hanging: inchesToTwip(0.25) },
              },
            },
          },
        ],
      },
    ],
  };

  // Build document sections
  const children: Paragraph[] = [];

  // Branding header
  if (withBranding && branding && (branding.clinic_name || branding.logo_url || branding.letterhead_url)) {
    children.push(...createBrandingParagraphs(branding, settings));
  }

  // Draft warning
  children.push(createDraftWarning(settings));

  // Title
  children.push(createTitleParagraph(note, settings));

  // Metadata
  children.push(...createMetadataParagraphs(note, settings));

  // Patient demographic
  children.push(...createDemographicParagraphs(note, settings));

  // Main note content
  children.push(
    ...convertRichDocumentToParagraphs(richContent.document, settings, 'ordered-list')
  );

  // Billing justification
  if (richContent.billingJustification) {
    children.push(
      ...createSectionParagraphs(
        'BILLING/SKILLED JUSTIFICATION',
        richContent.billingJustification,
        settings,
        'ordered-list'
      )
    );
  }

  // HEP Summary
  if (richContent.hepSummary) {
    children.push(
      ...createSectionParagraphs('HEP SUMMARY', richContent.hepSummary, settings, 'ordered-list')
    );
  }

  // Create the document
  const doc = new Document({
    numbering,
    styles: {
      default: {
        document: {
          run: {
            font: settings.fontFamily,
            size: ptToHalfPt(settings.baseFontSize),
          },
        },
        heading1: {
          run: {
            font: settings.fontFamily,
            size: ptToHalfPt(settings.headingFontSize),
            bold: true,
          },
          paragraph: {
            spacing: { before: 300, after: 150 },
          },
        },
        heading2: {
          run: {
            font: settings.fontFamily,
            size: ptToHalfPt(settings.headingFontSize - 2),
            bold: true,
          },
          paragraph: {
            spacing: { before: 200, after: 100 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: inchesToTwip(settings.pageMargins.top),
              right: inchesToTwip(settings.pageMargins.right),
              bottom: inchesToTwip(settings.pageMargins.bottom),
              left: inchesToTwip(settings.pageMargins.left),
            },
          },
        },
        headers: settings.includeDateInHeader
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: format(new Date(), 'MM/dd/yyyy'),
                        size: ptToHalfPt(9),
                        font: settings.fontFamily,
                        color: '94A3B8',
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers: settings.includePageNumbers
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                        size: ptToHalfPt(9),
                        font: settings.fontFamily,
                        color: '94A3B8',
                      }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  });

  // Generate and download the file
  const blob = await Packer.toBlob(doc);

  // Create filename
  const patientName = note.input_data?.patientDemographic?.patientName;
  const dateOfService = note.date_of_service || note.input_data?.dateOfService;
  const filename = formatSafePDFFilename(patientName, note.note_type, dateOfService, note.created_at)
    .replace('.pdf', '.docx');

  saveAs(blob, filename);
}

/**
 * Generate a Word document blob without downloading (for API use)
 */
export async function generateNoteWordBlob({
  note,
  richContent,
  branding,
  withBranding = false,
}: WordGenerationOptions): Promise<Blob> {
  // Same as above but returns the blob instead of downloading
  const settings = richContent.formatSettings || DEFAULT_EXPORT_SETTINGS;

  const numbering: INumberingOptions = {
    config: [
      {
        reference: 'ordered-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: { left: inchesToTwip(0.5), hanging: inchesToTwip(0.25) },
              },
            },
          },
        ],
      },
    ],
  };

  const children: Paragraph[] = [];

  if (withBranding && branding) {
    children.push(...createBrandingParagraphs(branding, settings));
  }

  children.push(createDraftWarning(settings));
  children.push(createTitleParagraph(note, settings));
  children.push(...createMetadataParagraphs(note, settings));
  children.push(...createDemographicParagraphs(note, settings));
  children.push(
    ...convertRichDocumentToParagraphs(richContent.document, settings, 'ordered-list')
  );

  if (richContent.billingJustification) {
    children.push(
      ...createSectionParagraphs(
        'BILLING/SKILLED JUSTIFICATION',
        richContent.billingJustification,
        settings,
        'ordered-list'
      )
    );
  }

  if (richContent.hepSummary) {
    children.push(
      ...createSectionParagraphs('HEP SUMMARY', richContent.hepSummary, settings, 'ordered-list')
    );
  }

  const doc = new Document({
    numbering,
    styles: {
      default: {
        document: {
          run: {
            font: settings.fontFamily,
            size: ptToHalfPt(settings.baseFontSize),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: inchesToTwip(settings.pageMargins.top),
              right: inchesToTwip(settings.pageMargins.right),
              bottom: inchesToTwip(settings.pageMargins.bottom),
              left: inchesToTwip(settings.pageMargins.left),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
