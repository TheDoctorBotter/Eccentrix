'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  FileText,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { AuditLogEntry, AuditAction } from '@/lib/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';

const ACTION_OPTIONS: AuditAction[] = [
  'view',
  'create',
  'update',
  'delete',
  'export',
  'print',
  'sign',
  'login',
  'logout',
];

const RESOURCE_TYPE_OPTIONS = [
  'patient',
  'episode',
  'document',
  'visit',
  'note',
  'exercise',
  'hep_program',
  'message',
  'provider_profile',
  'user',
  'clinic',
  'billing',
  'authorization',
];

const PAGE_SIZE = 25;

export default function AuditPage() {
  const router = useRouter();
  const { currentClinic, loading: authLoading, hasRole } = useAuth();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');

  const isAdmin = hasRole(['admin']);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/');
      toast.error('Access restricted to administrators');
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id || !isAdmin) return;
    fetchEntries();
  }, [authLoading, currentClinic?.clinic_id, page, isAdmin]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        clinic_id: currentClinic?.clinic_id || '',
        limit: PAGE_SIZE.toString(),
        offset: (page * PAGE_SIZE).toString(),
      });

      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (resourceTypeFilter !== 'all') params.set('resource_type', resourceTypeFilter);
      if (userSearch) params.set('user_id', userSearch);

      const res = await fetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const result = await res.json();
      setEntries(result.data || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Error fetching audit log:', error);
      toast.error('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPage(0);
    fetchEntries();
  };

  const handleExportCsv = () => {
    if (entries.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Description'];
    const rows = entries.map((entry) => [
      formatLocalDate(entry.created_at, 'yyyy-MM-dd h:mm:ss a'),
      entry.user_email || entry.user_id || '',
      entry.action,
      entry.resource_type,
      entry.resource_id || '',
      entry.resource_description || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${formatLocalDate(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Audit log exported');
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'update':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'delete':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'view':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'export':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'print':
        return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'sign':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'login':
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 'logout':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-[600px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Audit Log
            </h1>
            <p className="text-slate-500 mt-1">
              Track all system activity and changes
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="grid gap-1.5">
                <Label className="text-xs">Date From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Date To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Action</Label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {ACTION_OPTIONS.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action.charAt(0).toUpperCase() + action.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Resource Type</Label>
                <Select
                  value={resourceTypeFilter}
                  onValueChange={setResourceTypeFilter}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Resources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Resources</SelectItem>
                    {RESOURCE_TYPE_OPTIONS.map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {rt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">User Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="User ID or email"
                    className="pl-8 w-48"
                  />
                </div>
              </div>
              <Button onClick={handleApplyFilters} size="sm">
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 rounded" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-700">
                  No audit entries found
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Try adjusting your filters
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const isExpanded = expandedId === entry.id;
                    return (
                      <>
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : entry.id)
                          }
                        >
                          <TableCell className="text-xs text-slate-600">
                            {formatLocalDate(
                              entry.created_at,
                              'MMM d, yyyy h:mm:ss a'
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.user_email || entry.user_id?.slice(0, 8) || 'System'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${getActionColor(entry.action)}`}
                            >
                              {entry.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="text-slate-600">
                              {entry.resource_type.replace(/_/g, ' ')}
                            </span>
                            {entry.resource_id && (
                              <span className="text-xs text-slate-400 ml-1">
                                ({entry.resource_id.slice(0, 8)})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                            {entry.resource_description || '-'}
                          </TableCell>
                          <TableCell>
                            {entry.changes && (
                              isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              )
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && entry.changes && (
                          <TableRow key={`${entry.id}-expanded`}>
                            <TableCell colSpan={6} className="bg-slate-50">
                              <div className="p-3">
                                <p className="text-xs font-medium text-slate-700 mb-2">
                                  Changes
                                </p>
                                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-48">
                                  {JSON.stringify(entry.changes, null, 2)}
                                </pre>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-slate-500">
                Showing {page * PAGE_SIZE + 1}-
                {Math.min((page + 1) * PAGE_SIZE, total)} of {total} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-slate-600">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
