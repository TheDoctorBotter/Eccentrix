'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getAuthUsageHistory, AuthUsageLogEntry } from '@/lib/authUsageLog';
import { formatLocalDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TherapistInfo {
  user_id: string;
  display_name?: string;
  email?: string;
}

interface AuthUsageHistoryProps {
  authorizationId: string;
  clinicId?: string;
}

export function AuthUsageHistory({ authorizationId, clinicId }: AuthUsageHistoryProps) {
  const [entries, setEntries] = useState<AuthUsageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [therapistMap, setTherapistMap] = useState<Record<string, string>>({});

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const data = await getAuthUsageHistory(supabase, authorizationId);
    setEntries(data);

    // Build therapist name map from unique therapist_ids
    const therapistIds = Array.from(new Set(data.map((e) => e.therapist_id).filter(Boolean))) as string[];
    if (therapistIds.length > 0 && clinicId) {
      try {
        const res = await fetch(`/api/clinic-members?clinic_id=${clinicId}`);
        if (res.ok) {
          const members: TherapistInfo[] = await res.json();
          const map: Record<string, string> = {};
          for (const m of members) {
            if (therapistIds.includes(m.user_id)) {
              map[m.user_id] = m.display_name || m.email || 'Unknown Therapist';
            }
          }
          setTherapistMap(map);
        }
      } catch {
        // Non-critical — therapist names are optional
      }
    }

    setLoading(false);
  }, [authorizationId, clinicId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'deduction':
        return <Badge variant="destructive" className="text-xs">Deduction</Badge>;
      case 'restore':
        return <Badge className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Restore</Badge>;
      case 'adjustment':
        return <Badge className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100">Adjustment</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{type}</Badge>;
    }
  };

  if (loading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3 text-center">
        No authorization usage history yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Discipline</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs">Amount</TableHead>
            <TableHead className="text-xs">Therapist</TableHead>
            <TableHead className="text-xs">Balance After</TableHead>
            <TableHead className="text-xs">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id} className="text-xs">
              <TableCell className="text-xs whitespace-nowrap">
                {entry.date_of_service
                  ? formatLocalDate(entry.date_of_service, 'MM/dd/yyyy')
                  : formatLocalDate(entry.created_at, 'MM/dd/yyyy')}
              </TableCell>
              <TableCell className="text-xs">{entry.discipline}</TableCell>
              <TableCell className="text-xs">{getTypeBadge(entry.usage_type)}</TableCell>
              <TableCell className="text-xs">
                {entry.amount} {entry.amount_kind}
              </TableCell>
              <TableCell className="text-xs">
                {entry.therapist_id
                  ? therapistMap[entry.therapist_id] || 'Unknown Therapist'
                  : 'Unknown Therapist'}
              </TableCell>
              <TableCell className="text-xs font-medium">
                {entry.after_balance !== null ? entry.after_balance : '-'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {entry.note || ''}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
