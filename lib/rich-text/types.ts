/**
 * Rich Text Content Model for PT Notes
 *
 * This module defines the structured content model used to store formatted clinical notes.
 * The format is compatible with TipTap/ProseMirror and allows for clean conversion to:
 * - Microsoft Word (.docx)
 * - PDF
 * - HTML
 * - Plain text
 *
 * Design decisions:
 * 1. JSON-based storage (not HTML/Markdown) for precise formatting control
 * 2. Section-aware structure for clinical documentation requirements
 * 3. Style metadata stored separately for export customization
 */

// ============================================================================
// TipTap/ProseMirror Compatible Content Model
// ============================================================================

/**
 * Text marks define inline formatting (bold, italic, underline)
 */
export interface TextMark {
  type: 'bold' | 'italic' | 'underline';
}

/**
 * Text content with optional formatting marks
 */
export interface TextContent {
  type: 'text';
  text: string;
  marks?: TextMark[];
}

/**
 * Hard break (line break within a paragraph)
 */
export interface HardBreak {
  type: 'hardBreak';
}

/**
 * Paragraph node containing text content
 */
export interface ParagraphNode {
  type: 'paragraph';
  content?: (TextContent | HardBreak)[];
}

/**
 * Heading node with level (1-6)
 */
export interface HeadingNode {
  type: 'heading';
  attrs: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
  };
  content?: (TextContent | HardBreak)[];
}

/**
 * List item containing paragraphs
 */
export interface ListItemNode {
  type: 'listItem';
  content: ParagraphNode[];
}

/**
 * Bullet list containing list items
 */
export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

/**
 * Ordered list containing list items
 */
export interface OrderedListNode {
  type: 'orderedList';
  attrs?: {
    start?: number;
  };
  content: ListItemNode[];
}

/**
 * Union type for all block-level nodes
 */
export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode;

/**
 * Root document structure (TipTap compatible)
 */
export interface RichTextDocument {
  type: 'doc';
  content: BlockNode[];
}

// ============================================================================
// Clinical Note Sections
// ============================================================================

/**
 * Clinical section identifier for PT documentation
 */
export type ClinicalSection =
  | 'patient_demographic'
  | 'subjective'
  | 'objective'
  | 'assessment'
  | 'plan'
  | 'billing_justification'
  | 'hep_summary'
  | 'other';

/**
 * Section metadata for clinical documentation
 */
export interface SectionMetadata {
  section: ClinicalSection;
  title: string;
  required: boolean;
}

/**
 * A clinical section with its content
 */
export interface ClinicalSectionContent {
  id: string;
  section: ClinicalSection;
  title: string;
  content: RichTextDocument;
}

// ============================================================================
// Export Formatting Settings
// ============================================================================

/**
 * Font family options for export
 */
export type FontFamily =
  | 'Times New Roman'
  | 'Arial'
  | 'Calibri'
  | 'Georgia'
  | 'Helvetica';

/**
 * Page margin settings in inches
 */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Paragraph spacing settings in points
 */
export interface ParagraphSpacing {
  before: number;
  after: number;
  lineSpacing: number; // Multiplier (1.0, 1.15, 1.5, 2.0)
}

/**
 * Export formatting settings
 */
export interface ExportFormatSettings {
  fontFamily: FontFamily;
  baseFontSize: number; // in points (pt)
  headingFontSize: number; // for section headers
  pageMargins: PageMargins;
  paragraphSpacing: ParagraphSpacing;
  includePageNumbers: boolean;
  includeDateInHeader: boolean;
}

/**
 * Default export settings for clinical documentation
 */
export const DEFAULT_EXPORT_SETTINGS: ExportFormatSettings = {
  fontFamily: 'Times New Roman',
  baseFontSize: 12,
  headingFontSize: 14,
  pageMargins: {
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
  },
  paragraphSpacing: {
    before: 0,
    after: 6,
    lineSpacing: 1.15,
  },
  includePageNumbers: true,
  includeDateInHeader: true,
};

// ============================================================================
// Rich Note Content (Complete Note Structure)
// ============================================================================

/**
 * Complete rich text note content including all sections and metadata
 */
export interface RichNoteContent {
  /** Unique version identifier for content updates */
  version: string;

  /** When the content was last modified */
  lastModified: string;

  /** The main note content as a TipTap document */
  document: RichTextDocument;

  /** Optional section breakdown for structured editing */
  sections?: ClinicalSectionContent[];

  /** Export formatting preferences */
  formatSettings: ExportFormatSettings;

  /** Billing justification as structured content */
  billingJustification?: RichTextDocument;

  /** HEP summary as structured content */
  hepSummary?: RichTextDocument;
}

// ============================================================================
// Helper Types for Editor State
// ============================================================================

/**
 * Editor state for tracking unsaved changes
 */
export interface EditorState {
  isDirty: boolean;
  lastSaved: string | null;
  currentContent: RichTextDocument;
}

/**
 * Editor toolbar state
 */
export interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  heading: number | null; // null = paragraph, 1-6 = heading level
  bulletList: boolean;
  orderedList: boolean;
}

// ============================================================================
// Conversion Helper Types
// ============================================================================

/**
 * Plain text with section markers for AI output parsing
 */
export interface ParsedAISection {
  sectionType: ClinicalSection;
  title: string;
  rawText: string;
  bulletItems?: string[];
}

/**
 * Result of parsing AI-generated plain text
 */
export interface ParsedAIOutput {
  sections: ParsedAISection[];
  rawText: string;
}
