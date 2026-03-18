'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Calendar, ChevronRight } from 'lucide-react';
import { formatLocalDate } from '@/lib/utils';
import type { BCBSVisitBenefit } from '@/lib/bcbs/visitTracker';
import { getRemainingVisits, getVisitLimitColor, VISIT_LIMIT_COLORS } from '@/lib/bcbs/visitTracker';

interface Props {
  patientId: string;
  clinicId: string;
}

export function BCBSPatientSection({ patientId, clinicId }: Props) {
  const [benefit, setBenefit] = useState<BCBSVisitBenefit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId || !clinicId) return;
    setLoading(true);

    fetch(`/api/bcbs/benefits?clinic_id=${clinicId}&patient_id=${patientId}&active_only=true`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BCBSVisitBenefit[]) => {
        const today = new Date().toISOString().split('T')[0];
        const active = data.find(
          (b) => b.benefit_year_start <= today && b.benefit_year_end >= today
        );
        setBenefit(active || null);
      })
      .catch(() => setBenefit(null))
      .finally(() => setLoading(false));
  }, [patientId, clinicId]);

  if (loading) return null;
  if (!benefit) return null;

  const daysLeft = Math.ceil(
    (new Date(benefit.benefit_year_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">BCBS Visit Benefits</CardTitle>
          </div>
          <Link href="/bcbs">
            <Button size="sm" variant="ghost" className="gap-1 text-xs">
              Full History <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {/* Benefit info */}
        <div className="flex items-center gap-4 text-sm text-slate-600 mb-3 flex-wrap">
          <Badge variant="outline" className={benefit.benefit_type === 'pooled' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}>
            {benefit.benefit_type === 'pooled' ? 'Pooled' : 'Split'}
          </Badge>
          <span className="flex items-center gap-1 text-xs">
            <Calendar className="h-3 w-3" />
            {formatLocalDate(benefit.benefit_year_start, 'MM/dd/yyyy')} – {formatLocalDate(benefit.benefit_year_end, 'MM/dd/yyyy')}
          </span>
          <span className={`text-xs ${daysLeft <= 30 ? 'text-amber-600 font-medium' : ''}`}>
            {daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}
          </span>
        </div>

        {/* Progress bars */}
        {benefit.benefit_type === 'pooled' ? (
          <PooledBar benefit={benefit} />
        ) : (
          <SplitBars benefit={benefit} />
        )}

        {/* Member info */}
        {benefit.bcbs_member_id && (
          <div className="mt-3 pt-2 border-t text-xs text-slate-500">
            <span className="font-medium">Member ID:</span> {benefit.bcbs_member_id}
            {benefit.bcbs_group_number && <> &middot; <span className="font-medium">Group:</span> {benefit.bcbs_group_number}</>}
            {benefit.bcbs_plan_name && <> &middot; {benefit.bcbs_plan_name}</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PooledBar({ benefit }: { benefit: BCBSVisitBenefit }) {
  const info = getRemainingVisits(benefit, 'PT');
  const color = getVisitLimitColor(info.remaining, info.allowed);
  const colors = VISIT_LIMIT_COLORS[color];
  const pct = info.allowed > 0 ? Math.min(100, (info.remaining / info.allowed) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">PT/OT/ST Combined</span>
        <span className={`font-semibold ${colors.text}`}>
          {info.remaining} / {info.allowed} remaining
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SplitBars({ benefit }: { benefit: BCBSVisitBenefit }) {
  const disciplines = [
    { key: 'PT' as const, label: 'PT' },
    { key: 'OT' as const, label: 'OT' },
    { key: 'ST' as const, label: 'ST' },
  ];

  return (
    <div className="space-y-2">
      {disciplines.map(({ key, label }) => {
        const info = getRemainingVisits(benefit, key);
        const color = getVisitLimitColor(info.remaining, info.allowed);
        const colors = VISIT_LIMIT_COLORS[color];
        const pct = info.allowed > 0 ? Math.min(100, (info.remaining / info.allowed) * 100) : 0;

        return (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{label}</span>
              <span className={`font-semibold ${colors.text}`}>
                {info.remaining} / {info.allowed}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
