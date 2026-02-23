'use client';

import { useEffect, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  AlertCircle,
  Calendar,
  ClipboardList,
  UserPlus,
  ChevronRight,
  Briefcase,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { AssignCareTeamModal } from '@/components/AssignCareTeamModal';
import { Episode, DocumentationAlert } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

export default function FrontOfficePage() {
  const router = useRouter();
  const { currentClinic, loading: authLoading, hasRole } = useAuth();

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [alerts, setAlerts] = useState<DocumentationAlert[]>([]);
  const [todayVisitCount, setTodayVisitCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Assign Care Team modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    id: string;
    patientName: string;
  } | null>(null);

  const canAccess = hasRole(['admin', 'front_office', 'pt']);

  useEffect(() => {
    if (!authLoading && !canAccess) {
      router.replace('/');
    }
  }, [authLoading, canAccess, router]);

  useEffect(() => {
    if (currentClinic?.clinic_id && canAccess) {
      fetchAll(currentClinic.clinic_id);
    }
  }, [currentClinic, canAccess]);

  const fetchAll = async (clinicId: string) => {
    setLoading(true);
    try {
      const [episodesRes, alertsRes, visitsRes] = await Promise.all([
        fetch(`/api/episodes?clinic_id=${clinicId}&status=active`),
        fetch(`/api/alerts?clinic_id=${clinicId}`),
        fetch(
          `/api/visits?clinic_id=${clinicId}&from=${todayStart()}&to=${todayEnd()}`
        ),
      ]);

      if (episodesRes.ok) {
        const data = await episodesRes.json();
        setEpisodes(data);
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data);
      }
      if (visitsRes.ok) {
        const data = await visitsRes.json();
        setTodayVisitCount(Array.isArray(data) ? data.length : 0);
      }
    } catch (error) {
      console.error('Error fetching front office data:', error);
    } finally {
      setLoading(false);
    }
  };

  const todayStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const todayEnd = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  const unassignedCount = episodes.filter(
    (e) => !e.primary_pt_id && (!e.care_team_ids || e.care_team_ids.length === 0)
  ).length;

  const openAssignModal = (episode: Episode) => {
    setSelectedEpisode({
      id: episode.id,
      patientName: `${episode.first_name} ${episode.last_name}`,
    });
    setAssignModalOpen(true);
  };

  if (authLoading || !canAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!authLoading && !canAccess ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
                <p className="text-lg font-medium text-slate-900">Access Denied</p>
                <p className="text-sm text-slate-500 mt-1">
                  You do not have permission to view the Front Office dashboard.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          )}
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
          <div className="flex items-center gap-3">
            <Briefcase className="h-7 w-7 text-slate-700" />
            <h1 className="text-3xl font-bold text-slate-900">Front Office</h1>
          </div>
          <p className="text-slate-600 mt-1">
            Clinic-wide caseload, assignments, and scheduling overview
          </p>
          <p className="text-sm text-emerald-600 mt-1 font-medium">
            {currentClinic?.clinic_name}
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Snapshot Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Today's Visits */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Today&apos;s Visits
                      </p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">
                        {todayVisitCount}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Documentation Alerts */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Doc Alerts
                      </p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">
                        {alerts.length}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-amber-50 flex items-center justify-center">
                      <AlertCircle className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Caseload */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Active Caseload
                      </p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">
                        {episodes.length}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <Users className="h-6 w-6 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Unassigned Cases */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Unassigned
                      </p>
                      <p className="text-3xl font-bold text-slate-900 mt-1">
                        {unassignedCount}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-red-50 flex items-center justify-center">
                      <UserPlus className="h-6 w-6 text-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Caseload Table ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-slate-600" />
                    <CardTitle className="text-lg">Caseload</CardTitle>
                  </div>
                  <Badge variant="outline">{episodes.length} patients</Badge>
                </div>
                <CardDescription>
                  All active episodes in {currentClinic?.clinic_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {episodes.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No active episodes</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Assigned PT</TableHead>
                          <TableHead>Diagnosis</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {episodes.map((episode) => (
                          <TableRow key={episode.id}>
                            <TableCell className="font-medium">
                              {episode.last_name?.toUpperCase()},{' '}
                              {episode.first_name}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200"
                              >
                                Active
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {episode.primary_pt_id ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 border-emerald-200"
                                >
                                  Assigned
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-red-50 text-red-600 border-red-200"
                                >
                                  Unassigned
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-slate-600">
                              {episode.diagnosis ||
                                episode.primary_diagnosis ||
                                '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => openAssignModal(episode)}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Assign</span>
                                </Button>
                                <Link href={`/charts/${episode.id}`}>
                                  <Button size="sm" variant="ghost" className="gap-1">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Chart</span>
                                  </Button>
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Scheduling Panel (scaffold) ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">Schedule</CardTitle>
                </div>
                <CardDescription>
                  Integration-ready scheduling panel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Google Calendar */}
                  <div className="p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">
                      Google Calendar
                    </p>
                    <p className="text-xs text-slate-500 mt-1 mb-3">
                      Sync appointments from Google Calendar
                    </p>
                    <Button variant="outline" size="sm" disabled>
                      Connect (Coming Soon)
                    </Button>
                  </div>

                  {/* Buckeye Scheduler */}
                  <div className="p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">
                      Buckeye Scheduler
                    </p>
                    <p className="text-xs text-slate-500 mt-1 mb-3">
                      Sync from Buckeye Scheduler app
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-slate-300" />
                      <span className="text-xs text-slate-500">Not Connected</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Assign Care Team Modal */}
      {selectedEpisode && currentClinic?.clinic_id && (
        <AssignCareTeamModal
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          episodeId={selectedEpisode.id}
          patientName={selectedEpisode.patientName}
          clinicId={currentClinic.clinic_id}
          onSaved={() => {
            if (currentClinic.clinic_id) {
              fetchAll(currentClinic.clinic_id);
            }
          }}
        />
      )}
    </div>
  );
}
