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
  Archive,
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  Users,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { format } from 'date-fns';

interface ArchivedEpisode {
  id: string;
  patient_id: string;
  clinic_id: string;
  start_date: string | null;
  end_date: string | null;
  diagnosis: string | null;
  discharge_reason: string | null;
  discharged_at: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  primary_diagnosis: string | null;
}

interface GroupedArchive {
  label: string; // e.g. "2026 / 02"
  sortKey: string; // e.g. "2026-02"
  episodes: ArchivedEpisode[];
}

function groupByMonth(episodes: ArchivedEpisode[]): GroupedArchive[] {
  const groups: Record<string, ArchivedEpisode[]> = {};

  for (const ep of episodes) {
    const date = ep.discharged_at || ep.end_date || ep.start_date;
    if (!date) {
      const key = 'Unknown';
      (groups[key] ||= []).push(ep);
      continue;
    }
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (groups[key] ||= []).push(ep);
  }

  return Object.entries(groups)
    .map(([sortKey, episodes]) => ({
      label: sortKey === 'Unknown' ? 'Unknown Date' : `${sortKey.slice(0, 4)} / ${sortKey.slice(5)}`,
      sortKey,
      episodes,
    }))
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export default function ArchivedPage() {
  const { currentClinic, loading: authLoading } = useAuth();
  const [episodes, setEpisodes] = useState<ArchivedEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentClinic?.clinic_id) {
      fetchArchived(currentClinic.clinic_id);
    }
  }, [currentClinic]);

  const fetchArchived = async (clinicId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/episodes?clinic_id=${clinicId}&status=discharged`);
      if (res.ok) {
        setEpisodes(await res.json());
      }
    } catch (error) {
      console.error('Error fetching archived episodes:', error);
    } finally {
      setLoading(false);
    }
  };

  const grouped = groupByMonth(episodes);

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="mb-4 gap-2 text-slate-600"
        >
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Archive className="h-6 w-6 text-slate-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Archived Charts</h1>
          </div>
          <p className="text-slate-600">
            Discharged episodes grouped by month
          </p>
          <p className="text-sm text-emerald-600 mt-1 font-medium">
            {currentClinic.clinic_name}
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : episodes.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-slate-500">
                <Archive className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No archived charts</p>
                <p className="text-sm mt-1">
                  Discharged episodes will appear here grouped by month.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <Card key={group.sortKey}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-slate-500" />
                      <CardTitle className="text-lg">{group.label}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-slate-500">
                      {group.episodes.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {group.episodes.map((ep) => (
                      <Link
                        key={ep.id}
                        href={`/charts/${ep.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900 text-sm">
                              {ep.last_name?.toUpperCase()}, {ep.first_name}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {ep.diagnosis || ep.primary_diagnosis || 'No diagnosis'}
                              {ep.discharged_at && (
                                <>
                                  {' · '}
                                  Discharged {format(new Date(ep.discharged_at), 'MMM d, yyyy')}
                                </>
                              )}
                              {ep.discharge_reason && (
                                <>
                                  {' · '}
                                  {ep.discharge_reason}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-slate-400 border-slate-200 text-xs"
                            >
                              Discharged
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
