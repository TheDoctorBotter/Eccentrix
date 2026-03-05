'use client';

import { useEffect, useState, useCallback } from 'react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import {
  Claim,
  ClaimStatus,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_COLORS,
} from '@/lib/types';
import type { Invoice, ExtendedPriorAuth } from '@/lib/billing/types';
import { format, parseISO } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  DollarSign, FileText, AlertTriangle, RefreshCw, Download, Eye, Send,
} from 'lucide-react';

interface DashboardFilters {
  dateFrom: string;
  dateTo: string;
  payerType: string;
  discipline: string;
  status: string;
  page: number;
}

const PAGE_SIZE = 20;

export default function BillingDashboard() {
  const { currentClinic, user } = useAuth();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [priorAuths, setPriorAuths] = useState<ExtendedPriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Summary stats
  const [totalCharges, setTotalCharges] = useState(0);
  const [totalSubmitted, setTotalSubmitted] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  const now = new Date();
  const [filters, setFilters] = useState<DashboardFilters>({
    dateFrom: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'),
    dateTo: formatLocalDate(now, 'yyyy-MM-dd'),
    payerType: 'all',
    discipline: 'all',
    status: 'all',
    page: 1,
  });

  const clinicId = currentClinic?.id;

  const fetchData = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);

    try {
      // Fetch claims
      const claimParams = new URLSearchParams({ clinic_id: clinicId });
      if (filters.status !== 'all') claimParams.set('status', filters.status);

      const claimsRes = await fetch(`/api/claims?${claimParams}`);
      const claimsData = await claimsRes.json();

      let filteredClaims = Array.isArray(claimsData) ? claimsData : [];

      // Client-side filters for date range, payer type, discipline
      if (filters.dateFrom) {
        filteredClaims = filteredClaims.filter(
          (c: Claim) => c.created_at >= filters.dateFrom
        );
      }
      if (filters.dateTo) {
        filteredClaims = filteredClaims.filter(
          (c: Claim) => c.created_at.slice(0, 10) <= filters.dateTo
        );
      }
      if (filters.payerType !== 'all') {
        filteredClaims = filteredClaims.filter(
          (c: Record<string, unknown>) => c.payer_type === filters.payerType
        );
      }
      if (filters.discipline !== 'all') {
        filteredClaims = filteredClaims.filter(
          (c: Record<string, unknown>) => c.discipline === filters.discipline
        );
      }

      // Paginate
      const start = (filters.page - 1) * PAGE_SIZE;
      const paginatedClaims = filteredClaims.slice(start, start + PAGE_SIZE);
      setClaims(paginatedClaims);

      // Calculate stats from all filtered claims
      setTotalCharges(filteredClaims.reduce((s: number, c: Claim) => s + (c.total_charges || 0), 0));
      setTotalSubmitted(
        filteredClaims
          .filter((c: Claim) => ['submitted', 'accepted'].includes(c.status))
          .reduce((s: number, c: Claim) => s + (c.total_charges || 0), 0)
      );
      setTotalPaid(
        filteredClaims
          .filter((c: Claim) => c.status === 'paid')
          .reduce((s: number, c: Claim) => s + (c.paid_amount || c.total_charges || 0), 0)
      );
      setTotalOutstanding(
        filteredClaims
          .filter((c: Claim) => !['paid', 'void', 'denied'].includes(c.status))
          .reduce((s: number, c: Claim) => s + (c.total_charges || 0), 0)
      );

      // Fetch invoices
      const invoicesRes = await fetch(`/api/payments?clinic_id=${clinicId}&from=${filters.dateFrom}&to=${filters.dateTo}`);
      // Invoices use a different endpoint - fetch from billing page pattern

      // Fetch prior auths
      const authsRes = await fetch(`/api/authorizations?clinic_id=${clinicId}`);
      const authsData = await authsRes.json();
      const allAuths = Array.isArray(authsData) ? authsData : [];
      setPriorAuths(allAuths as ExtendedPriorAuth[]);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clinicId, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleResubmit = async (claimId: string) => {
    setSubmitting(claimId);
    try {
      const { resubmitClaim } = await import('@/lib/billing/actions');
      const result = await resubmitClaim({
        original_claim_id: claimId,
        actor_user_id: user?.id || '',
      });
      if (result.success) {
        toast.success('Replacement claim created');
        fetchData();
      } else {
        toast.error(result.error || 'Failed to resubmit');
      }
    } catch (err) {
      toast.error('Error resubmitting claim');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDownloadEDI = async (claimId: string) => {
    try {
      const { getEDIDownloadUrl } = await import('@/lib/billing/edi-storage');
      const result = await getEDIDownloadUrl({
        claim_id: claimId,
        actor_user_id: user?.id || '',
      });
      if (result.success && result.url) {
        window.open(result.url, '_blank');
      } else {
        toast.error(result.error || 'Failed to get download URL');
      }
    } catch {
      toast.error('Error downloading EDI file');
    }
  };

  const expiringAuths = priorAuths.filter((a) => {
    if (a.status !== 'approved') return false;
    const daysToExpiry = Math.ceil(
      (new Date(a.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const remaining = a.remaining_visits ?? (a.authorized_visits ?? 0) - a.used_visits;
    return daysToExpiry <= 30 || (remaining !== null && remaining <= 10);
  });

  return (
    <>
      <TopNav />
      <div className="container mx-auto py-6 px-4 space-y-6">
        <h1 className="text-2xl font-bold">Billing Dashboard</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Charges</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalCharges.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-600">${totalSubmitted.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">${totalOutstanding.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label>From</Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value, page: 1 }))}
                />
              </div>
              <div>
                <Label>To</Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value, page: 1 }))}
                />
              </div>
              <div>
                <Label>Payer Type</Label>
                <Select value={filters.payerType} onValueChange={(v) => setFilters(f => ({ ...f, payerType: v, page: 1 }))}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="medicaid">Medicaid</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="private_pay">Private Pay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discipline</Label>
                <Select value={filters.discipline} onValueChange={(v) => setFilters(f => ({ ...f, discipline: v, page: 1 }))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="PT">PT</SelectItem>
                    <SelectItem value="OT">OT</SelectItem>
                    <SelectItem value="ST">ST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v, page: 1 }))}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="generated">Generated</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="claims">
          <TabsList>
            <TabsTrigger value="claims">Claims</TabsTrigger>
            <TabsTrigger value="authorizations">
              Prior Authorizations
              {expiringAuths.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{expiringAuths.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoices">Private Pay Invoices</TabsTrigger>
          </TabsList>

          {/* Claims Tab */}
          <TabsContent value="claims">
            <Card>
              <CardContent className="pt-4">
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : claims.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No claims found for the selected filters.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Claim #</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Payer</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {claims.map((claim) => (
                          <TableRow key={claim.id}>
                            <TableCell className="font-mono text-sm">
                              {claim.claim_number || claim.id.slice(0, 8)}
                            </TableCell>
                            <TableCell>{claim.patient_name || claim.patient_id?.slice(0, 8)}</TableCell>
                            <TableCell>{claim.payer_name}</TableCell>
                            <TableCell>${(claim.total_charges || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge className={CLAIM_STATUS_COLORS[claim.status as ClaimStatus] || ''}>
                                {CLAIM_STATUS_LABELS[claim.status as ClaimStatus] || claim.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {claim.created_at ? format(parseISO(claim.created_at), 'MM/dd/yyyy') : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {claim.status === 'rejected' || claim.status === 'denied' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleResubmit(claim.id)}
                                    disabled={submitting === claim.id}
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Resubmit
                                  </Button>
                                ) : null}
                                {(claim as unknown as Record<string, unknown>).edi_storage_path ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDownloadEDI(claim.id)}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="flex justify-between items-center mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filters.page <= 1}
                        onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">Page {filters.page}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={claims.length < PAGE_SIZE}
                        onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                      >
                        Next
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prior Authorizations Tab */}
          <TabsContent value="authorizations">
            <Card>
              <CardContent className="pt-4">
                {loading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Auth #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Discipline</TableHead>
                        <TableHead>Authorized</TableHead>
                        <TableHead>Used</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priorAuths.map((auth) => {
                        const remaining = auth.remaining_visits ?? ((auth.authorized_visits ?? 0) - auth.used_visits);
                        const daysToExpiry = Math.ceil(
                          (new Date(auth.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                        );
                        const isWarning = daysToExpiry <= 30 || (remaining !== null && remaining <= 10);

                        return (
                          <TableRow key={auth.id} className={`${isWarning ? 'bg-amber-50' : ''} ${
                            auth.discipline === 'PT' ? 'border-l-4 border-l-blue-500' :
                            auth.discipline === 'OT' ? 'border-l-4 border-l-green-500' :
                            auth.discipline === 'ST' ? 'border-l-4 border-l-purple-500' : ''
                          }`}>
                            <TableCell className="font-mono text-sm">{auth.auth_number || '-'}</TableCell>
                            <TableCell>{auth.patient_id?.slice(0, 8)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                auth.discipline === 'PT' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                auth.discipline === 'OT' ? 'bg-green-100 text-green-700 border-green-200' :
                                auth.discipline === 'ST' ? 'bg-purple-100 text-purple-700 border-purple-200' : ''
                              }>
                                {auth.discipline || 'PT'}
                              </Badge>
                            </TableCell>
                            <TableCell>{auth.authorized_visits ?? auth.units_authorized ?? '-'}</TableCell>
                            <TableCell>{auth.used_visits ?? auth.units_used ?? 0}</TableCell>
                            <TableCell>
                              {remaining !== null && remaining <= 3 ? (
                                <span className="text-red-600 font-bold flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />{remaining}
                                </span>
                              ) : (
                                remaining ?? '-'
                              )}
                            </TableCell>
                            <TableCell>
                              {daysToExpiry <= 30 ? (
                                <span className="text-amber-600 font-medium">
                                  {format(parseISO(auth.end_date), 'MM/dd/yyyy')} ({daysToExpiry}d)
                                </span>
                              ) : (
                                format(parseISO(auth.end_date), 'MM/dd/yyyy')
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={auth.status === 'approved' ? 'default' : 'secondary'}>
                                {auth.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Private Pay Invoices Tab */}
          <TabsContent value="invoices">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Private pay invoices are created when charges are routed to the private_pay payer type.
                </p>
                <p className="text-center text-muted-foreground py-8">
                  Invoice management is available on the main Billing page.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
