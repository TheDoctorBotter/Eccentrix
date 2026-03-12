'use client';

import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  FileText,
  Plus,
  Calendar,
  User,
  Stethoscope,
  Clock,
  CheckCircle2,
  Edit2,
  Eye,
  Loader2,
  Save,
  Pencil,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { DeletePatientDialog } from '@/components/DeletePatientDialog';
import { useAuth } from '@/lib/auth-context';
import {
  Episode,
  Document,
  ClinicalDocType,
  CLINICAL_DOC_TYPE_LABELS,
} from '@/lib/types';
import { formatLocalDate } from '@/lib/utils';

interface PageProps {
  params: { episode_id: string };
}

export default function PatientChartPage({ params }: PageProps) {
  const episodeId = params.episode_id;
  const { currentClinic, isEmrMode } = useAuth();

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Top card (episode-level) editing
  const [editingTopCard, setEditingTopCard] = useState(false);
  const [savingTopCard, setSavingTopCard] = useState(false);
  const [topCardDetails, setTopCardDetails] = useState({
    diagnosis: '',
    frequency: '',
  });

  // Patient detail editing
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [patientDetails, setPatientDetails] = useState({
    gender: '',
    insurance_id: '',
    medicaid_id: '',
    allergies: '',
    precautions: '',
    referring_physician: '',
  });

  useEffect(() => {
    if (episodeId) {
      fetchEpisodeDetails();
      fetchDocuments();
    }
  }, [episodeId]);

  const fetchEpisodeDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`);
      if (res.ok) {
        const data = await res.json();
        setEpisode(data);
        setTopCardDetails({
          diagnosis: data.diagnosis || data.primary_diagnosis || '',
          frequency: data.frequency || '',
        });
        setPatientDetails({
          gender: data.gender || '',
          insurance_id: data.insurance_id || '',
          medicaid_id: data.medicaid_id || '',
          allergies: data.allergies || '',
          precautions: data.precautions || '',
          referring_physician: data.referring_physician || '',
        });
      }
    } catch (error) {
      console.error('Error fetching episode:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/documents?episode_id=${episodeId}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments([]);
    }
  };

  const calculateAge = (dob: string | null | undefined): string => {
    if (!dob) return '';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age} years old`;
  };

  const handleSaveTopCard = async () => {
    if (!episodeId) return;
    setSavingTopCard(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topCardDetails),
      });
      if (res.ok) {
        await fetchEpisodeDetails();
        setEditingTopCard(false);
      }
    } catch (error) {
      console.error('Error saving episode details:', error);
    } finally {
      setSavingTopCard(false);
    }
  };

  const handleSavePatientDetails = async () => {
    if (!episode?.patient_id) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/patients/${episode.patient_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientDetails),
      });
      if (res.ok) {
        // Refresh episode data so the header updates too
        await fetchEpisodeDetails();
        setEditingDetails(false);
      }
    } catch (error) {
      console.error('Error saving patient details:', error);
    } finally {
      setSavingDetails(false);
    }
  };

  const getDocTypeIcon = (docType: ClinicalDocType) => {
    switch (docType) {
      case 'evaluation':
      case 're_evaluation':
        return <Stethoscope className="h-4 w-4" />;
      case 'daily_note':
        return <FileText className="h-4 w-4" />;
      case 'progress_summary':
        return <Clock className="h-4 w-4" />;
      case 'discharge_summary':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'final') {
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
          Final
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        Draft
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Caseload
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !episode ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Episode Not Found
              </h3>
              <p className="text-slate-500 mb-6">
                This episode may have been deleted or you don&apos;t have access.
              </p>
              <Link href="/">
                <Button>Return to Home</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Patient Header Card */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">
                      {episode.last_name?.toUpperCase()}, {episode.first_name}
                    </CardTitle>
                    <CardDescription className="mt-2 space-y-1">
                      {episode.date_of_birth && (
                        <p className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          DOB: {formatLocalDate(episode.date_of_birth, 'MM/dd/yyyy')}{' '}
                          ({calculateAge(episode.date_of_birth)})
                        </p>
                      )}
                      {episode.referring_physician && (
                        <p className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Referring: {episode.referring_physician}
                        </p>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        episode.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : episode.status === 'on_hold'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }
                    >
                      {episode.status.charAt(0).toUpperCase() + episode.status.slice(1)}
                    </Badge>
                    {episode.patient_id && (
                      <DeletePatientDialog
                        patientId={episode.patient_id}
                        patientName={`${episode.first_name} ${episode.last_name}`}
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-end mb-2">
                  {!editingTopCard ? (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditingTopCard(true)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingTopCard(false);
                        setTopCardDetails({
                          diagnosis: episode.diagnosis || episode.primary_diagnosis || '',
                          frequency: episode.frequency || '',
                        });
                      }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="gap-1" onClick={handleSaveTopCard} disabled={savingTopCard}>
                        {savingTopCard ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
                {editingTopCard ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="diagnosis">Diagnosis</Label>
                      <Input
                        id="diagnosis"
                        value={topCardDetails.diagnosis}
                        onChange={(e) => setTopCardDetails(prev => ({ ...prev, diagnosis: e.target.value }))}
                        placeholder="e.g., Low back pain with radiculopathy"
                      />
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Start Date</p>
                      <p className="font-medium text-slate-900">
                        {formatLocalDate(episode.start_date, 'MM/dd/yyyy')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="frequency">Frequency</Label>
                      <Select
                        value={topCardDetails.frequency}
                        onValueChange={(value) => setTopCardDetails(prev => ({ ...prev, frequency: value }))}
                      >
                        <SelectTrigger id="frequency">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1x/week">1x/week</SelectItem>
                          <SelectItem value="2x/week">2x/week</SelectItem>
                          <SelectItem value="3x/week">3x/week</SelectItem>
                          <SelectItem value="4x/week">4x/week</SelectItem>
                          <SelectItem value="5x/week">5x/week</SelectItem>
                          <SelectItem value="PRN">PRN</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Diagnosis</p>
                      <p className="font-medium text-slate-900">
                        {episode.diagnosis || episode.primary_diagnosis || 'Not specified'}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Start Date</p>
                      <p className="font-medium text-slate-900">
                        {formatLocalDate(episode.start_date, 'MM/dd/yyyy')}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Frequency</p>
                      <p className="font-medium text-slate-900">
                        {episode.frequency || 'Not specified'}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Patient Details (editable) */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Patient Details</CardTitle>
                  {!editingDetails ? (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditingDetails(true)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingDetails(false);
                        // Reset to current episode data
                        setPatientDetails({
                          gender: episode.gender || '',
                          insurance_id: episode.insurance_id || '',
                          medicaid_id: episode.medicaid_id || '',
                          allergies: episode.allergies || '',
                          precautions: episode.precautions || '',
                          referring_physician: episode.referring_physician || '',
                        });
                      }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="gap-1" onClick={handleSavePatientDetails} disabled={savingDetails}>
                        {savingDetails ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingDetails ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Select
                        value={patientDetails.gender}
                        onValueChange={(value) => setPatientDetails(prev => ({ ...prev, gender: value }))}
                      >
                        <SelectTrigger id="gender">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                          <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="referring_physician">Referring MD</Label>
                      <Input
                        id="referring_physician"
                        value={patientDetails.referring_physician}
                        onChange={(e) => setPatientDetails(prev => ({ ...prev, referring_physician: e.target.value }))}
                        placeholder="e.g., Dr. Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="insurance_id">Insurance ID</Label>
                      <Input
                        id="insurance_id"
                        value={patientDetails.insurance_id}
                        onChange={(e) => setPatientDetails(prev => ({ ...prev, insurance_id: e.target.value }))}
                        placeholder="e.g., BCBS 12345678"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="medicaid_id">Medicaid ID</Label>
                      <Input
                        id="medicaid_id"
                        value={patientDetails.medicaid_id}
                        onChange={(e) => setPatientDetails(prev => ({ ...prev, medicaid_id: e.target.value }))}
                        placeholder="Texas Medicaid member ID"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="allergies">Allergies</Label>
                      <Input
                        id="allergies"
                        value={patientDetails.allergies}
                        onChange={(e) => setPatientDetails(prev => ({ ...prev, allergies: e.target.value }))}
                        placeholder="e.g., NKDA, Penicillin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="precautions">Precautions</Label>
                      <Input
                        id="precautions"
                        value={patientDetails.precautions}
                        onChange={(e) => setPatientDetails(prev => ({ ...prev, precautions: e.target.value }))}
                        placeholder="e.g., Fall risk, WB restrictions"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Gender</p>
                      <p className="text-sm font-medium text-slate-900">{episode.gender || '—'}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Referring MD</p>
                      <p className="text-sm font-medium text-slate-900">{episode.referring_physician || '—'}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Insurance ID</p>
                      <p className="text-sm font-medium text-slate-900">{episode.insurance_id || '—'}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Medicaid ID</p>
                      <p className="text-sm font-medium text-slate-900">{episode.medicaid_id || '—'}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Allergies</p>
                      <p className="text-sm font-medium text-slate-900">{episode.allergies || '—'}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Precautions</p>
                      <p className="text-sm font-medium text-slate-900">{episode.precautions || '—'}</p>
                    </div>
                    {episode.diagnosis_codes && episode.diagnosis_codes.length > 0 && (
                      <div className="p-3 bg-slate-50 rounded-lg md:col-span-4">
                        <p className="text-xs text-slate-500">ICD-10 Codes</p>
                        <p className="text-sm font-medium text-slate-900">{episode.diagnosis_codes.join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents Timeline */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">Documents</CardTitle>
                  </div>
                  {isEmrMode && (
                  <Link href={`/charts/${episodeId}/documents/new`}>
                    <Button size="sm" className="gap-1">
                      <Plus className="h-4 w-4" />
                      Add Document
                    </Button>
                  </Link>
                  )}
                </div>
                <CardDescription>
                  Clinical documentation timeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="mb-4">No documents yet</p>
                    {isEmrMode && (
                    <Link href={`/daily/new?episode_id=${episodeId}`}>
                      <Button variant="outline">Create First Document</Button>
                    </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-slate-100 rounded-lg">
                            {getDocTypeIcon(doc.doc_type)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {CLINICAL_DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                            </p>
                            <p className="text-sm text-slate-500">
                              {formatLocalDate(doc.date_of_service, 'MMMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(doc.status)}
                          <div className="flex gap-1">
                            <Link href={`/notes/${doc.legacy_note_id || doc.id}`}>
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            {doc.status === 'draft' && (
                              <Link href={`/notes/${doc.legacy_note_id || doc.id}`}>
                                <Button variant="ghost" size="icon">
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions (EMR mode only) */}
            {isEmrMode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/charts/${episodeId}/documents/new?type=evaluation`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Stethoscope className="h-4 w-4" />
                      New Evaluation
                    </Button>
                  </Link>
                  <Link href={`/daily/new?episode_id=${episodeId}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileText className="h-4 w-4" />
                      New Daily Note
                    </Button>
                  </Link>
                  <Link href={`/charts/${episodeId}/documents/new?type=discharge_summary`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      New Discharge
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
