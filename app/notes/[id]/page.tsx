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
} from 'lucide-react';
import { Note, NOTE_TYPE_LABELS, BrandingSettings } from '@/lib/types';
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
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchNote(params.id as string);
      fetchBranding();
    }
  }, [params.id]);

  // Initialize rich content when note loads
  useEffect(() => {
    if (note) {
      // Check if note already has rich content stored
      const parsed = note.rich_content
        ? parseNoteContent(note.rich_content)
        : null;

      if (parsed) {
        setRichContent(parsed);
        setOriginalContent(parsed.document);
      } else {
        // Convert plain text to rich content
        const newRichContent = createRichNoteContent(
          note.output_text,
          note.billing_justification || undefined,
          note.hep_summary || undefined
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
                  onClick={() => setShowExportPreview(true)}
                  disabled={isExporting}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
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

        <Alert className="mb-6 border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>Draft Documentation:</strong> This note must be reviewed and
            approved by a licensed clinician before use in patient records.
          </AlertDescription>
        </Alert>

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
                  <span className="font-medium">Referral Source:</span>{' '}
                  {note.input_data.patientDemographic.referralSource}
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

        {note.billing_justification && (
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

        {note.hep_summary && (
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

        {/* Export Preview Dialog */}
        <ExportPreview
          open={showExportPreview}
          onOpenChange={setShowExportPreview}
          content={richContent}
          onExportPDF={exportToPDF}
          onExportWord={exportToWord}
          isExporting={isExporting}
        />
      </div>
    </div>
  );
}
