'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  Download,
} from 'lucide-react';

interface PreviewData {
  headers: string[];
  mapped_headers: string[];
  row_count: number;
  preview: Record<string, unknown>[];
}

interface ImportResult {
  row: number;
  first_name: string;
  last_name: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
  patient_id?: string;
}

interface ImportResponse {
  total: number;
  success: number;
  errors: number;
  skipped: number;
  results: ImportResult[];
}

const DISPLAY_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'date_of_birth', label: 'DOB' },
  { key: 'gender', label: 'Gender' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'primary_diagnosis', label: 'Diagnosis' },
  { key: 'referring_physician', label: 'Referring MD' },
  { key: 'payer_name', label: 'Insurance' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'frequency', label: 'Frequency' },
];

export default function ImportCaseloadPage() {
  const { currentClinic } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setImportResult(null);
    setPreview(null);

    // Auto-preview
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selected);
      formData.append('clinic_id', currentClinic?.clinic_id || '');
      formData.append('mode', 'preview');

      const res = await fetch('/api/patients/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to parse file');
        return;
      }

      const data: PreviewData = await res.json();
      setPreview(data);
    } catch {
      toast.error('Failed to read file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !currentClinic?.clinic_id) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clinic_id', currentClinic.clinic_id);
      formData.append('mode', 'import');

      const res = await fetch('/api/patients/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Import failed');
        return;
      }

      const data: ImportResponse = await res.json();
      setImportResult(data);
      setPreview(null);

      if (data.success > 0) {
        toast.success(`Successfully imported ${data.success} patient${data.success !== 1 ? 's' : ''}`);
      }
      if (data.errors > 0) {
        toast.error(`${data.errors} row${data.errors !== 1 ? 's' : ''} had errors`);
      }
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Download the pre-built Excel template with sample data
    const a = document.createElement('a');
    a.href = '/caseload_import_template.xlsx';
    a.download = 'caseload_import_template.xlsx';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Import Caseload</h1>
          <p className="text-slate-600 mt-1">
            Upload an Excel (.xlsx) or CSV file to bulk-import patients
          </p>
        </div>

        {/* Upload Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg">Upload Spreadsheet</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-1">
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </div>
            <CardDescription>
              Accepted formats: .xlsx, .xls, .csv. The first row should contain column headers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!file ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors cursor-pointer"
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-slate-400" />
                <p className="font-medium text-slate-700">Click to select a file</p>
                <p className="text-sm text-slate-500 mt-1">or drag and drop</p>
              </button>
            ) : (
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                  <div>
                    <p className="font-medium text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                      {preview && ` · ${preview.row_count} rows found`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setImportResult(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Change File
                </Button>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Parsing file...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column Mapping Info */}
        {preview && !importResult && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Column Mapping</CardTitle>
              <CardDescription>
                Your columns have been automatically mapped. Here&apos;s how they&apos;ll be imported.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {preview.headers.map((header, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-slate-50 rounded">
                    <span className="text-slate-500">{header}</span>
                    <span className="text-slate-300">&rarr;</span>
                    <span className="font-medium text-slate-700">{preview.mapped_headers[i]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Table */}
        {preview && !importResult && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    Preview ({preview.row_count} rows)
                  </CardTitle>
                  <CardDescription>
                    Showing first {Math.min(10, preview.row_count)} rows. Review before importing.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="gap-1"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Import {preview.row_count} Patients
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium text-slate-500">#</th>
                      {DISPLAY_FIELDS.map((f) => (
                        <th key={f.key} className="text-left p-2 font-medium text-slate-500 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} className="border-b hover:bg-slate-50">
                        <td className="p-2 text-slate-400">{i + 1}</td>
                        {DISPLAY_FIELDS.map((f) => (
                          <td key={f.key} className="p-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                            {row[f.key] != null ? String(row[f.key]) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Results */}
        {importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Import Complete</CardTitle>
              <CardDescription>
                {importResult.total} rows processed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Summary badges */}
              <div className="flex gap-3 mb-6">
                {importResult.success > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1 px-3 py-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {importResult.success} imported
                  </Badge>
                )}
                {importResult.skipped > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 gap-1 px-3 py-1">
                    <SkipForward className="h-3.5 w-3.5" />
                    {importResult.skipped} skipped (duplicates)
                  </Badge>
                )}
                {importResult.errors > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1 px-3 py-1">
                    <XCircle className="h-3.5 w-3.5" />
                    {importResult.errors} errors
                  </Badge>
                )}
              </div>

              {/* Results table */}
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {importResult.results.map((result) => (
                  <div
                    key={result.row}
                    className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                      result.status === 'success'
                        ? 'bg-emerald-50 border border-emerald-100'
                        : result.status === 'skipped'
                          ? 'bg-amber-50 border border-amber-100'
                          : 'bg-red-50 border border-red-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {result.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {result.status === 'skipped' && <SkipForward className="h-4 w-4 text-amber-600" />}
                      {result.status === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
                      <span className="text-slate-500">Row {result.row}</span>
                      <span className="font-medium text-slate-900">
                        {result.last_name}, {result.first_name}
                      </span>
                    </div>
                    {result.error && (
                      <span className="text-sm text-slate-600">{result.error}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-6">
                <Button onClick={() => router.push('/')} className="gap-1">
                  Go to Caseload
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setImportResult(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Format guide */}
        {!preview && !importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spreadsheet Format Guide</CardTitle>
              <CardDescription>
                Your file should have a header row with column names. We automatically map common column names.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-slate-900 mb-2">Required Columns</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-red-50 border border-red-100 rounded text-sm">
                      <span className="font-medium">First Name</span>
                      <span className="text-slate-500 ml-1">(or first_name, firstname)</span>
                    </div>
                    <div className="p-2 bg-red-50 border border-red-100 rounded text-sm">
                      <span className="font-medium">Last Name</span>
                      <span className="text-slate-500 ml-1">(or last_name, lastname)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-slate-900 mb-2">Optional Columns</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { name: 'Date of Birth', aliases: 'DOB, birthdate' },
                      { name: 'Gender', aliases: 'sex' },
                      { name: 'Phone', aliases: 'telephone, cell' },
                      { name: 'Email', aliases: 'email address' },
                      { name: 'Address', aliases: 'street address' },
                      { name: 'Primary Diagnosis', aliases: 'diagnosis, dx' },
                      { name: 'Referring Physician', aliases: 'referring MD' },
                      { name: 'Allergies', aliases: 'allergy' },
                      { name: 'Precautions', aliases: 'precaution' },
                      { name: 'Insurance', aliases: 'payer, payer_name' },
                      { name: 'Insurance ID', aliases: 'member id, policy number' },
                      { name: 'Medicaid ID', aliases: 'medicaid' },
                      { name: 'Discipline', aliases: 'PT, OT, ST' },
                      { name: 'Frequency', aliases: 'e.g. 2x/week' },
                    ].map((col) => (
                      <div key={col.name} className="p-2 bg-slate-50 border rounded text-sm">
                        <span className="font-medium">{col.name}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{col.aliases}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                  <strong>Tip:</strong> Dates can be in MM/DD/YYYY, YYYY-MM-DD, or standard Excel date format.
                  Duplicate patients (same first + last name) will be automatically skipped.
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
