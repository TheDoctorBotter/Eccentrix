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
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { Patient, Visit, APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from '@/lib/types';
import { format, parseISO } from 'date-fns';

export default function PatientRecordPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Visit[]>([]);
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

        // Fetch visits for this patient
        if (patientData.clinic_id) {
          const visitsRes = await fetch(
            `/api/visits?clinic_id=${patientData.clinic_id}`
          );
          if (visitsRes.ok) {
            const visitsData: Visit[] = await visitsRes.json();
            setAppointments(
              visitsData.filter((v) => v.patient_id === patientId)
            );
          }
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
              {patient.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {patient.phone}
                </div>
              )}
              {patient.email && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" />
                  {patient.email}
                </div>
              )}
              {patient.date_of_birth && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  DOB: {format(parseISO(patient.date_of_birth), 'MM/dd/yyyy')}
                </div>
              )}
              {patient.primary_diagnosis && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  {patient.primary_diagnosis}
                </div>
              )}
            </div>
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

        {/* Appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No appointments found
              </p>
            ) : (
              <div className="space-y-3">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {format(parseISO(appt.start_time), 'MMM d, yyyy')} at{' '}
                        {format(parseISO(appt.start_time), 'h:mm a')}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {appt.visit_type || 'Treatment'}
                        {appt.location ? ` — ${appt.location}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={APPOINTMENT_STATUS_COLORS[appt.status] || ''}
                      >
                        {APPOINTMENT_STATUS_LABELS[appt.status] || appt.status}
                      </Badge>
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
