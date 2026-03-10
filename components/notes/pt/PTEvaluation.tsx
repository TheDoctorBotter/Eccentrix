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
import ROMTable from './shared/ROMTable';
import StrengthTable from './shared/StrengthTable';
import FunctionalMobilitySection from './shared/FunctionalMobilitySection';
import { GoalEntryTable } from './shared/GoalsSection';
import type {
  PTFormData,
  PainQuality,
  EvalComplexity,
  ROMEntry,
  StrengthEntry,
  FunctionalMobilityEntry,
  BalanceEntry,
  GaitEntry,
  GoalEntry,
} from '@/types/notes/pt';
import {
  PAIN_QUALITY_LABELS,
  EVAL_COMPLEXITY_LABELS,
  createEmptyPTFormData,
} from '@/types/notes/pt';

interface PTEvaluationProps {
  formData: PTFormData;
  onChange: (data: PTFormData) => void;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function PTEvaluation({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: PTEvaluationProps) {
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptyPTFormData('evaluation'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-populate ICD-10 and referral diagnosis from patient
  useEffect(() => {
    if (patientDiagnosis) {
      const updates: Partial<PTFormData> = {};
      if (formData.billing.icd10Codes.length === 0) {
        updates.billing = { ...formData.billing, icd10Codes: [patientDiagnosis] };
      }
      if (!formData.meta.referralDiagnosis) {
        updates.meta = { ...formData.meta, referralDiagnosis: patientDiagnosis };
      }
      if (Object.keys(updates).length > 0) {
        onChange({ ...formData, ...updates });
      }
    }
  }, [patientDiagnosis]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMeta = (field: string, value: unknown) =>
    onChange({ ...formData, meta: { ...formData.meta, [field]: value } });

  const updateSubjective = (field: string, value: unknown) =>
    onChange({ ...formData, subjective: { ...formData.subjective, [field]: value } });

  const updateObjective = (field: string, value: unknown) =>
    onChange({ ...formData, objective: { ...formData.objective, [field]: value } });

  const updateAssessment = (field: string, value: unknown) =>
    onChange({ ...formData, assessment: { ...formData.assessment, [field]: value } });

  const updatePlan = (field: string, value: unknown) =>
    onChange({ ...formData, plan: { ...formData.plan, [field]: value } });

  const updateBilling = (field: string, value: unknown) =>
    onChange({ ...formData, billing: { ...formData.billing, [field]: value } });

  const updateGoals = (field: string, value: unknown) =>
    onChange({ ...formData, goals: { ...formData.goals, [field]: value } });

  return (
    <div className="space-y-4">
      {/* ====== REFERRAL / HISTORY ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Referral &amp; History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Referral Diagnosis</Label>
              <Input
                value={formData.meta.referralDiagnosis || ''}
                onChange={(e) => updateMeta('referralDiagnosis', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">ICD-10 Code</Label>
              <Input
                value={formData.billing.icd10Codes.join(', ')}
                onChange={(e) =>
                  updateBilling('icd10Codes', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                }
                placeholder="M54.5"
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Chief Complaint &amp; Onset</Label>
            <Textarea
              value={formData.meta.chiefComplaint || ''}
              onChange={(e) => updateMeta('chiefComplaint', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Prior Level of Function</Label>
            <Textarea
              value={formData.meta.priorLevelOfFunction || ''}
              onChange={(e) => updateMeta('priorLevelOfFunction', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Relevant Medical History</Label>
            <Textarea
              value={formData.meta.relevantMedicalHistory || ''}
              onChange={(e) => updateMeta('relevantMedicalHistory', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== PAIN ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pain Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Location</Label>
              <Input
                value={formData.meta.painLocation || ''}
                onChange={(e) => updateMeta('painLocation', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Quality</Label>
              {readOnly ? (
                <p className="text-sm mt-1">
                  {formData.meta.painQuality
                    ? PAIN_QUALITY_LABELS[formData.meta.painQuality as PainQuality]
                    : '—'}
                </p>
              ) : (
                <Select
                  value={formData.meta.painQuality || ''}
                  onValueChange={(v) => updateMeta('painQuality', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAIN_QUALITY_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Rating: {formData.subjective.painLevel ?? 'N/A'}/10
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Aggravating Factors</Label>
              <Input
                value={formData.meta.aggravatingFactors || ''}
                onChange={(e) => updateMeta('aggravatingFactors', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Relieving Factors</Label>
              <Input
                value={formData.meta.relievingFactors || ''}
                onChange={(e) => updateMeta('relievingFactors', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ====== OBSERVATION / OBJECTIVE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Objective Examination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-slate-500">Posture &amp; Alignment</Label>
            <Textarea
              value={formData.meta.posture || ''}
              onChange={(e) => updateMeta('posture', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>

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

          <div>
            <Label className="text-xs text-slate-500">Special Tests</Label>
            <Textarea
              value={formData.objective.specialTests || ''}
              onChange={(e) => updateObjective('specialTests', e.target.value)}
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
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

      {/* ====== GOALS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Goals</CardTitle>
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

      {/* ====== ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Assessment / Clinical Impression</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.assessment.clinicalImpression || ''}
            onChange={(e) => updateAssessment('clinicalImpression', e.target.value)}
            placeholder="Clinical impression, functional deficits, and impact on age-appropriate activities..."
            className="min-h-[100px] text-sm"
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== PLAN ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Plan of Care</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Frequency &amp; Duration</Label>
            <Input
              value={formData.plan.frequencyDuration || ''}
              onChange={(e) => updatePlan('frequencyDuration', e.target.value)}
              placeholder="e.g. 2x/week x 6 weeks"
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Skilled PT Need Justification (required for Medicaid)
            </Label>
            <Textarea
              value={formData.plan.skilledNeedJustification || ''}
              onChange={(e) => updatePlan('skilledNeedJustification', e.target.value)}
              placeholder="Why skilled PT is required and cannot be achieved through a home program alone..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Evaluation CPT Complexity</Label>
            {readOnly ? (
              <p className="text-sm mt-1">
                {formData.billing.evaluationComplexity
                  ? EVAL_COMPLEXITY_LABELS[formData.billing.evaluationComplexity as EvalComplexity]
                  : '—'}
              </p>
            ) : (
              <Select
                value={formData.billing.evaluationComplexity || '97163'}
                onValueChange={(v) => updateBilling('evaluationComplexity', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVAL_COMPLEXITY_LABELS).map(([k, label]) => (
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
    </div>
  );
}
