'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Clock } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';

interface PriorAuth {
  id: string;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  auth_number?: string | null;
  insurance_name?: string | null;
  authorized_visits?: number | null;
  used_visits: number;
  remaining_visits?: number | null;
  start_date: string;
  end_date: string;
  status: string;
  notes?: string | null;
  discipline?: string | null;
  auth_type?: string | null;
  units_authorized?: number | null;
  units_used?: number | null;
  day_180_date?: string | null;
}

interface Props {
  patientId: string;
  clinicId: string;
  episodeId?: string;
}

export function PriorAuthSection({ patientId, clinicId, episodeId }: Props) {
  const [auths, setAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    auth_number: '',
    insurance_name: '',
    authorized_visits: '',
    auth_type: 'visits',
    units_authorized: '',
    discipline: 'PT',
    start_date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    status: 'pending',
    notes: '',
  });

  const fetchAuths = useCallback(async () => {
    const params = new URLSearchParams({ patient_id: patientId, clinic_id: clinicId });
    const res = await fetch(`/api/authorizations?${params}`);
    const data = await res.json();
    setAuths(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [patientId, clinicId]);

  useEffect(() => {
    fetchAuths();
  }, [fetchAuths]);

  const resetForm = () => {
    setForm({
      auth_number: '',
      insurance_name: '',
      authorized_visits: '',
      auth_type: 'visits',
      units_authorized: '',
      discipline: 'PT',
      start_date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      status: 'pending',
      notes: '',
    });
  };

  const handleSubmit = async () => {
    if (!episodeId) {
      toast.error('An active episode is required to create a prior authorization');
      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Start date and end date are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          patient_id: patientId,
          clinic_id: clinicId,
          episode_id: episodeId,
          authorized_visits: form.auth_type === 'visits' ? parseInt(form.authorized_visits) || null : null,
          units_authorized: form.auth_type === 'units' ? parseInt(form.units_authorized) || null : null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to create');
      }
      toast.success('Prior authorization created');
      setDialogOpen(false);
      resetForm();
      fetchAuths();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creating authorization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Prior Authorizations
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Prior Authorization</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Auth Number</Label>
                  <Input value={form.auth_number} onChange={(e) => setForm(f => ({ ...f, auth_number: e.target.value }))} />
                </div>
                <div>
                  <Label>Insurance Name</Label>
                  <Input value={form.insurance_name} onChange={(e) => setForm(f => ({ ...f, insurance_name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Discipline</Label>
                  <Select value={form.discipline} onValueChange={(v) => setForm(f => ({ ...f, discipline: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PT">PT</SelectItem>
                      <SelectItem value="OT">OT</SelectItem>
                      <SelectItem value="ST">ST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Auth Type</Label>
                  <Select value={form.auth_type} onValueChange={(v) => setForm(f => ({ ...f, auth_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visits">Visits</SelectItem>
                      <SelectItem value="units">Units</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.auth_type === 'visits' ? (
                <div>
                  <Label>Authorized Visits</Label>
                  <Input type="number" value={form.authorized_visits} onChange={(e) => setForm(f => ({ ...f, authorized_visits: e.target.value }))} />
                </div>
              ) : (
                <div>
                  <Label>Authorized Units</Label>
                  <Input type="number" value={form.units_authorized} onChange={(e) => setForm(f => ({ ...f, units_authorized: e.target.value }))} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : auths.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prior authorizations.</p>
        ) : (
          <div className="space-y-2">
            {auths.map((auth) => {
              const daysToExpiry = differenceInDays(new Date(auth.end_date), new Date());
              const remaining = auth.auth_type === 'units'
                ? (auth.units_authorized ?? 0) - (auth.units_used ?? 0)
                : auth.remaining_visits ?? ((auth.authorized_visits ?? 0) - auth.used_visits);
              const isWarning = daysToExpiry <= 30 || remaining <= 10;
              const isExpiring = daysToExpiry <= 0;

              return (
                <div
                  key={auth.id}
                  className={`border rounded p-3 ${
                    auth.discipline === 'PT' ? 'border-l-4 border-l-blue-500' :
                    auth.discipline === 'OT' ? 'border-l-4 border-l-green-500' :
                    auth.discipline === 'ST' ? 'border-l-4 border-l-purple-500' : ''
                  } ${isWarning ? 'border-amber-300 bg-amber-50' : ''} ${isExpiring ? 'border-red-300 bg-red-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={auth.status === 'approved' ? 'default' : 'secondary'}>
                        {auth.status}
                      </Badge>
                      {auth.discipline && (
                        <Badge variant="outline" className={
                          auth.discipline === 'PT' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          auth.discipline === 'OT' ? 'bg-green-100 text-green-700 border-green-200' :
                          auth.discipline === 'ST' ? 'bg-purple-100 text-purple-700 border-purple-200' : ''
                        }>
                          {auth.discipline}
                        </Badge>
                      )}
                      {auth.auth_number && <span className="font-mono text-sm">{auth.auth_number}</span>}
                    </div>
                    {isWarning && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 grid grid-cols-3 gap-2">
                    <div>
                      <span className="font-medium">
                        {auth.auth_type === 'units' ? 'Units' : 'Visits'}:
                      </span>{' '}
                      {auth.auth_type === 'units'
                        ? `${auth.units_used ?? 0} / ${auth.units_authorized ?? '?'}`
                        : `${auth.used_visits} / ${auth.authorized_visits ?? '?'}`}
                      {' '}
                      <span className={remaining <= 3 ? 'text-red-600 font-bold' : ''}>
                        ({remaining} remaining)
                      </span>
                    </div>
                    <div>
                      {format(parseISO(auth.start_date), 'MM/dd/yy')} - {format(parseISO(auth.end_date), 'MM/dd/yy')}
                    </div>
                    <div>
                      {daysToExpiry > 0 ? (
                        <span className={daysToExpiry <= 30 ? 'text-amber-600 font-medium' : ''}>
                          {daysToExpiry} days left
                        </span>
                      ) : (
                        <span className="text-red-600 font-bold">Expired</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
