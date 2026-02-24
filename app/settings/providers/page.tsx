'use client';

import { useEffect, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  UserCog,
  Plus,
  Pencil,
  Loader2,
  AlertTriangle,
  Stethoscope,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { ProviderProfile } from '@/lib/types';
import { toast } from 'sonner';
import { format, isPast, parseISO } from 'date-fns';

const SPECIALTIES = [
  'Orthopedic',
  'Neurological',
  'Pediatric',
  'Geriatric',
  'Sports',
  'Cardiopulmonary',
  'Women\'s Health',
  'Hand Therapy',
  'Vestibular',
  'Oncology',
  'Wound Care',
  'General',
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const CALENDAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#a855f7',
];

interface ProviderFormData {
  user_id: string;
  first_name: string;
  last_name: string;
  credentials: string;
  npi: string;
  license_number: string;
  license_state: string;
  license_expiry: string;
  specialty: string;
  email: string;
  phone: string;
  default_appointment_duration: number;
  max_daily_patients: string;
  color: string;
}

const emptyForm: ProviderFormData = {
  user_id: '',
  first_name: '',
  last_name: '',
  credentials: '',
  npi: '',
  license_number: '',
  license_state: '',
  license_expiry: '',
  specialty: '',
  email: '',
  phone: '',
  default_appointment_duration: 45,
  max_daily_patients: '',
  color: '#3b82f6',
};

export default function ProvidersPage() {
  const { currentClinic, loading: authLoading, hasRole } = useAuth();

  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderProfile | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Clinic members for user linking
  const [clinicMembers, setClinicMembers] = useState<
    Array<{ user_id: string; role: string }>
  >([]);

  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id) return;
    fetchProviders();
  }, [authLoading, currentClinic?.clinic_id]);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/provider-profiles?clinic_id=${currentClinic?.clinic_id}`
      );
      if (!res.ok) throw new Error('Failed to fetch providers');
      const data = await res.json();
      setProviders(data);
    } catch (error) {
      console.error('Error fetching providers:', error);
      toast.error('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const fetchClinicMembers = async () => {
    try {
      const res = await fetch(
        `/api/user/membership?clinic_id=${currentClinic?.clinic_id}`
      );
      if (res.ok) {
        const data = await res.json();
        setClinicMembers(data);
      }
    } catch (error) {
      console.error('Error fetching clinic members:', error);
    }
  };

  const handleOpenAdd = () => {
    setEditingProvider(null);
    setFormData(emptyForm);
    setDialogOpen(true);
    fetchClinicMembers();
  };

  const handleOpenEdit = (provider: ProviderProfile) => {
    setEditingProvider(provider);
    setFormData({
      user_id: provider.user_id,
      first_name: provider.first_name,
      last_name: provider.last_name,
      credentials: provider.credentials || '',
      npi: provider.npi || '',
      license_number: provider.license_number || '',
      license_state: provider.license_state || '',
      license_expiry: provider.license_expiry || '',
      specialty: provider.specialty || '',
      email: provider.email || '',
      phone: provider.phone || '',
      default_appointment_duration: provider.default_appointment_duration || 45,
      max_daily_patients: provider.max_daily_patients?.toString() || '',
      color: provider.color || '#3b82f6',
    });
    setDialogOpen(true);
    fetchClinicMembers();
  };

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.user_id) {
      toast.error('First name, last name, and linked user are required');
      return;
    }

    try {
      setSaving(true);

      if (editingProvider) {
        // Update existing
        const res = await fetch(`/api/provider-profiles/${editingProvider.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: formData.first_name,
            last_name: formData.last_name,
            credentials: formData.credentials || null,
            npi: formData.npi || null,
            license_number: formData.license_number || null,
            license_state: formData.license_state || null,
            license_expiry: formData.license_expiry || null,
            specialty: formData.specialty || null,
            email: formData.email || null,
            phone: formData.phone || null,
            default_appointment_duration: formData.default_appointment_duration,
            max_daily_patients: formData.max_daily_patients
              ? parseInt(formData.max_daily_patients, 10)
              : null,
            color: formData.color || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to update provider');
        const data = await res.json();
        setProviders((prev) =>
          prev.map((p) => (p.id === editingProvider.id ? data : p))
        );
        toast.success('Provider updated');
      } else {
        // Create new
        const res = await fetch('/api/provider-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: formData.user_id,
            clinic_id: currentClinic?.clinic_id,
            first_name: formData.first_name,
            last_name: formData.last_name,
            credentials: formData.credentials || null,
            npi: formData.npi || null,
            license_number: formData.license_number || null,
            license_state: formData.license_state || null,
            license_expiry: formData.license_expiry || null,
            specialty: formData.specialty || null,
            email: formData.email || null,
            phone: formData.phone || null,
            default_appointment_duration: formData.default_appointment_duration,
            max_daily_patients: formData.max_daily_patients
              ? parseInt(formData.max_daily_patients, 10)
              : null,
            color: formData.color || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to create provider');
        const data = await res.json();
        setProviders((prev) => [...prev, data]);
        toast.success('Provider added');
      }

      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving provider:', error);
      toast.error('Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  const isLicenseExpired = (expiry: string | null | undefined): boolean => {
    if (!expiry) return false;
    try {
      return isPast(parseISO(expiry));
    } catch {
      return false;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-[400px] rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <UserCog className="h-6 w-6" />
              Provider Management
            </h1>
            <p className="text-slate-500 mt-1">
              Manage provider profiles, credentials, and scheduling settings
            </p>
          </div>
          <Button className="gap-2" onClick={handleOpenAdd}>
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        </div>

        {/* Provider Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 rounded" />
                ))}
              </div>
            ) : providers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Stethoscope className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-700">
                  No providers configured
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Add provider profiles to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>NPI</TableHead>
                    <TableHead>License #</TableHead>
                    <TableHead>License Expiry</TableHead>
                    <TableHead>Specialty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => {
                    const expired = isLicenseExpired(provider.license_expiry);
                    return (
                      <TableRow
                        key={provider.id}
                        className={expired ? 'bg-red-50' : ''}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {provider.color && (
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: provider.color }}
                              />
                            )}
                            <span className="font-medium">
                              {provider.first_name} {provider.last_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {provider.credentials || '-'}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {provider.npi || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            {provider.license_number || '-'}
                            {provider.license_state && (
                              <span className="text-xs text-slate-400 ml-1">
                                ({provider.license_state})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {provider.license_expiry ? (
                            <span
                              className={`text-sm ${
                                expired
                                  ? 'text-red-600 font-semibold'
                                  : 'text-slate-600'
                              }`}
                            >
                              {format(
                                parseISO(provider.license_expiry),
                                'MM/dd/yyyy'
                              )}
                              {expired && (
                                <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-red-500" />
                              )}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {provider.specialty || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              provider.is_active
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }
                          >
                            {provider.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(provider)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Provider Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProvider ? 'Edit Provider' : 'Add Provider'}
              </DialogTitle>
              <DialogDescription>
                {editingProvider
                  ? 'Update provider profile information.'
                  : 'Create a new provider profile.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Link to user account */}
              <div className="grid gap-2">
                <Label>Link User Account *</Label>
                <Select
                  value={formData.user_id}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, user_id: v }))
                  }
                  disabled={!!editingProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clinicMembers.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.user_id.slice(0, 8)}... ({member.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="prov-first">First Name *</Label>
                  <Input
                    id="prov-first"
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        first_name: e.target.value,
                      }))
                    }
                    placeholder="John"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prov-last">Last Name *</Label>
                  <Input
                    id="prov-last"
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        last_name: e.target.value,
                      }))
                    }
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="prov-cred">Credentials</Label>
                  <Input
                    id="prov-cred"
                    value={formData.credentials}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        credentials: e.target.value,
                      }))
                    }
                    placeholder="PT, DPT, OCS"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prov-npi">NPI</Label>
                  <Input
                    id="prov-npi"
                    value={formData.npi}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, npi: e.target.value }))
                    }
                    placeholder="1234567890"
                    maxLength={10}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="prov-lic">License #</Label>
                  <Input
                    id="prov-lic"
                    value={formData.license_number}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        license_number: e.target.value,
                      }))
                    }
                    placeholder="PT123456"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>License State</Label>
                  <Select
                    value={formData.license_state}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, license_state: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prov-exp">License Expiry</Label>
                  <Input
                    id="prov-exp"
                    type="date"
                    value={formData.license_expiry}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        license_expiry: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Specialty</Label>
                <Select
                  value={formData.specialty}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, specialty: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialty..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="prov-email">Email</Label>
                  <Input
                    id="prov-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    placeholder="provider@clinic.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prov-phone">Phone</Label>
                  <Input
                    id="prov-phone"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="prov-duration">
                    Default Appointment Duration (min)
                  </Label>
                  <Input
                    id="prov-duration"
                    type="number"
                    value={formData.default_appointment_duration}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        default_appointment_duration: parseInt(e.target.value, 10) || 45,
                      }))
                    }
                    min={15}
                    max={120}
                    step={5}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prov-max">Max Daily Patients</Label>
                  <Input
                    id="prov-max"
                    type="number"
                    value={formData.max_daily_patients}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        max_daily_patients: e.target.value,
                      }))
                    }
                    placeholder="e.g., 12"
                    min={1}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Calendar Color</Label>
                <div className="flex flex-wrap gap-2">
                  {CALENDAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === color
                          ? 'border-slate-900 scale-110'
                          : 'border-transparent hover:border-slate-300'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, color }))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingProvider ? 'Update Provider' : 'Add Provider'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
