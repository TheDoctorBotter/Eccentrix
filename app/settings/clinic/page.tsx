'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
import { ArrowLeft, Building2, Loader2, Plus, Trash2 } from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { Clinic } from '@/lib/types';

export default function ClinicSettingsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activeClinic, setActiveClinic] = useState<Clinic | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
  });

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (activeClinic) {
      setFormData({
        name: activeClinic.name || '',
        address: activeClinic.address || '',
        phone: activeClinic.phone || '',
        email: activeClinic.email || '',
        website: activeClinic.website || '',
      });
    }
  }, [activeClinic]);

  const initializeApp = async () => {
    try {
      const clinicsRes = await fetch('/api/clinics');
      if (clinicsRes.ok) {
        const clinicsData = await clinicsRes.json();
        setClinics(clinicsData);
        if (clinicsData.length > 0) {
          setActiveClinic(clinicsData[0]);
        }
      }
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  };

  const handleClinicChange = (clinic: Clinic) => {
    setActiveClinic(clinic);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!activeClinic) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/clinics/${activeClinic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const updated = await res.json();
        setClinics((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );
        setActiveClinic(updated);
        setMessage({ type: 'success', text: 'Clinic settings saved successfully' });
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Failed to save clinic settings' });
      }
    } catch (error) {
      console.error('Error saving clinic:', error);
      setMessage({ type: 'error', text: 'Failed to save clinic settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClinic = async () => {
    const name = prompt('Enter the new clinic name:');
    if (!name) return;

    try {
      const res = await fetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        const newClinic = await res.json();
        setClinics((prev) => [...prev, newClinic]);
        setActiveClinic(newClinic);
        setMessage({ type: 'success', text: 'Clinic created successfully' });
      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Failed to create clinic' });
      }
    } catch (error) {
      console.error('Error creating clinic:', error);
      setMessage({ type: 'error', text: 'Failed to create clinic' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav
        activeClinic={activeClinic}
        clinics={clinics}
        onClinicChange={handleClinicChange}
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Building2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <CardTitle>Clinic Settings</CardTitle>
                  <CardDescription>
                    Manage clinic information and contact details
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleCreateClinic} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Clinic
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {message && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {message.text}
              </div>
            )}

            {!activeClinic ? (
              <div className="text-center py-8 text-slate-500">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="mb-4">No clinic selected</p>
                <Button onClick={handleCreateClinic}>Create Your First Clinic</Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Clinic Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Buckeye Physical Therapy"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="123 Main Street, Columbus, OH 43215"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(614) 555-1234"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="info@buckeyept.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    type="url"
                    value={formData.website}
                    onChange={handleInputChange}
                    placeholder="https://buckeyept.com"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinic List */}
        {clinics.length > 1 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">All Clinics</CardTitle>
              <CardDescription>
                Switch between clinics using the dropdown in the top navigation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {clinics.map((clinic) => (
                  <div
                    key={clinic.id}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      activeClinic?.id === clinic.id
                        ? 'border-emerald-200 bg-emerald-50'
                        : ''
                    }`}
                  >
                    <div>
                      <p className="font-medium">{clinic.name}</p>
                      {clinic.address && (
                        <p className="text-sm text-slate-500">{clinic.address}</p>
                      )}
                    </div>
                    {activeClinic?.id === clinic.id && (
                      <span className="text-xs text-emerald-600 font-medium">
                        Currently Editing
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
