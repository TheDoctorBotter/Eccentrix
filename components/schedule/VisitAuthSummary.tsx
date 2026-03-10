'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield } from 'lucide-react';
import { addWeeks } from 'date-fns';
import { formatLocalDate, safeDate } from '@/lib/utils';

interface AuthRecord {
  id: string;
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
}

interface Props {
  patientId: string | null | undefined;
  clinicId: string;
  discipline?: string | null;
}

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'bg-blue-100 text-blue-700 border-blue-200',
  OT: 'bg-lime-100 text-lime-700 border-lime-200',
  ST: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

function projectExhaustionDate(
  remaining: number,
  frequency: number,
  fromDate: Date
): string | null {
  if (frequency <= 0 || remaining <= 0) return null;
  const weeksNeeded = Math.ceil(remaining / frequency);
  const exhaustionDate = addWeeks(fromDate, weeksNeeded);
  return formatLocalDate(exhaustionDate, 'MMM d, yyyy');
}

export function VisitAuthSummary({ patientId, clinicId, discipline }: Props) {
  const [auths, setAuths] = useState<AuthRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId) return;

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      patient_id: patientId,
      clinic_id: clinicId,
      status: 'approved',
    });
    if (discipline) params.set('discipline', discipline);

    fetch(`/api/authorizations?${params}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setAuths(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, clinicId, discipline]);

  if (!patientId) return null;
  if (loading) {
    return (
      <div className="text-xs text-slate-400 py-1">
        Loading authorizations...
      </div>
    );
  }
  if (auths.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Shield className="h-3 w-3" />
        Authorizations
      </div>
      {auths.map((auth) => {
        const isUnitBasedAuth = auth.auth_type === 'units' || ['PT', 'OT'].includes(auth.discipline?.toUpperCase() ?? '');
        const remaining = isUnitBasedAuth
          ? (auth.units_authorized ?? 0) - (auth.units_used ?? 0)
          : auth.remaining_visits ??
            (auth.authorized_visits ?? 0) - auth.used_visits;
        const endDate = safeDate(auth.end_date);
        const daysToExpiry = endDate
          ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : Infinity;
        const isLow = remaining <= 3;
        const isWarning = daysToExpiry <= 30 || remaining <= 10;

        // Frequency projection: estimate based on common frequencies
        // Try to parse a simple "Nx/week" pattern if available
        const projections = [2, 3].map((freq) => ({
          freq,
          date: projectExhaustionDate(remaining, freq, new Date()),
        }));

        return (
          <div
            key={auth.id}
            className={`text-xs border rounded p-2 ${
              auth.discipline === 'PT'
                ? 'border-l-2 border-l-blue-500'
                : auth.discipline === 'OT'
                  ? 'border-l-2 border-l-green-500'
                  : auth.discipline === 'ST'
                    ? 'border-l-2 border-l-purple-500'
                    : ''
            } ${isWarning ? 'bg-amber-50' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {auth.discipline && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1 py-0 ${DISCIPLINE_BADGE[auth.discipline] || ''}`}
                  >
                    {auth.discipline}
                  </Badge>
                )}
                {auth.auth_number && (
                  <span className="font-mono text-slate-500">
                    #{auth.auth_number}
                  </span>
                )}
              </div>
              {isLow && (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-slate-600">
              <span
                className={
                  isLow
                    ? 'text-red-600 font-bold'
                    : remaining < 5
                      ? 'text-amber-600 font-semibold'
                      : 'text-emerald-600 font-semibold'
                }
              >
                {remaining} {isUnitBasedAuth ? 'units' : 'visits'}{' '}
                left
              </span>
              <span className="text-slate-400">
                {formatLocalDate(auth.end_date, 'MM/dd/yy')}
              </span>
              {daysToExpiry <= 30 && daysToExpiry > 0 && (
                <span className="text-amber-600">({daysToExpiry}d)</span>
              )}
              {daysToExpiry <= 0 && (
                <span className="text-red-600 font-bold">Expired</span>
              )}
            </div>
            {remaining > 0 && (
              <div className="mt-1 text-[10px] text-slate-400">
                Projected exhaustion:{' '}
                {projections.map((p, i) => (
                  <span key={p.freq}>
                    {i > 0 && ' · '}
                    {p.freq}x/wk → {p.date}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
