'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Copy,
  Download,
  Check,
  AlertCircle,
  FileText,
  Loader2,
  Edit3,
  Eye,
  Save,
  FileType,
  Trash2,
  ShieldCheck,
  DollarSign,
  Send,
  X,
  Plus,
} from 'lucide-react';
import { Note, NOTE_TYPE_LABELS, BrandingSettings, Claim, ClaimStatus, CLAIM_STATUS_LABELS, CLAIM_STATUS_COLORS } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { format } from 'date-fns';
import BrandingHeader from '@/components/BrandingHeader';
import { generateNotePDF, generateRichNotePDF } from '@/lib/pdf-generator';
import { generateNoteWord } from '@/lib/word-generator';
import { formatNoteTitle } from '@/lib/note-utils';
import { RichTextEditor, ExportPreview } from '@/components/rich-text-editor';
import {
  RichTextDocument,
  RichNoteContent,
  ExportFormatSettings,
  DEFAULT_EXPORT_SETTINGS,
} from '@/lib/rich-text/types';
import {
  createRichNoteContent,
  parseNoteContent,
  richDocumentToPlainText,
  updateRichNoteContent,
  isContentModified,
} from '@/lib/rich-text/content-converter';
import { TemplateExport, noteToTemplateData } from '@/components/TemplateExport';
import { Building2 } from 'lucide-react';

type ViewMode = 'view' | 'edit';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Rich text content state
  const [richContent, setRichContent] = useState<RichNoteContent | null>(null);
  const [originalContent, setOriginalContent] = useState<RichTextDocument | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Export preview state
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [showTemplateExport, setShowTemplateExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auth
  const { user, currentClinic } = useAuth();

  // Billing/finalization state
  const [finalizing, setFinalizing] = useState(false);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [cptSuggestions, setCptSuggestions] = useState<Array<{
    cpt_code: string;
    cpt_code_id: string;
    description: string;
    units: number;
    minutes: number;
    modifier_1: string | null;
    modifier_2: string | null;
    charge_amount: number;
    is_timed: boolean;
    category: string;
    included: boolean;
  }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [creatingCharges, setCreatingCharges] = useState(false);
  const [linkedClaim, setLinkedClaim] = useState<Claim | null>(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchNote(params.id as string);
      fetchBranding();
    }
  }, [params.id]);

  // Initialize rich content when note loads
  useEffect(() => {
    if (note) {
      // Debug: log what we received from the API
      console.log('[NoteDisplay] output_text (first 300 chars):', note.output_text?.substring(0, 300));
      console.log('[NoteDisplay] rich_content present:', !!note.rich_content);
      console.log('[NoteDisplay] output_text has SUBJECTIVE:', /SUBJECTIVE/i.test(note.output_text || ''));

      // Check if note already has rich content stored
      const parsed = note.rich_content
        ? parseNoteContent(note.rich_content)
        : null;

      if (parsed) {
        // Verify the stored rich content has SOAP headings
        const hasHeadings = parsed.document.content.some(
          (n: { type: string }) => n.type === 'heading'
        );
        if (hasHeadings) {
          console.log('[NoteDisplay] Using stored rich_content (has headings)');
          setRichContent(parsed);
          setOriginalContent(parsed.document);
        } else {
          // Stored rich_content lacks headings — re-convert from plain text
          console.warn('[NoteDisplay] Stored rich_content has NO headings — re-converting from output_text');
          const newRichContent = createRichNoteContent(
            note.output_text,
            note.billing_justification || undefined,
            note.hep_summary || undefined
          );
          setRichContent(newRichContent);
          setOriginalContent(newRichContent.document);
        }
      } else {
        // Convert plain text to rich content
        console.log('[NoteDisplay] No stored rich_content — converting from output_text');
        const newRichContent = createRichNoteContent(
          note.output_text,
          note.billing_justification || undefined,
          note.hep_summary || undefined
        );
        console.log('[NoteDisplay] Converted document headings:',
          newRichContent.document.content
            .filter((n: { type: string }) => n.type === 'heading')
            .length
        );
        setRichContent(newRichContent);
        setOriginalContent(newRichContent.document);
      }
    }
  }, [note]);

  const fetchNote = async (id: string) => {
    try {
      const response = await fetch(`/api/notes/${id}`);
      if (response.ok) {
        const data = await response.json();
        setNote(data);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Error fetching note:', error);
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranding = async () => {
    try {
      const response = await fetch('/api/branding');
      if (response.ok) {
        const data = await response.json();
        setBranding(data);
      }
    } catch (error) {
      console.error('Error fetching branding:', error);
    }
  };

  const copyToClipboard = async () => {
    if (!richContent) return;

    // Convert rich content to plain text for clipboard
    let textToCopy = richDocumentToPlainText(richContent.document);

    if (branding?.show_in_notes) {
      const brandingText = generateBrandingText(branding);
      if (brandingText) {
        textToCopy = brandingText + '\n\n' + textToCopy;
      }
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const generateBrandingText = (settings: BrandingSettings): string => {
    const parts: string[] = [];

    if (settings.clinic_name) {
      parts.push(settings.clinic_name);
    }
    if (settings.address) {
      parts.push(settings.address);
    }
    if (settings.phone) {
      parts.push(`Phone: ${settings.phone}`);
    }
    if (settings.email) {
      parts.push(`Email: ${settings.email}`);
    }
    if (settings.website) {
      parts.push(`Web: ${settings.website}`);
    }

    return parts.join('\n');
  };

  // Legacy PDF export (plain text)
  const exportToPDFLegacy = async (withBranding = false) => {
    if (!note) return;

    setExportingPDF(true);
    setPdfError(null);

    try {
      await generateNotePDF({
        note,
        branding: withBranding ? branding : null,
        withBranding,
      });
    } catch (error) {
      console.error('PDF export error:', error);
      setPdfError(
        error instanceof Error
          ? error.message
          : 'Failed to export PDF. Please try again.'
      );
    } finally {
      setExportingPDF(false);
    }
  };

  // Rich text PDF export
  const exportToPDF = async (settings: ExportFormatSettings) => {
    if (!note || !richContent) return;

    setIsExporting(true);
    setPdfError(null);

    try {
      const contentWithSettings: RichNoteContent = {
        ...richContent,
        formatSettings: settings,
      };

      await generateRichNotePDF({
        note,
        richContent: contentWithSettings,
        branding,
        withBranding: !!branding,
      });
    } catch (error) {
      console.error('PDF export error:', error);
      setPdfError(
        error instanceof Error
          ? error.message
          : 'Failed to export PDF. Please try again.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Word export
  const exportToWord = async (settings: ExportFormatSettings) => {
    if (!note || !richContent) return;

    setIsExporting(true);
    setPdfError(null);

    try {
      const contentWithSettings: RichNoteContent = {
        ...richContent,
        formatSettings: settings,
      };

      await generateNoteWord({
        note,
        richContent: contentWithSettings,
        branding,
        withBranding: !!branding,
      });
    } catch (error) {
      console.error('Word export error:', error);
      setPdfError(
        error instanceof Error
          ? error.message
          : 'Failed to export Word document. Please try again.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Handle content update from editor
  const handleContentUpdate = useCallback(
    (newDocument: RichTextDocument) => {
      if (!richContent || !originalContent) return;

      const updated = updateRichNoteContent(richContent, newDocument);
      setRichContent(updated);

      // Check if content has changed from original
      setHasUnsavedChanges(isContentModified(originalContent, newDocument));
    },
    [richContent, originalContent]
  );

  // Save edited content
  const saveContent = async () => {
    if (!note || !richContent) return;

    setSaving(true);

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rich_content: richContent,
          output_text: richDocumentToPlainText(richContent.document),
        }),
      });

      if (response.ok) {
        setOriginalContent(richContent.document);
        setHasUnsavedChanges(false);
        setViewMode('view');
      } else {
        throw new Error('Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving content:', error);
      setPdfError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    if (originalContent && richContent) {
      setRichContent(updateRichNoteContent(richContent, originalContent));
    }
    setHasUnsavedChanges(false);
    setViewMode('view');
  };

  // Delete note
  const handleDelete = async () => {
    if (!note) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/');
      } else {
        const data = await response.json().catch(() => ({}));
        setPdfError(data.error || 'Failed to delete note');
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      setPdfError('Failed to delete note. Please try again.');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Finalize note and open billing dialog
  const handleFinalize = async () => {
    if (!note) return;

    setFinalizing(true);
    try {
      // 1. Mark the note as final
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'final',
          finalized_by: user?.id || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to finalize note');

      const updatedNote = await res.json();
      setNote({ ...note, status: 'final', finalized_at: updatedNote.finalized_at });

      // 2. Fetch CPT suggestions based on note data
      setLoadingSuggestions(true);
      setBillingDialogOpen(true);

      const inputData = note.input_data || {};
      const suggestRes = await fetch('/api/billing/suggest-cpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_type: note.doc_type === 'evaluation' ? 'evaluation'
            : note.doc_type === 're_evaluation' ? 're_evaluation'
            : 'treatment',
          interventions: inputData.objective?.interventions || [],
          start_time: inputData.startTime || null,
          end_time: inputData.endTime || null,
        }),
      });

      if (suggestRes.ok) {
        const { suggestions } = await suggestRes.json();
        setCptSuggestions(suggestions.map((s: Record<string, unknown>) => ({ ...s, included: true })));
      }
    } catch (err) {
      console.error('Error finalizing note:', err);
      setPdfError('Failed to finalize note. Please try again.');
    } finally {
      setFinalizing(false);
      setLoadingSuggestions(false);
    }
  };

  // Update a CPT suggestion line
  const updateSuggestion = (index: number, field: string, value: unknown) => {
    setCptSuggestions(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  // Confirm CPT codes and create charges + claim
  const handleConfirmBilling = async () => {
    if (!note) return;

    const includedLines = cptSuggestions.filter(s => s.included);
    if (includedLines.length === 0) {
      setBillingDialogOpen(false);
      return;
    }

    setCreatingCharges(true);
    try {
      // Parse diagnosis codes from note demographics
      const diagText = note.input_data?.patientDemographic?.diagnosis || '';
      const diagCodes = diagText
        .split(/[,;]/)
        .map((d: string) => d.trim())
        .filter((d: string) => /^[A-Z]\d/.test(d))
        .map((d: string) => d.split(/\s/)[0]); // Extract just the code

      const res = await fetch('/api/billing/auto-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_id: note.visit_id || null,
          note_id: note.id,
          patient_id: note.patient_id || null,
          episode_id: null, // Linked through visit if available
          clinic_id: currentClinic?.clinic_id || null,
          date_of_service: note.date_of_service || note.input_data?.dateOfService || new Date().toISOString().split('T')[0],
          diagnosis_codes: diagCodes.length > 0 ? diagCodes : null,
          rendering_provider_npi: null, // Could be fetched from provider_profiles
          rendering_provider_name: null,
          created_by: user?.id || null,
          lines: includedLines.map(s => ({
            cpt_code: s.cpt_code,
            cpt_code_id: s.cpt_code_id,
            description: s.description,
            units: s.units,
            minutes: s.minutes,
            modifier_1: s.modifier_1,
            modifier_2: s.modifier_2,
            charge_amount: s.charge_amount,
            is_timed: s.is_timed,
            diagnosis_pointer: [1],
          })),
        }),
      });

      if (!res.ok) throw new Error('Failed to create charges');

      const { claim } = await res.json();
      setLinkedClaim(claim);
      setBillingDialogOpen(false);
    } catch (err) {
      console.error('Error creating charges:', err);
      setPdfError('Failed to create billing records. Please try again.');
    } finally {
      setCreatingCharges(false);
    }
  };

  // Submit claim to clearinghouse
  const handleSubmitClaim = async () => {
    if (!linkedClaim) return;

    setSubmittingClaim(true);
    try {
      // Try Stedi first, fall back to Claim.MD placeholder
      const res = await fetch(`/api/claims/${linkedClaim.id}/submit`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to submit claim');

      const result = await res.json();
      setLinkedClaim(result.claim);
    } catch (err) {
      console.error('Error submitting claim:', err);
      setPdfError('Failed to submit claim. Please try again.');
    } finally {
      setSubmittingClaim(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Loading note...</div>
      </div>
    );
  }

  if (!note || !richContent) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 truncate">
                {note.title ||
                  formatNoteTitle(
                    note.input_data?.patientDemographic?.patientName,
                    note.note_type,
                    note.date_of_service || note.input_data?.dateOfService,
                    note.created_at
                  )}
              </h1>
              <Badge variant="outline" className="text-sm px-2 py-0.5">
                {NOTE_TYPE_LABELS[note.note_type]}
              </Badge>
            </div>
            <div className="space-y-1 text-slate-600">
              {(note.date_of_service || note.input_data?.dateOfService) && (
                <p className="text-sm">
                  Service Date:{' '}
                  {format(
                    new Date(note.date_of_service || note.input_data.dateOfService!),
                    'MMMM d, yyyy'
                  )}
                  {note.input_data?.startTime && note.input_data?.endTime && (
                    <span className="ml-3">
                      {note.input_data.startTime} - {note.input_data.endTime}
                      {(() => {
                        const [sH, sM] = note.input_data.startTime!.split(':').map(Number);
                        const [eH, eM] = note.input_data.endTime!.split(':').map(Number);
                        const diff = (eH * 60 + eM) - (sH * 60 + sM);
                        if (diff <= 0) return null;
                        const h = Math.floor(diff / 60);
                        const m = diff % 60;
                        return <span className="ml-2 text-slate-500">({h > 0 ? `${h}h ` : ''}{m}m)</span>;
                      })()}
                    </span>
                  )}
                </p>
              )}
              <p className="text-sm">
                Created {format(new Date(note.created_at), 'MMMM d, yyyy h:mm a')}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap justify-end">
            {viewMode === 'edit' ? (
              <>
                <Button
                  variant="outline"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveContent}
                  disabled={!hasUnsavedChanges || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={copyToClipboard} disabled={isExporting}>
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setViewMode('edit')}
                  disabled={isExporting}
                >
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowExportPreview(true)}
                  disabled={isExporting}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Quick Export
                </Button>
                <Button
                  onClick={() => setShowTemplateExport(true)}
                  disabled={isExporting}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  Export with Template
                </Button>
                {note.status !== 'final' && (
                  <Button
                    onClick={handleFinalize}
                    disabled={finalizing || isExporting}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {finalizing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Finalizing...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Finalize & Bill
                      </>
                    )}
                  </Button>
                )}
                {note.status === 'final' && !linkedClaim && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 px-3 py-1.5">
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Finalized
                  </Badge>
                )}
                {!confirmDelete ? (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    disabled={isExporting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleting}
                      size="sm"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'Confirm Delete'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {pdfError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{pdfError}</AlertDescription>
          </Alert>
        )}

        {hasUnsavedChanges && viewMode === 'edit' && (
          <Alert className="mb-6 border-yellow-200 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              You have unsaved changes. Click "Save Changes" to keep your edits.
            </AlertDescription>
          </Alert>
        )}

        {note.input_data?.patientDemographic && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Patient Demographic</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {note.input_data.patientDemographic.patientName && (
                <div>
                  <span className="font-medium">Patient Name:</span>{' '}
                  {note.input_data.patientDemographic.patientName}
                </div>
              )}
              {note.input_data.patientDemographic.dateOfBirth && (
                <div>
                  <span className="font-medium">Date of Birth:</span>{' '}
                  {note.input_data.patientDemographic.dateOfBirth}
                </div>
              )}
              {note.input_data.patientDemographic.diagnosis && (
                <div>
                  <span className="font-medium">Diagnosis:</span>{' '}
                  {note.input_data.patientDemographic.diagnosis}
                </div>
              )}
              {note.input_data.patientDemographic.referralSource && (
                <div>
                  <span className="font-medium">Referring MD:</span>{' '}
                  {note.input_data.patientDemographic.referralSource}
                </div>
              )}
              {note.input_data.patientDemographic.treatmentDiagnosis && (
                <div>
                  <span className="font-medium">Treatment Diagnosis:</span>{' '}
                  {note.input_data.patientDemographic.treatmentDiagnosis}
                </div>
              )}
              {note.input_data.patientDemographic.insuranceId && (
                <div>
                  <span className="font-medium">Insurance ID:</span>{' '}
                  {note.input_data.patientDemographic.insuranceId}
                </div>
              )}
              {note.input_data.patientDemographic.allergies && (
                <div>
                  <span className="font-medium">Allergies:</span>{' '}
                  {note.input_data.patientDemographic.allergies}
                </div>
              )}
              {note.input_data.patientDemographic.precautions && (
                <div>
                  <span className="font-medium">Precautions:</span>{' '}
                  {note.input_data.patientDemographic.precautions}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {viewMode === 'edit' ? 'Edit Note' : 'Generated Note'}
                </CardTitle>
                <CardDescription>
                  {viewMode === 'edit'
                    ? 'Use the toolbar to format text. Changes are saved when you click "Save Changes".'
                    : 'Professional documentation ready for review'}
                </CardDescription>
              </div>
              {viewMode === 'view' && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Eye className="h-4 w-4" />
                  View Mode
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {branding && viewMode === 'view' && (
              <BrandingHeader settings={branding} variant="display" />
            )}
            <RichTextEditor
              content={richContent.document}
              onUpdate={handleContentUpdate}
              readOnly={viewMode === 'view'}
              showToolbar={viewMode === 'edit'}
              minHeight="400px"
              placeholder="Note content..."
            />
          </CardContent>
        </Card>

        {note.billing_justification && note.note_type !== 'daily_soap' && (
          <Card className="mb-6 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg">
                Billing/Skilled Justification
              </CardTitle>
            </CardHeader>
            <CardContent>
              {richContent.billingJustification ? (
                <RichTextEditor
                  content={richContent.billingJustification}
                  readOnly={true}
                  showToolbar={false}
                  minHeight="100px"
                />
              ) : (
                <p className="text-sm">{note.billing_justification}</p>
              )}
            </CardContent>
          </Card>
        )}

        {note.hep_summary && note.note_type !== 'daily_soap' && (
          <Card className="mb-6 border-green-200">
            <CardHeader>
              <CardTitle className="text-lg">HEP Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {richContent.hepSummary ? (
                <RichTextEditor
                  content={richContent.hepSummary}
                  readOnly={true}
                  showToolbar={false}
                  minHeight="100px"
                />
              ) : (
                <p className="text-sm">{note.hep_summary}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Export Preview Dialog (Quick Export) */}
        <ExportPreview
          open={showExportPreview}
          onOpenChange={setShowExportPreview}
          content={richContent}
          onExportPDF={exportToPDF}
          onExportWord={exportToWord}
          isExporting={isExporting}
        />

        {/* Template Export Dialog */}
        <TemplateExport
          open={showTemplateExport}
          onOpenChange={setShowTemplateExport}
          note={note}
          noteData={noteToTemplateData(note)}
          defaultClinic={note.clinic_name || undefined}
        />

        {/* Billing Confirmation Dialog */}
        <Dialog open={billingDialogOpen} onOpenChange={setBillingDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                Confirm Billing Codes
              </DialogTitle>
              <DialogDescription>
                Review the suggested CPT codes based on your documented interventions and treatment time.
                Adjust units or remove codes as needed, then confirm to create charges and a draft claim.
              </DialogDescription>
            </DialogHeader>

            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="ml-2 text-slate-500">Analyzing note for CPT suggestions...</span>
              </div>
            ) : cptSuggestions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                <p>No CPT codes could be suggested from this note.</p>
                <p className="text-sm mt-1">You can add charges manually from the Billing page.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Use</TableHead>
                      <TableHead>CPT Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[80px]">Units</TableHead>
                      <TableHead className="w-[80px]">Minutes</TableHead>
                      <TableHead className="w-[80px]">Mod 1</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cptSuggestions.map((suggestion, idx) => (
                      <TableRow key={idx} className={!suggestion.included ? 'opacity-50' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={suggestion.included}
                            onChange={(e) => updateSuggestion(idx, 'included', e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{suggestion.cpt_code}</TableCell>
                        <TableCell className="text-sm">{suggestion.description}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={suggestion.units}
                            onChange={(e) => updateSuggestion(idx, 'units', parseInt(e.target.value) || 1)}
                            className="w-16 h-8 text-center"
                            disabled={!suggestion.included}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {suggestion.is_timed ? `${suggestion.minutes}m` : '—'}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={suggestion.modifier_1 || ''}
                            onChange={(e) => updateSuggestion(idx, 'modifier_1', e.target.value || null)}
                            className="w-16 h-8 text-center font-mono"
                            placeholder="GP"
                            disabled={!suggestion.included}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-3 rounded-md">
                  <span>Total units: <strong>{cptSuggestions.filter(s => s.included).reduce((sum, s) => sum + s.units, 0)}</strong></span>
                  <span>{cptSuggestions.filter(s => s.included).length} of {cptSuggestions.length} codes selected</span>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setBillingDialogOpen(false)} disabled={creatingCharges}>
                Skip Billing
              </Button>
              <Button
                onClick={handleConfirmBilling}
                disabled={creatingCharges || cptSuggestions.filter(s => s.included).length === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {creatingCharges ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Charges...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Confirm & Create Claim
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Claim Status Card (shown after charges are created) */}
        {linkedClaim && (
          <Card className="mb-6 border-2 border-emerald-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  Claim {linkedClaim.claim_number}
                </CardTitle>
                <Badge className={CLAIM_STATUS_COLORS[linkedClaim.status as ClaimStatus] || 'bg-slate-100'}>
                  {CLAIM_STATUS_LABELS[linkedClaim.status as ClaimStatus] || linkedClaim.status}
                </Badge>
              </div>
              <CardDescription>
                {linkedClaim.claim_lines?.length || 0} service line(s) &bull; Total: ${Number(linkedClaim.total_charges || 0).toFixed(2)}
                {linkedClaim.submitted_at && (
                  <span className="ml-2">&bull; Submitted {format(new Date(linkedClaim.submitted_at), 'MMM d, yyyy h:mm a')}</span>
                )}
                {linkedClaim.paid_at && (
                  <span className="ml-2">&bull; Paid ${Number(linkedClaim.paid_amount || 0).toFixed(2)} on {format(new Date(linkedClaim.paid_at), 'MMM d, yyyy')}</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {linkedClaim.claim_lines && linkedClaim.claim_lines.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CPT</TableHead>
                      <TableHead>Modifier</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Charge</TableHead>
                      <TableHead>DOS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedClaim.claim_lines
                      .sort((a: { line_number: number }, b: { line_number: number }) => a.line_number - b.line_number)
                      .map((line: {
                        id: string;
                        cpt_code: string;
                        modifier_1?: string | null;
                        modifier_2?: string | null;
                        units: number;
                        charge_amount: number;
                        date_of_service: string;
                      }) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono">{line.cpt_code}</TableCell>
                          <TableCell>{[line.modifier_1, line.modifier_2].filter(Boolean).join(', ') || '—'}</TableCell>
                          <TableCell>{line.units}</TableCell>
                          <TableCell>${Number(line.charge_amount || 0).toFixed(2)}</TableCell>
                          <TableCell>{line.date_of_service}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}

              <div className="flex gap-2 mt-4">
                {(linkedClaim.status === 'draft' || linkedClaim.status === 'generated') && (
                  <Button
                    onClick={handleSubmitClaim}
                    disabled={submittingClaim}
                    size="sm"
                  >
                    {submittingClaim ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Claim
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/billing')}
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  View in Billing
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
