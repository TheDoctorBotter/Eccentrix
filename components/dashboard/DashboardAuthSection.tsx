'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, ChevronDown, ChevronUp, AlertTriangle, Upload, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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
  OT: 'bg-green-100 text-green-700 border-green-200',
  ST: 'bg-purple-100 text-purple-700 border-purple-200',
};

export function DashboardAuthSection({ clinicId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [auths, setAuths] = useState<AuthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [patientMap, setPatientMap] = useState<Map<string, { first_name: string; last_name: string }>>(new Map());

  const fetchAuths = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/authorizations?clinic_id=${clinicId}&status=approved`
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
      if (data.errors > 0) {
        toast.error(`${data.errors} row${data.errors !== 1 ? 's' : ''} had errors`);
        data.results
          .filter((r: { status: string }) => r.status === 'error')
          .slice(0, 3)
          .forEach((r: { row: number; error?: string }) => {
            toast.error(`Row ${r.row}: ${r.error}`);
          });
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

  const totalPages = Math.ceil(auths.length / PAGE_SIZE);
  const pageAuths = auths.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Authorizations</CardTitle>
            {fetched && (
              <Badge variant="outline" className="ml-1">
                {auths.length}
              </Badge>
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

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading authorizations...
            </p>
          ) : auths.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                No approved authorizations found.
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
          ) : (
            <>
              <div className="space-y-2">
                {pageAuths.map((auth) => {
                  const remaining =
                    auth.auth_type === 'units'
                      ? (auth.units_authorized ?? 0) - (auth.units_used ?? 0)
                      : auth.remaining_visits ??
                        (auth.authorized_visits ?? 0) - auth.used_visits;
                  const daysToExpiry = Math.ceil(
                    (new Date(auth.end_date).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24)
                  );
                  const isWarning = daysToExpiry <= 30 || remaining <= 10;

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
                      } ${isWarning ? 'bg-amber-50' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-slate-900">
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
                        </div>
                        {isWarning && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
                        <span>
                          {auth.auth_type === 'units' ? 'Units' : 'Visits'}:{' '}
                          <span
                            className={
                              remaining <= 3
                                ? 'text-red-600 font-bold'
                                : remaining < 5
                                  ? 'text-amber-600 font-semibold'
                                  : 'text-emerald-600 font-semibold'
                            }
                          >
                            {remaining} remaining
                          </span>
                        </span>
                        <span>
                          {format(parseISO(auth.start_date), 'MM/dd/yy')} –{' '}
                          {format(parseISO(auth.end_date), 'MM/dd/yy')}
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
    </Card>
  );
}
