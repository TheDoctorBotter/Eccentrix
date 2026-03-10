'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Trash2 } from 'lucide-react';
import { STGoalProgressTable } from './shared/STGoalsSection';
import type {
  STFormData,
  STDischargeReason,
  STGoalProgressEntry,
  STFunctionalStatusEntry,
} from '@/types/notes/st';
import { ST_DISCHARGE_REASON_LABELS, createEmptySTFormData } from '@/types/notes/st';

interface STDischargeProps {
  formData: STFormData;
  onChange: (data: STFormData) => void;
  readOnly?: boolean;
}

export default function STDischarge({
  formData,
  onChange,
  readOnly,
}: STDischargeProps) {
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptySTFormData('discharge'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMeta = (field: string, value: unknown) =>
    onChange({ ...formData, meta: { ...formData.meta, [field]: value } });

  const updateAssessment = (field: string, value: unknown) =>
    onChange({ ...formData, assessment: { ...formData.assessment, [field]: value } });

  const updatePlan = (field: string, value: unknown) =>
    onChange({ ...formData, plan: { ...formData.plan, [field]: value } });

  // Communication status table helpers
  const functionalStatus = (formData.meta.functionalStatus || []) as STFunctionalStatusEntry[];

  const addRow = () =>
    updateMeta('functionalStatus', [
      ...functionalStatus,
      { area: '', baseline: '', dischargeStatus: '', change: '' },
    ]);

  const removeRow = (idx: number) =>
    updateMeta('functionalStatus', functionalStatus.filter((_, i) => i !== idx));

  const updateRow = (
    idx: number,
    field: keyof STFunctionalStatusEntry,
    value: string
  ) => {
    const updated = functionalStatus.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e
    );
    updateMeta('functionalStatus', updated);
  };

  return (
    <div className="space-y-4">
      {/* ====== SUMMARY ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Discharge Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Total Visits Completed</Label>
            <Input
              type="number"
              min={0}
              value={formData.meta.totalVisitsCompleted ?? 0}
              onChange={(e) =>
                updateMeta('totalVisitsCompleted', parseInt(e.target.value) || 0)
              }
              className="h-8 text-sm w-32"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Reason for Discharge</Label>
            {readOnly ? (
              <p className="text-sm mt-1">
                {formData.plan.dischargeReason
                  ? ST_DISCHARGE_REASON_LABELS[formData.plan.dischargeReason as STDischargeReason]
                  : '—'}
              </p>
            ) : (
              <Select
                value={formData.plan.dischargeReason || ''}
                onValueChange={(v) => updatePlan('dischargeReason', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ST_DISCHARGE_REASON_LABELS).map(([k, label]) => (
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

      {/* ====== COMMUNICATION STATUS COMPARISON ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Communication Status: Baseline vs Discharge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Compare communication abilities from evaluation to discharge
              </span>
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Row
                </Button>
              )}
            </div>
            {functionalStatus.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left p-2 font-medium text-slate-600">
                        Communication Area
                      </th>
                      <th className="text-left p-2 font-medium text-slate-600">Baseline</th>
                      <th className="text-left p-2 font-medium text-slate-600">
                        Discharge Status
                      </th>
                      <th className="text-left p-2 font-medium text-slate-600 w-28">Change</th>
                      {!readOnly && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {functionalStatus.map((entry, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-1">
                          <Input
                            value={entry.area}
                            onChange={(e) => updateRow(idx, 'area', e.target.value)}
                            className="h-8 text-sm"
                            readOnly={readOnly}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={entry.baseline}
                            onChange={(e) => updateRow(idx, 'baseline', e.target.value)}
                            className="h-8 text-sm"
                            readOnly={readOnly}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={entry.dischargeStatus}
                            onChange={(e) => updateRow(idx, 'dischargeStatus', e.target.value)}
                            className="h-8 text-sm"
                            readOnly={readOnly}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            value={entry.change}
                            onChange={(e) => updateRow(idx, 'change', e.target.value)}
                            className="h-8 text-sm"
                            readOnly={readOnly}
                          />
                        </td>
                        {!readOnly && (
                          <td className="p-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeRow(idx)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {functionalStatus.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                No communication status entries.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ====== GOALS OUTCOME ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Goals Outcome</CardTitle>
        </CardHeader>
        <CardContent>
          <STGoalProgressTable
            label="Goal Outcomes at Discharge"
            entries={(formData.assessment.progressTowardGoals || []) as STGoalProgressEntry[]}
            onChange={(v) => updateAssessment('progressTowardGoals', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== DISCHARGE DETAILS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Discharge Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Home Program Summary</Label>
            <Textarea
              value={formData.plan.homeProgram || ''}
              onChange={(e) => updatePlan('homeProgram', e.target.value)}
              placeholder="Home practice activities, communication strategies, frequency..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Caregiver Training Summary</Label>
            <Textarea
              value={formData.plan.caregiverTrainingSummary || ''}
              onChange={(e) => updatePlan('caregiverTrainingSummary', e.target.value)}
              placeholder="Communication strategies trained, modeling techniques, carry-over..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Home Language / Communication Context
            </Label>
            <Input
              value={formData.meta.homeLanguageContext || ''}
              onChange={(e) => updateMeta('homeLanguageContext', e.target.value)}
              placeholder="Primary language at home, communication partners..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Discharge Recommendations</Label>
            <Textarea
              value={formData.assessment.clinicalImpression || ''}
              onChange={(e) => updateAssessment('clinicalImpression', e.target.value)}
              placeholder="Summary of communication gains, remaining needs, and recommendations..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Follow-Up Instructions</Label>
            <Textarea
              value={formData.plan.followUpInstructions || ''}
              onChange={(e) => updatePlan('followUpInstructions', e.target.value)}
              placeholder="Follow-up with physician, return-to-therapy criteria..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
