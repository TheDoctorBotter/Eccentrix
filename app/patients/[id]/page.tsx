'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  Phone,
  Mail,
  Calendar,
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  FileText,
  FilePlus,
  Copy,
  Plus,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { PatientInsuranceSection } from '@/components/billing/PatientInsuranceSection';
import { PriorAuthSection } from '@/components/billing/PriorAuthSection';
import { BCBSPatientSection } from '@/components/bcbs/BCBSPatientSection';
import { Patient, Visit, Note, APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS, Discipline, DISCIPLINE_LABELS, DISCIPLINE_COLORS, resolveDiscipline } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/phone-utils';
import { toast } from 'sonner';

export default function PatientRecordPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Visit[]>([]);
  const [notesByVisit, setNotesByVisit] = useState<Record<string, Note>>({});
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch patient details
        const patientRes = await fetch(`/api/patients/${patientId}`);
        if (!patientRes.ok) {
          setError('Patient not found');
          return;
        }
        const patientData = await patientRes.json();
        setPatient(patientData);

        // Fetch active episode and visits for this patient
        if (patientData.clinic_id) {
          const [episodesRes, visitsRes] = await Promise.all([
            fetch(`/api/episodes?patient_id=${patientId}&clinic_id=${patientData.clinic_id}&status=active`),
            fetch(`/api/visits?clinic_id=${patientData.clinic_id}`),
          ]);
          if (episodesRes.ok) {
            const episodesData = await episodesRes.json();
            if (Array.isArray(episodesData) && episodesData.length > 0) {
              setActiveEpisodeId(episodesData[0].id);
            }
          }
          if (visitsRes.ok) {
            const visitsData: Visit[] = await visitsRes.json();
            const patientVisits = visitsData.filter((v) => v.patient_id === patientId);
            setAppointments(patientVisits);
          }
        }

        // Fetch notes for this patient to map visit_id -> note
        const notesRes = await fetch(`/api/notes?patient_id=${patientId}`);
        if (notesRes.ok) {
          const notesData: Note[] = await notesRes.json();
          const map: Record<string, Note> = {};
          for (const note of notesData) {
            if (note.visit_id) {
              // Keep the most recent note per visit
              if (!map[note.visit_id] || new Date(note.created_at) > new Date(map[note.visit_id].created_at)) {
                map[note.visit_id] = note;
              }
            }
          }
          setNotesByVisit(map);
        }
      } catch {
        setError('Failed to load patient record');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [patientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-[300px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Button variant="ghost" className="mb-4 gap-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-700">
                {error || 'Patient not found'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Patient Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {patient.first_name} {patient.last_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {patient.date_of_birth && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  DOB: {formatLocalDate(patient.date_of_birth, 'MM/dd/yyyy')}
                </div>
              )}
              {patient.primary_diagnosis && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  {patient.primary_diagnosis}
                </div>
              )}
              {/* Caregiver phone */}
              {patient.caregiver_phone ? (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <a
                    href={`tel:${patient.caregiver_phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {formatPhoneDisplay(patient.caregiver_phone)}
                  </a>
                  {patient.caregiver_name && (
                    <span className="text-slate-500">{patient.caregiver_name}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(formatPhoneDisplay(patient.caregiver_phone!));
                      toast.success('Phone number copied');
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Copy phone number"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : patient.phone ? (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <a
                    href={`tel:${patient.phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {formatPhoneDisplay(patient.phone)}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(formatPhoneDisplay(patient.phone!));
                      toast.success('Phone number copied');
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Copy phone number"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Phone className="h-4 w-4" />
                  No phone number on file
                  <Link href={`/patients/${patientId}/edit`} className="text-blue-600 hover:underline text-xs flex items-center gap-0.5">
                    <Plus className="h-3 w-3" />
                    Add
                  </Link>
                </div>
              )}
              {/* Patient phone (if caregiver phone is also present) */}
              {patient.caregiver_phone && patient.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <a
                    href={`tel:${patient.phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {formatPhoneDisplay(patient.phone)}
                  </a>
                  <span className="text-slate-500">patient</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(formatPhoneDisplay(patient.phone!));
                      toast.success('Phone number copied');
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Copy phone number"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" />
                  {patient.email}
                </div>
              )}
            </div>
            {patient.medicaid_id && (
              <div className="mt-3 text-sm">
                <span className="font-medium text-slate-700">Medicaid ID:</span>{' '}
                <span className="text-slate-600">{patient.medicaid_id}</span>
              </div>
            )}
            {patient.payer_type && (
              <div className="mt-1 text-sm">
                <span className="font-medium text-slate-700">Payer Type:</span>{' '}
                <Badge variant="outline" className="ml-1 text-xs">
                  {patient.payer_type === 'eci' ? 'ECI (Early Childhood Intervention)'
                    : patient.payer_type === 'self_pay' ? 'Self Pay'
                    : patient.payer_type === 'private_insurance' ? 'Private Insurance'
                    : patient.payer_type === 'tricare' ? 'TRICARE'
                    : patient.payer_type === 'chip' ? 'CHIP'
                    : patient.payer_type.charAt(0).toUpperCase() + patient.payer_type.slice(1)}
                </Badge>
              </div>
            )}
            {patient.allergies && (
              <div className="mt-3 text-sm">
                <span className="font-medium text-red-600">Allergies:</span>{' '}
                <span className="text-slate-600">{patient.allergies}</span>
              </div>
            )}
            {patient.precautions && (
              <div className="mt-1 text-sm">
                <span className="font-medium text-amber-600">Precautions:</span>{' '}
                <span className="text-slate-600">{patient.precautions}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insurance & Prior Auth */}
        {patient.clinic_id && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PatientInsuranceSection patientId={patientId} clinicId={patient.clinic_id} />
            <PriorAuthSection patientId={patientId} clinicId={patient.clinic_id} episodeId={activeEpisodeId} />
          </div>
        )}

        {/* BCBS Visit Benefits — only for BCBS patients */}
        {patient.clinic_id && patient.payer_type === 'bcbs_tx' && (
          <BCBSPatientSection patientId={patientId} clinicId={patient.clinic_id} />
        )}

        {/* Visit History — grouped by discipline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Visit History</CardTitle>
          </CardHeader>
          <CardContent>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No visits found
              </p>
            ) : (
              <div className="space-y-6">
                {(['PT', 'OT', 'ST'] as Discipline[]).map((disc) => {
                  const discAppts = appointments.filter((a) => resolveDiscipline(a.discipline) === disc);
                  if (discAppts.length === 0) return null;
                  return (
                    <div key={disc}>
                      <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${DISCIPLINE_COLORS[disc].text}`}>
                        <span className={`inline-block w-2.5 h-2.5 rounded-sm ${DISCIPLINE_COLORS[disc].bg} border ${DISCIPLINE_COLORS[disc].border}`} />
                        {DISCIPLINE_LABELS[disc]} Visits ({discAppts.length})
                      </h3>
                      <div className="space-y-3">
                {discAppts.map((appt) => {
                  const note = notesByVisit[appt.id];
                  const isCompleted = appt.status === 'completed';
                  const noteStatus = note
                    ? (note.status === 'final' ? 'Final' : 'Draft')
                    : (isCompleted ? 'Missing' : null);

                  return (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {formatLocalDate(appt.start_time, 'MMM d, yyyy')} at{' '}
                          {formatLocalDate(appt.start_time, 'h:mm a')}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span className="capitalize">{(appt.visit_type || 'treatment').replace('_', ' ')}</span>
                          {appt.location ? ` — ${appt.location}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* SOAP note indicator */}
                        {noteStatus && (
                          <Badge
                            variant="outline"
                            className={
                              noteStatus === 'Final'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : noteStatus === 'Draft'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {noteStatus}
                          </Badge>
                        )}
                        {/* Status badge */}
                        <Badge
                          variant="outline"
                          className={APPOINTMENT_STATUS_COLORS[appt.status] || ''}
                        >
                          {APPOINTMENT_STATUS_LABELS[appt.status] || appt.status}
                        </Badge>
                        {/* Open/Create Note button */}
                        {note ? (
                          <Link href={`/notes/${note.id}`}>
                            <Button variant="ghost" size="sm" className="gap-1 text-xs">
                              <FileText className="h-3.5 w-3.5" />
                              Open Note
                            </Button>
                          </Link>
                        ) : isCompleted ? (
                          <Link href={`/daily/new?visit_id=${appt.id}`}>
                            <Button variant="ghost" size="sm" className="gap-1 text-xs">
                              <FilePlus className="h-3.5 w-3.5" />
                              Create Note
                            </Button>
                          </Link>
                        ) : null}
                        {appt.episode_id && (
                          <Link href={`/charts/${appt.episode_id}`}>
                            <Button variant="ghost" size="sm" className="gap-1">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Chart
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
