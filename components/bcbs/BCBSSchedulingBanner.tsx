'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Shield } from 'lucide-react';
import type { BCBSVisitBenefit } from '@/lib/bcbs/visitTracker';
import { getRemainingVisits, getVisitLimitColor, VISIT_LIMIT_COLORS } from '@/lib/bcbs/visitTracker';

interface Props {
  patientId: string;
  clinicId: string;
  discipline: string;
}

export function BCBSSchedulingBanner({ patientId, clinicId, discipline }: Props) {
  const [benefit, setBenefit] = useState<BCBSVisitBenefit | null>(null);
  const [loading, setLoading] = useState(true);
  const [noBenefit, setNoBenefit] = useState(false);

  useEffect(() => {
    if (!patientId || !clinicId) return;
    setLoading(true);
    setNoBenefit(false);

    fetch(`/api/bcbs/benefits?clinic_id=${clinicId}&patient_id=${patientId}&active_only=true`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BCBSVisitBenefit[]) => {
        const today = new Date().toISOString().split('T')[0];
        const active = data.find(
          (b) => b.benefit_year_start <= today && b.benefit_year_end >= today
        );
        if (active) {
          setBenefit(active);
          setNoBenefit(false);
        } else {
          setBenefit(null);
          setNoBenefit(true);
        }
      })
      .catch(() => {
        setBenefit(null);
        setNoBenefit(true);
      })
      .finally(() => setLoading(false));
  }, [patientId, clinicId]);

  if (loading) return null;

  if (noBenefit) {
    return (
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>No BCBS benefit period configured for this patient. Visits will not be tracked until benefits are set up.</span>
      </div>
    );
  }

  if (!benefit) return null;

  const disc = (discipline || 'PT').toUpperCase() as 'PT' | 'OT' | 'ST';
  const info = getRemainingVisits(benefit, disc);

  if (benefit.benefit_type === 'pooled') {
    const color = getVisitLimitColor(info.remaining, info.allowed);
    const colors = VISIT_LIMIT_COLORS[color];
    return (
      <div className={`text-xs ${colors.text} ${colors.bg} border ${colors.border} rounded p-2 flex items-center gap-1.5`}>
        <Shield className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>BCBS Visits:</strong> {info.remaining} of {info.allowed} remaining (PT/OT/ST combined)
        </span>
        {info.remaining <= 0 && (
          <span className="ml-1 font-semibold text-red-600">— EXHAUSTED</span>
        )}
      </div>
    );
  }

  // Split plan
  const ptInfo = getRemainingVisits(benefit, 'PT');
  const otInfo = getRemainingVisits(benefit, 'OT');
  const stInfo = getRemainingVisits(benefit, 'ST');

  // PT and OT share a limit in split plans
  const ptotColor = getVisitLimitColor(ptInfo.remaining, ptInfo.allowed);
  const stColor = getVisitLimitColor(stInfo.remaining, stInfo.allowed);
  const worstColor = ptotColor === 'red' || stColor === 'red' ? 'red' : ptotColor === 'yellow' || stColor === 'yellow' ? 'yellow' : 'green';
  const colors = VISIT_LIMIT_COLORS[worstColor];

  return (
    <div className={`text-xs ${colors.text} ${colors.bg} border ${colors.border} rounded p-2 flex items-center gap-1.5`}>
      <Shield className="h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>BCBS Visits:</strong>{' '}
        PT/OT: {ptInfo.remaining} of {ptInfo.allowed} remaining{' | '}
        ST: {stInfo.remaining} of {stInfo.allowed} remaining
      </span>
    </div>
  );
}
