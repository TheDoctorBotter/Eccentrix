'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Clock, Pencil, Trash2, Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { formatLocalDate, safeDate } from '@/lib/utils';
import { AuthorizationForm, AuthorizationFormData } from '@/components/authorizations/AuthorizationForm';
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

export function PriorAuthSection({ patientId, clinicId, episodeId }: Props) {
  const [auths, setAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingAuth, setEditingAuth] = useState<PriorAuth | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriorAuth | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const openEditDialog = (auth: PriorAuth) => {
    setEditingAuth(auth);
    setDialogOpen(true);
  };

  const handleFormSave = async (formData: AuthorizationFormData) => {
    if (!editingAuth && !episodeId) {
      toast.error('An active episode is required to create a prior authorization');
      return;
    }
    if (!formData.start_date || !formData.end_date) {
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
            auth_number: formData.auth_number || null,
            insurance_name: formData.insurance_name || null,
            insurance_phone: formData.insurance_phone || null,
            discipline: formData.discipline || null,
            auth_type: formData.auth_type,
            authorized_visits: formData.auth_type === 'visits' ? (parseInt(formData.authorized_visits) || null) : null,
            units_authorized: formData.auth_type === 'units' ? (parseInt(formData.units_authorized) || null) : null,
            start_date: formData.start_date,
            end_date: formData.end_date,
            status: formData.status,
            notes: formData.notes || null,
            updated_at: new Date().toISOString(),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'Failed to update');
        }
        toast.success('Authorization updated successfully');
      } else {
        // Create new authorization
        const res = await fetch('/api/authorizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            patient_id: patientId,
            clinic_id: clinicId,
            episode_id: episodeId,
            authorized_visits: formData.auth_type === 'visits' ? parseInt(formData.authorized_visits) || null : null,
            units_authorized: formData.auth_type === 'units' ? parseInt(formData.units_authorized) || null : null,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || 'Failed to create');
        }
        toast.success('Prior authorization created');
      }
      setDialogOpen(false);
      setEditingAuth(null);
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
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingAuth(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setEditingAuth(null)}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingAuth ? 'Edit Authorization' : 'Add Prior Authorization'}</DialogTitle>
              </DialogHeader>
              <AuthorizationForm
                mode={editingAuth ? 'edit' : 'create'}
                initialData={editingAuth}
                onSave={handleFormSave}
                onCancel={() => setDialogOpen(false)}
                submitting={submitting}
                defaultStartDate={formatLocalDate(new Date(), 'yyyy-MM-dd')}
              />
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
              const endDate = safeDate(auth.end_date);
              const daysToExpiry = endDate
                ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : Infinity;
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
                          auth.discipline === 'OT' ? 'bg-lime-100 text-lime-700 border-lime-200' :
                          auth.discipline === 'ST' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : ''
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
                      {formatLocalDate(auth.start_date, 'MM/dd/yy')} - {formatLocalDate(auth.end_date, 'MM/dd/yy')}
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
