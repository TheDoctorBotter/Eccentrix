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
import {
  AlertCircle,
  Bell,
  Users,
  ChevronRight,
  Calendar,
  Stethoscope,
  Plus,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import {
  Episode,
  DocumentationAlert,
} from '@/lib/types';
import { format } from 'date-fns';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { currentClinic, loading: authLoading } = useAuth();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [alerts, setAlerts] = useState<DocumentationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Homepage useEffect - currentClinic:', currentClinic);
    console.log('Homepage useEffect - authLoading:', authLoading);
    if (currentClinic?.clinic_id) {
      console.log('Fetching caseload for clinic:', currentClinic.clinic_id);
      fetchCaseload(currentClinic.clinic_id);
      fetchAlerts(currentClinic.clinic_id);
    } else {
      console.log('Not fetching - currentClinic or clinic_id is null');
    }
  }, [currentClinic]);

  const fetchCaseload = async (clinicId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/episodes?clinic_id=${clinicId}&status=active`);
      if (res.ok) {
        const data = await res.json();
        setEpisodes(data);
      }
    } catch (error) {
      console.error('Error fetching caseload:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async (clinicId: string) => {
    try {
      const res = await fetch(`/api/alerts?clinic_id=${clinicId}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setAlerts([]);
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
    return `${age}y`;
  };

  const seedDemoData = async () => {
    try {
      const res = await fetch('/api/seed-emr', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      } else {
        const error = await res.json();
        alert(`Failed to seed data: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error seeding data:', error);
      alert('Failed to seed demo data');
    }
  };

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Buckeye EMR</h1>
          <p className="text-slate-600 mt-1">
            Secure clinical documentation and patient chart management
          </p>
          <p className="text-sm text-emerald-600 mt-2 font-medium">
            {currentClinic.clinic_name}
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Alerts Box */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-amber-500" />
                    <CardTitle className="text-lg">Alerts</CardTitle>
                  </div>
                  {alerts.length > 0 && (
                    <Badge variant="destructive">{alerts.length}</Badge>
                  )}
                </div>
                <CardDescription>Documentation due today</CardDescription>
              </CardHeader>
              <CardContent>
                {alerts.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p>No alerts due today</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <AlertCircle className="h-5 w-5 text-amber-500" />
                          <div>
                            <p className="font-medium text-slate-900">
                              {alert.patient_name}
                            </p>
                            <p className="text-sm text-amber-700">
                              {alert.alert_message}
                            </p>
                          </div>
                        </div>
                        <Link href={`/charts/${alert.episode_id}`}>
                          <Button size="sm" variant="outline">
                            Open Chart
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Caseload Box */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">Caseload</CardTitle>
                  </div>
                  <Link href="/patients/new">
                    <Button size="sm" className="gap-1">
                      <Plus className="h-4 w-4" />
                      Add Patient
                    </Button>
                  </Link>
                </div>
                <CardDescription>
                  Active patients • {episodes.length} total
                </CardDescription>
              </CardHeader>
              <CardContent>
                {episodes.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="mb-4">No active patients yet</p>
                    <Link href="/patients/new">
                      <Button variant="outline">Add Your First Patient</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {episodes.map((episode) => (
                      <Link
                        key={episode.id}
                        href={`/charts/${episode.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 hover:border-emerald-200 transition-colors cursor-pointer">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <p className="font-semibold text-slate-900">
                                {episode.last_name?.toUpperCase()},{' '}
                                {episode.first_name}
                              </p>
                              {episode.date_of_birth && (
                                <span className="text-sm text-slate-500">
                                  DOB: {format(new Date(episode.date_of_birth), 'MM/dd/yyyy')}
                                  {' '}({calculateAge(episode.date_of_birth)})
                                </span>
                              )}
                            </div>
                            {(episode.diagnosis || episode.primary_diagnosis) && (
                              <p className="text-sm text-slate-600 mt-1">
                                {episode.diagnosis || episode.primary_diagnosis}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              Active
                            </Badge>
                            <ChevronRight className="h-5 w-5 text-slate-400" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Future integration note */}
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Future: schedule integration to sync visits and due documentation.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Dev Seed Data Button */}
            {episodes.length === 0 && (
              <div className="text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={seedDemoData}
                  className="text-slate-500"
                >
                  Seed Demo Data
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
