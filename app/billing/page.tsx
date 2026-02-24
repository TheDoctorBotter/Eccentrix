'use client';

import { useEffect, useState, useCallback } from 'react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import {
  CptCode,
  VisitCharge,
  PriorAuthorization,
  PatientPayment,
  ChargeStatus,
  AuthorizationStatus,
  PaymentType,
  PaymentMethod,
  EIGHT_MINUTE_RULE_TABLE,
  calculateBillingUnits,
  Claim,
  ClaimStatus,
  CLAIM_STATUS_COLORS,
  EligibilityCheck,
  EligibilityStatus,
  ELIGIBILITY_STATUS_COLORS,
} from '@/lib/types';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  DollarSign,
  FileText,
  CreditCard,
  AlertTriangle,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Trash2,
  Download,
  Shield,
  Activity,
} from 'lucide-react';

interface PatientOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface EpisodeOption {
  id: string;
  patient_id: string;
  diagnosis?: string | null;
  status: string;
}

export default function BillingPage() {
  const { currentClinic, user, loading: authLoading } = useAuth();

  // Summary stats
  const [todaysCharges, setTodaysCharges] = useState(0);
  const [pendingClaims, setPendingClaims] = useState(0);
  const [monthlyPayments, setMonthlyPayments] = useState(0);
  const [authAlerts, setAuthAlerts] = useState(0);

  // Data
  const [charges, setCharges] = useState<VisitCharge[]>([]);
  const [authorizations, setAuthorizations] = useState<PriorAuthorization[]>([]);
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [cptCodes, setCptCodes] = useState<CptCode[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Dialog states
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Charge form
  const [chargeForm, setChargeForm] = useState({
    patient_id: '',
    episode_id: '',
    cpt_code_id: '',
    cpt_code: '',
    description: '',
    is_timed: false,
    minutes_spent: '',
    units: '1',
    modifier_1: '',
    modifier_2: '',
    diagnosis_pointer: '',
    date_of_service: format(new Date(), 'yyyy-MM-dd'),
    charge_amount: '',
  });
  const [cptSearch, setCptSearch] = useState('');

  // Auth form
  const [authForm, setAuthForm] = useState({
    patient_id: '',
    episode_id: '',
    auth_number: '',
    insurance_name: '',
    insurance_phone: '',
    authorized_visits: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    status: 'pending' as AuthorizationStatus,
    notes: '',
  });

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    patient_id: '',
    amount: '',
    payment_type: 'copay' as PaymentType,
    payment_method: 'credit_card' as PaymentMethod,
    reference_number: '',
    date_received: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  // Claims data
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimChargeSelection, setClaimChargeSelection] = useState<Set<string>>(new Set());
  const [claimForm, setClaimForm] = useState({
    patient_id: '',
    episode_id: '',
    subscriber_id: '',
    diagnosis_codes: '',
    rendering_provider_npi: '',
    rendering_provider_name: '',
    notes: '',
  });
  const [generatingEdi, setGeneratingEdi] = useState<string | null>(null);

  // Eligibility data
  const [eligibilityChecks, setEligibilityChecks] = useState<EligibilityCheck[]>([]);
  const [eligibilityDialogOpen, setEligibilityDialogOpen] = useState(false);
  const [eligibilityForm, setEligibilityForm] = useState({
    patient_id: '',
    medicaid_id: '',
    date_of_service: format(new Date(), 'yyyy-MM-dd'),
  });

  // Batch selection
  const [selectedCharges, setSelectedCharges] = useState<Set<string>>(new Set());

  const clinicId = currentClinic?.clinic_id;

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      const [
        chargesRes,
        authsRes,
        paymentsRes,
        cptRes,
        patientsRes,
        episodesRes,
        todayChargesRes,
        claimsRes,
        eligibilityRes,
      ] = await Promise.all([
        fetch(`/api/charges?clinic_id=${clinicId}`),
        fetch(`/api/authorizations?clinic_id=${clinicId}`),
        fetch(`/api/payments?clinic_id=${clinicId}&from=${monthStart}&to=${monthEnd}`),
        fetch('/api/cpt-codes'),
        fetch(`/api/patients?clinic_id=${clinicId}`),
        fetch(`/api/episodes?clinic_id=${clinicId}&status=active`),
        fetch(`/api/charges?clinic_id=${clinicId}&from=${today}&to=${today}`),
        fetch(`/api/claims?clinic_id=${clinicId}`),
        fetch(`/api/eligibility?clinic_id=${clinicId}`),
      ]);

      const [chargesData, authsData, paymentsData, cptData, patientsData, episodesData, todayChargesData, claimsData, eligibilityData] =
        await Promise.all([
          chargesRes.ok ? chargesRes.json() : [],
          authsRes.ok ? authsRes.json() : [],
          paymentsRes.ok ? paymentsRes.json() : [],
          cptRes.ok ? cptRes.json() : [],
          patientsRes.ok ? patientsRes.json() : [],
          episodesRes.ok ? episodesRes.json() : [],
          todayChargesRes.ok ? todayChargesRes.json() : [],
          claimsRes.ok ? claimsRes.json() : [],
          eligibilityRes.ok ? eligibilityRes.json() : [],
        ]);

      setCharges(chargesData);
      setAuthorizations(authsData);
      setPayments(paymentsData);
      setCptCodes(cptData);
      setPatients(patientsData);
      setEpisodes(episodesData);
      setClaims(Array.isArray(claimsData) ? claimsData : []);
      setEligibilityChecks(Array.isArray(eligibilityData) ? eligibilityData : []);

      // Summary stats
      setTodaysCharges(Array.isArray(todayChargesData) ? todayChargesData.length : 0);
      setPendingClaims(
        Array.isArray(chargesData)
          ? chargesData.filter((c: VisitCharge) => c.status === 'pending').length
          : 0
      );
      setMonthlyPayments(
        Array.isArray(paymentsData)
          ? paymentsData.reduce((sum: number, p: PatientPayment) => sum + (p.amount || 0), 0)
          : 0
      );
      setAuthAlerts(
        Array.isArray(authsData)
          ? authsData.filter(
              (a: PriorAuthorization) =>
                (a.remaining_visits !== null && a.remaining_visits !== undefined && a.remaining_visits < 5) ||
                a.status === 'expired' ||
                a.status === 'exhausted'
            ).length
          : 0
      );
    } catch (error) {
      console.error('Error fetching billing data:', error);
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) {
      fetchData();
    }
  }, [clinicId, fetchData]);

  // Get patient name helper
  const getPatientName = (patientId: string): string => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.last_name}, ${patient.first_name}` : 'Unknown';
  };

  // Filter episodes for selected patient
  const filteredEpisodes = chargeForm.patient_id
    ? episodes.filter((e) => e.patient_id === chargeForm.patient_id)
    : episodes;

  const filteredAuthEpisodes = authForm.patient_id
    ? episodes.filter((e) => e.patient_id === authForm.patient_id)
    : episodes;

  // Filter CPT codes by search
  const filteredCptCodes = cptSearch
    ? cptCodes.filter(
        (c) =>
          c.code.toLowerCase().includes(cptSearch.toLowerCase()) ||
          c.description.toLowerCase().includes(cptSearch.toLowerCase())
      )
    : cptCodes;

  // Handle CPT code selection
  const handleCptSelect = (cptId: string) => {
    const cpt = cptCodes.find((c) => c.id === cptId);
    if (cpt) {
      setChargeForm((prev) => ({
        ...prev,
        cpt_code_id: cpt.id,
        cpt_code: cpt.code,
        description: cpt.description,
        is_timed: cpt.is_timed,
        units: String(cpt.default_units || 1),
      }));
    }
  };

  // Auto-calculate units when minutes change
  const handleMinutesChange = (minutes: string) => {
    setChargeForm((prev) => {
      const mins = parseInt(minutes, 10);
      const newUnits = !isNaN(mins) && prev.is_timed ? calculateBillingUnits(mins) : parseInt(prev.units, 10) || 1;
      return {
        ...prev,
        minutes_spent: minutes,
        units: String(newUnits),
      };
    });
  };

  // Create charge
  const handleCreateCharge = async () => {
    if (!clinicId) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...chargeForm,
          clinic_id: clinicId,
          minutes_spent: chargeForm.minutes_spent ? parseInt(chargeForm.minutes_spent, 10) : null,
          units: parseInt(chargeForm.units, 10) || 1,
          charge_amount: chargeForm.charge_amount ? parseFloat(chargeForm.charge_amount) : null,
          diagnosis_pointer: chargeForm.diagnosis_pointer
            ? chargeForm.diagnosis_pointer.split(',').map((d) => parseInt(d.trim(), 10))
            : null,
          created_by: user?.id || null,
          is_timed: chargeForm.is_timed,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create charge');
      }

      toast.success('Charge created successfully');
      setChargeDialogOpen(false);
      resetChargeForm();
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create charge');
    } finally {
      setSubmitting(false);
    }
  };

  // Create authorization
  const handleCreateAuth = async () => {
    if (!clinicId) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...authForm,
          clinic_id: clinicId,
          authorized_visits: authForm.authorized_visits ? parseInt(authForm.authorized_visits, 10) : null,
          created_by: user?.id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create authorization');
      }

      toast.success('Authorization created successfully');
      setAuthDialogOpen(false);
      resetAuthForm();
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create authorization');
    } finally {
      setSubmitting(false);
    }
  };

  // Record payment
  const handleRecordPayment = async () => {
    if (!clinicId) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          clinic_id: clinicId,
          amount: parseFloat(paymentForm.amount),
          collected_by: user?.id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record payment');
      }

      toast.success('Payment recorded successfully');
      setPaymentDialogOpen(false);
      resetPaymentForm();
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  // Batch mark as submitted
  const handleBatchSubmit = async () => {
    if (selectedCharges.size === 0) return;
    setSubmitting(true);

    try {
      const promises = Array.from(selectedCharges).map((id) =>
        fetch(`/api/charges/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'submitted' }),
        })
      );

      await Promise.all(promises);
      toast.success(`${selectedCharges.size} charge(s) marked as submitted`);
      setSelectedCharges(new Set());
      fetchData();
    } catch (error) {
      toast.error('Failed to update charges');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete charge
  const handleDeleteCharge = async (id: string) => {
    try {
      const res = await fetch(`/api/charges/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete charge');
      toast.success('Charge deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete charge');
    }
  };

  // Create claim from selected charges
  const handleCreateClaim = async () => {
    if (!clinicId || claimChargeSelection.size === 0) return;
    setSubmitting(true);

    try {
      const diagCodes = claimForm.diagnosis_codes
        ? claimForm.diagnosis_codes.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          patient_id: claimForm.patient_id,
          episode_id: claimForm.episode_id || null,
          charge_ids: Array.from(claimChargeSelection),
          diagnosis_codes: diagCodes.length > 0 ? diagCodes : null,
          subscriber_id: claimForm.subscriber_id || null,
          rendering_provider_npi: claimForm.rendering_provider_npi || null,
          rendering_provider_name: claimForm.rendering_provider_name || null,
          notes: claimForm.notes || null,
          created_by: user?.id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create claim');
      }

      toast.success('Claim created successfully');
      setClaimDialogOpen(false);
      resetClaimForm();
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create claim');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate 837P EDI for a claim
  const handleGenerateEdi = async (claimId: string) => {
    setGeneratingEdi(claimId);
    try {
      const res = await fetch(`/api/claims/${claimId}/generate-edi`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate EDI');
      }

      const result = await res.json();

      // Download the EDI file
      const blob = new Blob([result.edi_content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `837P_${result.claim?.claim_number || claimId}.edi`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('837P EDI file generated and downloaded');
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate EDI');
    } finally {
      setGeneratingEdi(null);
    }
  };

  // Update claim status
  const handleUpdateClaimStatus = async (claimId: string, newStatus: string) => {
    try {
      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'submitted') {
        updateData.submitted_at = new Date().toISOString();
      }

      const res = await fetch(`/api/claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) throw new Error('Failed to update claim');
      toast.success(`Claim marked as ${newStatus}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update claim status');
    }
  };

  // Delete draft claim
  const handleDeleteClaim = async (claimId: string) => {
    try {
      const res = await fetch(`/api/claims/${claimId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete claim');
      }
      toast.success('Claim deleted');
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete claim');
    }
  };

  // Run eligibility check
  const handleEligibilityCheck = async () => {
    if (!clinicId || !eligibilityForm.patient_id) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/eligibility/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          patient_id: eligibilityForm.patient_id,
          medicaid_id: eligibilityForm.medicaid_id || null,
          date_of_service: eligibilityForm.date_of_service,
          checked_by: user?.id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to run eligibility check');
      }

      const result = await res.json();

      // Download the 270 file
      if (result.edi_270_content) {
        const blob = new Blob([result.edi_270_content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `270_${eligibilityForm.medicaid_id || 'eligibility'}_${eligibilityForm.date_of_service}.edi`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      toast.success('Eligibility inquiry created. 270 EDI file downloaded.');
      setEligibilityDialogOpen(false);
      resetEligibilityForm();
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check eligibility');
    } finally {
      setSubmitting(false);
    }
  };

  // Get charges available for claims (pending charges for a specific patient)
  const getClaimableCharges = (patientId: string): VisitCharge[] => {
    return charges.filter((c) => c.patient_id === patientId && c.status === 'pending');
  };

  // Reset forms
  const resetClaimForm = () => {
    setClaimForm({
      patient_id: '',
      episode_id: '',
      subscriber_id: '',
      diagnosis_codes: '',
      rendering_provider_npi: '',
      rendering_provider_name: '',
      notes: '',
    });
    setClaimChargeSelection(new Set());
  };

  const resetEligibilityForm = () => {
    setEligibilityForm({
      patient_id: '',
      medicaid_id: '',
      date_of_service: format(new Date(), 'yyyy-MM-dd'),
    });
  };

  // Reset forms
  const resetChargeForm = () => {
    setChargeForm({
      patient_id: '',
      episode_id: '',
      cpt_code_id: '',
      cpt_code: '',
      description: '',
      is_timed: false,
      minutes_spent: '',
      units: '1',
      modifier_1: '',
      modifier_2: '',
      diagnosis_pointer: '',
      date_of_service: format(new Date(), 'yyyy-MM-dd'),
      charge_amount: '',
    });
    setCptSearch('');
  };

  const resetAuthForm = () => {
    setAuthForm({
      patient_id: '',
      episode_id: '',
      auth_number: '',
      insurance_name: '',
      insurance_phone: '',
      authorized_visits: '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      status: 'pending',
      notes: '',
    });
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      patient_id: '',
      amount: '',
      payment_type: 'copay',
      payment_method: 'credit_card',
      reference_number: '',
      date_received: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
  };

  // Status badge helper
  const getChargeStatusBadge = (status: ChargeStatus) => {
    const styles: Record<ChargeStatus, string> = {
      pending: 'bg-amber-100 text-amber-700 border-amber-200',
      submitted: 'bg-blue-100 text-blue-700 border-blue-200',
      paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      denied: 'bg-red-100 text-red-700 border-red-200',
      appealed: 'bg-purple-100 text-purple-700 border-purple-200',
    };
    return (
      <Badge variant="outline" className={styles[status] || ''}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getAuthStatusBadge = (status: AuthorizationStatus) => {
    const styles: Record<AuthorizationStatus, string> = {
      pending: 'bg-amber-100 text-amber-700 border-amber-200',
      approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      denied: 'bg-red-100 text-red-700 border-red-200',
      expired: 'bg-slate-100 text-slate-700 border-slate-200',
      exhausted: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <Badge variant="outline" className={styles[status] || ''}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Auth remaining visits color
  const getAuthRemainingColor = (auth: PriorAuthorization): string => {
    if (auth.status === 'exhausted' || auth.status === 'expired') return 'text-red-600 font-semibold';
    if (auth.remaining_visits !== null && auth.remaining_visits !== undefined) {
      if (auth.remaining_visits === 0) return 'text-red-600 font-semibold';
      if (auth.remaining_visits < 5) return 'text-amber-600 font-semibold';
      return 'text-emerald-600 font-semibold';
    }
    return '';
  };

  // Toggle charge selection
  const toggleChargeSelection = (id: string) => {
    setSelectedCharges((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all charges
  const toggleAllCharges = () => {
    if (selectedCharges.size === charges.filter((c) => c.status === 'pending').length) {
      setSelectedCharges(new Set());
    } else {
      setSelectedCharges(new Set(charges.filter((c) => c.status === 'pending').map((c) => c.id)));
    }
  };

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Billing</h1>
          <p className="text-slate-600 mt-1">
            Charge capture, authorizations, and payment tracking
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Today&apos;s Charges</p>
                  <p className="text-2xl font-bold text-slate-900">{todaysCharges}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Pending Claims</p>
                  <p className="text-2xl font-bold text-slate-900">{pendingClaims}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Payments (This Month)</p>
                  <p className="text-2xl font-bold text-slate-900">
                    ${monthlyPayments.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Auth Alerts</p>
                  <p className="text-2xl font-bold text-slate-900">{authAlerts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="charges" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="charges">Charges</TabsTrigger>
            <TabsTrigger value="claims">Claims / EDI</TabsTrigger>
            <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
            <TabsTrigger value="authorizations">Authorizations</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          {/* ============================================================ */}
          {/* CHARGE CAPTURE TAB */}
          {/* ============================================================ */}
          <TabsContent value="charges">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Charge Capture</CardTitle>
                    <CardDescription>Record and manage CPT charges for patient visits</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCharges.size > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBatchSubmit}
                        disabled={submitting}
                        className="gap-1"
                      >
                        <Send className="h-4 w-4" />
                        Mark {selectedCharges.size} as Submitted
                      </Button>
                    )}
                    <Dialog open={chargeDialogOpen} onOpenChange={setChargeDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1" onClick={() => resetChargeForm()}>
                          <Plus className="h-4 w-4" />
                          New Charge
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>New Charge</DialogTitle>
                          <DialogDescription>
                            Record a new CPT charge for a patient visit
                          </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-2 gap-6">
                          {/* Left: Form */}
                          <div className="space-y-4">
                            {/* Patient */}
                            <div className="space-y-2">
                              <Label>Patient</Label>
                              <Select
                                value={chargeForm.patient_id}
                                onValueChange={(val) =>
                                  setChargeForm((prev) => ({ ...prev, patient_id: val, episode_id: '' }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select patient" />
                                </SelectTrigger>
                                <SelectContent>
                                  {patients.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.last_name}, {p.first_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Episode */}
                            <div className="space-y-2">
                              <Label>Episode</Label>
                              <Select
                                value={chargeForm.episode_id}
                                onValueChange={(val) =>
                                  setChargeForm((prev) => ({ ...prev, episode_id: val }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select episode" />
                                </SelectTrigger>
                                <SelectContent>
                                  {filteredEpisodes.map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                      {e.diagnosis || 'Episode'} ({e.status})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* CPT Code Search */}
                            <div className="space-y-2">
                              <Label>CPT Code</Label>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                  placeholder="Search CPT codes..."
                                  value={cptSearch}
                                  onChange={(e) => setCptSearch(e.target.value)}
                                  className="pl-9"
                                />
                              </div>
                              {cptSearch && (
                                <div className="border rounded-md max-h-40 overflow-y-auto">
                                  {filteredCptCodes.length === 0 ? (
                                    <p className="p-2 text-sm text-slate-500">No CPT codes found</p>
                                  ) : (
                                    filteredCptCodes.map((cpt) => (
                                      <button
                                        key={cpt.id}
                                        type="button"
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
                                        onClick={() => {
                                          handleCptSelect(cpt.id);
                                          setCptSearch('');
                                        }}
                                      >
                                        <span className="font-mono font-medium">{cpt.code}</span>
                                        <span className="text-slate-500 ml-2">{cpt.description}</span>
                                        {cpt.is_timed && (
                                          <Badge variant="outline" className="ml-2 text-xs">
                                            Timed
                                          </Badge>
                                        )}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                              {chargeForm.cpt_code && (
                                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-md">
                                  <span className="font-mono font-medium text-sm">{chargeForm.cpt_code}</span>
                                  <span className="text-sm text-slate-600">{chargeForm.description}</span>
                                  {chargeForm.is_timed && (
                                    <Badge variant="outline" className="text-xs">Timed</Badge>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Minutes (for timed codes) */}
                            {chargeForm.is_timed && (
                              <div className="space-y-2">
                                <Label>Minutes Spent</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="e.g., 30"
                                  value={chargeForm.minutes_spent}
                                  onChange={(e) => handleMinutesChange(e.target.value)}
                                />
                                {chargeForm.minutes_spent && (
                                  <p className="text-sm text-emerald-600">
                                    = {chargeForm.units} unit(s) per 8-minute rule
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Units (for non-timed) */}
                            {!chargeForm.is_timed && (
                              <div className="space-y-2">
                                <Label>Units</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={chargeForm.units}
                                  onChange={(e) =>
                                    setChargeForm((prev) => ({ ...prev, units: e.target.value }))
                                  }
                                />
                              </div>
                            )}

                            {/* Modifiers */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-2">
                                <Label>Modifier 1</Label>
                                <Input
                                  placeholder="e.g., 59"
                                  value={chargeForm.modifier_1}
                                  onChange={(e) =>
                                    setChargeForm((prev) => ({ ...prev, modifier_1: e.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Modifier 2</Label>
                                <Input
                                  placeholder="e.g., GP"
                                  value={chargeForm.modifier_2}
                                  onChange={(e) =>
                                    setChargeForm((prev) => ({ ...prev, modifier_2: e.target.value }))
                                  }
                                />
                              </div>
                            </div>

                            {/* Diagnosis Pointer */}
                            <div className="space-y-2">
                              <Label>Diagnosis Pointer</Label>
                              <Input
                                placeholder="e.g., 1,2"
                                value={chargeForm.diagnosis_pointer}
                                onChange={(e) =>
                                  setChargeForm((prev) => ({ ...prev, diagnosis_pointer: e.target.value }))
                                }
                              />
                            </div>

                            {/* Date of Service */}
                            <div className="space-y-2">
                              <Label>Date of Service</Label>
                              <Input
                                type="date"
                                value={chargeForm.date_of_service}
                                onChange={(e) =>
                                  setChargeForm((prev) => ({ ...prev, date_of_service: e.target.value }))
                                }
                              />
                            </div>

                            {/* Charge Amount */}
                            <div className="space-y-2">
                              <Label>Charge Amount ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={chargeForm.charge_amount}
                                onChange={(e) =>
                                  setChargeForm((prev) => ({ ...prev, charge_amount: e.target.value }))
                                }
                              />
                            </div>
                          </div>

                          {/* Right: 8-Minute Rule Reference */}
                          <div>
                            <Card className="bg-slate-50">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-blue-600" />
                                  8-Minute Rule Reference
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">Units</TableHead>
                                      <TableHead className="text-xs">Min Minutes</TableHead>
                                      <TableHead className="text-xs">Max Minutes</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {EIGHT_MINUTE_RULE_TABLE.map((row) => {
                                      const mins = parseInt(chargeForm.minutes_spent, 10);
                                      const isActive =
                                        !isNaN(mins) && mins >= row.min && mins <= row.max;
                                      return (
                                        <TableRow
                                          key={row.units}
                                          className={isActive ? 'bg-emerald-100' : ''}
                                        >
                                          <TableCell className="text-sm font-medium">
                                            {row.units}
                                          </TableCell>
                                          <TableCell className="text-sm">{row.min}</TableCell>
                                          <TableCell className="text-sm">{row.max}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                                <p className="text-xs text-slate-500 mt-3">
                                  For timed CPT codes, the 8-minute rule determines the number
                                  of billable units based on total treatment minutes. A minimum
                                  of 8 minutes is required for 1 unit.
                                </p>
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setChargeDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleCreateCharge}
                            disabled={
                              submitting ||
                              !chargeForm.patient_id ||
                              !chargeForm.episode_id ||
                              !chargeForm.cpt_code_id
                            }
                          >
                            {submitting ? 'Creating...' : 'Create Charge'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : charges.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No charges recorded yet</p>
                    <p className="text-sm mt-1">Click &quot;New Charge&quot; to get started</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                charges.filter((c) => c.status === 'pending').length > 0 &&
                                selectedCharges.size ===
                                  charges.filter((c) => c.status === 'pending').length
                              }
                              onCheckedChange={toggleAllCharges}
                            />
                          </TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>CPT Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Units</TableHead>
                          <TableHead>Minutes</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {charges.map((charge) => (
                          <TableRow key={charge.id}>
                            <TableCell>
                              {charge.status === 'pending' && (
                                <Checkbox
                                  checked={selectedCharges.has(charge.id)}
                                  onCheckedChange={() => toggleChargeSelection(charge.id)}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(parseISO(charge.date_of_service), 'MM/dd/yyyy')}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {getPatientName(charge.patient_id)}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {charge.cpt_code}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 max-w-[200px] truncate">
                              {charge.description || '-'}
                            </TableCell>
                            <TableCell className="text-sm">{charge.units}</TableCell>
                            <TableCell className="text-sm">
                              {charge.minutes_spent || '-'}
                            </TableCell>
                            <TableCell>{getChargeStatusBadge(charge.status)}</TableCell>
                            <TableCell className="text-sm">
                              {charge.charge_amount
                                ? `$${charge.charge_amount.toFixed(2)}`
                                : '-'}
                            </TableCell>
                            <TableCell>
                              {charge.status === 'pending' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteCharge(charge.id)}
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* CLAIMS / EDI TAB */}
          {/* ============================================================ */}
          <TabsContent value="claims">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>TMHP Claims</CardTitle>
                    <CardDescription>
                      Create claims from charges and generate 837P EDI files for TMHP submission
                    </CardDescription>
                  </div>
                  <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1" onClick={() => resetClaimForm()}>
                        <Plus className="h-4 w-4" />
                        New Claim
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Create TMHP Claim</DialogTitle>
                        <DialogDescription>
                          Select a patient and their pending charges to create an electronic claim
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        {/* Patient */}
                        <div className="space-y-2">
                          <Label>Patient</Label>
                          <Select
                            value={claimForm.patient_id}
                            onValueChange={(val) => {
                              setClaimForm((prev) => ({ ...prev, patient_id: val, episode_id: '' }));
                              setClaimChargeSelection(new Set());
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select patient" />
                            </SelectTrigger>
                            <SelectContent>
                              {patients.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.last_name}, {p.first_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Episode */}
                        <div className="space-y-2">
                          <Label>Episode</Label>
                          <Select
                            value={claimForm.episode_id}
                            onValueChange={(val) =>
                              setClaimForm((prev) => ({ ...prev, episode_id: val }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select episode" />
                            </SelectTrigger>
                            <SelectContent>
                              {episodes
                                .filter((e) => !claimForm.patient_id || e.patient_id === claimForm.patient_id)
                                .map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.diagnosis || 'Episode'} ({e.status})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Subscriber / Medicaid ID */}
                        <div className="space-y-2">
                          <Label>Subscriber / Medicaid ID</Label>
                          <Input
                            placeholder="Patient's Medicaid ID"
                            value={claimForm.subscriber_id}
                            onChange={(e) =>
                              setClaimForm((prev) => ({ ...prev, subscriber_id: e.target.value }))
                            }
                          />
                        </div>

                        {/* Diagnosis Codes */}
                        <div className="space-y-2">
                          <Label>Diagnosis Codes (ICD-10, comma-separated)</Label>
                          <Input
                            placeholder="e.g., M54.5, M47.812"
                            value={claimForm.diagnosis_codes}
                            onChange={(e) =>
                              setClaimForm((prev) => ({ ...prev, diagnosis_codes: e.target.value }))
                            }
                          />
                        </div>

                        {/* Rendering Provider */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Rendering Provider NPI</Label>
                            <Input
                              placeholder="NPI number"
                              value={claimForm.rendering_provider_npi}
                              onChange={(e) =>
                                setClaimForm((prev) => ({ ...prev, rendering_provider_npi: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Rendering Provider Name</Label>
                            <Input
                              placeholder="Last, First"
                              value={claimForm.rendering_provider_name}
                              onChange={(e) =>
                                setClaimForm((prev) => ({ ...prev, rendering_provider_name: e.target.value }))
                              }
                            />
                          </div>
                        </div>

                        {/* Available Charges for Selection */}
                        {claimForm.patient_id && (
                          <div className="space-y-2">
                            <Label>Select Charges to Include</Label>
                            {getClaimableCharges(claimForm.patient_id).length === 0 ? (
                              <p className="text-sm text-slate-500 p-3 bg-slate-50 rounded-md">
                                No pending charges available for this patient
                              </p>
                            ) : (
                              <div className="border rounded-md max-h-60 overflow-y-auto">
                                {getClaimableCharges(claimForm.patient_id).map((charge) => (
                                  <div
                                    key={charge.id}
                                    className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-slate-50"
                                  >
                                    <Checkbox
                                      checked={claimChargeSelection.has(charge.id)}
                                      onCheckedChange={(checked) => {
                                        setClaimChargeSelection((prev) => {
                                          const next = new Set(prev);
                                          if (checked) next.add(charge.id);
                                          else next.delete(charge.id);
                                          return next;
                                        });
                                      }}
                                    />
                                    <div className="flex-1">
                                      <span className="font-mono text-sm font-medium">{charge.cpt_code}</span>
                                      <span className="text-sm text-slate-500 ml-2">{charge.description}</span>
                                    </div>
                                    <span className="text-sm">
                                      {charge.units} unit(s)
                                    </span>
                                    <span className="text-sm text-slate-600">
                                      {format(parseISO(charge.date_of_service), 'MM/dd/yy')}
                                    </span>
                                    <span className="text-sm font-medium">
                                      {charge.charge_amount ? `$${charge.charge_amount.toFixed(2)}` : '-'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {claimChargeSelection.size > 0 && (
                              <p className="text-sm text-emerald-600">
                                {claimChargeSelection.size} charge(s) selected - Total: $
                                {getClaimableCharges(claimForm.patient_id)
                                  .filter((c) => claimChargeSelection.has(c.id))
                                  .reduce((sum, c) => sum + (c.charge_amount || 0), 0)
                                  .toFixed(2)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Input
                            placeholder="Internal notes..."
                            value={claimForm.notes}
                            onChange={(e) =>
                              setClaimForm((prev) => ({ ...prev, notes: e.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setClaimDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateClaim}
                          disabled={
                            submitting ||
                            !claimForm.patient_id ||
                            claimChargeSelection.size === 0
                          }
                        >
                          {submitting ? 'Creating...' : 'Create Claim'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : claims.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Send className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No claims created yet</p>
                    <p className="text-sm mt-1">
                      Create a claim from pending charges to generate an 837P EDI file for TMHP
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Claim #</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Payer</TableHead>
                          <TableHead>Lines</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {claims.map((claim) => (
                          <TableRow key={claim.id}>
                            <TableCell className="font-mono text-sm font-medium">
                              {claim.claim_number || claim.id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {getPatientName(claim.patient_id)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {claim.payer_name || 'Texas Medicaid'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {claim.lines?.length || 0}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              ${Number(claim.total_charges || 0).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={CLAIM_STATUS_COLORS[claim.status] || ''}
                              >
                                {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {format(parseISO(claim.created_at), 'MM/dd/yy')}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Generate / Download EDI */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => handleGenerateEdi(claim.id)}
                                  disabled={generatingEdi === claim.id}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {generatingEdi === claim.id ? 'Generating...' : '837P'}
                                </Button>

                                {/* Mark as submitted */}
                                {(claim.status === 'draft' || claim.status === 'generated') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => handleUpdateClaimStatus(claim.id, 'submitted')}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    Submitted
                                  </Button>
                                )}

                                {/* Mark as paid */}
                                {claim.status === 'submitted' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-emerald-600"
                                    onClick={() => handleUpdateClaimStatus(claim.id, 'paid')}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Paid
                                  </Button>
                                )}

                                {/* Mark as denied */}
                                {claim.status === 'submitted' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-red-600"
                                    onClick={() => handleUpdateClaimStatus(claim.id, 'denied')}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Denied
                                  </Button>
                                )}

                                {/* Delete draft */}
                                {claim.status === 'draft' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                    onClick={() => handleDeleteClaim(claim.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* ELIGIBILITY TAB */}
          {/* ============================================================ */}
          <TabsContent value="eligibility">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Eligibility Verification</CardTitle>
                    <CardDescription>
                      Check patient Medicaid eligibility and generate 270 EDI inquiries for TMHP
                    </CardDescription>
                  </div>
                  <Dialog open={eligibilityDialogOpen} onOpenChange={setEligibilityDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1" onClick={() => resetEligibilityForm()}>
                        <Shield className="h-4 w-4" />
                        Check Eligibility
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Check Medicaid Eligibility</DialogTitle>
                        <DialogDescription>
                          Generate a 270 EDI eligibility inquiry for TMHP portal submission
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Patient</Label>
                          <Select
                            value={eligibilityForm.patient_id}
                            onValueChange={(val) =>
                              setEligibilityForm((prev) => ({ ...prev, patient_id: val }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select patient" />
                            </SelectTrigger>
                            <SelectContent>
                              {patients.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.last_name}, {p.first_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Medicaid ID</Label>
                          <Input
                            placeholder="Patient's Medicaid ID"
                            value={eligibilityForm.medicaid_id}
                            onChange={(e) =>
                              setEligibilityForm((prev) => ({ ...prev, medicaid_id: e.target.value }))
                            }
                          />
                          <p className="text-xs text-slate-500">
                            If blank, will use the Medicaid ID from the patient record
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Date of Service</Label>
                          <Input
                            type="date"
                            value={eligibilityForm.date_of_service}
                            onChange={(e) =>
                              setEligibilityForm((prev) => ({ ...prev, date_of_service: e.target.value }))
                            }
                          />
                        </div>

                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-md">
                          <p className="text-sm text-blue-800">
                            This will generate a HIPAA 270 eligibility inquiry file. Upload the file
                            to the TMHP portal or submit through your clearinghouse to verify
                            patient eligibility.
                          </p>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEligibilityDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleEligibilityCheck}
                          disabled={submitting || !eligibilityForm.patient_id}
                        >
                          {submitting ? 'Generating...' : 'Generate 270 & Check'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : eligibilityChecks.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Shield className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No eligibility checks yet</p>
                    <p className="text-sm mt-1">
                      Click &quot;Check Eligibility&quot; to verify a patient&apos;s Medicaid coverage
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Medicaid ID</TableHead>
                          <TableHead>Service Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eligibilityChecks.map((check) => (
                          <TableRow key={check.id}>
                            <TableCell className="text-sm text-slate-500">
                              {format(parseISO(check.created_at), 'MM/dd/yy HH:mm')}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {check.patient_last_name
                                ? `${check.patient_last_name}, ${check.patient_first_name}`
                                : getPatientName(check.patient_id)}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {check.medicaid_id || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {check.check_date
                                ? format(parseISO(check.check_date), 'MM/dd/yyyy')
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={ELIGIBILITY_STATUS_COLORS[check.status as EligibilityStatus] || ''}
                              >
                                {check.status.charAt(0).toUpperCase() + check.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {check.edi_270_content && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => {
                                    const blob = new Blob([check.edi_270_content!], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `270_${check.medicaid_id || check.id.slice(0, 8)}.edi`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  }}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  270 File
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* AUTHORIZATIONS TAB */}
          {/* ============================================================ */}
          <TabsContent value="authorizations">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Prior Authorizations</CardTitle>
                    <CardDescription>
                      Track insurance authorizations and visit utilization
                    </CardDescription>
                  </div>
                  <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1" onClick={() => resetAuthForm()}>
                        <Plus className="h-4 w-4" />
                        New Authorization
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>New Prior Authorization</DialogTitle>
                        <DialogDescription>
                          Record a new insurance authorization
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Patient</Label>
                          <Select
                            value={authForm.patient_id}
                            onValueChange={(val) =>
                              setAuthForm((prev) => ({ ...prev, patient_id: val, episode_id: '' }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select patient" />
                            </SelectTrigger>
                            <SelectContent>
                              {patients.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.last_name}, {p.first_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Episode</Label>
                          <Select
                            value={authForm.episode_id}
                            onValueChange={(val) =>
                              setAuthForm((prev) => ({ ...prev, episode_id: val }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select episode" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredAuthEpisodes.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.diagnosis || 'Episode'} ({e.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Authorization Number</Label>
                          <Input
                            placeholder="Auth #"
                            value={authForm.auth_number}
                            onChange={(e) =>
                              setAuthForm((prev) => ({ ...prev, auth_number: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Insurance Name</Label>
                          <Input
                            placeholder="e.g., Blue Cross Blue Shield"
                            value={authForm.insurance_name}
                            onChange={(e) =>
                              setAuthForm((prev) => ({ ...prev, insurance_name: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Insurance Phone</Label>
                          <Input
                            placeholder="e.g., (800) 555-1234"
                            value={authForm.insurance_phone}
                            onChange={(e) =>
                              setAuthForm((prev) => ({ ...prev, insurance_phone: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Authorized Visits</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="e.g., 24"
                            value={authForm.authorized_visits}
                            onChange={(e) =>
                              setAuthForm((prev) => ({ ...prev, authorized_visits: e.target.value }))
                            }
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input
                              type="date"
                              value={authForm.start_date}
                              onChange={(e) =>
                                setAuthForm((prev) => ({ ...prev, start_date: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input
                              type="date"
                              value={authForm.end_date}
                              onChange={(e) =>
                                setAuthForm((prev) => ({ ...prev, end_date: e.target.value }))
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={authForm.status}
                            onValueChange={(val) =>
                              setAuthForm((prev) => ({
                                ...prev,
                                status: val as AuthorizationStatus,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="denied">Denied</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Input
                            placeholder="Additional notes..."
                            value={authForm.notes}
                            onChange={(e) =>
                              setAuthForm((prev) => ({ ...prev, notes: e.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAuthDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateAuth}
                          disabled={
                            submitting ||
                            !authForm.patient_id ||
                            !authForm.episode_id ||
                            !authForm.start_date ||
                            !authForm.end_date
                          }
                        >
                          {submitting ? 'Creating...' : 'Create Authorization'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : authorizations.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No authorizations recorded</p>
                    <p className="text-sm mt-1">
                      Click &quot;New Authorization&quot; to add one
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Auth #</TableHead>
                          <TableHead>Insurance</TableHead>
                          <TableHead>Authorized</TableHead>
                          <TableHead>Used</TableHead>
                          <TableHead>Remaining</TableHead>
                          <TableHead>Date Range</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {authorizations.map((auth) => (
                          <TableRow key={auth.id}>
                            <TableCell className="font-medium text-sm">
                              {getPatientName(auth.patient_id)}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {auth.auth_number || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {auth.insurance_name || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {auth.authorized_visits ?? '-'}
                            </TableCell>
                            <TableCell className="text-sm">{auth.used_visits}</TableCell>
                            <TableCell className={`text-sm ${getAuthRemainingColor(auth)}`}>
                              {auth.remaining_visits ?? '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(parseISO(auth.start_date), 'MM/dd/yy')} -{' '}
                              {format(parseISO(auth.end_date), 'MM/dd/yy')}
                            </TableCell>
                            <TableCell>{getAuthStatusBadge(auth.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* PAYMENTS TAB */}
          {/* ============================================================ */}
          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Payments</CardTitle>
                    <CardDescription>
                      Track patient payments and collections
                    </CardDescription>
                  </div>
                  <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1" onClick={() => resetPaymentForm()}>
                        <Plus className="h-4 w-4" />
                        Record Payment
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Record Payment</DialogTitle>
                        <DialogDescription>Record a patient payment</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Patient</Label>
                          <Select
                            value={paymentForm.patient_id}
                            onValueChange={(val) =>
                              setPaymentForm((prev) => ({ ...prev, patient_id: val }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select patient" />
                            </SelectTrigger>
                            <SelectContent>
                              {patients.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.last_name}, {p.first_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Amount ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={paymentForm.amount}
                            onChange={(e) =>
                              setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Payment Type</Label>
                          <Select
                            value={paymentForm.payment_type}
                            onValueChange={(val) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                payment_type: val as PaymentType,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="copay">Copay</SelectItem>
                              <SelectItem value="coinsurance">Coinsurance</SelectItem>
                              <SelectItem value="deductible">Deductible</SelectItem>
                              <SelectItem value="self_pay">Self Pay</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Payment Method</Label>
                          <Select
                            value={paymentForm.payment_method}
                            onValueChange={(val) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                payment_method: val as PaymentMethod,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="check">Check</SelectItem>
                              <SelectItem value="credit_card">Credit Card</SelectItem>
                              <SelectItem value="debit_card">Debit Card</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Reference Number</Label>
                          <Input
                            placeholder="Check # or transaction ID"
                            value={paymentForm.reference_number}
                            onChange={(e) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                reference_number: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Date Received</Label>
                          <Input
                            type="date"
                            value={paymentForm.date_received}
                            onChange={(e) =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                date_received: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Input
                            placeholder="Additional notes..."
                            value={paymentForm.notes}
                            onChange={(e) =>
                              setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setPaymentDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleRecordPayment}
                          disabled={
                            submitting ||
                            !paymentForm.patient_id ||
                            !paymentForm.amount ||
                            parseFloat(paymentForm.amount) <= 0
                          }
                        >
                          {submitting ? 'Recording...' : 'Record Payment'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {/* Monthly Summary */}
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-800">
                      Monthly Collection Summary
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">
                    ${monthlyPayments.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">
                    {payments.length} payment(s) this month
                  </p>
                </div>

                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : payments.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <DollarSign className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p>No payments recorded this month</p>
                    <p className="text-sm mt-1">
                      Click &quot;Record Payment&quot; to log a collection
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="text-sm">
                              {format(parseISO(payment.date_received), 'MM/dd/yyyy')}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {getPatientName(payment.patient_id)}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-emerald-700">
                              ${payment.amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {payment.payment_type.replace('_', ' ')}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {payment.payment_method
                                ? payment.payment_method.replace('_', ' ')
                                : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">
                              {payment.reference_number || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
