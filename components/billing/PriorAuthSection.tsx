'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Clock, Pencil, Trash2, Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface PriorAuth {
  id: string;
  episode_id: string;
  patient_id: string;
  clinic_id: string;
  auth_number?: string | null;
  insurance_name?: string | null;
  insurance_phone?: string | null;
  authorized_visits?: number | null;
  used_visits: number;
  remaining_visits?: number | null;
  start_date: string;
  end_date: string;
  requested_date?: string | null;
  approved_date?: string | null;
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

const EMPTY_FORM = {
  auth_number: '',
  insurance_name: '',
  insurance_phone: '',
  authorized_visits: '',
  auth_type: 'visits',
  units_authorized: '',
  discipline: 'PT',
  start_date: '',
  end_date: '',
  status: 'pending',
  notes: '',
};

export function PriorAuthSection({ patientId, clinicId, episodeId }: Props) {
  const [auths, setAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingAuth, setEditingAuth] = useState<PriorAuth | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriorAuth | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    start_date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
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
      ...EMPTY_FORM,
      start_date: formatLocalDate(new Date(), 'yyyy-MM-dd'),
    });
    setEditingAuth(null);
  };

  const openEditDialog = (auth: PriorAuth) => {
    setEditingAuth(auth);
    setForm({
      auth_number: auth.auth_number || '',
      insurance_name: auth.insurance_name || '',
      insurance_phone: auth.insurance_phone || '',
      authorized_visits: auth.authorized_visits != null ? String(auth.authorized_visits) : '',
      auth_type: auth.auth_type || 'visits',
      units_authorized: auth.units_authorized != null ? String(auth.units_authorized) : '',
      discipline: auth.discipline || 'PT',
      start_date: auth.start_date ? auth.start_date.split('T')[0] : '',
      end_date: auth.end_date ? auth.end_date.split('T')[0] : '',
      status: auth.status || 'pending',
      notes: auth.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!editingAuth && !episodeId) {
      toast.error('An active episode is required to create a prior authorization');
      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Start date and end date are required');
      return;
    }
    setSubmitting(true);
    try {
      if (editingAuth) {
        // Update existing authorization
        const res = await fetch(`/api/authorizations/${editingAuth.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_number: form.auth_number || null,
            insurance_name: form.insurance_name || null,
            insurance_phone: form.insurance_phone || null,
            discipline: form.discipline || null,
            auth_type: form.auth_type,
            authorized_visits: form.auth_type === 'visits' ? (parseInt(form.authorized_visits) || null) : null,
            units_authorized: form.auth_type === 'units' ? (parseInt(form.units_authorized) || null) : null,
            start_date: form.start_date,
            end_date: form.end_date,
            status: form.status,
            notes: form.notes || null,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'Failed to update');
        }
        toast.success('Authorization updated');
      } else {
        // Create new authorization
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
      }
      setDialogOpen(false);
      resetForm();
      fetchAuths();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error saving authorization');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/authorizations/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to delete');
      }
      toast.success('Authorization deleted');
      setDeleteTarget(null);
      fetchAuths();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error deleting authorization');
    }
  };

  const handleExport = () => {
    if (auths.length === 0) {
      toast.error('No authorizations to export');
      return;
    }

    const exportData = auths.map((auth) => ({
      'Auth Number': auth.auth_number || '',
      'Insurance Name': auth.insurance_name || '',
      'Insurance Phone': auth.insurance_phone || '',
      'Discipline': auth.discipline || '',
      'Auth Type': auth.auth_type || 'visits',
      'Authorized Visits': auth.auth_type === 'units' ? '' : (auth.authorized_visits ?? ''),
      'Used Visits': auth.auth_type === 'units' ? '' : auth.used_visits,
      'Units Authorized': auth.auth_type === 'units' ? (auth.units_authorized ?? '') : '',
      'Units Used': auth.auth_type === 'units' ? (auth.units_used ?? '') : '',
      'Start Date': auth.start_date ? auth.start_date.split('T')[0] : '',
      'End Date': auth.end_date ? auth.end_date.split('T')[0] : '',
      'Status': auth.status || '',
      'Notes': auth.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Authorizations');

    // Auto-size columns
    const colWidths = Object.keys(exportData[0]).map((key) => ({
      wch: Math.max(key.length, ...exportData.map((row) => String(row[key as keyof typeof row] || '').length)) + 2,
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, 'authorizations_export.xlsx');
    toast.success('Authorizations exported');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clinic_id', clinicId);
      formData.append('mode', 'import');

      const res = await fetch('/api/authorizations/import-export', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Import failed');
        return;
      }

      const data = await res.json();
      if (data.success > 0) {
        toast.success(`Imported ${data.success} authorization${data.success !== 1 ? 's' : ''}`);
      }
      if (data.skipped > 0) {
        toast.info(`${data.skipped} skipped (duplicates)`);
      }
      if (data.needs_review > 0) {
        toast.warning(`${data.needs_review} row${data.needs_review !== 1 ? 's' : ''} need manual review`);
      }
      if (data.errors > 0) {
        toast.error(`${data.errors} row${data.errors !== 1 ? 's' : ''} had errors`);
      }
      // Show per-row details for errors and review items
      data.results
        .filter((r: { status: string }) => r.status === 'error' || r.status === 'needs_review')
        .slice(0, 5)
        .forEach((r: { row: number; status: string; error?: string }) => {
          if (r.status === 'error') {
            toast.error(`Row ${r.row}: ${r.error}`);
          } else {
            toast.warning(`Row ${r.row}: ${r.error}`);
          }
        });

      fetchAuths();
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Prior Authorizations
        </CardTitle>
        <div className="flex items-center gap-1">
          {/* Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="Import from Excel"
          >
            {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          </Button>

          {/* Export */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleExport}
            disabled={auths.length === 0}
            title="Export to Excel"
          >
            <Download className="h-3 w-3" />
          </Button>

          {/* Add new */}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingAuth ? 'Edit Authorization' : 'Add Prior Authorization'}</DialogTitle>
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
                <div>
                  <Label>Insurance Phone</Label>
                  <Input value={form.insurance_phone} onChange={(e) => setForm(f => ({ ...f, insurance_phone: e.target.value }))} placeholder="e.g. 800-555-0123" />
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
                  {submitting ? 'Saving...' : editingAuth ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : auths.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">No prior authorizations.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Import from Excel
            </Button>
          </div>
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
                  className={`border rounded p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                    auth.discipline === 'PT' ? 'border-l-4 border-l-blue-500' :
                    auth.discipline === 'OT' ? 'border-l-4 border-l-green-500' :
                    auth.discipline === 'ST' ? 'border-l-4 border-l-purple-500' : ''
                  } ${isWarning ? 'border-amber-300 bg-amber-50' : ''} ${isExpiring ? 'border-red-300 bg-red-50' : ''}`}
                  onClick={() => openEditDialog(auth)}
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
                    <div className="flex items-center gap-1">
                      {isWarning && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); openEditDialog(auth); }}
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(auth); }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
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
                  {auth.insurance_name && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {auth.insurance_name}
                      {auth.insurance_phone ? ` - ${auth.insurance_phone}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Authorization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete authorization
              {deleteTarget?.auth_number ? ` #${deleteTarget.auth_number}` : ''}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
