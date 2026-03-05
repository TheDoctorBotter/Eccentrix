'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface AuthSummary {
  id: string;
  patient_id: string;
  discipline: string | null;
  auth_number: string | null;
  auth_type: string | null;
  authorized_visits: number | null;
  used_visits: number;
  remaining_visits: number | null;
  units_authorized: number | null;
  units_used: number | null;
  start_date: string;
  end_date: string;
  status: string;
  patient_name?: string;
}

interface Props {
  clinicId: string;
}

const PAGE_SIZE = 10;

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'bg-blue-100 text-blue-700 border-blue-200',
  OT: 'bg-green-100 text-green-700 border-green-200',
  ST: 'bg-purple-100 text-purple-700 border-purple-200',
};

export function DashboardAuthSection({ clinicId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [auths, setAuths] = useState<AuthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [page, setPage] = useState(0);

  const fetchAuths = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/authorizations?clinic_id=${clinicId}&status=approved`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      // Resolve patient names
      const patRes = await fetch(`/api/patients?clinic_id=${clinicId}`);
      let patMap = new Map<string, string>();
      if (patRes.ok) {
        const patients = await patRes.json();
        patMap = new Map(
          (Array.isArray(patients) ? patients : []).map(
            (p: { id: string; first_name: string; last_name: string }) => [
              p.id,
              `${p.last_name}, ${p.first_name}`,
            ]
          )
        );
      }

      const enriched: AuthSummary[] = data.map(
        (a: AuthSummary) => ({
          ...a,
          patient_name: patMap.get(a.patient_id) || 'Unknown',
        })
      );

      setAuths(enriched);
      setFetched(true);
    } catch (error) {
      console.error('Error fetching dashboard auths:', error);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (expanded && !fetched) {
      fetchAuths();
    }
  }, [expanded, fetched, fetchAuths]);

  const totalPages = Math.ceil(auths.length / PAGE_SIZE);
  const pageAuths = auths.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Authorizations</CardTitle>
            {fetched && (
              <Badge variant="outline" className="ml-1">
                {auths.length}
              </Badge>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading authorizations...
            </p>
          ) : auths.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No approved authorizations found.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {pageAuths.map((auth) => {
                  const remaining =
                    auth.auth_type === 'units'
                      ? (auth.units_authorized ?? 0) - (auth.units_used ?? 0)
                      : auth.remaining_visits ??
                        (auth.authorized_visits ?? 0) - auth.used_visits;
                  const daysToExpiry = Math.ceil(
                    (new Date(auth.end_date).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24)
                  );
                  const isWarning = daysToExpiry <= 30 || remaining <= 10;

                  return (
                    <div
                      key={auth.id}
                      className={`border rounded-lg p-3 ${
                        auth.discipline === 'PT'
                          ? 'border-l-4 border-l-blue-500'
                          : auth.discipline === 'OT'
                            ? 'border-l-4 border-l-green-500'
                            : auth.discipline === 'ST'
                              ? 'border-l-4 border-l-purple-500'
                              : ''
                      } ${isWarning ? 'bg-amber-50' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-slate-900">
                            {auth.patient_name}
                          </span>
                          {auth.discipline && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${DISCIPLINE_BADGE[auth.discipline] || ''}`}
                            >
                              {auth.discipline}
                            </Badge>
                          )}
                          {auth.auth_number && (
                            <span className="text-xs font-mono text-slate-500">
                              #{auth.auth_number}
                            </span>
                          )}
                        </div>
                        {isWarning && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
                        <span>
                          {auth.auth_type === 'units' ? 'Units' : 'Visits'}:{' '}
                          <span
                            className={
                              remaining <= 3
                                ? 'text-red-600 font-bold'
                                : remaining < 5
                                  ? 'text-amber-600 font-semibold'
                                  : 'text-emerald-600 font-semibold'
                            }
                          >
                            {remaining} remaining
                          </span>
                        </span>
                        <span>
                          {format(parseISO(auth.start_date), 'MM/dd/yy')} –{' '}
                          {format(parseISO(auth.end_date), 'MM/dd/yy')}
                        </span>
                        <span
                          className={
                            daysToExpiry <= 0
                              ? 'text-red-600 font-bold'
                              : daysToExpiry <= 30
                                ? 'text-amber-600 font-medium'
                                : ''
                          }
                        >
                          {daysToExpiry > 0
                            ? `${daysToExpiry}d left`
                            : 'Expired'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-slate-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
