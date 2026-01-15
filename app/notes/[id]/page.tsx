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
} from 'lucide-react';
import { Note, NOTE_TYPE_LABELS, BrandingSettings } from '@/lib/types';
import { format } from 'date-fns';
import BrandingHeader from '@/components/BrandingHeader';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const exportToPDF = (withBranding = false) => {
    if (!note) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let brandingHTML = '';
    if (withBranding && branding) {
      if (branding.letterhead_url) {
        brandingHTML = `
          <div style="border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px;">
            <img src="${branding.letterhead_url}" alt="Clinic Letterhead" style="width: 100%; max-height: 200px; object-fit: contain;" />
          </div>
        `;
      } else if (branding.logo_url) {
        brandingHTML = `
          <div style="border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; display: flex; gap: 20px; align-items: start;">
            <img src="${branding.logo_url}" alt="Clinic Logo" style="height: 64px; width: 64px; object-fit: contain; flex-shrink: 0;" />
            <div style="flex: 1;">
              ${branding.clinic_name ? `<h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1e293b;">${branding.clinic_name}</h2>` : ''}
              ${branding.address ? `<p style="margin: 0 0 8px 0; font-size: 13px; white-space: pre-line; color: #475569;">${branding.address}</p>` : ''}
              <div style="font-size: 13px; color: #64748b;">
                ${branding.phone ? `<div>Phone: ${branding.phone}</div>` : ''}
                ${branding.email ? `<div>Email: ${branding.email}</div>` : ''}
                ${branding.website ? `<div>Web: ${branding.website}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      } else {
        const brandingText = generateBrandingText(branding);
        if (brandingText) {
          brandingHTML = `
            <div style="border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; text-align: center;">
              ${branding.clinic_name ? `<h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1e293b;">${branding.clinic_name}</h2>` : ''}
              ${branding.address ? `<p style="margin: 0 0 8px 0; font-size: 13px; white-space: pre-line; color: #475569;">${branding.address}</p>` : ''}
              <div style="font-size: 13px; color: #64748b;">
                ${branding.phone ? `<div>Phone: ${branding.phone}</div>` : ''}
                ${branding.email ? `<div>Email: ${branding.email}</div>` : ''}
                ${branding.website ? `<div>Web: ${branding.website}</div>` : ''}
              </div>
            </div>
          `;
        }
      }
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${NOTE_TYPE_LABELS[note.note_type]} - ${format(
      new Date(note.created_at),
      'MMM d, yyyy'
    )}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              color: #1e293b;
              border-bottom: 3px solid #3b82f6;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .meta {
              color: #64748b;
              margin-bottom: 30px;
            }
            .note-content {
              white-space: pre-wrap;
              font-size: 14px;
              line-height: 1.8;
            }
            .section {
              margin-top: 30px;
              padding: 15px;
              background: #f8fafc;
              border-left: 4px solid #3b82f6;
            }
            .section-title {
              font-weight: bold;
              color: #1e293b;
              margin-bottom: 10px;
            }
            .warning {
              background: #fef3c7;
              border: 1px solid #f59e0b;
              padding: 15px;
              margin-bottom: 20px;
              border-radius: 5px;
            }
            @media print {
              body {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          ${brandingHTML}
          <div class="warning">
            <strong>DRAFT DOCUMENTATION</strong> - This note must be reviewed and approved by a licensed clinician before use.
          </div>
          <h1>${NOTE_TYPE_LABELS[note.note_type]}</h1>
          <div class="meta">
            Generated: ${format(new Date(note.created_at), 'MMMM d, yyyy h:mm a')}
            ${
              note.input_data?.patientDemographic?.diagnosis
                ? `<br>Diagnosis: ${note.input_data.patientDemographic.diagnosis}`
                : ''
            }
          </div>
          <div class="note-content">${note.output_text.replace(/\n/g, '<br>')}</div>
          ${
            note.billing_justification
              ? `
          <div class="section">
            <div class="section-title">Billing/Skilled Justification</div>
            <div>${note.billing_justification}</div>
          </div>
          `
              : ''
          }
          ${
            note.hep_summary
              ? `
          <div class="section">
            <div class="section-title">HEP Summary</div>
            <div>${note.hep_summary}</div>
          </div>
          `
              : ''
          }
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
                Generated Note
              </h1>
              <Badge variant="outline" className="text-base px-3 py-1">
                {NOTE_TYPE_LABELS[note.note_type]}
              </Badge>
            </div>
            <p className="text-slate-600">
              Created {format(new Date(note.created_at), 'MMMM d, yyyy h:mm a')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyToClipboard}>
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
            <Button variant="outline" onClick={() => exportToPDF(false)}>
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            {branding && (branding.logo_url || branding.letterhead_url || branding.clinic_name) && (
              <Button onClick={() => exportToPDF(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Branded PDF
              </Button>
            )}
          </div>
        </div>

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
