'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Shield } from 'lucide-react';
import type { PatientInsurance } from '@/lib/billing/types';

interface Props {
  patientId: string;
  clinicId: string;
}

interface InsuranceFormState {
  payer_type: 'medicaid' | 'commercial' | 'private_pay';
  payer_name: string;
  payer_id: string;
  member_id: string;
  group_number: string;
  subscriber_name: string;
  subscriber_dob: string;
  subscriber_first_name: string;
  subscriber_last_name: string;
  subscriber_gender: string;
  subscriber_address_line1: string;
  subscriber_address_city: string;
  subscriber_address_state: string;
  subscriber_address_zip: string;
  relationship_to_subscriber: string;
  is_primary: boolean;
}

const EMPTY_FORM: InsuranceFormState = {
  payer_type: 'medicaid',
  payer_name: '',
  payer_id: '',
  member_id: '',
  group_number: '',
  subscriber_name: '',
  subscriber_dob: '',
  subscriber_first_name: '',
  subscriber_last_name: '',
  subscriber_gender: 'U',
  subscriber_address_line1: '',
  subscriber_address_city: '',
  subscriber_address_state: 'TX',
  subscriber_address_zip: '',
  relationship_to_subscriber: 'self',
  is_primary: true,
};

export function PatientInsuranceSection({ patientId, clinicId }: Props) {
  const [insurances, setInsurances] = useState<PatientInsurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchInsurances = useCallback(async () => {
    const res = await fetch(`/api/patient-insurance?patient_id=${patientId}&clinic_id=${clinicId}`);
    const data = await res.json();
    setInsurances(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [patientId, clinicId]);

  useEffect(() => {
    fetchInsurances();
  }, [fetchInsurances]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = { ...form, patient_id: patientId, clinic_id: clinicId };

      if (editingId) {
        const res = await fetch(`/api/patient-insurance/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update');
        toast.success('Insurance updated');
      } else {
        const res = await fetch('/api/patient-insurance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create');
        toast.success('Insurance added');
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchInsurances();
    } catch (err) {
      toast.error('Error saving insurance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (ins: PatientInsurance) => {
    setEditingId(ins.id);
    setForm({
      payer_type: ins.payer_type as InsuranceFormState['payer_type'],
      payer_name: ins.payer_name || '',
      payer_id: ins.payer_id || '',
      member_id: ins.member_id || '',
      group_number: ins.group_number || '',
      subscriber_name: ins.subscriber_name || '',
      subscriber_dob: ins.subscriber_dob || '',
      subscriber_first_name: ins.subscriber_first_name || '',
      subscriber_last_name: ins.subscriber_last_name || '',
      subscriber_gender: ins.subscriber_gender || 'U',
      subscriber_address_line1: ins.subscriber_address_line1 || '',
      subscriber_address_city: ins.subscriber_address_city || '',
      subscriber_address_state: ins.subscriber_address_state || 'TX',
      subscriber_address_zip: ins.subscriber_address_zip || '',
      relationship_to_subscriber: ins.relationship_to_subscriber || 'self',
      is_primary: ins.is_primary,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/patient-insurance/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Insurance removed');
      fetchInsurances();
    } else {
      toast.error('Failed to remove insurance');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" /> Insurance
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingId(null); setForm(EMPTY_FORM); }
        }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit' : 'Add'} Insurance</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Payer Type</Label>
                <Select value={form.payer_type} onValueChange={(v) => setForm(f => ({ ...f, payer_type: v as 'medicaid' | 'commercial' | 'private_pay' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medicaid">Medicaid</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="private_pay">Private Pay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Payer Name</Label>
                  <Input value={form.payer_name} onChange={(e) => setForm(f => ({ ...f, payer_name: e.target.value }))} placeholder="e.g. Texas Medicaid" />
                </div>
                <div>
                  <Label>Payer ID</Label>
                  <Input value={form.payer_id} onChange={(e) => setForm(f => ({ ...f, payer_id: e.target.value }))} placeholder="e.g. TXMCD" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Member ID {form.payer_type === 'medicaid' && '(Medicaid ID)'}</Label>
                  <Input value={form.member_id} onChange={(e) => setForm(f => ({ ...f, member_id: e.target.value }))} />
                </div>
                <div>
                  <Label>Group Number</Label>
                  <Input value={form.group_number} onChange={(e) => setForm(f => ({ ...f, group_number: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Relationship to Subscriber</Label>
                <Select value={form.relationship_to_subscriber} onValueChange={(v) => setForm(f => ({ ...f, relationship_to_subscriber: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Self</SelectItem>
                    <SelectItem value="spouse">Spouse</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.relationship_to_subscriber !== 'self' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Subscriber First Name</Label>
                      <Input value={form.subscriber_first_name} onChange={(e) => setForm(f => ({ ...f, subscriber_first_name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Subscriber Last Name</Label>
                      <Input value={form.subscriber_last_name} onChange={(e) => setForm(f => ({ ...f, subscriber_last_name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Subscriber DOB</Label>
                      <Input type="date" value={form.subscriber_dob} onChange={(e) => setForm(f => ({ ...f, subscriber_dob: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Subscriber Gender</Label>
                      <Select value={form.subscriber_gender} onValueChange={(v) => setForm(f => ({ ...f, subscriber_gender: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Male</SelectItem>
                          <SelectItem value="F">Female</SelectItem>
                          <SelectItem value="U">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Subscriber Address</Label>
                    <Input value={form.subscriber_address_line1} onChange={(e) => setForm(f => ({ ...f, subscriber_address_line1: e.target.value }))} placeholder="Street address" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={form.subscriber_address_city} onChange={(e) => setForm(f => ({ ...f, subscriber_address_city: e.target.value }))} placeholder="City" />
                    <Input value={form.subscriber_address_state} onChange={(e) => setForm(f => ({ ...f, subscriber_address_state: e.target.value }))} placeholder="State" maxLength={2} />
                    <Input value={form.subscriber_address_zip} onChange={(e) => setForm(f => ({ ...f, subscriber_address_zip: e.target.value }))} placeholder="ZIP" />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : insurances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No insurance records.</p>
        ) : (
          <div className="space-y-2">
            {insurances.map((ins) => (
              <div key={ins.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ins.payer_type === 'medicaid' ? 'default' : 'secondary'}>
                      {ins.payer_type}
                    </Badge>
                    {ins.is_primary && <Badge variant="outline">Primary</Badge>}
                    <span className="font-medium">{ins.payer_name || 'Unknown Payer'}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {ins.member_id && <span>ID: {ins.member_id}</span>}
                    {ins.group_number && <span className="ml-3">Group: {ins.group_number}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(ins)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(ins.id)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
