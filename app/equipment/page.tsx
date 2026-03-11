'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Plus,
  ChevronRight,
  Check,
  Pencil,
  ClipboardList,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  EQUIPMENT_PHASES,
  EQUIPMENT_TYPES,
  isStale,
  daysSinceUpdate,
  getPhaseById,
  getEquipmentTypeLabel,
} from '@/lib/equipment/phases';
import { getNextPhase, getDateFieldForPhase } from '@/lib/equipment/advancePhase';
import {
  EquipmentReferralModal,
  type EquipmentReferral,
} from '@/components/equipment/EquipmentReferralModal';
import { toast } from 'sonner';

type PhaseFilter = 'all' | string;

export default function EquipmentPage() {
  const { currentClinic, memberships, loading: authLoading, user } = useAuth();
  const clinicId = currentClinic?.clinic_id || '';

  const [referrals, setReferrals] = useState<EquipmentReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editReferral, setEditReferral] = useState<EquipmentReferral | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const fetchReferrals = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment_referrals')
        .select('*, patients!inner(first_name, last_name, date_of_birth)')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('last_updated_at', { ascending: true });

      if (error) throw error;

      const mapped: EquipmentReferral[] = (data || []).map((r: any) => ({
        ...r,
        patient_first_name: r.patients?.first_name,
        patient_last_name: r.patients?.last_name,
        patient_date_of_birth: r.patients?.date_of_birth,
      }));

      setReferrals(mapped);
    } catch (err) {
      console.error('Error fetching equipment referrals:', err);
      setReferrals([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) fetchReferrals();
  }, [clinicId, fetchReferrals]);

  const staleCount = referrals.filter(
    (r) => r.phase !== 'equipment_received' && isStale(r.last_updated_at)
  ).length;

  const filteredReferrals =
    phaseFilter === 'all'
      ? referrals
      : referrals.filter((r) => r.phase === phaseFilter);

  const groupedByPhase = EQUIPMENT_PHASES.map((phase) => ({
    phase,
    items: filteredReferrals
      .filter((r) => r.phase === phase.id)
      .sort(
        (a, b) =>
          new Date(a.last_updated_at).getTime() - new Date(b.last_updated_at).getTime()
      ),
  }));

  const handleAdvancePhase = async (referral: EquipmentReferral) => {
    const nextPhase = getNextPhase(referral.phase);
    if (!nextPhase) {
      toast.info('This referral is already in the final phase.');
      return;
    }

    setAdvancingId(referral.id);

    const dateField = getDateFieldForPhase(nextPhase);
    const today = new Date().toISOString().split('T')[0];
    const updates: Record<string, unknown> = {
      phase: nextPhase,
      last_updated_by: user?.id || null,
    };

    // Auto-populate date if empty
    if (dateField && !referral[dateField as keyof EquipmentReferral]) {
      updates[dateField] = today;
    }

    try {
      const { error } = await supabase
        .from('equipment_referrals')
        .update(updates)
        .eq('id', referral.id);

      if (error) throw error;

      const phaseLabel = getPhaseById(nextPhase)?.label || nextPhase;
      toast.success(`Advanced to: ${phaseLabel}`);
      await fetchReferrals();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to advance phase.');
    } finally {
      setAdvancingId(null);
    }
  };

  const handleMarkReceived = async (referral: EquipmentReferral) => {
    if (referral.phase === 'equipment_received') return;
    setAdvancingId(referral.id);

    const today = new Date().toISOString().split('T')[0];
    const updates: Record<string, unknown> = {
      phase: 'equipment_received',
      equipment_received_date: referral.equipment_received_date || today,
      last_updated_by: user?.id || null,
    };

    // Fill in intermediate dates if missing
    if (!referral.referral_sent_date) updates.referral_sent_date = today;
    if (!referral.evaluation_date) updates.evaluation_date = today;

    try {
      const { error } = await supabase
        .from('equipment_referrals')
        .update(updates)
        .eq('id', referral.id);

      if (error) throw error;
      toast.success('Marked as received.');
      await fetchReferrals();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark as received.');
    } finally {
      setAdvancingId(null);
    }
  };

  const openEdit = (referral: EquipmentReferral) => {
    setEditReferral(referral);
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditReferral(null);
    setModalOpen(true);
  };

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">
              Equipment &amp; Orthotics Tracking
            </h1>
          </div>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Referral
          </Button>
        </div>

        {/* Phase filter bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={phaseFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPhaseFilter('all')}
          >
            All
          </Button>
          {EQUIPMENT_PHASES.map((p) => (
            <Button
              key={p.id}
              variant={phaseFilter === p.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPhaseFilter(p.id)}
            >
              {p.label.split(' — ')[0]}
            </Button>
          ))}
        </div>

        {/* Stale alert banner */}
        {staleCount > 0 && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-800 font-medium">
              {staleCount} referral{staleCount !== 1 ? 's have' : ' has'} not been
              updated in 30+ days. Review below.
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByPhase.map(({ phase, items }) => {
              // Skip empty phases if filtering by a specific phase
              if (phaseFilter !== 'all' && phase.id !== phaseFilter) return null;

              return (
                <div key={phase.id}>
                  {/* Phase header */}
                  <div
                    className={`flex items-center gap-3 px-4 py-2 rounded-t-lg border ${phase.bgColor} ${phase.borderColor}`}
                  >
                    <span className={`text-sm font-semibold ${phase.textColor}`}>
                      {phase.label}
                    </span>
                    <Badge
                      variant="outline"
                      className={`${phase.textColor} ${phase.borderColor} text-xs`}
                    >
                      {items.length}
                    </Badge>
                  </div>

                  {/* Cards */}
                  <div className="border border-t-0 rounded-b-lg divide-y bg-white">
                    {items.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        No patients currently in this phase.
                      </div>
                    ) : (
                      items.map((r) => {
                        const stale =
                          r.phase !== 'equipment_received' && isStale(r.last_updated_at);
                        const days = daysSinceUpdate(r.last_updated_at);
                        const nextPhase = getNextPhase(r.phase);
                        const isAdvancing = advancingId === r.id;

                        return (
                          <div
                            key={r.id}
                            className={`flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors ${
                              stale ? 'border-l-4 border-l-red-400' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 text-sm">
                                  {r.patient_last_name?.toUpperCase()},{' '}
                                  {r.patient_first_name}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${phase.textColor} ${phase.borderColor} ${phase.bgColor}`}
                                >
                                  {phase.label.split(' — ')[0]}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                                <span>{getEquipmentTypeLabel(r.equipment_type)}</span>
                                {r.provider_company && (
                                  <span>| {r.provider_company}</span>
                                )}
                                {r.provider_contact_name && (
                                  <span>| ATP: {r.provider_contact_name}</span>
                                )}
                                <span className={stale ? 'font-bold text-red-600' : ''}>
                                  | Updated {days}d ago
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-3">
                              {nextPhase && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs gap-1"
                                  disabled={isAdvancing}
                                  onClick={() => handleAdvancePhase(r)}
                                >
                                  <ChevronRight className="h-3 w-3" />
                                  Advance
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs gap-1"
                                onClick={() => openEdit(r)}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                              {r.phase !== 'equipment_received' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs gap-1 text-green-700 hover:text-green-800 hover:bg-green-50"
                                  disabled={isAdvancing}
                                  onClick={() => handleMarkReceived(r)}
                                >
                                  <Check className="h-3 w-3" />
                                  Received
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {modalOpen && (
        <EquipmentReferralModal
          existingReferral={editReferral}
          onClose={() => {
            setModalOpen(false);
            setEditReferral(null);
          }}
          onSaved={fetchReferrals}
        />
      )}
    </div>
  );
}
