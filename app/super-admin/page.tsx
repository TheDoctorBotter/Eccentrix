'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  Plus,
  Users,
  UserCheck,
  Loader2,
  ArrowRight,
  X,
  Shield,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ClinicWithStats {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  npi?: string;
  tax_id?: string;
  documentation_mode: string;
  is_active: boolean;
  patient_count: number;
  staff_count: number;
  address_city?: string;
  address_state?: string;
}

// Helper to auto-generate a URL-safe slug from a clinic name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export default function SuperAdminDashboard() {
  const { user, isSuperAdmin, loading: authLoading, setCurrentClinic, memberships } = useAuth();
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add clinic form state
  const [newClinic, setNewClinic] = useState({
    name: '',
    slug: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    npi: '',
    tax_id: '',
    documentation_mode: 'emr',
    admin_email: '',
    admin_name: '',
  });

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      // Redirect non-super-admins to the main dashboard
      router.push('/');
      return;
    }
    if (!authLoading && isSuperAdmin) {
      fetchClinics();
    }
  }, [authLoading, isSuperAdmin]);

  const fetchClinics = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const response = await fetch('/api/super-admin/clinics', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.ok) {
        const data = await response.json();
        setClinics(data);
      } else {
        throw new Error('Failed to fetch clinics');
      }
    } catch (err) {
      console.error('Error fetching clinics:', err);
      setError('Failed to load clinics');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClinic = async () => {
    if (!newClinic.name || !newClinic.slug) {
      setError('Clinic name and slug are required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const response = await fetch('/api/super-admin/clinics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(newClinic),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create clinic');
      }

      // Reset form and refresh
      setNewClinic({
        name: '', slug: '', address: '', phone: '', fax: '', email: '',
        npi: '', tax_id: '', documentation_mode: 'emr', admin_email: '', admin_name: '',
      });
      setShowAddForm(false);
      await fetchClinics();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create clinic';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Switch into a clinic's context (super admin "impersonation" for support)
  const switchToClinic = (clinic: ClinicWithStats) => {
    // Find an existing membership for this clinic, or use the first membership
    // and override the clinic context
    const membership = memberships.find(
      (m) => m.clinic_id === clinic.id || m.clinic_id_ref === clinic.id
    );

    if (membership) {
      setCurrentClinic(membership);
    } else {
      // Create a synthetic membership for viewing this clinic
      setCurrentClinic({
        id: 'super-admin-override',
        user_id: user?.id || '',
        clinic_id: clinic.id,
        clinic_id_ref: clinic.id,
        clinic_name: clinic.name,
        role: 'admin',
        is_active: true,
        is_super_admin: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    router.push('/');
  };

  const toggleClinicActive = async (clinic: ClinicWithStats) => {
    try {
      const { error } = await supabase
        .from('clinics')
        .update({ is_active: !clinic.is_active })
        .eq('id', clinic.id);

      if (error) throw error;
      await fetchClinics();
    } catch (err) {
      console.error('Error toggling clinic:', err);
      setError('Failed to update clinic status');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Super Admin Dashboard</h1>
              <p className="text-slate-600">Manage all clinics across the platform</p>
            </div>
          </div>
          <Button onClick={() => setShowAddForm(true)} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            Add Clinic
          </Button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{clinics.length}</p>
                  <p className="text-sm text-slate-500">Total Clinics</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {clinics.reduce((sum, c) => sum + c.patient_count, 0)}
                  </p>
                  <p className="text-sm text-slate-500">Total Patients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <UserCheck className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {clinics.reduce((sum, c) => sum + c.staff_count, 0)}
                  </p>
                  <p className="text-sm text-slate-500">Total Staff</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Clinic Modal */}
        {showAddForm && (
          <Card className="border-2 border-blue-200">
            <CardHeader>
              <CardTitle>Add New Clinic</CardTitle>
              <CardDescription>Create a new clinic and optionally invite a clinic admin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clinic-name">Clinic Name *</Label>
                  <Input
                    id="clinic-name"
                    value={newClinic.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewClinic({ ...newClinic, name, slug: generateSlug(name) });
                    }}
                    placeholder="Buckeye Physical Therapy"
                  />
                </div>
                <div>
                  <Label htmlFor="clinic-slug">URL Slug *</Label>
                  <Input
                    id="clinic-slug"
                    value={newClinic.slug}
                    onChange={(e) => setNewClinic({ ...newClinic, slug: e.target.value })}
                    placeholder="buckeye-pt"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="clinic-address">Address</Label>
                <Input
                  id="clinic-address"
                  value={newClinic.address}
                  onChange={(e) => setNewClinic({ ...newClinic, address: e.target.value })}
                  placeholder="123 Main St, City, State ZIP"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clinic-phone">Phone</Label>
                  <Input
                    id="clinic-phone"
                    value={newClinic.phone}
                    onChange={(e) => setNewClinic({ ...newClinic, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <Label htmlFor="clinic-fax">Fax</Label>
                  <Input
                    id="clinic-fax"
                    value={newClinic.fax}
                    onChange={(e) => setNewClinic({ ...newClinic, fax: e.target.value })}
                    placeholder="(555) 123-4568"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clinic-email">Email</Label>
                  <Input
                    id="clinic-email"
                    value={newClinic.email}
                    onChange={(e) => setNewClinic({ ...newClinic, email: e.target.value })}
                    placeholder="office@clinic.com"
                  />
                </div>
                <div>
                  <Label htmlFor="clinic-npi">NPI</Label>
                  <Input
                    id="clinic-npi"
                    value={newClinic.npi}
                    onChange={(e) => setNewClinic({ ...newClinic, npi: e.target.value })}
                    placeholder="1234567890"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clinic-taxid">Tax ID</Label>
                  <Input
                    id="clinic-taxid"
                    value={newClinic.tax_id}
                    onChange={(e) => setNewClinic({ ...newClinic, tax_id: e.target.value })}
                    placeholder="XX-XXXXXXX"
                  />
                </div>
                <div>
                  <Label htmlFor="clinic-mode">Practice Mode</Label>
                  <select
                    id="clinic-mode"
                    value={newClinic.documentation_mode}
                    onChange={(e) => setNewClinic({ ...newClinic, documentation_mode: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="emr">EMR (Electronic)</option>
                    <option value="paper">Paper</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium text-slate-900 mb-3">Invite Clinic Admin (optional)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="admin-name">Admin Name</Label>
                    <Input
                      id="admin-name"
                      value={newClinic.admin_name}
                      onChange={(e) => setNewClinic({ ...newClinic, admin_name: e.target.value })}
                      placeholder="Dr. Jane Smith"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-email">Admin Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={newClinic.admin_email}
                      onChange={(e) => setNewClinic({ ...newClinic, admin_email: e.target.value })}
                      placeholder="admin@clinic.com"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleAddClinic} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Clinic'
                  )}
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clinics table */}
        <Card>
          <CardHeader>
            <CardTitle>All Clinics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-slate-600">Clinic</th>
                    <th className="pb-3 font-medium text-slate-600">Slug</th>
                    <th className="pb-3 font-medium text-slate-600">Location</th>
                    <th className="pb-3 font-medium text-slate-600 text-center">Patients</th>
                    <th className="pb-3 font-medium text-slate-600 text-center">Staff</th>
                    <th className="pb-3 font-medium text-slate-600 text-center">Mode</th>
                    <th className="pb-3 font-medium text-slate-600 text-center">Status</th>
                    <th className="pb-3 font-medium text-slate-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clinics.map((clinic) => (
                    <tr key={clinic.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-3 font-medium text-slate-900">{clinic.name}</td>
                      <td className="py-3 text-slate-500 font-mono text-xs">{clinic.slug}</td>
                      <td className="py-3 text-slate-600">
                        {[clinic.address_city, clinic.address_state].filter(Boolean).join(', ') || clinic.address || '-'}
                      </td>
                      <td className="py-3 text-center">{clinic.patient_count}</td>
                      <td className="py-3 text-center">{clinic.staff_count}</td>
                      <td className="py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          clinic.documentation_mode === 'emr'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {clinic.documentation_mode?.toUpperCase() || 'EMR'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          clinic.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {clinic.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => switchToClinic(clinic)}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" />
                            Enter
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleClinicActive(clinic)}
                            className={clinic.is_active ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                          >
                            {clinic.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {clinics.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No clinics found. Click "Add Clinic" to create your first clinic.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
