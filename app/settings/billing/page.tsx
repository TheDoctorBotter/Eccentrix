'use client';

import { useEffect, useState, useCallback } from 'react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send } from 'lucide-react';
import Link from 'next/link';

interface BillingSettings {
  id: string;
  name: string;
  tax_id: string | null;
  taxonomy_code: string | null;
  medicaid_provider_id: string | null;
  billing_npi: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  submitter_id: string | null;
}

export default function BillingSettingsPage() {
  const { currentClinic, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tax_id: '',
    taxonomy_code: '225100000X',
    medicaid_provider_id: '',
    billing_npi: '',
    billing_address: '',
    billing_city: '',
    billing_state: 'TX',
    billing_zip: '',
    submitter_id: '',
  });

  const clinicId = currentClinic?.clinic_id;

  const fetchSettings = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/clinic-billing?clinic_id=${clinicId}`);
      if (res.ok) {
        const data: BillingSettings = await res.json();
        setForm({
          tax_id: data.tax_id || '',
          taxonomy_code: data.taxonomy_code || '225100000X',
          medicaid_provider_id: data.medicaid_provider_id || '',
          billing_npi: data.billing_npi || '',
          billing_address: data.billing_address || '',
          billing_city: data.billing_city || '',
          billing_state: data.billing_state || 'TX',
          billing_zip: data.billing_zip || '',
          submitter_id: data.submitter_id || '',
        });
      }
    } catch (error) {
      console.error('Error fetching billing settings:', error);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!clinicId) return;
    setSaving(true);

    try {
      const res = await fetch('/api/clinic-billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic_id: clinicId, ...form }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save settings');
      }

      toast.success('Billing settings saved successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !currentClinic) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <TopNav />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Send className="h-6 w-6 text-orange-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">TMHP / Billing Settings</h1>
          </div>
          <p className="text-slate-600">
            Configure your clinic&apos;s billing identifiers for electronic claims submission to TMHP
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="space-y-6">
            {/* Tax & Provider IDs */}
            <Card>
              <CardHeader>
                <CardTitle>Provider Identifiers</CardTitle>
                <CardDescription>
                  Required for 837P electronic claims and 270 eligibility inquiries
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">Tax ID (EIN)</Label>
                    <Input
                      id="tax_id"
                      placeholder="XX-XXXXXXX"
                      value={form.tax_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, tax_id: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500">
                      Employer Identification Number for REF*EI segment
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_npi">Billing NPI</Label>
                    <Input
                      id="billing_npi"
                      placeholder="10-digit NPI"
                      value={form.billing_npi}
                      onChange={(e) => setForm((prev) => ({ ...prev, billing_npi: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500">
                      Organization NPI used in NM1*85 billing provider loop
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxonomy_code">Taxonomy Code</Label>
                    <Input
                      id="taxonomy_code"
                      placeholder="225100000X"
                      value={form.taxonomy_code}
                      onChange={(e) => setForm((prev) => ({ ...prev, taxonomy_code: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500">
                      225100000X = Physical Therapist. Used in PRV segment.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medicaid_provider_id">Medicaid Provider ID</Label>
                    <Input
                      id="medicaid_provider_id"
                      placeholder="TMHP Provider ID"
                      value={form.medicaid_provider_id}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, medicaid_provider_id: e.target.value }))
                      }
                    />
                    <p className="text-xs text-slate-500">
                      Your Texas Medicaid provider number from TMHP enrollment
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submitter_id">EDI Submitter ID</Label>
                  <Input
                    id="submitter_id"
                    placeholder="Submitter ID for ISA/GS segments"
                    value={form.submitter_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, submitter_id: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500">
                    Used in ISA06 and GS02 segments. Defaults to Billing NPI if blank.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Billing Address */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Address</CardTitle>
                <CardDescription>
                  Address used in the N3/N4 segments of the billing provider loop
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="billing_address">Street Address</Label>
                  <Input
                    id="billing_address"
                    placeholder="123 Main St, Suite 100"
                    value={form.billing_address}
                    onChange={(e) => setForm((prev) => ({ ...prev, billing_address: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="billing_city">City</Label>
                    <Input
                      id="billing_city"
                      placeholder="Austin"
                      value={form.billing_city}
                      onChange={(e) => setForm((prev) => ({ ...prev, billing_city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_state">State</Label>
                    <Input
                      id="billing_state"
                      placeholder="TX"
                      maxLength={2}
                      value={form.billing_state}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, billing_state: e.target.value.toUpperCase() }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_zip">ZIP Code</Label>
                    <Input
                      id="billing_zip"
                      placeholder="78701"
                      value={form.billing_zip}
                      onChange={(e) => setForm((prev) => ({ ...prev, billing_zip: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TMHP Info */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900">TMHP Receiver Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-blue-800">
                <p>
                  <strong>Payer Name:</strong> Texas Medicaid
                </p>
                <p>
                  <strong>Payer ID:</strong> 330897513
                </p>
                <p>
                  <strong>Receiver ID:</strong> TMHP
                </p>
                <p className="pt-2">
                  These values are automatically used in generated 837P and 270 EDI files.
                  Upload generated files to the{' '}
                  <strong>TMHP Provider Portal</strong> or submit through your clearinghouse.
                </p>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Billing Settings'}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
