'use client';

import { useEffect } from 'react';
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
import OralMotorSection from './shared/OralMotorSection';
import { STGoalEntryTable, STGoalProgressTable } from './shared/STGoalsSection';
import type {
  STFormData,
  STEvalGoalEntry,
  STGoalProgressEntry,
  STLanguageOfService,
  OralMotorExam,
} from '@/types/notes/st';
import { ST_LANGUAGE_OF_SERVICE_OPTIONS, createEmptySTFormData } from '@/types/notes/st';

interface STReEvaluationProps {
  formData: STFormData;
  onChange: (data: STFormData) => void;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function STReEvaluation({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: STReEvaluationProps) {
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptySTFormData('re_evaluation'));
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

  const oralMotor = formData.objective.oralMotor || {
    lips: '', tongue: '', jaw: '', palate: '',
  };

  return (
    <div className="space-y-4">
      {/* ====== CONTEXT ====== */}
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
                  updateBilling(
                    'icd10Codes',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Progress on Communication Goals
            </Label>
            <Textarea
              value={formData.assessment.clinicalImpression || ''}
              onChange={(e) => updateAssessment('clinicalImpression', e.target.value)}
              placeholder="Summary of communication progress since last evaluation..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Changes in Articulation / Language / Fluency Since Last Eval
            </Label>
            <Textarea
              value={formData.meta.articulationLanguageChanges || ''}
              onChange={(e) => updateMeta('articulationLanguageChanges', e.target.value)}
              placeholder="New phonemes acquired, vocabulary growth, fluency changes..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== PROGRESS TOWARD PRIOR GOALS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Progress Toward Prior Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <STGoalProgressTable
            label="Goal Progress"
            entries={(formData.assessment.progressTowardGoals || []) as STGoalProgressEntry[]}
            onChange={(v) => updateAssessment('progressTowardGoals', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== ORAL MOTOR RE-EXAMINATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Oral Motor Re-Examination</CardTitle>
        </CardHeader>
        <CardContent>
          <OralMotorSection
            exam={oralMotor}
            onChange={(v) => updateObjective('oralMotor', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== UPDATED STANDARDIZED ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Updated Standardized Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={formData.meta.updatedAssessment || ''}
            onChange={(e) => updateMeta('updatedAssessment', e.target.value)}
            placeholder="Assessment name and updated scores if completed..."
            className="h-8 text-sm"
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
          <STGoalEntryTable
            label="Short-Term Goals"
            goals={(formData.goals.shortTermGoals || []) as STEvalGoalEntry[]}
            onChange={(v) => updateGoals('shortTermGoals', v)}
            readOnly={readOnly}
          />
          <STGoalEntryTable
            label="Long-Term Goals"
            goals={(formData.goals.longTermGoals || []) as STEvalGoalEntry[]}
            onChange={(v) => updateGoals('longTermGoals', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== UPDATED PLAN ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Updated Plan of Care</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Changes to Treatment Approach</Label>
            <Textarea
              value={formData.plan.changesToTreatment || ''}
              onChange={(e) => updatePlan('changesToTreatment', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Updated Frequency / Duration</Label>
            <Input
              value={formData.plan.updatedFrequencyDuration || ''}
              onChange={(e) => updatePlan('updatedFrequencyDuration', e.target.value)}
              placeholder="e.g. 2x/week x 3 months"
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Language of Service</Label>
            {readOnly ? (
              <p className="text-sm mt-1">{formData.plan.languageOfService || '—'}</p>
            ) : (
              <Select
                value={formData.plan.languageOfService || ''}
                onValueChange={(v) => updatePlan('languageOfService', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select language..." />
                </SelectTrigger>
                <SelectContent>
                  {ST_LANGUAGE_OF_SERVICE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Medical Necessity for Continued ST (required for auth renewal)
            </Label>
            <Textarea
              value={formData.plan.medicalNecessityContinued || ''}
              onChange={(e) => updatePlan('medicalNecessityContinued', e.target.value)}
              placeholder="Justify continued need for skilled SLP services..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
