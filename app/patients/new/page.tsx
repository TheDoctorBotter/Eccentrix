'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, UserPlus, Loader2 } from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { ICD10CodeInput, type ICD10Code } from '@/components/ICD10CodeInput';

export default function AddPatientPage() {
  const router = useRouter();
  const { currentClinic, loading: authLoading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    primary_diagnosis: '',
    referring_physician: '',
    insurance_id: '',
    allergies: '',
    precautions: '',
    // Episode fields
    episode_diagnosis: '',
    frequency: '',
  });

  // ICD-10 codes state
  const [primaryDiagnosisCodes, setPrimaryDiagnosisCodes] = useState<ICD10Code[]>([]);
  const [treatmentDiagnosisCodes, setTreatmentDiagnosisCodes] = useState<ICD10Code[]>([]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentClinic) {
      setError('No active clinic selected. Please select a clinic from the top navigation.');
      return;
    }

    if (!formData.first_name || !formData.last_name) {
      setError('First name and last name are required');
      return;
    }

    setSaving(true);

    try {
      // 1. Create patient
      const patientRes = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: currentClinic.clinic_id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          date_of_birth: formData.date_of_birth || null,
          gender: formData.gender || null,
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          primary_diagnosis: formData.primary_diagnosis || null,
          referring_physician: formData.referring_physician || null,
          insurance_id: formData.insurance_id || null,
          allergies: formData.allergies || null,
          precautions: formData.precautions || null,
        }),
      });

      if (!patientRes.ok) {
        const patientError = await patientRes.json();
        throw new Error(patientError.error || 'Failed to create patient');
      }

      const patient = await patientRes.json();

      // 2. Create initial episode
      const episodeRes = await fetch('/api/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          clinic_id: currentClinic.clinic_id,
          diagnosis: formData.episode_diagnosis || formData.primary_diagnosis || null,
          frequency: formData.frequency || null,
          primary_diagnosis_codes: primaryDiagnosisCodes,
          treatment_diagnosis_codes: treatmentDiagnosisCodes,
        }),
      });

      if (!episodeRes.ok) {
        const episodeError = await episodeRes.json();
        throw new Error(episodeError.error || 'Failed to create episode');
      }

      const episode = await episodeRes.json();

      // Navigate to the new patient's chart
      router.push(`/charts/${episode.id}`);
    } catch (err) {
      console.error('Error creating patient:', err);
      setError(err instanceof Error ? err.message : 'Failed to create patient');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Caseload
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <UserPlus className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <CardTitle>Add New Patient</CardTitle>
                <CardDescription>
                  Create a new patient record and start their episode of care
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Basic Information */}
              <div>
                <h3 className="font-medium text-slate-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      id="last_name"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                    <Input
                      id="date_of_birth"
                      name="date_of_birth"
                      type="date"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => handleSelectChange('gender', value)}
                    >
                      <SelectTrigger id="gender">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                        <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="font-medium text-slate-900 mb-4">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="(614) 555-0100"
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
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Medical Information */}
              <div>
                <h3 className="font-medium text-slate-900 mb-4">Medical Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="primary_diagnosis">Primary Diagnosis</Label>
                    <Input
                      id="primary_diagnosis"
                      name="primary_diagnosis"
                      value={formData.primary_diagnosis}
                      onChange={handleInputChange}
                      placeholder="e.g., Low back pain with radiculopathy"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referring_physician">Referring Physician</Label>
                    <Input
                      id="referring_physician"
                      name="referring_physician"
                      value={formData.referring_physician}
                      onChange={handleInputChange}
                      placeholder="e.g., Dr. John Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insurance_id">Insurance ID</Label>
                    <Input
                      id="insurance_id"
                      name="insurance_id"
                      value={formData.insurance_id}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Input
                      id="allergies"
                      name="allergies"
                      value={formData.allergies}
                      onChange={handleInputChange}
                      placeholder="e.g., NKDA, Penicillin, Latex"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="precautions">Precautions</Label>
                    <Input
                      id="precautions"
                      name="precautions"
                      value={formData.precautions}
                      onChange={handleInputChange}
                      placeholder="e.g., Fall risk, WB restrictions"
                    />
                  </div>
                </div>
              </div>

              {/* Episode of Care */}
              <div>
                <h3 className="font-medium text-slate-900 mb-4">Episode of Care</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="episode_diagnosis">Episode Diagnosis</Label>
                    <Input
                      id="episode_diagnosis"
                      name="episode_diagnosis"
                      value={formData.episode_diagnosis}
                      onChange={handleInputChange}
                      placeholder="Specific diagnosis for this episode (defaults to primary diagnosis)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="frequency">Treatment Frequency</Label>
                    <Select
                      value={formData.frequency}
                      onValueChange={(value) => handleSelectChange('frequency', value)}
                    >
                      <SelectTrigger id="frequency">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1x/week">1x/week</SelectItem>
                        <SelectItem value="2x/week">2x/week</SelectItem>
                        <SelectItem value="3x/week">3x/week</SelectItem>
                        <SelectItem value="4x/week">4x/week</SelectItem>
                        <SelectItem value="5x/week">5x/week</SelectItem>
                        <SelectItem value="PRN">PRN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t pt-4">
                    <ICD10CodeInput
                      label="Primary Diagnosis ICD-10 Codes"
                      description="Up to 5 ICD-10 codes for primary diagnosis"
                      codes={primaryDiagnosisCodes}
                      onChange={setPrimaryDiagnosisCodes}
                      maxCodes={5}
                      diagnosisText={formData.primary_diagnosis || formData.episode_diagnosis}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <ICD10CodeInput
                      label="Treatment Diagnosis ICD-10 Codes"
                      description="Up to 5 ICD-10 codes for treatment diagnosis"
                      codes={treatmentDiagnosisCodes}
                      onChange={setTreatmentDiagnosisCodes}
                      maxCodes={5}
                      diagnosisText={formData.episode_diagnosis || formData.primary_diagnosis}
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Creating...' : 'Create Patient'}
                </Button>
                <Link href="/">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
