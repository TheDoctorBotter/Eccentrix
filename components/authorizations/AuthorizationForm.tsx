'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { isValidDate } from '@/lib/utils';

export interface AuthorizationFormData {
  auth_number: string;
  insurance_name: string;
  insurance_phone: string;
  discipline: string;
  auth_type: string;
  authorized_visits: string;
  units_authorized: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string;
}

export interface AuthorizationRecord {
  id: string;
  patient_id: string;
  episode_id?: string;
  clinic_id?: string;
  auth_number?: string | null;
  insurance_name?: string | null;
  insurance_phone?: string | null;
  authorized_visits?: number | null;
  used_visits?: number;
  remaining_visits?: number | null;
  start_date: string;
  end_date: string;
  status: string;
  notes?: string | null;
  discipline?: string | null;
  auth_type?: string | null;
  units_authorized?: number | null;
  units_used?: number | null;
  patient_name?: string;
}

interface Props {
  mode: 'create' | 'edit';
  initialData?: AuthorizationRecord | null;
  onSave: (data: AuthorizationFormData) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
  /** Read-only patient name shown in edit mode */
  patientName?: string;
  /** Default start date for create mode (e.g., today) */
  defaultStartDate?: string;
}

const EMPTY_FORM: AuthorizationFormData = {
  auth_number: '',
  insurance_name: '',
  insurance_phone: '',
  authorized_visits: '',
  auth_type: 'visits',
  units_authorized: '',
  discipline: 'PT',
  start_date: '',
  end_date: '',
  status: 'pending',
  notes: '',
};

function safeDateField(value: string | null | undefined): string {
  if (!value) return '';
  const dateStr = value.split('T')[0];
  return isValidDate(dateStr) ? dateStr : '';
}

export function AuthorizationForm({
  mode,
  initialData,
  onSave,
  onCancel,
  submitting,
  patientName,
  defaultStartDate,
}: Props) {
  const [form, setForm] = useState<AuthorizationFormData>(() => {
    if (mode === 'edit' && initialData) {
      return {
        auth_number: initialData.auth_number || '',
        insurance_name: initialData.insurance_name || '',
        insurance_phone: initialData.insurance_phone || '',
        authorized_visits: initialData.authorized_visits != null ? String(initialData.authorized_visits) : '',
        auth_type: initialData.auth_type || 'visits',
        units_authorized: initialData.units_authorized != null ? String(initialData.units_authorized) : '',
        discipline: initialData.discipline || 'PT',
        start_date: safeDateField(initialData.start_date),
        end_date: safeDateField(initialData.end_date),
        status: initialData.status || 'pending',
        notes: initialData.notes || '',
      };
    }
    return {
      ...EMPTY_FORM,
      start_date: defaultStartDate || '',
    };
  });

  const [dateError, setDateError] = useState('');

  // Reset form when initialData changes (e.g., opening a different auth for edit)
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setForm({
        auth_number: initialData.auth_number || '',
        insurance_name: initialData.insurance_name || '',
        insurance_phone: initialData.insurance_phone || '',
        authorized_visits: initialData.authorized_visits != null ? String(initialData.authorized_visits) : '',
        auth_type: initialData.auth_type || 'visits',
        units_authorized: initialData.units_authorized != null ? String(initialData.units_authorized) : '',
        discipline: initialData.discipline || 'PT',
        start_date: safeDateField(initialData.start_date),
        end_date: safeDateField(initialData.end_date),
        status: initialData.status || 'pending',
        notes: initialData.notes || '',
      });
      setDateError('');
    }
  }, [mode, initialData]);

  // Date validation
  useEffect(() => {
    if (form.start_date && form.end_date) {
      if (form.end_date < form.start_date) {
        setDateError('End date cannot be before start date');
      } else {
        setDateError('');
      }
    } else {
      setDateError('');
    }
  }, [form.start_date, form.end_date]);

  const handleSubmit = async () => {
    if (dateError) return;
    await onSave(form);
  };

  return (
    <div className="space-y-3">
      {mode === 'edit' && patientName && (
        <div>
          <Label className="text-muted-foreground">Patient</Label>
          <p className="text-sm font-medium">{patientName}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Auth Number</Label>
          <Input
            value={form.auth_number}
            onChange={(e) => setForm(f => ({ ...f, auth_number: e.target.value }))}
          />
        </div>
        <div>
          <Label>Insurance Name</Label>
          <Input
            value={form.insurance_name}
            onChange={(e) => setForm(f => ({ ...f, insurance_name: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <Label>Insurance Phone</Label>
        <Input
          value={form.insurance_phone}
          onChange={(e) => setForm(f => ({ ...f, insurance_phone: e.target.value }))}
          placeholder="e.g. 800-555-0123"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Discipline</Label>
          <Select value={form.discipline} onValueChange={(v) => setForm(f => ({ ...f, discipline: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PT">PT</SelectItem>
              <SelectItem value="OT">OT</SelectItem>
              <SelectItem value="ST">ST</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Auth Type</Label>
          <Select value={form.auth_type} onValueChange={(v) => setForm(f => ({ ...f, auth_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="visits">Visits</SelectItem>
              <SelectItem value="units">Units</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {form.auth_type === 'visits' ? (
        <div>
          <Label>Authorized Visits</Label>
          <Input
            type="number"
            value={form.authorized_visits}
            onChange={(e) => setForm(f => ({ ...f, authorized_visits: e.target.value }))}
          />
        </div>
      ) : (
        <div>
          <Label>Authorized Units</Label>
          <Input
            type="number"
            value={form.units_authorized}
            onChange={(e) => setForm(f => ({ ...f, units_authorized: e.target.value }))}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Start Date</Label>
          <Input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
          />
        </div>
        <div>
          <Label>End Date</Label>
          <Input
            type="date"
            value={form.end_date}
            onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))}
          />
          {dateError && (
            <p className="text-xs text-red-600 mt-1">{dateError}</p>
          )}
        </div>
      </div>

      <div>
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Notes</Label>
        <Input
          value={form.notes}
          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !!dateError}
        >
          {submitting ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create'}
        </Button>
      </div>
    </div>
  );
}
