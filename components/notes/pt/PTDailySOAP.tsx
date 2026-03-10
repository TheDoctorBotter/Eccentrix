'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import InterventionSelector from './shared/InterventionSelector';
import type {
  PTFormData,
  ResponseToTreatment,
  AttendanceLevel,
} from '@/types/notes/pt';
import {
  RESPONSE_LABELS,
  ATTENDANCE_LABELS,
  createEmptyPTFormData,
} from '@/types/notes/pt';
import { calculateBillingUnits } from '@/lib/types';

interface PTDailySOAPProps {
  formData: PTFormData;
  onChange: (data: PTFormData) => void;
  visitDurationMinutes?: number;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function PTDailySOAP({
  formData,
  onChange,
  visitDurationMinutes,
  patientDiagnosis,
  readOnly,
}: PTDailySOAPProps) {
  // Initialize with defaults if form data is empty
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptyPTFormData('daily_soap'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-populate units from visit duration using existing 8-minute rule helper
  useEffect(() => {
    if (visitDurationMinutes && formData.billing.units === 0) {
      const units = calculateBillingUnits(visitDurationMinutes);
      if (units > 0) {
        onChange({
          ...formData,
          billing: { ...formData.billing, units },
        });
      }
    }
  }, [visitDurationMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-populate ICD-10 from patient diagnosis
  useEffect(() => {
    if (patientDiagnosis && formData.billing.icd10Codes.length === 0) {
      onChange({
        ...formData,
        billing: {
          ...formData.billing,
          icd10Codes: [patientDiagnosis],
        },
      });
    }
  }, [patientDiagnosis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helpers to update nested fields
  const updateSubjective = (field: string, value: unknown) =>
    onChange({
      ...formData,
      subjective: { ...formData.subjective, [field]: value },
    });

  const updateObjective = (field: string, value: unknown) =>
    onChange({
      ...formData,
      objective: { ...formData.objective, [field]: value },
    });

  const updatePlan = (field: string, value: unknown) =>
    onChange({
      ...formData,
      plan: { ...formData.plan, [field]: value },
    });

  const updateBilling = (field: string, value: unknown) =>
    onChange({
      ...formData,
      billing: { ...formData.billing, [field]: value },
    });

  return (
    <div className="space-y-4">
      {/* ====== SUBJECTIVE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Subjective</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Pain Level */}
          <div>
            <Label className="text-xs text-slate-500">
              Pain Level: {formData.subjective.painLevel ?? 'N/A'}/10
            </Label>
            <Slider
              value={[formData.subjective.painLevel ?? 0]}
              onValueChange={([v]) => updateSubjective('painLevel', v)}
              min={0}
              max={10}
              step={1}
              className="mt-1"
              disabled={readOnly}
            />
          </div>

          {/* Subjective report */}
          <div>
            <Label className="text-xs text-slate-500">
              Patient/Caregiver Report
            </Label>
            <Textarea
              value={formData.subjective.subjectiveReport}
              onChange={(e) =>
                updateSubjective('subjectiveReport', e.target.value)
              }
              placeholder="Report of progress, complaints, functional changes..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== OBJECTIVE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Objective</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Interventions */}
          <InterventionSelector
            interventions={formData.objective.interventions}
            onChange={(v) => updateObjective('interventions', v)}
            readOnly={readOnly}
          />

          {/* Objective measurements */}
          <div>
            <Label className="text-xs text-slate-500">
              Objective Measurements (ROM, strength, balance, gait observations)
            </Label>
            <Textarea
              value={formData.objective.objectiveMeasurements}
              onChange={(e) =>
                updateObjective('objectiveMeasurements', e.target.value)
              }
              placeholder="ROM, strength, balance, gait observations..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>

          {/* Response to treatment */}
          <div>
            <Label className="text-xs text-slate-500">Response to Treatment</Label>
            {readOnly ? (
              <p className="text-sm">
                {formData.objective.responseToTreatment
                  ? RESPONSE_LABELS[formData.objective.responseToTreatment as ResponseToTreatment]
                  : '—'}
              </p>
            ) : (
              <Select
                value={formData.objective.responseToTreatment || ''}
                onValueChange={(v) =>
                  updateObjective('responseToTreatment', v)
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select response..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RESPONSE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Attendance/participation */}
          <div>
            <Label className="text-xs text-slate-500">
              Attendance/Participation
            </Label>
            {readOnly ? (
              <p className="text-sm">
                {formData.objective.attendanceParticipation
                  ? ATTENDANCE_LABELS[formData.objective.attendanceParticipation as AttendanceLevel]
                  : '—'}
              </p>
            ) : (
              <Select
                value={formData.objective.attendanceParticipation || ''}
                onValueChange={(v) =>
                  updateObjective('attendanceParticipation', v)
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select level..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ATTENDANCE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ====== BILLING ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">
                Units (8-minute rule)
              </Label>
              <Input
                type="number"
                min={0}
                value={formData.billing.units}
                onChange={(e) =>
                  updateBilling('units', parseInt(e.target.value) || 0)
                }
                className="h-8 text-sm"
                readOnly={readOnly}
              />
              {visitDurationMinutes && (
                <p className="text-xs text-slate-400 mt-1">
                  Based on {visitDurationMinutes} min session
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500">CPT Codes</Label>
              <Input
                value={formData.billing.cptCodes.join(', ')}
                onChange={(e) =>
                  updateBilling(
                    'cptCodes',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="97110, 97530..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">ICD-10 Codes</Label>
            <Input
              value={formData.billing.icd10Codes.join(', ')}
              onChange={(e) =>
                updateBilling(
                  'icd10Codes',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )
              }
              placeholder="M54.5, G80.0..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== PLAN ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-slate-500">Plan for Next Session</Label>
          <Textarea
            value={formData.plan.planNextSession}
            onChange={(e) => updatePlan('planNextSession', e.target.value)}
            placeholder="Focus areas, modifications, goals for next visit..."
            className="min-h-[80px] text-sm"
            readOnly={readOnly}
          />
        </CardContent>
      </Card>
    </div>
  );
}
