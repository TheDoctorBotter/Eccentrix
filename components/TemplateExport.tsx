'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, FileType, Download, AlertCircle, Check } from 'lucide-react';
import { ClinicTemplateSelector } from './ClinicTemplateSelector';
import {
  DocumentTemplate,
  NoteTemplateData,
  ExportFormat,
} from '@/lib/templates/types';
import { Note, BrandingSettings } from '@/lib/types';

interface TemplateExportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note;
  /** Pre-built template data from the note */
  noteData: NoteTemplateData;
  /** Default clinic to pre-select */
  defaultClinic?: string;
}

/**
 * Template Export Dialog
 *
 * Allows users to:
 * 1. Select a clinic template
 * 2. Export the note to DOCX or PDF using that template
 *
 * The template placeholders are filled with the note data.
 */
export function TemplateExport({
  open,
  onOpenChange,
  note,
  noteData,
  defaultClinic,
}: TemplateExportProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);

  // Fetch branding settings for provider/signature info
  useEffect(() => {
    if (open) {
      fetch('/api/branding')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => setBranding(data))
        .catch(() => setBranding(null));
    }
  }, [open]);

  const handleExport = async (format: ExportFormat) => {
    if (!selectedTemplate) {
      setError('Please select a template first');
      return;
    }

    setExporting(true);
    setExportFormat(format);
    setError(null);
    setSuccess(null);

    try {
      // Merge branding/provider info with note data
      const exportData: NoteTemplateData = {
        ...noteData,
        // Provider/Signature info from branding settings
        therapistName: branding?.provider_name || '',
        therapistCredentials: branding?.provider_credentials || '',
        therapistLicense: branding?.provider_license || '',
        signatureDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        // Clinic info from branding
        clinicName: branding?.clinic_name || '',
        clinicAddress: branding?.address || '',
        clinicPhone: branding?.phone || '',
      };

      const response = await fetch('/api/document-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          format,
          note_data: exportData,
          note_id: note.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `export.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`${format.toUpperCase()} exported successfully!`);

      // Close dialog after short delay
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportFormat(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[520px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export with Template</DialogTitle>
          <DialogDescription>
            Select a clinic template to export this note. The template's formatting will be preserved exactly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* Template Selector */}
          <ClinicTemplateSelector
            onTemplateSelect={setSelectedTemplate}
            defaultClinic={defaultClinic || note.clinic_name || undefined}
            className="border-0 shadow-none p-0"
          />

          {/* Errors */}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {success && (
            <Alert className="mt-4 border-green-200 bg-green-50">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Template Info */}
          {selectedTemplate && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <h4 className="text-sm font-medium text-blue-900">
                Template: {selectedTemplate.template_name}
              </h4>
              <p className="text-xs text-blue-700 mt-1">
                Clinic: {selectedTemplate.clinic_name}
              </p>
              <p className="text-xs text-blue-600 mt-2">
                The exported document will use this template's exact formatting, branding, and layout.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport('pdf')}
            disabled={!selectedTemplate || exporting}
            className="gap-2"
          >
            {exporting && exportFormat === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileType className="h-4 w-4" />
            )}
            Export PDF
          </Button>
          <Button
            onClick={() => handleExport('docx')}
            disabled={!selectedTemplate || exporting}
            className="gap-2"
          >
            {exporting && exportFormat === 'docx' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Export Word
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Convert Note and input data to NoteTemplateData format
 */
export function noteToTemplateData(note: Note): NoteTemplateData {
  const demographic = note.input_data?.patientDemographic;
  const subjective = note.input_data?.subjective;
  const objective = note.input_data?.objective;
  const assessment = note.input_data?.assessment;
  const plan = note.input_data?.plan;

  // Parse patient name
  let patientFirstName = '';
  let patientLastName = '';
  if (demographic?.patientName) {
    if (demographic.patientName.includes(',')) {
      const parts = demographic.patientName.split(',').map((p) => p.trim());
      patientLastName = parts[0] || '';
      patientFirstName = parts[1] || '';
    } else {
      const parts = demographic.patientName.split(' ');
      patientFirstName = parts[0] || '';
      patientLastName = parts.slice(1).join(' ') || '';
    }
  }

  // Calculate age from DOB
  let age = '';
  if (demographic?.dateOfBirth) {
    try {
      const dob = new Date(demographic.dateOfBirth);
      const today = new Date();
      let years = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        years--;
      }
      age = `${years} years`;
    } catch {
      // Ignore date parsing errors
    }
  }

  return {
    // Patient Info
    patientName: demographic?.patientName || '',
    patientFirstName,
    patientLastName,
    dob: demographic?.dateOfBirth || '',
    age,
    medicalDx: demographic?.diagnosis || '',
    referringMd: demographic?.referralSource || '',

    // Session Info
    dateOfService:
      note.date_of_service ||
      note.input_data?.dateOfService ||
      new Date().toISOString().split('T')[0],

    // SOAP Sections (from generated output)
    subjective: extractSection(note.output_text, 'SUBJECTIVE') ||
                subjective?.symptoms || '',
    objective: extractSection(note.output_text, 'OBJECTIVE') ||
               formatObjective(objective) || '',
    assessment: extractSection(note.output_text, 'ASSESSMENT') ||
                assessment?.response_to_treatment || '',
    plan: extractSection(note.output_text, 'PLAN') ||
          (Array.isArray(plan?.next_session_focus) ? plan?.next_session_focus.join(', ') : plan?.next_session_focus) || '',

    // Plan of Care
    frequency: plan?.frequency_duration || '',
    hep: plan?.hep || '',

    // Billing
    billingJustification: note.billing_justification || '',
  };
}

/**
 * Extract a section from the note text by header
 */
function extractSection(text: string, sectionName: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  let inSection = false;
  const sectionLines: string[] = [];
  const sectionPattern = new RegExp(`^${sectionName}[:\\s]*$`, 'i');
  const nextSectionPattern = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN|BILLING)[:\s]*$/i;

  for (const line of lines) {
    if (sectionPattern.test(line.trim())) {
      inSection = true;
      continue;
    }

    if (inSection) {
      if (nextSectionPattern.test(line.trim())) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').trim();
}

/**
 * Format objective data
 */
function formatObjective(objective: Note['input_data']['objective']): string {
  if (!objective) return '';

  const parts: string[] = [];

  if (objective.interventions && objective.interventions.length > 0) {
    parts.push('Interventions Performed:');
    objective.interventions.forEach((int) => {
      let line = `- ${int.name}`;
      if (int.dosage) line += `: ${int.dosage}`;
      if (int.cues) line += ` (${int.cues})`;
      parts.push(line);
    });
  }

  if (objective.assist_level) {
    parts.push(`\nAssist Level: ${objective.assist_level}`);
  }

  if (objective.tolerance) {
    parts.push(`Tolerance: ${objective.tolerance}`);
  }

  if (objective.key_measures) {
    parts.push(`\n${objective.key_measures}`);
  }

  return parts.join('\n');
}
