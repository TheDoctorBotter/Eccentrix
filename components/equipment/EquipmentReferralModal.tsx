'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  EQUIPMENT_PHASES,
  EQUIPMENT_TYPES,
  PROVIDER_COMPANIES,
  getEquipmentTypeLabel,
  getPhaseById,
} from '@/lib/equipment/phases';
import { getDateFieldForPhase } from '@/lib/equipment/advancePhase';
import { toast } from 'sonner';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
}

export interface EquipmentReferral {
  id: string;
  clinic_id: string;
  patient_id: string;
  equipment_type: string;
  equipment_description: string | null;
  phase: string;
  provider_company: string | null;
  provider_contact_name: string | null;
  provider_contact_phone: string | null;
  provider_contact_email: string | null;
  referral_sent_date: string | null;
  evaluation_date: string | null;
  evaluation_notes: string | null;
  equipment_received_date: string | null;
  notes: string | null;
  last_updated_at: string;
  last_updated_by: string | null;
  created_at: string;
  created_by: string | null;
  is_active: boolean;
  // Joined fields
  patient_first_name?: string;
  patient_last_name?: string;
  patient_date_of_birth?: string | null;
}

interface Props {
  existingReferral?: EquipmentReferral | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EquipmentReferralModal({ existingReferral, onClose, onSaved }: Props) {
  const { currentClinic, user } = useAuth();
  const clinicId = currentClinic?.clinic_id || '';
  const isEdit = !!existingReferral;

  // Form state
  const [patientId, setPatientId] = useState(existingReferral?.patient_id || '');
  const [patientDisplay, setPatientDisplay] = useState('');
  const [equipmentType, setEquipmentType] = useState(existingReferral?.equipment_type || '');
  const [equipmentDescription, setEquipmentDescription] = useState(existingReferral?.equipment_description || '');
  const [phase, setPhase] = useState(existingReferral?.phase || 'monitoring');
  const [providerCompany, setProviderCompany] = useState(existingReferral?.provider_company || '');
  const [providerContactName, setProviderContactName] = useState(existingReferral?.provider_contact_name || '');
  const [providerContactPhone, setProviderContactPhone] = useState(existingReferral?.provider_contact_phone || '');
  const [providerContactEmail, setProviderContactEmail] = useState(existingReferral?.provider_contact_email || '');
  const [referralSentDate, setReferralSentDate] = useState(existingReferral?.referral_sent_date || '');
  const [evaluationDate, setEvaluationDate] = useState(existingReferral?.evaluation_date || '');
  const [evaluationNotes, setEvaluationNotes] = useState(existingReferral?.evaluation_notes || '');
  const [equipmentReceivedDate, setEquipmentReceivedDate] = useState(existingReferral?.equipment_received_date || '');
  const [notes, setNotes] = useState(existingReferral?.notes || '');

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Provider company custom entry
  const [customProvider, setCustomProvider] = useState(false);

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialize patient display for edit mode
  useEffect(() => {
    if (existingReferral && existingReferral.patient_first_name) {
      setPatientDisplay(
        `${existingReferral.patient_last_name}, ${existingReferral.patient_first_name}`
      );
    }
    // Check if provider is custom
    if (existingReferral?.provider_company && !PROVIDER_COMPANIES.includes(existingReferral.provider_company)) {
      setCustomProvider(true);
    }
  }, [existingReferral]);

  // Patient search debounce
  useEffect(() => {
    if (!patientSearch || patientSearch.length < 2) {
      setPatientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/patients?clinic_id=${clinicId}&search=${encodeURIComponent(patientSearch)}`
        );
        if (res.ok) {
          const data = await res.json();
          setPatientResults(Array.isArray(data) ? data.slice(0, 10) : []);
          setShowDropdown(true);
        }
      } catch {
        setPatientResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch, clinicId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectPatient = (p: Patient) => {
    setPatientId(p.id);
    setPatientDisplay(`${p.last_name}, ${p.first_name}`);
    setPatientSearch('');
    setShowDropdown(false);
    setDirty(true);
  };

  const handlePhaseChange = (newPhase: string) => {
    setPhase(newPhase);
    setDirty(true);

    // Auto-populate date field if advancing and empty
    const today = new Date().toISOString().split('T')[0];
    if (newPhase === 'referral_sent' && !referralSentDate) setReferralSentDate(today);
    if (newPhase === 'evaluation_completed' && !evaluationDate) setEvaluationDate(today);
    if (newPhase === 'equipment_received' && !equipmentReceivedDate) setEquipmentReceivedDate(today);
  };

  const handleClose = () => {
    if (dirty) {
      if (!confirm('You have unsaved changes. Close anyway?')) return;
    }
    onClose();
  };

  const handleSave = async () => {
    // Validation
    if (!patientId) {
      toast.error('Please select a patient.');
      return;
    }
    if (!equipmentType) {
      toast.error('Please select an equipment type.');
      return;
    }
    if (!phase) {
      toast.error('Please select a phase.');
      return;
    }
    if (!clinicId) {
      toast.error('No clinic selected.');
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      clinic_id: clinicId,
      patient_id: patientId,
      equipment_type: equipmentType,
      equipment_description: equipmentDescription || null,
      phase,
      provider_company: providerCompany || null,
      provider_contact_name: providerContactName || null,
      provider_contact_phone: providerContactPhone || null,
      provider_contact_email: providerContactEmail || null,
      referral_sent_date: referralSentDate || null,
      evaluation_date: evaluationDate || null,
      evaluation_notes: evaluationNotes || null,
      equipment_received_date: equipmentReceivedDate || null,
      notes: notes || null,
      last_updated_by: user?.id || null,
    };

    try {
      if (isEdit && existingReferral) {
        const { error } = await supabase
          .from('equipment_referrals')
          .update(payload)
          .eq('id', existingReferral.id);
        if (error) throw error;
        toast.success('Referral updated.');
      } else {
        payload.created_by = user?.id || null;
        const { error } = await supabase
          .from('equipment_referrals')
          .insert(payload);
        if (error) throw error;
        toast.success('Referral created.');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save referral.');
    } finally {
      setSaving(false);
    }
  };

  const phaseIndex = EQUIPMENT_PHASES.findIndex((p) => p.id === phase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? 'Edit Equipment Referral' : 'Add Equipment Referral'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* PATIENT SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Patient</h3>
            {isEdit ? (
              <div className="px-3 py-2 bg-slate-50 border rounded-lg text-sm text-slate-700">
                {patientDisplay}
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                {patientId ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-slate-50 border rounded-lg text-sm">
                      {patientDisplay}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPatientId('');
                        setPatientDisplay('');
                        setDirty(true);
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search patients by name..."
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setDirty(true);
                        }}
                        className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {searchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                      )}
                    </div>
                    {showDropdown && patientResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {patientResults.map((p) => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                            onClick={() => selectPatient(p)}
                          >
                            <span className="font-medium">{p.last_name}, {p.first_name}</span>
                            {p.date_of_birth && (
                              <span className="text-slate-500 ml-2">
                                DOB: {p.date_of_birth}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {showDropdown && patientSearch.length >= 2 && patientResults.length === 0 && !searchLoading && (
                      <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg px-3 py-2 text-sm text-slate-500">
                        No patients found.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* EQUIPMENT SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Equipment</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Equipment Type *</label>
                <select
                  value={equipmentType}
                  onChange={(e) => { setEquipmentType(e.target.value); setDirty(true); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select type...</option>
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={equipmentDescription}
                  onChange={(e) => { setEquipmentDescription(e.target.value); setDirty(true); }}
                  placeholder="Additional details about the equipment..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* PHASE SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Phase</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Current Phase *</label>
                <select
                  value={phase}
                  onChange={(e) => handlePhaseChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EQUIPMENT_PHASES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Conditional date fields */}
              {phaseIndex >= 1 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Referral Sent Date</label>
                  <input
                    type="date"
                    value={referralSentDate}
                    onChange={(e) => { setReferralSentDate(e.target.value); setDirty(true); }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {phaseIndex >= 2 && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Evaluation Date</label>
                    <input
                      type="date"
                      value={evaluationDate}
                      onChange={(e) => { setEvaluationDate(e.target.value); setDirty(true); }}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Evaluation Notes</label>
                    <textarea
                      value={evaluationNotes}
                      onChange={(e) => { setEvaluationNotes(e.target.value); setDirty(true); }}
                      rows={2}
                      placeholder="Notes from the evaluation..."
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {phaseIndex >= 3 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Equipment Received Date</label>
                  <input
                    type="date"
                    value={equipmentReceivedDate}
                    onChange={(e) => { setEquipmentReceivedDate(e.target.value); setDirty(true); }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* PROVIDER SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Provider</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Provider Company</label>
                {customProvider ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={providerCompany}
                      onChange={(e) => { setProviderCompany(e.target.value); setDirty(true); }}
                      placeholder="Enter provider name..."
                      className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button variant="ghost" size="sm" onClick={() => { setCustomProvider(false); setProviderCompany(''); }}>
                      List
                    </Button>
                  </div>
                ) : (
                  <select
                    value={providerCompany}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setCustomProvider(true);
                        setProviderCompany('');
                      } else {
                        setProviderCompany(e.target.value);
                      }
                      setDirty(true);
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select provider...</option>
                    {PROVIDER_COMPANIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__custom__">— Enter custom —</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">ATP / Orthotist Name</label>
                <input
                  type="text"
                  value={providerContactName}
                  onChange={(e) => { setProviderContactName(e.target.value); setDirty(true); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={providerContactPhone}
                    onChange={(e) => { setProviderContactPhone(e.target.value); setDirty(true); }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={providerContactEmail}
                    onChange={(e) => { setProviderContactEmail(e.target.value); setDirty(true); }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* NOTES SECTION */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              rows={3}
              placeholder="General notes..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : isEdit ? (
              'Update Referral'
            ) : (
              'Create Referral'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
