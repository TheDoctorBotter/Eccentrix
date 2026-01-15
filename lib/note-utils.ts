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
