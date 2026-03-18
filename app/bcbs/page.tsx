'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield, Plus, Pencil, ChevronDown, ChevronUp, Loader2, AlertTriangle, Calendar,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { formatLocalDate } from '@/lib/utils';
import type { BCBSVisitBenefit, BCBSVisitLogEntry } from '@/lib/bcbs/visitTracker';
import { getRemainingVisits, getVisitLimitColor, VISIT_LIMIT_COLORS } from '@/lib/bcbs/visitTracker';

interface PatientOption {
  id: string;
  first_name: string;
  last_name: string;
  payer_type: string | null;
}

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'bg-blue-100 text-blue-700 border-blue-200',
  OT: 'bg-lime-100 text-lime-700 border-lime-200',
  ST: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export default function BCBSBenefitsPage() {
  const { currentClinic, loading: authLoading } = useAuth();
  const [benefits, setBenefits] = useState<BCBSVisitBenefit[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientSearch, setPatientSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBenefit, setEditingBenefit] = useState<BCBSVisitBenefit | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Log dialog state
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logBenefitId, setLogBenefitId] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<BCBSVisitLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    patient_id: '',
    benefit_year_start: '',
    benefit_year_end: '',
    benefit_type: 'pooled' as 'pooled' | 'split',
    total_visits_allowed: '',
    pt_visits_allowed: '',
    ot_visits_allowed: '',
    st_visits_allowed: '',
    bcbs_member_id: '',
    bcbs_group_number: '',
    bcbs_plan_name: '',
    notes: '',
  });

  const clinicId = currentClinic?.clinic_id || '';

  const fetchBenefits = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bcbs/benefits?clinic_id=${clinicId}&active_only=false`);
      if (res.ok) {
        const data = await res.json();
        setBenefits(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching BCBS benefits:', err);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  const fetchPatients = useCallback(async () => {
    if (!clinicId) return;
    try {
      const res = await fetch(`/api/patients?clinic_id=${clinicId}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  }, [clinicId]);

  useEffect(() => {
    fetchBenefits();
    fetchPatients();
  }, [fetchBenefits, fetchPatients]);

  // Patient name resolver
  const patientName = (patientId: string) => {
    const p = patients.find((pt) => pt.id === patientId);
    return p ? `${p.last_name}, ${p.first_name}` : 'Unknown';
  };

  // Filter benefits by patient search
  const filteredBenefits = benefits.filter((b) => {
    if (!patientSearch) return true;
    const name = patientName(b.patient_id).toLowerCase();
    return name.includes(patientSearch.toLowerCase());
  });

  // Open add dialog
  const openAddDialog = () => {
    setEditingBenefit(null);
    setForm({
      patient_id: '',
      benefit_year_start: '',
      benefit_year_end: '',
      benefit_type: 'pooled',
      total_visits_allowed: '',
      pt_visits_allowed: '',
      ot_visits_allowed: '',
      st_visits_allowed: '',
      bcbs_member_id: '',
      bcbs_group_number: '',
      bcbs_plan_name: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEditDialog = (b: BCBSVisitBenefit) => {
    setEditingBenefit(b);
    setForm({
      patient_id: b.patient_id,
      benefit_year_start: b.benefit_year_start,
      benefit_year_end: b.benefit_year_end,
      benefit_type: b.benefit_type,
      total_visits_allowed: b.total_visits_allowed?.toString() || '',
      pt_visits_allowed: b.pt_visits_allowed?.toString() || '',
      ot_visits_allowed: b.ot_visits_allowed?.toString() || '',
      st_visits_allowed: b.st_visits_allowed?.toString() || '',
      bcbs_member_id: b.bcbs_member_id || '',
      bcbs_group_number: b.bcbs_group_number || '',
      bcbs_plan_name: b.bcbs_plan_name || '',
      notes: b.notes || '',
    });
    setDialogOpen(true);
  };

  // Auto-suggest end date 1 year from start
  const handleStartDateChange = (val: string) => {
    setForm((prev) => {
      const updated = { ...prev, benefit_year_start: val };
      if (val && !prev.benefit_year_end) {
        const start = new Date(val);
        start.setFullYear(start.getFullYear() + 1);
        start.setDate(start.getDate() - 1);
        updated.benefit_year_end = start.toISOString().split('T')[0];
      }
      return updated;
    });
  };

  // Save benefit
  const handleSave = async () => {
    if (!form.patient_id || !form.benefit_year_start || !form.benefit_year_end) {
      toast.error('Patient, start date, and end date are required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        clinic_id: clinicId,
        patient_id: form.patient_id,
        benefit_year_start: form.benefit_year_start,
        benefit_year_end: form.benefit_year_end,
        benefit_type: form.benefit_type,
        total_visits_allowed: form.benefit_type === 'pooled' ? (parseInt(form.total_visits_allowed) || null) : null,
        pt_visits_allowed: form.benefit_type === 'split' ? (parseInt(form.pt_visits_allowed) || null) : null,
        ot_visits_allowed: form.benefit_type === 'split' ? (parseInt(form.ot_visits_allowed) || null) : null,
        st_visits_allowed: form.benefit_type === 'split' ? (parseInt(form.st_visits_allowed) || null) : null,
        bcbs_member_id: form.bcbs_member_id || null,
        bcbs_group_number: form.bcbs_group_number || null,
        bcbs_plan_name: form.bcbs_plan_name || null,
        notes: form.notes || null,
      };

      let res: Response;
      if (editingBenefit) {
        res = await fetch(`/api/bcbs/benefits/${editingBenefit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/bcbs/benefits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }

      toast.success(editingBenefit ? 'Benefit updated' : 'Benefit created');
      setDialogOpen(false);
      fetchBenefits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error saving benefit');
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch visit log
  const openLogDialog = async (benefitId: string) => {
    setLogBenefitId(benefitId);
    setLogDialogOpen(true);
    setLogLoading(true);
    try {
      const res = await fetch(`/api/bcbs/log?benefit_id=${benefitId}`);
      if (res.ok) {
        const data = await res.json();
        setLogEntries(Array.isArray(data) ? data : []);
      }
    } catch {
      setLogEntries([]);
    } finally {
      setLogLoading(false);
    }
  };

  // Days left in benefit year
  const daysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // BCBS patient filter for dropdown
  const bcbsPatients = patients.filter((p) => p.payer_type === 'bcbs_tx');

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-48 w-full" />
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
            <Shield className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">BCBS Visit Benefits</h1>
              <p className="text-sm text-slate-600">Track annual visit limits for BCBS-TX patients</p>
            </div>
          </div>
          <Button onClick={openAddDialog} className="gap-1">
            <Plus className="h-4 w-4" />
            Add Benefit
          </Button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Search by patient name..."
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Benefits List */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : filteredBenefits.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">
                {benefits.length === 0
                  ? 'No BCBS benefit periods configured yet.'
                  : 'No benefits match your search.'}
              </p>
              {benefits.length === 0 && (
                <Button onClick={openAddDialog} className="mt-4 gap-1" variant="outline">
                  <Plus className="h-4 w-4" />
                  Add First Benefit
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredBenefits.map((b) => {
              const today = new Date().toISOString().split('T')[0];
              const isCurrentYear = b.benefit_year_start <= today && b.benefit_year_end >= today;
              const days = daysLeft(b.benefit_year_end);
              const isExpired = days <= 0;

              return (
                <Card key={b.id} className={!b.is_active ? 'opacity-60' : isExpired ? 'opacity-75' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Patient name + badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-semibold text-slate-900">
                            {patientName(b.patient_id)}
                          </span>
                          <Badge variant="outline" className={b.benefit_type === 'pooled' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}>
                            {b.benefit_type === 'pooled' ? 'Pooled' : 'Split'}
                          </Badge>
                          {isCurrentYear && !isExpired && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                              Current Year
                            </Badge>
                          )}
                          {isExpired && (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">
                              Expired
                            </Badge>
                          )}
                          {!b.is_active && (
                            <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]">
                              Inactive
                            </Badge>
                          )}
                        </div>

                        {/* Date range + days remaining */}
                        <div className="flex items-center gap-4 text-xs text-slate-600 mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatLocalDate(b.benefit_year_start, 'MM/dd/yyyy')} – {formatLocalDate(b.benefit_year_end, 'MM/dd/yyyy')}
                          </span>
                          <span className={days <= 30 && days > 0 ? 'text-amber-600 font-medium' : days <= 0 ? 'text-red-600 font-medium' : ''}>
                            {days > 0 ? `${days} days left` : 'Expired'}
                          </span>
                          {b.bcbs_member_id && (
                            <span className="font-mono">ID: {b.bcbs_member_id}</span>
                          )}
                        </div>

                        {/* Progress bars */}
                        {b.benefit_type === 'pooled' ? (
                          <PooledProgressBar benefit={b} />
                        ) : (
                          <SplitProgressBars benefit={b} />
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 ml-3 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => openEditDialog(b)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openLogDialog(b.id)}
                        >
                          History
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Add/Edit Benefit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingBenefit ? 'Edit BCBS Benefit' : 'Add BCBS Benefit'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* Patient select */}
            {!editingBenefit && (
              <div className="space-y-2">
                <Label>Patient (BCBS-TX only)</Label>
                <Select
                  value={form.patient_id}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, patient_id: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bcbsPatients.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No BCBS-TX patients found
                      </SelectItem>
                    ) : (
                      bcbsPatients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.last_name}, {p.first_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Benefit Year Start</Label>
                <Input
                  type="date"
                  value={form.benefit_year_start}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Benefit Year End</Label>
                <Input
                  type="date"
                  value={form.benefit_year_end}
                  onChange={(e) => setForm((prev) => ({ ...prev, benefit_year_end: e.target.value }))}
                />
              </div>
            </div>

            {/* Benefit type toggle */}
            <div className="space-y-2">
              <Label>Benefit Type</Label>
              <div className="flex rounded-lg border overflow-hidden text-sm">
                {(['pooled', 'split'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`flex-1 px-4 py-2 font-medium transition-colors ${
                      form.benefit_type === type
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => setForm((prev) => ({ ...prev, benefit_type: type }))}
                  >
                    {type === 'pooled' ? 'Pooled' : 'Split'}
                  </button>
                ))}
              </div>
            </div>

            {/* Visit limits */}
            {form.benefit_type === 'pooled' ? (
              <div className="space-y-2">
                <Label>Total Visits Allowed</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.total_visits_allowed}
                  onChange={(e) => setForm((prev) => ({ ...prev, total_visits_allowed: e.target.value }))}
                  placeholder="e.g., 60"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>PT/OT Visits Allowed</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.pt_visits_allowed}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => ({ ...prev, pt_visits_allowed: val, ot_visits_allowed: val }));
                    }}
                    placeholder="e.g., 40"
                  />
                  <p className="text-xs text-slate-500">PT and OT share the combined PT/OT limit</p>
                </div>
                <div className="space-y-2">
                  <Label>ST Visits Allowed</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.st_visits_allowed}
                    onChange={(e) => setForm((prev) => ({ ...prev, st_visits_allowed: e.target.value }))}
                    placeholder="e.g., 20"
                  />
                </div>
              </div>
            )}

            {/* BCBS info */}
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-2">
                <Label>BCBS Member ID</Label>
                <Input
                  value={form.bcbs_member_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, bcbs_member_id: e.target.value }))}
                  placeholder="e.g., XYZ123456"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Group Number</Label>
                  <Input
                    value={form.bcbs_group_number}
                    onChange={(e) => setForm((prev) => ({ ...prev, bcbs_group_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plan Name</Label>
                  <Input
                    value={form.bcbs_plan_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, bcbs_plan_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingBenefit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visit History Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Visit History</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {logLoading ? (
              <div className="py-8 text-center text-slate-500">Loading...</div>
            ) : logEntries.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No visits recorded yet</div>
            ) : (
              <div className="space-y-1">
                {/* Header */}
                <div className="grid grid-cols-5 gap-2 text-xs font-medium text-slate-500 px-2 py-1 border-b">
                  <span>Date</span>
                  <span>Discipline</span>
                  <span>Type</span>
                  <span>Therapist</span>
                  <span>Balance After</span>
                </div>
                {logEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-5 gap-2 text-xs px-2 py-2 rounded ${
                      entry.usage_type === 'restore'
                        ? 'bg-emerald-50'
                        : entry.usage_type === 'adjustment'
                          ? 'bg-amber-50'
                          : ''
                    }`}
                  >
                    <span>{entry.date_of_service ? formatLocalDate(entry.date_of_service, 'MM/dd/yy') : formatLocalDate(entry.created_at, 'MM/dd/yy')}</span>
                    <span>
                      <Badge variant="outline" className={`text-[10px] ${DISCIPLINE_BADGE[entry.discipline] || ''}`}>
                        {entry.discipline}
                      </Badge>
                    </span>
                    <span className={
                      entry.usage_type === 'deduction' ? 'text-red-600' :
                      entry.usage_type === 'restore' ? 'text-emerald-600' :
                      'text-amber-600'
                    }>
                      {entry.usage_type === 'deduction' ? '-1' : entry.usage_type === 'restore' ? '+1' : 'adj'}
                    </span>
                    <span className="text-slate-600 truncate">{entry.therapist_id?.slice(0, 8) || '—'}</span>
                    <span className="font-mono">{entry.after_balance ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar components
// ---------------------------------------------------------------------------

function PooledProgressBar({ benefit }: { benefit: BCBSVisitBenefit }) {
  const info = getRemainingVisits(benefit, 'PT'); // discipline doesn't matter for pooled
  const color = getVisitLimitColor(info.remaining, info.allowed);
  const colors = VISIT_LIMIT_COLORS[color];
  const pct = info.allowed > 0 ? Math.min(100, ((info.allowed - info.used) / info.allowed) * 100) : 0;

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

function SplitProgressBars({ benefit }: { benefit: BCBSVisitBenefit }) {
  const disciplines = [
    { key: 'PT', label: 'PT' },
    { key: 'OT', label: 'OT' },
    { key: 'ST', label: 'ST' },
  ] as const;

  return (
    <div className="space-y-2">
      {disciplines.map(({ key, label }) => {
        const info = getRemainingVisits(benefit, key);
        const color = getVisitLimitColor(info.remaining, info.allowed);
        const colors = VISIT_LIMIT_COLORS[color];
        const pct = info.allowed > 0 ? Math.min(100, ((info.allowed - info.used) / info.allowed) * 100) : 0;

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
