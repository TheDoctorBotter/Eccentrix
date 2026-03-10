'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SensoryProcessingSection from './shared/SensoryProcessingSection';
import ADLStatusSection from './shared/ADLStatusSection';
import { OTGoalEntryTable, OTGoalProgressTable } from './shared/OTGoalsSection';
import type {
  OTFormData,
  SensoryEntry,
  ADLEntry,
  OTEvalGoalEntry,
  OTGoalProgressEntry,
} from '@/types/notes/ot';
import { createEmptyOTFormData } from '@/types/notes/ot';

interface OTReEvaluationProps {
  formData: OTFormData;
  onChange: (data: OTFormData) => void;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function OTReEvaluation({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: OTReEvaluationProps) {
  const [sensoryChangeValues, setSensoryChangeValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptyOTFormData('re_evaluation'));
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
      {/* ====== CONTEXT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Re-Evaluation Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">
                Visits Since Last Eval
              </Label>
              <Input
                type="number"
                min={0}
                value={formData.goals.visitsCompletedSinceLastEval ?? 0}
                onChange={(e) =>
                  updateGoals(
                    'visitsCompletedSinceLastEval',
                    parseInt(e.target.value) || 0
                  )
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
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Progress on Functional Performance Areas
            </Label>
            <Textarea
              value={formData.meta.progressFunctionalAreas || ''}
              onChange={(e) =>
                updateMeta('progressFunctionalAreas', e.target.value)
              }
              placeholder="Summary of functional progress since last evaluation..."
              className="min-h-[80px] text-sm"
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
          <OTGoalProgressTable
            label="Goal Progress"
            entries={
              (formData.assessment.progressTowardGoals ||
                []) as OTGoalProgressEntry[]
            }
            onChange={(v) => updateAssessment('progressTowardGoals', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== SENSORY PROCESSING (with change column) ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Sensory Processing Changes Since Last Eval
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SensoryProcessingSection
            entries={
              (formData.objective.sensoryProcessing || []) as SensoryEntry[]
            }
            onChange={(v) => updateObjective('sensoryProcessing', v)}
            readOnly={readOnly}
            showChange
            changeValues={sensoryChangeValues}
            onChangeValues={setSensoryChangeValues}
          />
        </CardContent>
      </Card>

      {/* ====== ADL STATUS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Self-Care / ADL Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ADLStatusSection
            entries={(formData.objective.adlStatus || []) as ADLEntry[]}
            onChange={(v) => updateObjective('adlStatus', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== FINE MOTOR SKILLS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Fine Motor Skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">
              Grasp Patterns Observed
            </Label>
            <Input
              value={formData.objective.graspPatterns || ''}
              onChange={(e) =>
                updateObjective('graspPatterns', e.target.value)
              }
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              In-Hand Manipulation
            </Label>
            <Input
              value={formData.objective.inHandManipulation || ''}
              onChange={(e) =>
                updateObjective('inHandManipulation', e.target.value)
              }
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Bilateral Coordination
            </Label>
            <Input
              value={formData.objective.bilateralCoordination || ''}
              onChange={(e) =>
                updateObjective('bilateralCoordination', e.target.value)
              }
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== UPDATED GOALS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Updated Goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <OTGoalEntryTable
            label="Short-Term Goals"
            goals={(formData.goals.shortTermGoals || []) as OTEvalGoalEntry[]}
            onChange={(v) => updateGoals('shortTermGoals', v)}
            readOnly={readOnly}
          />
          <OTGoalEntryTable
            label="Long-Term Goals"
            goals={(formData.goals.longTermGoals || []) as OTEvalGoalEntry[]}
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
            <Label className="text-xs text-slate-500">
              Changes to Treatment Approach
            </Label>
            <Textarea
              value={formData.plan.changesToTreatment || ''}
              onChange={(e) =>
                updatePlan('changesToTreatment', e.target.value)
              }
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Updated Frequency / Duration
            </Label>
            <Input
              value={formData.plan.updatedFrequencyDuration || ''}
              onChange={(e) =>
                updatePlan('updatedFrequencyDuration', e.target.value)
              }
              placeholder="e.g. 2x/week x 4 weeks"
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Medical Necessity for Continued OT (required for auth renewal)
            </Label>
            <Textarea
              value={formData.plan.medicalNecessityContinued || ''}
              onChange={(e) =>
                updatePlan('medicalNecessityContinued', e.target.value)
              }
              placeholder="Justify continued need for skilled OT services..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
