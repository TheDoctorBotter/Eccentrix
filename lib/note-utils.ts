import { NoteType, NOTE_TYPE_LABELS } from './types';
import { format } from 'date-fns';

export const NOTE_TYPE_SHORT_LABELS: Record<NoteType, string> = {
  daily_soap: 'DAILY NOTE',
  pt_evaluation: 'EVAL',
};

export function parsePatientName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: '', lastName: '' };
  }

  const trimmed = fullName.trim();

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    return {
      lastName: parts[0] || '',
      firstName: parts[1] || '',
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: '', lastName: parts[0] };
  }

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

export function formatNoteTitle(
  patientName: string | undefined,
  noteType: NoteType,
  dateOfService?: string | null,
  createdAt?: string
): string {
  let patientPart = 'UNKNOWN PATIENT';

  if (patientName) {
    const { firstName, lastName } = parsePatientName(patientName);
    if (lastName) {
      patientPart = lastName.toUpperCase();
      if (firstName) {
        patientPart += `, ${firstName.toUpperCase()}`;
      }
    } else if (firstName) {
      patientPart = firstName.toUpperCase();
    }
  }

  const noteTypeLabel = NOTE_TYPE_SHORT_LABELS[noteType] || noteType.toUpperCase();

  let datePart = '';
  if (dateOfService) {
    try {
      const date = new Date(dateOfService);
      datePart = format(date, 'yyyy-MM-dd');
    } catch {
      datePart = dateOfService;
    }
  } else if (createdAt) {
    try {
      const date = new Date(createdAt);
      datePart = format(date, 'yyyy-MM-dd');
    } catch {
      datePart = '';
    }
  }

  if (datePart) {
    return `${patientPart} - ${noteTypeLabel} - ${datePart}`;
  }

  return `${patientPart} - ${noteTypeLabel}`;
}

/**
 * Ensure SOAP headers (SUBJECTIVE, OBJECTIVE, ASSESSMENT, PLAN) are always
 * present in the note text. If missing, inject them.
 */
export function ensureSoapHeaders(note: string): string {
  const requiredHeaders = ['SUBJECTIVE', 'OBJECTIVE', 'ASSESSMENT', 'PLAN'];

  // Only skip normalization if ALL headers are on their OWN lines
  // (header word + optional colon/whitespace, nothing else on the line)
  const hasAllOnOwnLines = requiredHeaders.every((h) =>
    new RegExp(`^${h}[:\\s]*$`, 'im').test(note)
  );

  if (hasAllOnOwnLines) return note;

  // Try to find headers (possibly with inline content, markdown, etc.)
  const headerPattern = /^(?:\*{0,2})(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN(?:\s+OF\s+CARE)?)(?:\*{0,2})\s*:/gim;
  const matches: { header: string; index: number }[] = [];
  let match;
  while ((match = headerPattern.exec(note)) !== null) {
    matches.push({ header: match[1].toUpperCase(), index: match.index });
  }

  if (matches.some((m) => m.header === 'SUBJECTIVE')) {
    const preamble = note.slice(0, matches[0].index).trim();
    const sections: string[] = [];
    if (preamble) sections.push(preamble);

    const sectionMap: Record<string, string> = {};
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : note.length;
      const content = note.slice(start, end).replace(/^.*?:\s*\n?/, '').trim();
      const key = matches[i].header.startsWith('PLAN') ? 'PLAN' : matches[i].header;
      sectionMap[key] = content;
    }

    for (const h of requiredHeaders) {
      sections.push(`${h}:\n${sectionMap[h] || 'Not provided.'}`);
    }
    return sections.join('\n\n');
  }

  // No headers found — wrap entire content under SUBJECTIVE
  return [
    `SUBJECTIVE:\n${note.trim()}`,
    'OBJECTIVE:\nNot assessed today.',
    'ASSESSMENT:\nNot assessed today.',
    'PLAN:\nNot assessed today.',
  ].join('\n\n');
}

export function formatSafePDFFilename(
  patientName: string | undefined,
  noteType: NoteType,
  dateOfService?: string | null,
  createdAt?: string
): string {
  let patientPart = 'Unknown_Patient';

  if (patientName) {
    const { firstName, lastName } = parsePatientName(patientName);
    if (lastName) {
      patientPart = lastName.replace(/[^a-zA-Z0-9]/g, '_');
      if (firstName) {
        patientPart += `_${firstName.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }
    } else if (firstName) {
      patientPart = firstName.replace(/[^a-zA-Z0-9]/g, '_');
    }
  }

  const noteTypeLabel = NOTE_TYPE_SHORT_LABELS[noteType]?.replace(/\s+/g, '_') || noteType;

  let datePart = '';
  if (dateOfService) {
    try {
      const date = new Date(dateOfService);
      datePart = format(date, 'yyyy-MM-dd');
    } catch {
      datePart = dateOfService.replace(/[^0-9-]/g, '');
    }
  } else if (createdAt) {
    try {
      const date = new Date(createdAt);
      datePart = format(date, 'yyyy-MM-dd');
    } catch {
      datePart = '';
    }
  }

  if (datePart) {
    return `${patientPart}-${noteTypeLabel}-${datePart}.pdf`;
  }

  return `${patientPart}-${noteTypeLabel}.pdf`;
}
