'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ROMTable from './shared/ROMTable';
import StrengthTable from './shared/StrengthTable';
import FunctionalMobilitySection from './shared/FunctionalMobilitySection';
import { GoalEntryTable, GoalProgressTable } from './shared/GoalsSection';
import type {
  PTFormData,
  GoalEntry,
  GoalProgressEntry,
} from '@/types/notes/pt';
import { createEmptyPTFormData } from '@/types/notes/pt';

interface PTReEvaluationProps {
  formData: PTFormData;
  onChange: (data: PTFormData) => void;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function PTReEvaluation({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: PTReEvaluationProps) {
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptyPTFormData('re_evaluation'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (patientDiagnosis && formData.billing.icd10Codes.length === 0) {
      onChange({
        ...formData,
        billing: { ...formData.billing, icd10Codes: [patientDiagnosis] },
      });
    }
  }, [patientDiagnosis]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMeta = (field: string, value: unknown) =>
    onChange({ ...formData, meta: { ...formData.meta, [field]: value } });

  const updateObjective = (field: string, value: unknown) =>
    onChange({ ...formData, objective: { ...formData.objective, [field]: value } });

  const updateAssessment = (field: string, value: unknown) =>
    onChange({ ...formData, assessment: { ...formData.assessment, [field]: value } });

  const updatePlan = (field: string, value: unknown) =>
    onChange({ ...formData, plan: { ...formData.plan, [field]: value } });

  const updateGoals = (field: string, value: unknown) =>
    onChange({ ...formData, goals: { ...formData.goals, [field]: value } });

  const updateBilling = (field: string, value: unknown) =>
    onChange({ ...formData, billing: { ...formData.billing, [field]: value } });

  return (
    <div className="space-y-4">
      {/* ====== VISITS & CONTEXT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Re-Evaluation Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Visits Since Last Eval</Label>
              <Input
                type="number"
                min={0}
                value={formData.goals.visitsCompletedSinceLastEval ?? 0}
                onChange={(e) =>
                  updateGoals('visitsCompletedSinceLastEval', parseInt(e.target.value) || 0)
                }
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">ICD-10 Codes</Label>
              <Input
                value={formData.billing.icd10Codes.join(', ')}
                onChange={(e) =>
                  updateBilling('icd10Codes', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                }
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ====== PROGRESS TOWARD GOALS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Progress Toward Prior Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <GoalProgressTable
            label="Goal Progress"
            entries={(formData.assessment.progressTowardGoals || []) as GoalProgressEntry[]}
            onChange={(v) => updateAssessment('progressTowardGoals', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== OBJECTIVE RE-EXAMINATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Objective Re-Examination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ROMTable
            entries={formData.objective.rom || []}
            onChange={(v) => updateObjective('rom', v)}
            readOnly={readOnly}
          />
          <StrengthTable
            entries={formData.objective.strength || []}
            onChange={(v) => updateObjective('strength', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== FUNCTIONAL ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Functional Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <FunctionalMobilitySection
            mobility={formData.objective.functionalMobility || []}
            balance={formData.objective.balance || []}
            gait={formData.objective.gait || { pattern: '', deviations: '', assistiveDevice: '', distance: '' }}
            onMobilityChange={(v) => updateObjective('functionalMobility', v)}
            onBalanceChange={(v) => updateObjective('balance', v)}
            onGaitChange={(v) => updateObjective('gait', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== UPDATED GOALS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Updated Goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoalEntryTable
            label="Short-Term Goals"
            goals={(formData.goals.shortTermGoals || []) as GoalEntry[]}
            onChange={(v) => updateGoals('shortTermGoals', v)}
            readOnly={readOnly}
          />
          <GoalEntryTable
            label="Long-Term Goals"
            goals={(formData.goals.longTermGoals || []) as GoalEntry[]}
            onChange={(v) => updateGoals('longTermGoals', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== PLAN ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Updated Plan of Care</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Changes to Treatment Plan</Label>
            <Textarea
              value={formData.meta.changesToTreatmentPlan || ''}
              onChange={(e) => updateMeta('changesToTreatmentPlan', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Updated Frequency/Duration</Label>
            <Input
              value={formData.meta.updatedFrequencyDuration || ''}
              onChange={(e) => updateMeta('updatedFrequencyDuration', e.target.value)}
              placeholder="e.g. 2x/week x 4 weeks"
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Medical Necessity for Continued PT (required for auth renewal)
            </Label>
            <Textarea
              value={formData.meta.medicalNecessityContinued || ''}
              onChange={(e) => updateMeta('medicalNecessityContinued', e.target.value)}
              placeholder="Justify continued need for skilled PT services..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
