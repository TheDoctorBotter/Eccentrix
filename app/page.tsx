'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  Bell,
  Users,
  ChevronRight,
  Calendar,
  Stethoscope,
  Plus,
  Video,
  FileText,
  Clock,
  Check,
  FileSpreadsheet,
  ClipboardList,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import {
  Episode,
  DocumentationAlert,
} from '@/lib/types';
import { format } from 'date-fns';
import { formatLocalDate, daysUntil, isValidDate } from '@/lib/utils';
import { PAPER_MODE } from '@/lib/config';
import { AUTH_THRESHOLDS } from '@/lib/authorizations';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { PTBotFolder } from '@/components/PTBotFolder';
import { DashboardAuthSection } from '@/components/dashboard/DashboardAuthSection';
import { toast } from 'sonner';

interface TelehealthDraft {
  id: string;
  title: string;
  note_type: string;
  date_of_service: string | null;
  created_at: string;
  input_data: { ptbot_external_id?: string; patient_name?: string };
}

interface AuthAlert {
  id: string;
  patient_id: string;
  discipline: string | null;
  day_180_date: string;
  days_remaining: number;
  auth_number: string | null;
  alert_30_dismissed_at: string | null;
  alert_15_dismissed_at: string | null;
  patient_name?: string;
}

interface LowBalanceAlert {
  id: string;
  patient_id: string;
  patient_name: string;
  discipline: string;
  remaining: number;
  unit_label: string; // 'visits' or 'units'
  end_date: string | null;
  auth_number: string | null;
}

export default function HomePage() {
  const { currentClinic, loading: authLoading, isEmrMode } = useAuth();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [alerts, setAlerts] = useState<DocumentationAlert[]>([]);
  const [telehealthDrafts, setTelehealthDrafts] = useState<TelehealthDraft[]>([]);
  const [authAlerts, setAuthAlerts] = useState<AuthAlert[]>([]);
  const [expiringAuths, setExpiringAuths] = useState<{ id: string; patient_name: string; discipline: string; end_date: string; days_remaining: number }[]>([]);
  const [lowBalanceAlerts, setLowBalanceAlerts] = useState<LowBalanceAlert[]>([]);
  const [staleEquipmentCount, setStaleEquipmentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null);
  const prevClinicId = useRef<string | null>(null);

  const fetchAuthAlerts = useCallback(async (clinicId: string) => {
    try {
      const res = await fetch(`/api/authorizations?clinic_id=${clinicId}&status=approved,exhausted`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const now = Date.now();
      const alertAuths: AuthAlert[] = [];

      for (const auth of data) {
        if (!auth.day_180_date) continue;
        const d180 = new Date(auth.day_180_date);
        if (isNaN(d180.getTime())) continue;
        const daysRemaining = Math.ceil(
          (d180.getTime() - now) / (1000 * 60 * 60 * 24)
        );
        // Show alerts at 30 days and 15 days
        const show30 = daysRemaining <= 30 && daysRemaining > 15 && !auth.alert_30_dismissed_at;
        const show15 = daysRemaining <= 15 && !auth.alert_15_dismissed_at;

        if (show30 || show15) {
          alertAuths.push({
            id: auth.id,
            patient_id: auth.patient_id,
            discipline: auth.discipline,
            day_180_date: auth.day_180_date,
            days_remaining: daysRemaining,
            auth_number: auth.auth_number,
            alert_30_dismissed_at: auth.alert_30_dismissed_at,
            alert_15_dismissed_at: auth.alert_15_dismissed_at,
          });
        }
      }

      // Resolve patient names
      if (alertAuths.length > 0) {
        const patRes = await fetch(`/api/patients?clinic_id=${clinicId}`);
        if (patRes.ok) {
          const patients = await patRes.json();
          const patMap = new Map(
            (Array.isArray(patients) ? patients : []).map(
              (p: { id: string; first_name: string; last_name: string }) => [
                p.id,
                `${p.last_name}, ${p.first_name}`,
              ]
            )
          );
          for (const a of alertAuths) {
            a.patient_name = (patMap.get(a.patient_id) as string) || 'Unknown';
          }
        }
      }

      setAuthAlerts(alertAuths.sort((a, b) => a.days_remaining - b.days_remaining));
    } catch (error) {
      console.error('Error fetching auth alerts:', error);
    }
  }, []);

  const fetchExpiringAuths = useCallback(async (clinicId: string) => {
    try {
      const res = await fetch(`/api/authorizations?clinic_id=${clinicId}&status=approved,exhausted`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const expiring: { id: string; patient_id: string; patient_name: string; discipline: string; end_date: string; days_remaining: number }[] = [];

      for (const auth of data) {
        if (!isValidDate(auth.end_date)) continue;
        const days = daysUntil(auth.end_date);
        if (days === null) continue;
        if (days > 30) continue; // only within 30 days or expired
        expiring.push({
          id: auth.id,
          patient_id: auth.patient_id,
          patient_name: '',
          discipline: auth.discipline || 'PT',
          end_date: auth.end_date,
          days_remaining: days,
        });
      }

      // Resolve patient names
      if (expiring.length > 0) {
        const patRes = await fetch(`/api/patients?clinic_id=${clinicId}`);
        if (patRes.ok) {
          const patients = await patRes.json();
          const patMap = new Map(
            (Array.isArray(patients) ? patients : []).map(
              (p: { id: string; first_name: string; last_name: string }) => [
                p.id,
                `${p.last_name}, ${p.first_name}`,
              ]
            )
          );
          for (const a of expiring) {
            a.patient_name = (patMap.get(a.patient_id) as string) || 'Unknown';
          }
        }
      }

      setExpiringAuths(expiring.sort((a, b) => a.days_remaining - b.days_remaining));
    } catch (error) {
      console.error('Error fetching expiring auths:', error);
    }
  }, []);

  const fetchLowBalanceAuths = useCallback(async (clinicId: string) => {
    try {
      const res = await fetch(`/api/authorizations?clinic_id=${clinicId}&status=approved,exhausted`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const lowBalance: LowBalanceAlert[] = [];

      for (const auth of data) {
        const disc = auth.discipline || 'PT';

        if (disc === 'ST') {
          // ST: check remaining_visits against threshold
          const threshold = AUTH_THRESHOLDS.ST.low;
          if (auth.remaining_visits != null && auth.remaining_visits <= threshold && auth.remaining_visits > 0) {
            lowBalance.push({
              id: auth.id,
              patient_id: auth.patient_id,
              patient_name: '',
              discipline: disc,
              remaining: auth.remaining_visits,
              unit_label: 'visits',
              end_date: auth.end_date || null,
              auth_number: auth.auth_number || null,
            });
          }
        } else if (disc === 'PT' || disc === 'OT') {
          // PT/OT: compute remaining units against threshold
          const threshold = AUTH_THRESHOLDS[disc as 'PT' | 'OT'].low;
          const unitsAuth = auth.units_authorized;
          const unitsUsed = auth.units_used ?? 0;
          if (unitsAuth != null) {
            const remainingUnits = unitsAuth - unitsUsed;
            if (remainingUnits <= threshold && remainingUnits > 0) {
              lowBalance.push({
                id: auth.id,
                patient_id: auth.patient_id,
                patient_name: '',
                discipline: disc,
                remaining: Math.max(0, remainingUnits),
                unit_label: 'units',
                end_date: auth.end_date || null,
                auth_number: auth.auth_number || null,
              });
            }
          }
        }
      }

      // Resolve patient names
      if (lowBalance.length > 0) {
        const patRes = await fetch(`/api/patients?clinic_id=${clinicId}`);
        if (patRes.ok) {
          const patients = await patRes.json();
          const patMap = new Map(
            (Array.isArray(patients) ? patients : []).map(
              (p: { id: string; first_name: string; last_name: string }) => [
                p.id,
                `${p.last_name}, ${p.first_name}`,
              ]
            )
          );
          for (const a of lowBalance) {
            a.patient_name = (patMap.get(a.patient_id) as string) || 'Unknown';
          }
        }
      }

      // Sort by lowest remaining balance first
      setLowBalanceAlerts(lowBalance.sort((a, b) => a.remaining - b.remaining));
    } catch (error) {
      console.error('Error fetching low-balance auths:', error);
    }
  }, []);

  const dismissAuthAlert = async (authId: string, level: '30' | '15') => {
    try {
      const field = level === '30' ? 'alert_30_dismissed_at' : 'alert_15_dismissed_at';
      const res = await fetch(`/api/authorizations/${authId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: new Date().toISOString() }),
      });
      if (res.ok) {
        setAuthAlerts((prev) => prev.filter((a) => a.id !== authId));
        toast.success('Alert dismissed');
      }
    } catch {
      toast.error('Failed to dismiss alert');
    }
  };

  const fetchStaleEquipment = useCallback(async (clinicId: string) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count, error } = await supabase
        .from('equipment_referrals')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .neq('phase', 'equipment_received')
        .lt('last_updated_at', thirtyDaysAgo.toISOString());

      if (!error) {
        setStaleEquipmentCount(count || 0);
      }
    } catch (err) {
      console.error('Error fetching stale equipment referrals:', err);
    }
  }, []);

  useEffect(() => {
    if (currentClinic?.clinic_id) {
      fetchCaseload(currentClinic.clinic_id);
      if (!PAPER_MODE) fetchAlerts(currentClinic.clinic_id);
      fetchTelehealthDrafts(currentClinic.clinic_id);
      fetchAuthAlerts(currentClinic.clinic_id);
      if (PAPER_MODE) fetchExpiringAuths(currentClinic.clinic_id);
      fetchLowBalanceAuths(currentClinic.clinic_id);
      fetchStaleEquipment(currentClinic.clinic_id);

      // Fetch clinic branding logo
      if (prevClinicId.current !== currentClinic.clinic_id) {
        prevClinicId.current = currentClinic.clinic_id;
        fetch(`/api/branding?clinic_id=${currentClinic.clinic_id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data) setClinicLogoUrl(data.logo_url || null); })
          .catch(() => setClinicLogoUrl(null));
      }
    }
  }, [currentClinic, fetchAuthAlerts, fetchExpiringAuths, fetchLowBalanceAuths, fetchStaleEquipment]);

  const fetchCaseload = async (clinicId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/episodes?clinic_id=${clinicId}&status=active`);
      if (res.ok) {
        const data = await res.json();
        setEpisodes(data);
      }
    } catch (error) {
      console.error('Error fetching caseload:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async (clinicId: string) => {
    try {
      const res = await fetch(`/api/alerts?clinic_id=${clinicId}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setAlerts([]);
    }
  };

  const fetchTelehealthDrafts = async (clinicId: string) => {
    try {
      const res = await fetch(`/api/notes?clinic_id=${clinicId}&ptbot=true&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setTelehealthDrafts(data);
      }
    } catch (error) {
      console.error('Error fetching PTBot imports:', error);
    }
  };

  const calculateAge = (dob: string | null | undefined): string => {
    if (!dob) return '';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age}y`;
  };

  const seedDemoData = async () => {
    try {
      const res = await fetch('/api/seed-emr', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      } else {
        const error = await res.json();
        alert(`Failed to seed data: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error seeding data:', error);
      alert('Failed to seed demo data');
    }
  };

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-5">
          {clinicLogoUrl ? (
            <img
              src={clinicLogoUrl}
              alt={currentClinic.clinic_name}
              className="h-20 w-auto max-w-[200px] object-contain shrink-0"
            />
          ) : (
            <img
              src="/logo.png"
              alt="Eccentrix EMR"
              className="h-20 w-auto max-w-[200px] object-contain shrink-0"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {currentClinic.clinic_name || 'Eccentrix EMR'}
            </h1>
            <p className="text-slate-600 mt-1">
              Secure clinical documentation and patient chart management
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Alerts Box */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-amber-500" />
                    <CardTitle className="text-lg">Alerts</CardTitle>
                  </div>
                  {PAPER_MODE ? (
                    (expiringAuths.length + lowBalanceAlerts.length) > 0 && (
                      <Badge variant="destructive">{expiringAuths.length + lowBalanceAlerts.length}</Badge>
                    )
                  ) : (
                    (alerts.length + lowBalanceAlerts.length) > 0 && (
                      <Badge variant="destructive">{alerts.length + lowBalanceAlerts.length}</Badge>
                    )
                  )}
                </div>
                <CardDescription>
                  {PAPER_MODE ? 'Authorization expirations & low balances' : 'Documentation & authorization alerts'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {PAPER_MODE ? (
                  /* Paper mode: show authorization expiration alerts + low balance */
                  (expiringAuths.length === 0 && lowBalanceAlerts.length === 0) ? (
                    <div className="text-center py-6 text-slate-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p>No authorization alerts.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {expiringAuths.map((auth) => {
                        const isExpired = auth.days_remaining <= 0;
                        const isUrgent = auth.days_remaining <= 7;
                        const bgClass = isExpired
                          ? 'bg-red-50 border-red-300'
                          : isUrgent
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-yellow-50 border-yellow-200';

                        return (
                          <div
                            key={auth.id}
                            className={`flex items-center justify-between p-3 border rounded-lg ${bgClass}`}
                          >
                            <div className="flex items-center gap-3">
                              <Clock className={`h-5 w-5 ${isExpired ? 'text-red-500' : isUrgent ? 'text-orange-500' : 'text-yellow-600'}`} />
                              <div>
                                <p className="font-medium text-slate-900">
                                  {auth.patient_name}
                                  <Badge
                                    variant="outline"
                                    className={`ml-2 text-xs ${
                                      auth.discipline === 'PT'
                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                        : auth.discipline === 'OT'
                                          ? 'bg-lime-100 text-lime-700 border-lime-200'
                                          : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                    }`}
                                  >
                                    {auth.discipline}
                                  </Badge>
                                </p>
                                <p className="text-sm text-slate-600">
                                  Ends: {formatLocalDate(auth.end_date, 'MM/dd/yyyy')}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-sm font-semibold px-2 py-1 rounded ${
                                isExpired
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : isUrgent
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {isExpired ? 'Expired' : `Ends in ${auth.days_remaining} days`}
                            </span>
                          </div>
                        );
                      })}
                      {lowBalanceAlerts.map((alert) => (
                        <div
                          key={`low-${alert.id}`}
                          className="flex items-center justify-between p-3 border rounded-lg bg-red-50 border-red-300"
                        >
                          <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <div>
                              <p className="font-medium text-slate-900">
                                {alert.patient_name}
                                <Badge
                                  variant="outline"
                                  className={`ml-2 text-xs ${
                                    alert.discipline === 'PT'
                                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                                      : alert.discipline === 'OT'
                                        ? 'bg-lime-100 text-lime-700 border-lime-200'
                                        : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                  }`}
                                >
                                  {alert.discipline}
                                </Badge>
                              </p>
                              <p className="text-sm text-red-700">
                                {alert.discipline} authorization low: {alert.remaining} {alert.unit_label} remaining
                                {alert.end_date ? ` · Ends: ${formatLocalDate(alert.end_date, 'MM/dd/yyyy')}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold px-2 py-1 rounded bg-red-100 text-red-700 border border-red-300">
                            {alert.remaining} {alert.unit_label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* Normal mode: documentation alerts + low balance */
                  (alerts.length === 0 && lowBalanceAlerts.length === 0) ? (
                    <div className="text-center py-6 text-slate-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p>No alerts due today</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            <div>
                              <p className="font-medium text-slate-900">
                                {alert.patient_name}
                              </p>
                              <p className="text-sm text-amber-700">
                                {alert.alert_message}
                              </p>
                            </div>
                          </div>
                          <Link href={`/charts/${alert.episode_id}`}>
                            <Button size="sm" variant="outline">
                              Open Chart
                              <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      ))}
                      {lowBalanceAlerts.map((alert) => (
                        <div
                          key={`low-${alert.id}`}
                          className="flex items-center justify-between p-3 border rounded-lg bg-red-50 border-red-300"
                        >
                          <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <div>
                              <p className="font-medium text-slate-900">
                                {alert.patient_name}
                                <Badge
                                  variant="outline"
                                  className={`ml-2 text-xs ${
                                    alert.discipline === 'PT'
                                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                                      : alert.discipline === 'OT'
                                        ? 'bg-lime-100 text-lime-700 border-lime-200'
                                        : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                  }`}
                                >
                                  {alert.discipline}
                                </Badge>
                              </p>
                              <p className="text-sm text-red-700">
                                {alert.discipline} authorization low: {alert.remaining} {alert.unit_label} remaining
                                {alert.end_date ? ` · Ends: ${formatLocalDate(alert.end_date, 'MM/dd/yyyy')}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold px-2 py-1 rounded bg-red-100 text-red-700 border border-red-300">
                            {alert.remaining} {alert.unit_label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </CardContent>
            </Card>

            {/* 180-Day Authorization Alerts */}
            {authAlerts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-orange-500" />
                      <CardTitle className="text-lg">Upcoming 180-Day Checks</CardTitle>
                    </div>
                    <Badge variant="destructive">{authAlerts.length}</Badge>
                  </div>
                  <CardDescription>Authorization 180-day marks approaching</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {authAlerts.map((alert) => {
                      const isUrgent = alert.days_remaining <= 15;
                      const level = isUrgent ? '15' : '30';
                      return (
                        <div
                          key={alert.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isUrgent
                              ? 'bg-red-50 border-red-200'
                              : 'bg-amber-50 border-amber-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Clock className={`h-5 w-5 ${isUrgent ? 'text-red-500' : 'text-amber-500'}`} />
                            <div>
                              <p className="font-medium text-slate-900">
                                {alert.patient_name || alert.patient_id.slice(0, 8)}
                                {alert.discipline && (
                                  <Badge
                                    variant="outline"
                                    className={`ml-2 text-xs ${
                                      alert.discipline === 'PT'
                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                        : alert.discipline === 'OT'
                                          ? 'bg-lime-100 text-lime-700 border-lime-200'
                                          : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                    }`}
                                  >
                                    {alert.discipline}
                                  </Badge>
                                )}
                              </p>
                              <p className={`text-sm ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
                                180-day mark: {formatLocalDate(alert.day_180_date, 'MMM d, yyyy')}
                                {' '}&mdash; <strong>{alert.days_remaining} days remaining</strong>
                                {alert.auth_number && ` (Auth #${alert.auth_number})`}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0"
                            onClick={() => dismissAuthAlert(alert.id, level)}
                            title="Dismiss this alert"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stale Equipment Referrals Alert */}
            {staleEquipmentCount > 0 && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 rounded-lg">
                        <ClipboardList className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">Equipment Follow-Up Needed</p>
                        <p className="text-sm text-red-700">
                          {staleEquipmentCount} patient{staleEquipmentCount !== 1 ? 's have' : ' has'} equipment referrals with no update in 30+ days.
                        </p>
                      </div>
                    </div>
                    <Link href="/equipment">
                      <Button size="sm" variant="outline" className="gap-1 text-red-700 border-red-200 hover:bg-red-50">
                        Review Equipment Tracker
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Authorizations (collapsed, lazy-loaded) */}
            {currentClinic?.clinic_id && (
              <DashboardAuthSection clinicId={currentClinic.clinic_id} />
            )}

            {/* Telehealth Drafts (EMR mode only) */}
            {isEmrMode && telehealthDrafts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Video className="h-5 w-5 text-violet-500" />
                      <CardTitle className="text-lg">Telehealth Drafts</CardTitle>
                    </div>
                    <Badge className="bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100">
                      {telehealthDrafts.length}
                    </Badge>
                  </div>
                  <CardDescription>Draft notes from telehealth sessions awaiting review</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {telehealthDrafts.map((note) => (
                      <Link key={note.id} href={`/notes/${note.id}`} className="block">
                        <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 hover:border-violet-200 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-violet-400 shrink-0" />
                            <div>
                              <p className="font-medium text-slate-900 text-sm">{note.title}</p>
                              <p className="text-xs text-slate-500">
                                {note.date_of_service
                                  ? formatLocalDate(note.date_of_service, 'MMM d, yyyy')
                                  : formatLocalDate(note.created_at, 'MMM d, yyyy')}
                                {' · '}
                                {note.note_type === 'pt_evaluation' ? 'PT Evaluation' : 'Daily SOAP'}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Caseload Box */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-emerald-600" />
                    <CardTitle className="text-lg">Caseload</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Link href="/patients/import">
                      <Button size="sm" variant="outline" className="gap-1">
                        <FileSpreadsheet className="h-4 w-4" />
                        Import
                      </Button>
                    </Link>
                    <Link href="/patients/new">
                      <Button size="sm" className="gap-1">
                        <Plus className="h-4 w-4" />
                        Add Patient
                      </Button>
                    </Link>
                  </div>
                </div>
                <CardDescription>
                  Active patients • {episodes.length} total
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* PTBot Patient Folder */}
                {currentClinic?.clinic_id && (
                  <PTBotFolder clinicId={currentClinic.clinic_id} />
                )}

                {episodes.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="mb-4">No active patients yet</p>
                    <Link href="/patients/new">
                      <Button variant="outline">Add Your First Patient</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {episodes.map((episode) => (
                      <Link
                        key={episode.id}
                        href={`/charts/${episode.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 hover:border-emerald-200 transition-colors cursor-pointer">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <p className="font-semibold text-slate-900">
                                {episode.last_name?.toUpperCase()},{' '}
                                {episode.first_name}
                              </p>
                              {episode.date_of_birth && (
                                <span className="text-sm text-slate-500">
                                  DOB: {formatLocalDate(episode.date_of_birth, 'MM/dd/yyyy')}
                                  {' '}({calculateAge(episode.date_of_birth)})
                                </span>
                              )}
                            </div>
                            {(episode.diagnosis || episode.primary_diagnosis) && (
                              <p className="text-sm text-slate-600 mt-1">
                                {episode.diagnosis || episode.primary_diagnosis}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              Active
                            </Badge>
                            <ChevronRight className="h-5 w-5 text-slate-400" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Future integration note */}
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Future: schedule integration to sync visits and due documentation.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Dev Seed Data Button */}
            {episodes.length === 0 && (
              <div className="text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={seedDemoData}
                  className="text-slate-500"
                >
                  Seed Demo Data
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
