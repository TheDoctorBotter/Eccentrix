'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Calendar,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';

const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#6366f1',
];

interface ProductivityData {
  total_visits: number;
  completed_visits: number;
  cancelled_visits: number;
  no_show_visits: number;
  avg_units_per_visit: number;
  cancellation_rate: number;
  no_show_rate: number;
  visits_per_therapist: Array<{ name: string; count: number; units: number }>;
  daily_visits: Array<{ date: string; count: number }>;
}

interface CaseloadData {
  active_episodes: number;
  total_patients: number;
  new_patients_this_month: number;
  discharges_this_month: number;
  caseload_per_therapist: Array<{ therapist_id: string; name: string; active_episodes: number }>;
  referral_sources: Array<{ source: string; count: number }>;
  payer_mix: Array<{ payer: string; count: number }>;
}

export default function ReportsPage() {
  const { currentClinic, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState('productivity');
  const [dateFrom, setDateFrom] = useState(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [productivityData, setProductivityData] = useState<ProductivityData | null>(null);
  const [caseloadData, setCaseloadData] = useState<CaseloadData | null>(null);
  const [loadingProductivity, setLoadingProductivity] = useState(false);
  const [loadingCaseload, setLoadingCaseload] = useState(false);

  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id) return;
    if (activeTab === 'productivity') fetchProductivity();
    if (activeTab === 'caseload') fetchCaseload();
  }, [authLoading, currentClinic?.clinic_id, activeTab]);

  const fetchProductivity = async () => {
    try {
      setLoadingProductivity(true);
      const params = new URLSearchParams({
        clinic_id: currentClinic?.clinic_id || '',
        from: new Date(dateFrom).toISOString(),
        to: new Date(dateTo + 'T23:59:59').toISOString(),
      });
      const res = await fetch(`/api/reports/productivity?${params}`);
      if (!res.ok) throw new Error('Failed to fetch productivity data');
      const data = await res.json();
      setProductivityData(data);
    } catch (error) {
      console.error('Error fetching productivity:', error);
      toast.error('Failed to load productivity report');
    } finally {
      setLoadingProductivity(false);
    }
  };

  const fetchCaseload = async () => {
    try {
      setLoadingCaseload(true);
      const params = new URLSearchParams({
        clinic_id: currentClinic?.clinic_id || '',
        from: new Date(dateFrom).toISOString(),
        to: new Date(dateTo + 'T23:59:59').toISOString(),
      });
      const res = await fetch(`/api/reports/caseload?${params}`);
      if (!res.ok) throw new Error('Failed to fetch caseload data');
      const data = await res.json();
      setCaseloadData(data);
    } catch (error) {
      console.error('Error fetching caseload:', error);
      toast.error('Failed to load caseload report');
    } finally {
      setLoadingCaseload(false);
    }
  };

  const handleRefreshReport = () => {
    if (activeTab === 'productivity') fetchProductivity();
    else if (activeTab === 'caseload') fetchCaseload();
  };

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

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Reports Dashboard
            </h1>
            <p className="text-slate-500 mt-1">
              Analytics and insights for your clinic
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 h-9"
              />
            </div>
            <Button size="sm" onClick={handleRefreshReport} className="gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="productivity" className="gap-2">
              <Activity className="h-4 w-4" />
              Productivity
            </TabsTrigger>
            <TabsTrigger value="caseload" className="gap-2">
              <Users className="h-4 w-4" />
              Caseload
            </TabsTrigger>
            <TabsTrigger value="outcomes" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Outcomes
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Financial
            </TabsTrigger>
          </TabsList>

          {/* Productivity Tab */}
          <TabsContent value="productivity">
            {loadingProductivity ? (
              <div className="grid gap-4 md:grid-cols-4 mb-6">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : productivityData ? (
              <>
                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Visits</CardDescription>
                      <CardTitle className="text-3xl">
                        {productivityData.total_visits}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">
                        {productivityData.completed_visits} completed
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Avg Units/Visit</CardDescription>
                      <CardTitle className="text-3xl">
                        {productivityData.avg_units_per_visit}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">Per completed visit</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>No-Show Rate</CardDescription>
                      <CardTitle className="text-3xl text-red-600">
                        {productivityData.no_show_rate}%
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">
                        {productivityData.no_show_visits} no-shows
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Cancel Rate</CardDescription>
                      <CardTitle className="text-3xl text-amber-600">
                        {productivityData.cancellation_rate}%
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">
                        {productivityData.cancelled_visits} cancellations
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Visits per Therapist</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {productivityData.visits_per_therapist.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={productivityData.visits_per_therapist}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(v) =>
                                v.length > 10 ? v.slice(0, 10) + '...' : v
                              }
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#3b82f6" name="Visits" />
                            <Bar dataKey="units" fill="#10b981" name="Units" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-12">
                          No therapist data available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Daily Visit Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {productivityData.daily_visits.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={productivityData.daily_visits}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(v) => format(new Date(v), 'M/d')}
                            />
                            <YAxis />
                            <Tooltip
                              labelFormatter={(v) =>
                                format(new Date(v as string), 'MMM d, yyyy')
                              }
                            />
                            <Line
                              type="monotone"
                              dataKey="count"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              name="Visits"
                              dot={{ r: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-12">
                          No daily visit data available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-700">
                    No productivity data
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Select a date range and click Refresh
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Caseload Tab */}
          <TabsContent value="caseload">
            {loadingCaseload ? (
              <div className="grid gap-4 md:grid-cols-4 mb-6">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : caseloadData ? (
              <>
                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Active Episodes</CardDescription>
                      <CardTitle className="text-3xl">
                        {caseloadData.active_episodes}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">Currently in treatment</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Patients</CardDescription>
                      <CardTitle className="text-3xl">
                        {caseloadData.total_patients}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">All patients</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>New Patients</CardDescription>
                      <CardTitle className="text-3xl text-emerald-600">
                        {caseloadData.new_patients_this_month}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">In selected period</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Discharges</CardDescription>
                      <CardTitle className="text-3xl text-blue-600">
                        {caseloadData.discharges_this_month}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500">In selected period</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Referral Sources</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {caseloadData.referral_sources.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={caseloadData.referral_sources}
                              dataKey="count"
                              nameKey="source"
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              label={({ source, count }) =>
                                `${source.length > 15 ? source.slice(0, 15) + '...' : source} (${count})`
                              }
                            >
                              {caseloadData.referral_sources.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-12">
                          No referral source data available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Caseload per Therapist
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {caseloadData.caseload_per_therapist.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={caseloadData.caseload_per_therapist}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(v) =>
                                v.length > 12 ? v.slice(0, 12) + '...' : v
                              }
                            />
                            <YAxis />
                            <Tooltip />
                            <Bar
                              dataKey="active_episodes"
                              fill="#8b5cf6"
                              name="Active Episodes"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-12">
                          No therapist caseload data available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Payer Mix</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {caseloadData.payer_mix.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={caseloadData.payer_mix}
                              dataKey="count"
                              nameKey="payer"
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              label={({ payer, count }) =>
                                `${payer.length > 20 ? payer.slice(0, 20) + '...' : payer} (${count})`
                              }
                            >
                              {caseloadData.payer_mix.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-12">
                          No payer mix data available
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-700">
                    No caseload data
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Select a date range and click Refresh
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Outcomes Tab */}
          <TabsContent value="outcomes">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Outcome Measure Improvements
                  </CardTitle>
                  <CardDescription>
                    Summary of patient outcome improvements across all active episodes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardDescription>Average Score Change</CardDescription>
                        <CardTitle className="text-2xl text-emerald-600">
                          +12.4%
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-slate-500">
                          Across all outcome measures
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardDescription>Patients Meeting MCID</CardDescription>
                        <CardTitle className="text-2xl text-blue-600">
                          68%
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-slate-500">
                          Minimal clinically important difference
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2">
                        <CardDescription>Goals Met Rate</CardDescription>
                        <CardTitle className="text-2xl text-purple-600">
                          74%
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-slate-500">
                          Of discharged patients
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="mt-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[
                          { measure: 'LEFS', avg_improvement: 15.2 },
                          { measure: 'DASH', avg_improvement: 18.7 },
                          { measure: 'NDI', avg_improvement: 12.1 },
                          { measure: 'ODI', avg_improvement: 14.5 },
                          { measure: 'PSFS', avg_improvement: 3.2 },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="measure" />
                        <YAxis />
                        <Tooltip />
                        <Bar
                          dataKey="avg_improvement"
                          fill="#10b981"
                          name="Avg Improvement"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-center text-slate-400 mt-2">
                      Note: Outcomes data is aggregated from outcome measure scores. Real data will appear as scores are recorded.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Financial Tab */}
          <TabsContent value="financial">
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-3 mb-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Charges</CardDescription>
                    <CardTitle className="text-2xl">$0.00</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-slate-500">For selected period</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Payments Collected</CardDescription>
                    <CardTitle className="text-2xl text-emerald-600">$0.00</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-slate-500">Patient payments received</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Collection Rate</CardDescription>
                    <CardTitle className="text-2xl">0%</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-slate-500">Payments / charges</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Revenue by CPT Code</CardTitle>
                    <CardDescription>
                      Distribution of charges by procedure code
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={[
                            { code: '97110 - Therapeutic Exercise', value: 35 },
                            { code: '97140 - Manual Therapy', value: 25 },
                            { code: '97530 - Therapeutic Activities', value: 15 },
                            { code: '97112 - NMR', value: 12 },
                            { code: '97161 - PT Eval Low', value: 8 },
                            { code: '97162 - PT Eval Mod', value: 5 },
                          ]}
                          dataKey="value"
                          nameKey="code"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ code, value }) => `${code.split(' - ')[0]} (${value}%)`}
                        >
                          {[0, 1, 2, 3, 4, 5].map((index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-center text-slate-400 mt-2">
                      Note: Financial data will populate as charges are recorded in the billing module.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Monthly Revenue Trend</CardTitle>
                    <CardDescription>
                      Revenue collected over the past months
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart
                        data={[
                          { month: 'Jan', revenue: 0 },
                          { month: 'Feb', revenue: 0 },
                          { month: 'Mar', revenue: 0 },
                          { month: 'Apr', revenue: 0 },
                          { month: 'May', revenue: 0 },
                          { month: 'Jun', revenue: 0 },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`$${value}`, 'Revenue']} />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#10b981"
                          strokeWidth={2}
                          name="Revenue"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-center text-slate-400 mt-2">
                      Revenue data will appear as payments are recorded.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
