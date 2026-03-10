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
import SensoryProcessingSection from './shared/SensoryProcessingSection';
import ADLStatusSection from './shared/ADLStatusSection';
import { OTGoalEntryTable } from './shared/OTGoalsSection';
import type {
  OTFormData,
  OTEvalComplexity,
  SensoryEntry,
  ADLEntry,
  OTEvalGoalEntry,
} from '@/types/notes/ot';
import { OT_EVAL_COMPLEXITY_LABELS, createEmptyOTFormData } from '@/types/notes/ot';

interface OTEvaluationProps {
  formData: OTFormData;
  onChange: (data: OTFormData) => void;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function OTEvaluation({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: OTEvaluationProps) {
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptyOTFormData('evaluation'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (patientDiagnosis) {
      const updates: Partial<OTFormData> = {};
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

  const updateDevHistory = (field: string, value: string) =>
    onChange({
      ...formData,
      meta: {
        ...formData.meta,
        developmentalHistory: {
          ...(formData.meta.developmentalHistory || {
            birthHistory: '',
            milestones: '',
            diagnoses: '',
          }),
          [field]: value,
        },
      },
    });

  const updateObjective = (field: string, value: unknown) =>
    onChange({ ...formData, objective: { ...formData.objective, [field]: value } });

  const updatePlaySkills = (field: string, value: string) =>
    onChange({
      ...formData,
      objective: {
        ...formData.objective,
        playSkills: {
          ...(formData.objective.playSkills || {
            parallel: '',
            associative: '',
            cooperative: '',
          }),
          [field]: value,
        },
      },
    });

  const updateAssessment = (field: string, value: unknown) =>
    onChange({ ...formData, assessment: { ...formData.assessment, [field]: value } });

  const updatePlan = (field: string, value: unknown) =>
    onChange({ ...formData, plan: { ...formData.plan, [field]: value } });

  const updateBilling = (field: string, value: unknown) =>
    onChange({ ...formData, billing: { ...formData.billing, [field]: value } });

  const updateGoals = (field: string, value: unknown) =>
    onChange({ ...formData, goals: { ...formData.goals, [field]: value } });

  const devHistory = formData.meta.developmentalHistory || {
    birthHistory: '',
    milestones: '',
    diagnoses: '',
  };

  const playSkills = formData.objective.playSkills || {
    parallel: '',
    associative: '',
    cooperative: '',
  };

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
                  updateBilling(
                    'icd10Codes',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="F82, R27.8..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Reason for Referral / Concerns
            </Label>
            <Textarea
              value={formData.meta.chiefComplaint || ''}
              onChange={(e) => updateMeta('chiefComplaint', e.target.value)}
              placeholder="Primary concerns and reason for OT referral..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== DEVELOPMENTAL HISTORY ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Developmental History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Birth History</Label>
            <Textarea
              value={devHistory.birthHistory}
              onChange={(e) => updateDevHistory('birthHistory', e.target.value)}
              placeholder="Gestational age, birth complications, NICU stay..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Developmental Milestones</Label>
            <Textarea
              value={devHistory.milestones}
              onChange={(e) => updateDevHistory('milestones', e.target.value)}
              placeholder="Sitting, crawling, walking, first words, self-feeding..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Diagnoses</Label>
            <Textarea
              value={devHistory.diagnoses}
              onChange={(e) => updateDevHistory('diagnoses', e.target.value)}
              placeholder="Medical and developmental diagnoses..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== SENSORY PROCESSING ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sensory Processing</CardTitle>
        </CardHeader>
        <CardContent>
          <SensoryProcessingSection
            entries={(formData.objective.sensoryProcessing || []) as SensoryEntry[]}
            onChange={(v) => updateObjective('sensoryProcessing', v)}
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
            <Label className="text-xs text-slate-500">Grasp Patterns Observed</Label>
            <Input
              value={formData.objective.graspPatterns || ''}
              onChange={(e) => updateObjective('graspPatterns', e.target.value)}
              placeholder="Palmar, pincer, tripod..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">In-Hand Manipulation</Label>
            <Input
              value={formData.objective.inHandManipulation || ''}
              onChange={(e) => updateObjective('inHandManipulation', e.target.value)}
              placeholder="Translation, shift, rotation..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Bilateral Coordination</Label>
            <Input
              value={formData.objective.bilateralCoordination || ''}
              onChange={(e) => updateObjective('bilateralCoordination', e.target.value)}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Age Equivalents (if tested)</Label>
            <Input
              value={formData.objective.ageEquivalents || ''}
              onChange={(e) => updateObjective('ageEquivalents', e.target.value)}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== VISUAL MOTOR INTEGRATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Visual Motor Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.objective.vmiObservations || ''}
            onChange={(e) => updateObjective('vmiObservations', e.target.value)}
            placeholder="VMI observations, copying, tracing, drawing..."
            className="min-h-[80px] text-sm"
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== SELF-CARE / ADL STATUS ====== */}
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

      {/* ====== PLAY SKILLS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Play Skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Parallel Play</Label>
            <Input
              value={playSkills.parallel}
              onChange={(e) => updatePlaySkills('parallel', e.target.value)}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Associative Play</Label>
            <Input
              value={playSkills.associative}
              onChange={(e) => updatePlaySkills('associative', e.target.value)}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Cooperative Play</Label>
            <Input
              value={playSkills.cooperative}
              onChange={(e) => updatePlaySkills('cooperative', e.target.value)}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== STANDARDIZED ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Standardized Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.meta.standardizedAssessment || ''}
            onChange={(e) => updateMeta('standardizedAssessment', e.target.value)}
            placeholder="Assessment name, scores, and results..."
            className="min-h-[80px] text-sm"
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

      {/* ====== ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Assessment / Clinical Impression</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.assessment.clinicalImpression || ''}
            onChange={(e) => updateAssessment('clinicalImpression', e.target.value)}
            placeholder="Clinical impression, functional deficits, and impact on occupational performance..."
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
              Skilled OT Need Justification (required for Medicaid)
            </Label>
            <Textarea
              value={formData.plan.skilledNeedJustification || ''}
              onChange={(e) => updatePlan('skilledNeedJustification', e.target.value)}
              placeholder="Why skilled OT is required and cannot be met through a home program alone..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Evaluation CPT Complexity
            </Label>
            {readOnly ? (
              <p className="text-sm mt-1">
                {formData.billing.evaluationComplexity
                  ? OT_EVAL_COMPLEXITY_LABELS[formData.billing.evaluationComplexity as OTEvalComplexity]
                  : '—'}
              </p>
            ) : (
              <Select
                value={formData.billing.evaluationComplexity || '97167'}
                onValueChange={(v) => updateBilling('evaluationComplexity', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OT_EVAL_COMPLEXITY_LABELS).map(([k, label]) => (
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
