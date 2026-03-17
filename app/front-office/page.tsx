'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
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
  ChevronDown,
  Briefcase,
  Loader2,
  ExternalLink,
  X,
  UserCog,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { AssignCareTeamModal } from '@/components/AssignCareTeamModal';
import { Episode, DocumentationAlert } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

// ── Types for staff & care team data ──

interface StaffMember {
  user_id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  credentials?: string | null;
  role: string;
}

interface CareTeamMember {
  id: string;
  episode_id: string;
  user_id: string;
  role: string; // pt, pta, ot, ota, slp, slpa
  assigned_at: string;
}

// ── Credential badge color mapping ──

const CREDENTIAL_BADGE_STYLE: Record<string, string> = {
  PT: 'bg-blue-100 text-blue-700 border-blue-200',
  DPT: 'bg-blue-100 text-blue-700 border-blue-200',
  PTA: 'bg-sky-100 text-sky-700 border-sky-200',
  OT: 'bg-green-100 text-green-700 border-green-200',
  OTR: 'bg-green-100 text-green-700 border-green-200',
  COTA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  OTA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  SLP: 'bg-purple-100 text-purple-700 border-purple-200',
  'CCC-SLP': 'bg-purple-100 text-purple-700 border-purple-200',
  SLPA: 'bg-violet-100 text-violet-700 border-violet-200',
};

function getCredentialBadgeStyle(credentials: string | null | undefined): string {
  if (!credentials) return 'bg-slate-100 text-slate-600 border-slate-200';
  const cred = credentials.trim().toUpperCase().split(/[,\s/]+/)[0];
  return CREDENTIAL_BADGE_STYLE[cred] || 'bg-slate-100 text-slate-600 border-slate-200';
}

// Primary discipline badge styles (used in the therapist column)
const DISCIPLINE_BADGE_STYLE: Record<string, string> = {
  PT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OT: 'bg-amber-50 text-amber-700 border-amber-200',
  SLP: 'bg-rose-50 text-rose-700 border-rose-200',
};

// Assistant roles for filtering
const ASSISTANT_ROLES = new Set(['pta', 'ota', 'slpa']);

// ── Filter chip value: either a user_id or special string ──
const FILTER_ALL = '__all__';
const FILTER_UNASSIGNED = '__unassigned__';

export default function FrontOfficePage() {
  const router = useRouter();
  const { currentClinic, loading: authLoading, hasRole } = useAuth();

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [alerts, setAlerts] = useState<DocumentationAlert[]>([]);
  const [todayVisitCount, setTodayVisitCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Staff data: full list from clinic memberships
  const [clinicStaff, setClinicStaff] = useState<StaffMember[]>([]);
  // Map userId → display_name for quick lookup
  const [providerNames, setProviderNames] = useState<Map<string, string>>(new Map());
  // Map userId → credentials
  const [providerCredentials, setProviderCredentials] = useState<Map<string, string>>(new Map());
  // Care team members for all active episodes: Map<episodeId, CareTeamMember[]>
  const [careTeamMap, setCareTeamMap] = useState<Map<string, CareTeamMember[]>>(new Map());

  // Filter state
  const [primaryFilter, setPrimaryFilter] = useState<string>(FILTER_ALL);
  const [assistantFilter, setAssistantFilter] = useState<string>(FILTER_ALL);

  // Quick-assign popover state
  const [quickAssignEpisodeId, setQuickAssignEpisodeId] = useState<string | null>(null);
  const [quickAssignSaving, setQuickAssignSaving] = useState(false);
  const quickAssignRef = useRef<HTMLDivElement>(null);

  // Assign Care Team modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    id: string;
    patientId: string;
    patientName: string;
  } | null>(null);

  const canAccess = hasRole(['admin', 'front_office', 'pt', 'ot', 'slp']);

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

  // Close quick-assign popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickAssignRef.current && !quickAssignRef.current.contains(e.target as Node)) {
        setQuickAssignEpisodeId(null);
      }
    };
    if (quickAssignEpisodeId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [quickAssignEpisodeId]);

  const fetchAll = async (clinicId: string) => {
    setLoading(true);
    try {
      const [episodesRes, alertsRes, visitsRes, staffRes] = await Promise.all([
        fetch(`/api/episodes?clinic_id=${clinicId}&status=active`),
        fetch(`/api/alerts?clinic_id=${clinicId}`),
        fetch(
          `/api/visits?clinic_id=${clinicId}&from=${todayStart()}&to=${todayEnd()}`
        ),
        fetch(`/api/user/membership?clinic_id=${clinicId}`),
      ]);

      let episodeData: Episode[] = [];

      if (episodesRes.ok) {
        episodeData = await episodesRes.json();
        setEpisodes(episodeData);
      }

      // Process staff data
      if (staffRes.ok) {
        const staffData: StaffMember[] = await staffRes.json();
        setClinicStaff(staffData);

        const nameMap = new Map<string, string>();
        const credMap = new Map<string, string>();
        for (const s of staffData) {
          if (s.display_name && s.display_name !== s.user_id?.slice(0, 8) + '...') {
            nameMap.set(s.user_id, s.display_name);
          }
          if (s.credentials) {
            credMap.set(s.user_id, s.credentials);
          }
        }
        setProviderNames(nameMap);
        setProviderCredentials(credMap);
      }

      // Fetch care team members for all active episodes
      if (episodeData.length > 0) {
        const teamMap = new Map<string, CareTeamMember[]>();
        // Batch fetch all care teams (parallel, max 10 concurrent)
        const batchSize = 10;
        for (let i = 0; i < episodeData.length; i += batchSize) {
          const batch = episodeData.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map((ep) =>
              fetch(`/api/care-team?episode_id=${ep.id}`)
                .then((r) => (r.ok ? r.json() : []))
                .catch(() => [])
            )
          );
          for (let j = 0; j < batch.length; j++) {
            teamMap.set(batch[j].id, results[j]);
          }
        }
        setCareTeamMap(teamMap);
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
    (e) => !e.primary_pt_id && !e.primary_ot_id && !e.primary_slp_id
  ).length;

  // ── Compute unique therapists for filter chips ──

  const uniquePrimaryTherapists = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ep of episodes) {
      for (const id of [ep.primary_pt_id, ep.primary_ot_id, ep.primary_slp_id]) {
        if (id && !seen.has(id)) {
          seen.set(id, providerNames.get(id) || id.slice(0, 8));
        }
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [episodes, providerNames]);

  const uniqueAssistantTherapists = useMemo(() => {
    const seen = new Map<string, string>();
    careTeamMap.forEach((members) => {
      for (const m of members) {
        if (ASSISTANT_ROLES.has(m.role) && !seen.has(m.user_id)) {
          seen.set(m.user_id, providerNames.get(m.user_id) || m.user_id.slice(0, 8));
        }
      }
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [careTeamMap, providerNames]);

  // ── Helper to get assistants for an episode ──

  const getAssistantsForEpisode = (episodeId: string): CareTeamMember[] => {
    const team = careTeamMap.get(episodeId) || [];
    return team.filter((m) => ASSISTANT_ROLES.has(m.role));
  };

  // ── Filter episodes ──

  const filteredEpisodes = useMemo(() => {
    return episodes.filter((ep) => {
      // Primary therapist filter
      if (primaryFilter !== FILTER_ALL) {
        const hasPrimary =
          ep.primary_pt_id === primaryFilter ||
          ep.primary_ot_id === primaryFilter ||
          ep.primary_slp_id === primaryFilter;
        if (!hasPrimary) return false;
      }

      // Assistant filter
      if (assistantFilter !== FILTER_ALL) {
        const assistants = getAssistantsForEpisode(ep.id);
        if (assistantFilter === FILTER_UNASSIGNED) {
          if (assistants.length > 0) return false;
        } else {
          if (!assistants.some((a) => a.user_id === assistantFilter)) return false;
        }
      }

      return true;
    });
  }, [episodes, primaryFilter, assistantFilter, careTeamMap]);

  const hasActiveFilter = primaryFilter !== FILTER_ALL || assistantFilter !== FILTER_ALL;

  // ── Quick-assign assistant ──

  const assistantStaff = useMemo(() => {
    return clinicStaff.filter((s) => ASSISTANT_ROLES.has(s.role));
  }, [clinicStaff]);

  const handleQuickAssign = async (episodeId: string, userId: string) => {
    setQuickAssignSaving(true);
    try {
      // Determine the assistant role based on staff membership role
      const staff = clinicStaff.find((s) => s.user_id === userId);
      const role = staff?.role || 'pta';

      await fetch('/api/care-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: episodeId, user_id: userId, role }),
      });

      toast.success('Assistant assigned');
      setQuickAssignEpisodeId(null);
      if (currentClinic?.clinic_id) {
        fetchAll(currentClinic.clinic_id);
      }
    } catch {
      toast.error('Failed to assign assistant');
    } finally {
      setQuickAssignSaving(false);
    }
  };

  const handleRemoveAssistant = async (episodeId: string, userId: string) => {
    setQuickAssignSaving(true);
    try {
      await fetch('/api/care-team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: episodeId, user_id: userId }),
      });

      toast.success('Assistant removed');
      setQuickAssignEpisodeId(null);
      if (currentClinic?.clinic_id) {
        fetchAll(currentClinic.clinic_id);
      }
    } catch {
      toast.error('Failed to remove assistant');
    } finally {
      setQuickAssignSaving(false);
    }
  };

  const openAssignModal = (episode: Episode) => {
    setSelectedEpisode({
      id: episode.id,
      patientId: episode.patient_id,
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

            {/* ── Caseload Filter Bar ── */}
            {episodes.length > 0 && (
              <Card>
                <CardContent className="py-4">
                  <div className="space-y-3">
                    {/* ROW 1: Primary Therapist Filter */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-600 w-20 shrink-0">
                        Therapist
                      </span>
                      <button
                        onClick={() => setPrimaryFilter(FILTER_ALL)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                          primaryFilter === FILTER_ALL
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        All
                      </button>
                      {uniquePrimaryTherapists.map(([userId, name]) => (
                        <button
                          key={userId}
                          onClick={() => setPrimaryFilter(userId)}
                          className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                            primaryFilter === userId
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>

                    {/* ROW 2: Assistant Therapist Filter */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-600 w-20 shrink-0">
                        Assistant
                      </span>
                      <button
                        onClick={() => setAssistantFilter(FILTER_ALL)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                          assistantFilter === FILTER_ALL
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        All
                      </button>
                      {uniqueAssistantTherapists.map(([userId, name]) => (
                        <button
                          key={userId}
                          onClick={() => setAssistantFilter(userId)}
                          className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                            assistantFilter === userId
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                      <button
                        onClick={() => setAssistantFilter(FILTER_UNASSIGNED)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                          assistantFilter === FILTER_UNASSIGNED
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Unassigned
                      </button>
                    </div>

                    {/* Clear Filters */}
                    {hasActiveFilter && (
                      <div className="flex items-center pt-1">
                        <button
                          onClick={() => {
                            setPrimaryFilter(FILTER_ALL);
                            setAssistantFilter(FILTER_ALL);
                          }}
                          className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                        >
                          <X className="h-3 w-3" />
                          Clear Filters
                        </button>
                        <span className="text-xs text-slate-400 ml-3">
                          Showing {filteredEpisodes.length} of {episodes.length} patients
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Caseload Table ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-slate-600" />
                    <CardTitle className="text-lg">Caseload</CardTitle>
                  </div>
                  <Badge variant="outline">
                    {hasActiveFilter
                      ? `${filteredEpisodes.length} of ${episodes.length} patients`
                      : `${episodes.length} patients`}
                  </Badge>
                </div>
                <CardDescription>
                  All active episodes in {currentClinic?.clinic_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredEpisodes.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>{hasActiveFilter ? 'No patients match current filters' : 'No active episodes'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Assigned Therapists</TableHead>
                          <TableHead>Diagnosis</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEpisodes.map((episode) => {
                          const assistants = getAssistantsForEpisode(episode.id);

                          return (
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
                                <div className="space-y-1.5">
                                  {/* Primary therapists */}
                                  {(() => {
                                    const primaries: { label: string; id: string; style: string }[] = [];
                                    if (episode.primary_pt_id)
                                      primaries.push({ label: 'PT', id: episode.primary_pt_id, style: DISCIPLINE_BADGE_STYLE.PT });
                                    if (episode.primary_ot_id)
                                      primaries.push({ label: 'OT', id: episode.primary_ot_id, style: DISCIPLINE_BADGE_STYLE.OT });
                                    if (episode.primary_slp_id)
                                      primaries.push({ label: 'SLP', id: episode.primary_slp_id, style: DISCIPLINE_BADGE_STYLE.SLP });

                                    return primaries.length > 0 ? (
                                      <div className="flex flex-wrap items-center gap-1">
                                        {primaries.map((p) => {
                                          const name = providerNames.get(p.id) || '';
                                          const cred = providerCredentials.get(p.id);
                                          const credStyle = cred ? getCredentialBadgeStyle(cred) : p.style;
                                          return (
                                            <Badge
                                              key={p.label}
                                              variant="outline"
                                              className={credStyle}
                                            >
                                              {p.label}{name ? `: ${name}` : ''}
                                            </Badge>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="bg-red-50 text-red-600 border-red-200"
                                      >
                                        Unassigned
                                      </Badge>
                                    );
                                  })()}

                                  {/* Assistant therapists */}
                                  {assistants.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {assistants.map((a) => {
                                        const name = providerNames.get(a.user_id) || a.user_id.slice(0, 8);
                                        const cred = providerCredentials.get(a.user_id);
                                        const credStyle = getCredentialBadgeStyle(cred);
                                        const roleLabel = a.role.toUpperCase();
                                        return (
                                          <Badge
                                            key={a.user_id}
                                            variant="outline"
                                            className={`text-xs ${credStyle}`}
                                          >
                                            {roleLabel}: {name}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">
                                      No assistant assigned
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm text-slate-600">
                                {episode.diagnosis ||
                                  episode.primary_diagnosis ||
                                  '\u2014'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Quick-assign assistant button */}
                                  <div className="relative" ref={quickAssignEpisodeId === episode.id ? quickAssignRef : undefined}>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1 text-xs"
                                      onClick={() =>
                                        setQuickAssignEpisodeId(
                                          quickAssignEpisodeId === episode.id ? null : episode.id
                                        )
                                      }
                                    >
                                      <UserCog className="h-3.5 w-3.5" />
                                      <span className="hidden sm:inline">
                                        {assistants.length > 0 ? 'Change' : '+ Assistant'}
                                      </span>
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>

                                    {/* Quick-assign dropdown */}
                                    {quickAssignEpisodeId === episode.id && (
                                      <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 z-50 py-1 max-h-64 overflow-y-auto">
                                        <p className="px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-100">
                                          Assign Assistant
                                        </p>
                                        {quickAssignSaving ? (
                                          <div className="flex items-center justify-center py-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                          </div>
                                        ) : (
                                          <>
                                            {assistantStaff.map((staff) => {
                                              const isAssigned = assistants.some(
                                                (a) => a.user_id === staff.user_id
                                              );
                                              return (
                                                <button
                                                  key={staff.user_id}
                                                  onClick={() => {
                                                    if (isAssigned) {
                                                      handleRemoveAssistant(episode.id, staff.user_id);
                                                    } else {
                                                      handleQuickAssign(episode.id, staff.user_id);
                                                    }
                                                  }}
                                                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-slate-50 transition-colors ${
                                                    isAssigned ? 'bg-slate-50' : ''
                                                  }`}
                                                >
                                                  <span className={isAssigned ? 'font-medium' : ''}>
                                                    {staff.display_name || staff.user_id.slice(0, 8)}
                                                  </span>
                                                  <span className="flex items-center gap-1">
                                                    <Badge
                                                      variant="outline"
                                                      className={`text-xs ${getCredentialBadgeStyle(staff.credentials)}`}
                                                    >
                                                      {staff.credentials?.trim().toUpperCase() || staff.role.toUpperCase()}
                                                    </Badge>
                                                    {isAssigned && (
                                                      <span className="text-xs text-red-500 ml-1">
                                                        Remove
                                                      </span>
                                                    )}
                                                  </span>
                                                </button>
                                              );
                                            })}
                                            {/* Remove all assistants option */}
                                            {assistants.length > 0 && (
                                              <>
                                                <div className="border-t border-slate-100 my-1" />
                                                {assistants.map((a) => (
                                                  <button
                                                    key={`remove-${a.user_id}`}
                                                    onClick={() => handleRemoveAssistant(episode.id, a.user_id)}
                                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                  >
                                                    Remove {providerNames.get(a.user_id) || 'assistant'}
                                                  </button>
                                                ))}
                                              </>
                                            )}
                                            {assistantStaff.length === 0 && (
                                              <p className="px-3 py-3 text-xs text-slate-400">
                                                No PTA/COTA/SLPA staff in this clinic
                                              </p>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>

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
                          );
                        })}
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

                  {/* Eccentrix Scheduler */}
                  <div className="p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">
                      Eccentrix Scheduler
                    </p>
                    <p className="text-xs text-slate-500 mt-1 mb-3">
                      Sync from Eccentrix Scheduler
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
          patientId={selectedEpisode.patientId}
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
