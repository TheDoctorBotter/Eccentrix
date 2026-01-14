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
} from 'lucide-react';
import { Note, NOTE_TYPE_LABELS } from '@/lib/types';
import { format } from 'date-fns';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchNote(params.id as string);
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

  const copyToClipboard = async () => {
    if (!note) return;

    try {
      await navigator.clipboard.writeText(note.output_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const exportToPDF = () => {
    if (!note) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

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
          <div class="warning">
            <strong>DRAFT DOCUMENTATION</strong> - This note must be reviewed and approved by a licensed clinician before use.
          </div>
          <h1>${NOTE_TYPE_LABELS[note.note_type]}</h1>
          <div class="meta">
            Generated: ${format(new Date(note.created_at), 'MMMM d, yyyy h:mm a')}
            ${
              note.input_data?.patient_context?.diagnosis
                ? `<br>Diagnosis: ${note.input_data.patient_context.diagnosis}`
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
                  Copy
                </>
              )}
            </Button>
            <Button onClick={exportToPDF}>
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        <Alert className="mb-6 border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>Draft Documentation:</strong> This note must be reviewed and
            approved by a licensed clinician before use in patient records.
          </AlertDescription>
        </Alert>

        {note.input_data?.patient_context && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Patient Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {note.input_data.patient_context.identifier && (
                <div>
                  <span className="font-medium">Identifier:</span>{' '}
                  {note.input_data.patient_context.identifier}
                </div>
              )}
              {note.input_data.patient_context.diagnosis && (
                <div>
                  <span className="font-medium">Diagnosis:</span>{' '}
                  {note.input_data.patient_context.diagnosis}
                </div>
              )}
              {note.input_data.patient_context.reason_for_visit && (
                <div>
                  <span className="font-medium">Reason:</span>{' '}
                  {note.input_data.patient_context.reason_for_visit}
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
