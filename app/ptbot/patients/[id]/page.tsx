'use client';

import { useEffect, useState, useRef } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Video,
  FileText,
  FileCheck,
  FileX,
  Upload,
  Download,
  Eye,
  Loader2,
  ClipboardList,
  ShieldCheck,
  User,
  ChevronRight,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { format } from 'date-fns';

interface PatientFile {
  id: string;
  patient_id: string;
  clinic_id: string;
  file_type: string;
  file_name: string;
  file_url: string | null;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  uploaded_by: string;
  notes: string | null;
  created_at: string;
}

interface PatientInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  phone: string | null;
  primary_diagnosis: string | null;
}

interface PTBotNote {
  id: string;
  title: string;
  note_type: string;
  date_of_service: string | null;
  created_at: string;
}

const FILE_TYPE_LABELS: Record<string, string> = {
  consent_form: 'Telehealth Consent Form',
  referral: 'PT Referral from Physician',
  insurance_card: 'Insurance Card',
  other: 'Other Document',
};

export default function PTBotPatientFilePage() {
  const params = useParams();
  const router = useRouter();
  const { currentClinic } = useAuth();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [notes, setNotes] = useState<PTBotNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileType, setUploadFileType] = useState<string>('referral');

  useEffect(() => {
    if (patientId && currentClinic?.clinic_id) {
      fetchAll();
    }
  }, [patientId, currentClinic]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [patientRes, filesRes, notesRes] = await Promise.all([
        fetch(`/api/patients/${patientId}`),
        fetch(`/api/patients/${patientId}/files`),
        fetch(`/api/notes?clinic_id=${currentClinic!.clinic_id}&ptbot=true&limit=50`),
      ]);

      if (patientRes.ok) {
        setPatient(await patientRes.json());
      }
      if (filesRes.ok) {
        setFiles(await filesRes.json());
      }
      if (notesRes.ok) {
        const allNotes = await notesRes.json();
        // Filter to only this patient's notes
        setNotes(allNotes.filter((n: { patient_id?: string }) => n.patient_id === patientId));
      }
    } catch (error) {
      console.error('Error fetching patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentClinic?.clinic_id) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', uploadFileType);
      formData.append('clinic_id', currentClinic.clinic_id);

      const res = await fetch(`/api/patients/${patientId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      // Refresh files list
      const filesRes = await fetch(`/api/patients/${patientId}/files`);
      if (filesRes.ok) {
        setFiles(await filesRes.json());
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const consentFiles = files.filter((f) => f.file_type === 'consent_form');
  const referralFiles = files.filter((f) => f.file_type === 'referral');
  const otherFiles = files.filter((f) => !['consent_form', 'referral'].includes(f.file_type));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
          className="mb-4 gap-2 text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Patient Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    {patient?.last_name?.toUpperCase()}, {patient?.first_name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <Video className="h-3 w-3" />
                    Telehealth Patient File
                    {patient?.date_of_birth && (
                      <span>
                        {' '}
                        &middot; DOB: {format(new Date(patient.date_of_birth), 'MM/dd/yyyy')}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
              <Badge className="bg-violet-100 text-violet-700 border-violet-200">
                Telehealth
              </Badge>
            </div>
          </CardHeader>
          {(patient?.email || patient?.phone || patient?.primary_diagnosis) && (
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {patient?.email && (
                  <div>
                    <span className="text-slate-500">Email:</span>{' '}
                    <span className="text-slate-700">{patient.email}</span>
                  </div>
                )}
                {patient?.phone && (
                  <div>
                    <span className="text-slate-500">Phone:</span>{' '}
                    <span className="text-slate-700">{patient.phone}</span>
                  </div>
                )}
                {patient?.primary_diagnosis && (
                  <div>
                    <span className="text-slate-500">Diagnosis:</span>{' '}
                    <span className="text-slate-700">{patient.primary_diagnosis}</span>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Telehealth Consent Form */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg">Telehealth Consent Form</CardTitle>
              </div>
              {consentFiles.length > 0 ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  Received
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-200">
                  Pending
                </Badge>
              )}
            </div>
            <CardDescription>
              Signed telehealth consent form
            </CardDescription>
          </CardHeader>
          <CardContent>
            {consentFiles.length > 0 ? (
              <div className="space-y-2">
                {consentFiles.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">
                <FileX className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">
                  No consent form received yet. This will be synced automatically when
                  the patient completes their telehealth consent.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PT Referral */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">PT Referral from Physician</CardTitle>
              </div>
              {referralFiles.length > 0 ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  Received
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-200">
                  Pending
                </Badge>
              )}
            </div>
            <CardDescription>
              Physical therapy referral from the patient&apos;s physician
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referralFiles.length > 0 ? (
              <div className="space-y-2">
                {referralFiles.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">
                <FileX className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm mb-4">
                  No referral received yet. The patient can upload their referral
                  during intake, or you can upload it manually below.
                </p>
              </div>
            )}

            {/* Manual Upload */}
            <div className="mt-4 pt-4 border-t">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div className="flex items-center gap-3">
                <select
                  value={uploadFileType}
                  onChange={(e) => setUploadFileType(e.target.value)}
                  className="text-sm border rounded-md px-2 py-1.5 text-slate-700"
                >
                  <option value="referral">PT Referral</option>
                  <option value="consent_form">Consent Form</option>
                  <option value="insurance_card">Insurance Card</option>
                  <option value="other">Other</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </Button>
              </div>
              {uploadError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Other Documents */}
        {otherFiles.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-600" />
                <CardTitle className="text-lg">Other Documents</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {otherFiles.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Telehealth SOAP Notes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-violet-500" />
                <CardTitle className="text-lg">Telehealth Notes</CardTitle>
              </div>
              {notes.length > 0 && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200">
                  {notes.length}
                </Badge>
              )}
            </div>
            <CardDescription>SOAP notes from telehealth sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No telehealth notes for this patient yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <Link key={note.id} href={`/notes/${note.id}`} className="block">
                    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-violet-50 hover:border-violet-200 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-violet-400 shrink-0" />
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{note.title}</p>
                          <p className="text-xs text-slate-500">
                            {note.date_of_service
                              ? format(new Date(note.date_of_service), 'MMM d, yyyy')
                              : format(new Date(note.created_at), 'MMM d, yyyy')}
                            {' · '}
                            {note.note_type === 'pt_evaluation' ? 'PT Evaluation' : 'Daily SOAP'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FileRow({ file }: { file: PatientFile }) {
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg">
      <div className="flex items-center gap-3">
        <FileCheck className="h-4 w-4 text-emerald-500 shrink-0" />
        <div>
          <p className="font-medium text-slate-900 text-sm">{file.file_name}</p>
          <p className="text-xs text-slate-500">
            {FILE_TYPE_LABELS[file.file_type] || file.file_type}
            {file.file_size ? ` · ${formatFileSize(file.file_size)}` : ''}
            {' · '}
            Uploaded {format(new Date(file.created_at), 'MMM d, yyyy')}
            {file.uploaded_by === 'ptbot' && (
              <span className="text-violet-500"> via telehealth</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {file.file_url && (
          <>
            <a href={file.file_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <Eye className="h-3 w-3" />
                View
              </Button>
            </a>
            <a href={file.file_url} download={file.file_name}>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <Download className="h-3 w-3" />
                Download
              </Button>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
