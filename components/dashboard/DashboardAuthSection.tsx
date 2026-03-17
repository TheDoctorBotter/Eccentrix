'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Clock, ChevronDown, ChevronUp, AlertTriangle, Upload, Download, Loader2, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, SkipForward, Pencil } from 'lucide-react';
import { formatLocalDate, safeDateTimestamp } from '@/lib/utils';
import { toast } from 'sonner';
import { AuthorizationForm, AuthorizationFormData, AuthorizationRecord } from '@/components/authorizations/AuthorizationForm';
import { getAuthStatus, AUTH_THRESHOLDS } from '@/lib/authorizations';
import type { AuthDisplayStatus } from '@/lib/authorizations';
import * as XLSX from 'xlsx';

interface ImportResultRow {
  row: number;
  patient_name: string;
  auth_number: string;
  status: 'success' | 'error' | 'skipped' | 'needs_review';
  error?: string;
  auth_id?: string;
  matched_name?: string;
  candidates?: { id: string; name: string }[];
  row_data?: Record<string, unknown>;
}

interface ImportResponse {
  total: number;
  success: number;
  errors: number;
  skipped: number;
  needs_review: number;
  results: ImportResultRow[];
}

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
  insurance_name?: string | null;
  insurance_phone?: string | null;
  notes?: string | null;
  patient_name?: string;
}

interface Props {
  clinicId: string;
}

const PAGE_SIZE = 10;

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'bg-blue-100 text-blue-700 border-blue-200',
  OT: 'bg-lime-100 text-lime-700 border-lime-200',
  ST: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export function DashboardAuthSection({ clinicId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [auths, setAuths] = useState<AuthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [page, setPage] = useState(0);
  const [disciplineFilter, setDisciplineFilter] = useState<'All' | 'PT' | 'OT' | 'ST'>('All');
  const [lastNameSearch, setLastNameSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResponse | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  const [submittingManual, setSubmittingManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastImportFile = useRef<File | null>(null);
  const [patientMap, setPatientMap] = useState<Map<string, { first_name: string; last_name: string }>>(new Map());
  const [editingAuth, setEditingAuth] = useState<AuthSummary | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchAuths = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/authorizations?clinic_id=${clinicId}&status=approved,exhausted`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      // Resolve patient names
      const patRes = await fetch(`/api/patients?clinic_id=${clinicId}`);
      let patMap = new Map<string, string>();
      const fullPatMap = new Map<string, { first_name: string; last_name: string }>();
      if (patRes.ok) {
        const patients = await patRes.json();
        patMap = new Map(
          (Array.isArray(patients) ? patients : []).map(
            (p: { id: string; first_name: string; last_name: string }) => {
              fullPatMap.set(p.id, { first_name: p.first_name, last_name: p.last_name });
              return [p.id, `${p.last_name}, ${p.first_name}`];
            }
          )
        );
      }
      setPatientMap(fullPatMap);

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

  const handleExportAll = async () => {
    try {
      const res = await fetch(`/api/authorizations/import-export?clinic_id=${clinicId}`);
      if (!res.ok) {
        toast.error('Failed to export authorizations');
        return;
      }
      const { auths: allAuths, patients } = await res.json();

      if (!allAuths || allAuths.length === 0) {
        toast.error('No authorizations to export');
        return;
      }

      const exportData = allAuths.map((auth: Record<string, unknown>) => {
        const pat = (patients as Record<string, { first_name: string; last_name: string }>)?.[auth.patient_id as string];
        return {
          'Patient First Name': pat?.first_name || '',
          'Patient Last Name': pat?.last_name || '',
          'Auth Number': auth.auth_number || '',
          'Insurance Name': auth.insurance_name || '',
          'Insurance Phone': auth.insurance_phone || '',
          'Discipline': auth.discipline || '',
          'Auth Type': auth.auth_type || 'visits',
          'Authorized Visits': auth.auth_type === 'units' ? '' : (auth.authorized_visits ?? ''),
          'Used Visits': auth.auth_type === 'units' ? '' : (auth.used_visits ?? 0),
          'Units Authorized': auth.auth_type === 'units' ? (auth.units_authorized ?? '') : '',
          'Units Used': auth.auth_type === 'units' ? (auth.units_used ?? '') : '',
          'Start Date': auth.start_date ? String(auth.start_date).split('T')[0] : '',
          'End Date': auth.end_date ? String(auth.end_date).split('T')[0] : '',
          'Status': auth.status || '',
          'Notes': auth.notes || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Authorizations');

      const colWidths = Object.keys(exportData[0]).map((key: string) => ({
        wch: Math.max(key.length, ...exportData.map((row: Record<string, unknown>) => String(row[key] || '').length)) + 2,
      }));
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, 'all_authorizations_export.xlsx');
      toast.success(`Exported ${allAuths.length} authorizations`);
    } catch {
      toast.error('Export failed');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    lastImportFile.current = file;
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

      const data: ImportResponse = await res.json();
      setImportResults(data);
      setManualSelections({});
      setShowResultsDialog(true);

      if (data.success > 0) {
        toast.success(`Imported ${data.success} authorization${data.success !== 1 ? 's' : ''}`);
      }
      if (data.needs_review > 0) {
        toast.warning(`${data.needs_review} row${data.needs_review !== 1 ? 's' : ''} need manual review`);
      }

      // Refresh data
      setFetched(false);
      if (expanded) fetchAuths();
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitManualMatches = async () => {
    if (!lastImportFile.current || Object.keys(manualSelections).length === 0) return;

    setSubmittingManual(true);
    try {
      const formData = new FormData();
      formData.append('file', lastImportFile.current);
      formData.append('clinic_id', clinicId);
      formData.append('mode', 'import');
      formData.append('manual_matches', JSON.stringify(manualSelections));

      const res = await fetch('/api/authorizations/import-export', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        toast.error('Failed to submit manual matches');
        return;
      }

      const data: ImportResponse = await res.json();

      // Merge results — keep original non-review results, replace review rows with new results
      if (importResults) {
        const reviewRows = new Set(Object.keys(manualSelections));
        const kept = importResults.results.filter(
          r => !reviewRows.has(String(r.row))
        );
        const newFromManual = data.results.filter(
          r => reviewRows.has(String(r.row))
        );
        const merged: ImportResponse = {
          total: importResults.total,
          success: importResults.success + data.success,
          errors: importResults.errors + data.errors,
          skipped: importResults.skipped + data.skipped,
          needs_review: Math.max(0, (importResults.needs_review || 0) - Object.keys(manualSelections).length + (data.needs_review || 0)),
          results: [...kept, ...newFromManual].sort((a, b) => a.row - b.row),
        };
        setImportResults(merged);
      }

      if (data.success > 0) {
        toast.success(`Imported ${data.success} more authorization${data.success !== 1 ? 's' : ''}`);
      }

      setManualSelections({});
      setFetched(false);
      if (expanded) fetchAuths();
    } catch {
      toast.error('Failed to submit manual matches');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'Patient First Name': 'John',
        'Patient Last Name': 'Smith',
        'Auth Number': 'AUTH-2024-001',
        'Insurance Name': 'Blue Cross',
        'Insurance Phone': '800-555-0100',
        'Discipline': 'PT',
        'Auth Type': 'visits',
        'Authorized Visits': 20,
        'Units Authorized': '',
        'Start Date': '2024-01-15',
        'End Date': '2024-07-15',
        'Status': 'approved',
        'Notes': 'Initial eval + 19 follow-up visits',
      },
      {
        'Patient First Name': 'Jane',
        'Patient Last Name': 'Doe',
        'Auth Number': 'AUTH-2024-002',
        'Insurance Name': 'Aetna',
        'Insurance Phone': '800-555-0200',
        'Discipline': 'OT',
        'Auth Type': 'units',
        'Authorized Visits': '',
        'Units Authorized': 48,
        'Start Date': '2024-02-01',
        'End Date': '2024-08-01',
        'Status': 'approved',
        'Notes': '48 units for OT services',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Authorizations');

    const colWidths = Object.keys(sampleData[0]).map((key) => ({
      wch: Math.max(key.length, ...sampleData.map((row) => String(row[key as keyof typeof row] || '').length)) + 2,
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, 'authorization_import_template.xlsx');
    toast.success('Template downloaded');
  };

  const openEditDialog = (auth: AuthSummary) => {
    setEditingAuth(auth);
    setEditDialogOpen(true);
  };

  const handleEditSave = async (formData: AuthorizationFormData) => {
    if (!editingAuth) return;
    setEditSubmitting(true);
    try {
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
      const updated = await res.json();
      // Update local state immediately — preserve filters
      setAuths((prev) =>
        prev.map((a) =>
          a.id === editingAuth.id
            ? { ...a, ...updated, patient_name: a.patient_name }
            : a
        )
      );
      toast.success('Authorization updated successfully');
      setEditDialogOpen(false);
      setEditingAuth(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error updating authorization');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Enrich auths with computed fields for sorting and display
  const enrichedAuths = auths.map((a) => {
    const disc = (a.discipline || 'PT').toUpperCase();
    const isUnitBased = a.auth_type === 'units' || ['PT', 'OT'].includes(disc);
    const remaining = isUnitBased
      ? (a.units_authorized ?? 0) - (a.units_used ?? 0)
      : a.remaining_visits ?? (a.authorized_visits ?? 0) - a.used_visits;
    const endTs = safeDateTimestamp(a.end_date, Date.now());
    const daysToExpiry = Math.ceil((endTs - Date.now()) / (1000 * 60 * 60 * 24));
    const displayStatus = getAuthStatus(remaining, disc, a.end_date);
    return { ...a, _remaining: remaining, _daysToExpiry: daysToExpiry, _displayStatus: displayStatus, _isUnitBased: isUnitBased };
  });

  // Sort: active (expiring soonest) → low/critical → exhausted → expired
  const STATUS_SORT_ORDER: Record<AuthDisplayStatus, number> = {
    active: 0,
    expiring: 1,
    low: 2,
    critical: 3,
    exhausted: 4,
  };
  enrichedAuths.sort((a, b) => {
    // Expired auths (end_date past) go to bottom
    const aExpired = a._daysToExpiry <= 0;
    const bExpired = b._daysToExpiry <= 0;
    if (aExpired !== bExpired) return aExpired ? 1 : -1;
    // Then sort by display status category
    const aSortKey = STATUS_SORT_ORDER[a._displayStatus] ?? 5;
    const bSortKey = STATUS_SORT_ORDER[b._displayStatus] ?? 5;
    if (aSortKey !== bSortKey) return aSortKey - bSortKey;
    // Within same category: exhausted by most recent end_date, others by expiring soonest
    if (a._displayStatus === 'exhausted') return b._daysToExpiry - a._daysToExpiry;
    if (a._displayStatus === 'low' || a._displayStatus === 'critical') return a._remaining - b._remaining;
    return a._daysToExpiry - b._daysToExpiry;
  });

  const filteredAuths = enrichedAuths.filter((a) => {
    const disc = a.discipline || 'PT';
    if (disciplineFilter !== 'All' && disc !== disciplineFilter) return false;
    if (lastNameSearch) {
      const name = (a.patient_name || '').toLowerCase();
      const lastName = name.split(',')[0].trim();
      if (!lastName.includes(lastNameSearch.toLowerCase())) return false;
    }
    return true;
  });

  // Counts for summary badges
  const activeCount = enrichedAuths.filter(a => a._displayStatus === 'active' || a._displayStatus === 'expiring').length;
  const lowBalanceCount = enrichedAuths.filter(a => a._displayStatus === 'low' || a._displayStatus === 'critical').length;
  const exhaustedCount = enrichedAuths.filter(a => a._displayStatus === 'exhausted').length;
  const expiredCount = enrichedAuths.filter(a => a._daysToExpiry <= 0 && a._displayStatus !== 'exhausted').length;

  const totalPages = Math.ceil(filteredAuths.length / PAGE_SIZE);
  const pageAuths = filteredAuths.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Authorizations</CardTitle>
            {fetched && (
              <>
                <Badge variant="outline" className="ml-1">
                  {auths.length}
                </Badge>
                {activeCount > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                    Active: {activeCount}
                  </Badge>
                )}
                {lowBalanceCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                    Low Balance: {lowBalanceCount}
                  </Badge>
                )}
                {exhaustedCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                    Exhausted: {exhaustedCount}
                  </Badge>
                )}
              </>
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
          {/* Import/Export toolbar */}
          <div className="flex items-center justify-end gap-2 mb-3 pb-3 border-b">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              className="hidden"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadTemplate}
              className="gap-1 text-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Template
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="gap-1 text-xs"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportAll}
              className="gap-1 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export All
            </Button>
          </div>

          {/* Filters */}
          {fetched && auths.length > 0 && (
            <div className="flex items-center gap-3 mb-3 pb-3 border-b flex-wrap">
              <div className="flex items-center rounded-lg border overflow-hidden text-xs">
                {(['All', 'PT', 'OT', 'ST'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`px-3 py-1.5 font-medium transition-colors ${
                      disciplineFilter === opt
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => { setDisciplineFilter(opt); setPage(0); }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search by patient last name"
                value={lastNameSearch}
                onChange={(e) => { setLastNameSearch(e.target.value); setPage(0); }}
                className="border rounded-md px-3 py-1.5 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          )}

          {/* Exhausted auths alert banner */}
          {fetched && exhaustedCount > 0 && (
            <div className="flex items-center gap-3 p-3 mb-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700">
                <strong>{exhaustedCount}</strong> authorization{exhaustedCount !== 1 ? 's are' : ' is'} exhausted and may need renewal.
              </span>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading authorizations...
            </p>
          ) : auths.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                No authorizations found.
              </p>
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
          ) : filteredAuths.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No authorizations match your filters.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {pageAuths.map((auth) => {
                  const { _remaining: remaining, _daysToExpiry: daysToExpiry, _displayStatus: displayStatus, _isUnitBased: isUnitBased } = auth;
                  const authorized = isUnitBased ? (auth.units_authorized ?? 0) : (auth.authorized_visits ?? 0);
                  const label = isUnitBased ? 'units' : 'visits';
                  const isExpired = daysToExpiry <= 0;
                  const isExhausted = displayStatus === 'exhausted';

                  // Background styling based on status
                  const cardBg = isExhausted
                    ? 'bg-gray-50 opacity-75'
                    : isExpired
                      ? 'bg-gray-50 opacity-75'
                      : displayStatus === 'critical'
                        ? 'bg-red-50'
                        : displayStatus === 'low'
                          ? 'bg-amber-50'
                          : displayStatus === 'expiring'
                            ? 'bg-amber-50'
                            : '';

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
                      } ${cardBg}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium text-sm ${isExhausted || isExpired ? 'text-slate-500' : 'text-slate-900'}`}>
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
                          {isExhausted && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                              Exhausted
                            </Badge>
                          )}
                          {isExpired && !isExhausted && (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">
                              Expired
                            </Badge>
                          )}
                          {displayStatus === 'critical' && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                              Critical
                            </Badge>
                          )}
                          {displayStatus === 'low' && (
                            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">
                              Low
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(displayStatus === 'low' || displayStatus === 'critical' || displayStatus === 'expiring') && (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditDialog(auth)}
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <span
                            className={
                              remaining <= 0
                                ? 'text-red-600 font-bold'
                                : displayStatus === 'critical'
                                  ? 'text-red-600 font-semibold'
                                  : displayStatus === 'low'
                                    ? 'text-amber-600 font-semibold'
                                    : 'text-emerald-600 font-semibold'
                            }
                          >
                            {remaining} / {authorized}
                          </span>
                          {' '}{label} remaining
                        </span>
                        <span>
                          {formatLocalDate(auth.start_date, 'MM/dd/yy')} –{' '}
                          {formatLocalDate(auth.end_date, 'MM/dd/yy')}
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
      {/* Edit Authorization Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingAuth(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Authorization</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
          <AuthorizationForm
            mode="edit"
            initialData={editingAuth as AuthorizationRecord | null}
            onSave={handleEditSave}
            onCancel={() => { setEditDialogOpen(false); setEditingAuth(null); }}
            submitting={editSubmitting}
            patientName={editingAuth?.patient_name}
          />
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Results</DialogTitle>
          </DialogHeader>

          {importResults && (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap text-sm border-b pb-3">
                <span className="font-medium">{importResults.total} rows</span>
                {importResults.success > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    {importResults.success} imported
                  </Badge>
                )}
                {importResults.needs_review > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                    {importResults.needs_review} need review
                  </Badge>
                )}
                {importResults.errors > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200">
                    {importResults.errors} errors
                  </Badge>
                )}
                {importResults.skipped > 0 && (
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200">
                    {importResults.skipped} skipped
                  </Badge>
                )}
              </div>

              {/* Results list */}
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {importResults.results.map((r) => (
                  <div
                    key={r.row}
                    className={`border rounded-lg p-3 text-sm ${
                      r.status === 'success'
                        ? 'border-emerald-200 bg-emerald-50'
                        : r.status === 'needs_review'
                          ? 'border-amber-200 bg-amber-50'
                          : r.status === 'skipped'
                            ? 'border-slate-200 bg-slate-50'
                            : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 mt-0.5">
                        {r.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {r.status === 'needs_review' && <AlertCircle className="h-4 w-4 text-amber-600" />}
                        {r.status === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
                        {r.status === 'skipped' && <SkipForward className="h-4 w-4 text-slate-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900">Row {r.row}</span>
                          <span className="text-slate-600">{r.patient_name}</span>
                          {r.auth_number && (
                            <span className="text-xs font-mono text-slate-500">#{r.auth_number}</span>
                          )}
                        </div>
                        {r.error && (
                          <p className={`mt-1 text-xs ${
                            r.status === 'error' ? 'text-red-700' :
                            r.status === 'needs_review' ? 'text-amber-700' :
                            'text-slate-600'
                          }`}>
                            {r.error}
                          </p>
                        )}

                        {/* Manual match dropdown for needs_review rows */}
                        {r.status === 'needs_review' && r.candidates && r.candidates.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-slate-600 shrink-0">Match to:</span>
                            <Select
                              value={manualSelections[String(r.row)] || ''}
                              onValueChange={(v) =>
                                setManualSelections((prev) => ({ ...prev, [String(r.row)]: v }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Select patient..." />
                              </SelectTrigger>
                              <SelectContent>
                                {r.candidates.map((c) => (
                                  <SelectItem key={c.id} value={c.id} className="text-xs">
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer with manual match submit */}
              <DialogFooter className="border-t pt-3">
                {importResults.needs_review > 0 &&
                  importResults.results.some(r => r.status === 'needs_review') && (
                  <div className="flex items-center gap-2 mr-auto">
                    <span className="text-xs text-slate-500">
                      {Object.keys(manualSelections).length} of{' '}
                      {importResults.results.filter(r => r.status === 'needs_review').length} matched
                    </span>
                  </div>
                )}
                {Object.keys(manualSelections).length > 0 && (
                  <Button
                    size="sm"
                    onClick={handleSubmitManualMatches}
                    disabled={submittingManual}
                    className="gap-1"
                  >
                    {submittingManual ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Import {Object.keys(manualSelections).length} Matched
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResultsDialog(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
