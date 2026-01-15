'use client';

import { useEffect, useState } from 'react';
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
import {
  ArrowLeft,
  Copy,
  Download,
  Check,
  AlertCircle,
  FileText,
  Loader2,
} from 'lucide-react';
import { Note, NOTE_TYPE_LABELS, BrandingSettings } from '@/lib/types';
import { format } from 'date-fns';
import BrandingHeader from '@/components/BrandingHeader';
import { generateNotePDF } from '@/lib/pdf-generator';
import { formatNoteTitle } from '@/lib/note-utils';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchNote(params.id as string);
      fetchBranding();
    }
  }, [params.id]);

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
    if (!note) return;

    let textToCopy = note.output_text;

    if (branding?.show_in_notes) {
      const brandingText = generateBrandingText(branding);
      if (brandingText) {
        textToCopy = brandingText + '\n\n' + note.output_text;
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

  const exportToPDF = async (withBranding = false) => {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Loading note...</div>
      </div>
    );
  }

  if (!note) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-slate-900">
                {note.title ||
                  formatNoteTitle(
                    note.input_data?.patientDemographic?.patientName,
                    note.note_type,
                    note.date_of_service || note.input_data?.dateOfService,
                    note.created_at
                  )}
              </h1>
              <Badge variant="outline" className="text-base px-3 py-1">
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyToClipboard} disabled={exportingPDF}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Note
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportToPDF(false)}
              disabled={exportingPDF}
            >
              {exportingPDF ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </>
              )}
            </Button>
            {branding && (branding.logo_url || branding.letterhead_url || branding.clinic_name) && (
              <Button
                onClick={() => exportToPDF(true)}
                disabled={exportingPDF}
              >
                {exportingPDF ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Branded PDF
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {pdfError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{pdfError}</AlertDescription>
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
            <CardTitle>Generated Note</CardTitle>
            <CardDescription>
              Professional documentation ready for review
            </CardDescription>
          </CardHeader>
          <CardContent>
            {branding && <BrandingHeader settings={branding} variant="display" />}
            <div className="whitespace-pre-wrap font-mono text-sm bg-slate-50 p-6 rounded-lg border">
              {note.output_text}
            </div>
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
              <p className="text-sm">{note.billing_justification}</p>
            </CardContent>
          </Card>
        )}

        {note.hep_summary && (
          <Card className="mb-6 border-green-200">
            <CardHeader>
              <CardTitle className="text-lg">HEP Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{note.hep_summary}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
