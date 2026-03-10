'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import OralMotorSection from './shared/OralMotorSection';
import { STGoalEntryTable } from './shared/STGoalsSection';
import type {
  STFormData,
  STEvalComplexity,
  STEvalGoalEntry,
  STLanguageOfService,
  OralMotorExam,
} from '@/types/notes/st';
import {
  ST_EVAL_COMPLEXITY_LABELS,
  ST_LANGUAGE_OF_SERVICE_OPTIONS,
  createEmptySTFormData,
} from '@/types/notes/st';

interface STEvaluationProps {
  formData: STFormData;
  onChange: (data: STFormData) => void;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

export default function STEvaluation({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: STEvaluationProps) {
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptySTFormData('evaluation'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (patientDiagnosis) {
      const updates: Partial<STFormData> = {};
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

  const oralMotor = formData.objective.oralMotor || {
    lips: '', tongue: '', jaw: '', palate: '',
  };

  return (
    <div className="space-y-4">
      {/* ====== CASE HISTORY ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Case History</CardTitle>
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
                placeholder="F80.1, F80.2..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Reason for Referral / Caregiver Concerns
            </Label>
            <Textarea
              value={formData.meta.chiefComplaint || ''}
              onChange={(e) => updateMeta('chiefComplaint', e.target.value)}
              placeholder="Primary communication concerns and reason for referral..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Birth / Medical History
            </Label>
            <Textarea
              value={formData.meta.birthMedicalHistory || ''}
              onChange={(e) => updateMeta('birthMedicalHistory', e.target.value)}
              placeholder="Birth history, medical conditions, ear infections, tubes..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Language Exposure
            </Label>
            <Input
              value={formData.meta.languageExposure || ''}
              onChange={(e) => updateMeta('languageExposure', e.target.value)}
              placeholder="e.g. English only, Bilingual English/Spanish..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              RGV patient population is largely bilingual — document language exposure
            </p>
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Prior Therapy History
            </Label>
            <Textarea
              value={formData.meta.priorTherapy || ''}
              onChange={(e) => updateMeta('priorTherapy', e.target.value)}
              placeholder="Prior speech therapy, duration, facility, discharge reason..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== ORAL MOTOR EXAMINATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Oral Motor Examination</CardTitle>
        </CardHeader>
        <CardContent>
          <OralMotorSection
            exam={oralMotor}
            onChange={(v) => updateObjective('oralMotor', v)}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== VOICE AND FLUENCY ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Voice and Fluency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Voice Quality</Label>
            <Input
              value={formData.objective.voiceQuality || ''}
              onChange={(e) => updateObjective('voiceQuality', e.target.value)}
              placeholder="Hoarse, breathy, strained, WNL..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Resonance</Label>
            <Input
              value={formData.objective.resonance || ''}
              onChange={(e) => updateObjective('resonance', e.target.value)}
              placeholder="Normal, hypernasal, hyponasal..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Fluency Observations</Label>
            <Input
              value={formData.objective.fluencyObservations || ''}
              onChange={(e) => updateObjective('fluencyObservations', e.target.value)}
              placeholder="Dysfluency type, frequency, secondary behaviors..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== RECEPTIVE LANGUAGE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Receptive Language</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Observations</Label>
            <Textarea
              value={formData.objective.receptiveObservations || ''}
              onChange={(e) => updateObjective('receptiveObservations', e.target.value)}
              placeholder="Comprehension observations, following directions..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Age Equivalent (if assessed)</Label>
            <Input
              value={formData.objective.receptiveAgeEquivalent || ''}
              onChange={(e) => updateObjective('receptiveAgeEquivalent', e.target.value)}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== EXPRESSIVE LANGUAGE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Expressive Language</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Observations</Label>
            <Textarea
              value={formData.objective.expressiveObservations || ''}
              onChange={(e) => updateObjective('expressiveObservations', e.target.value)}
              placeholder="Expressive language observations, spontaneous utterances..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">MLU / Utterance Sample</Label>
              <Input
                value={formData.objective.expressiveMLU || ''}
                onChange={(e) => updateObjective('expressiveMLU', e.target.value)}
                placeholder="e.g. MLU 2.5, mostly 2-word combos..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Age Equivalent (if assessed)</Label>
              <Input
                value={formData.objective.expressiveAgeEquivalent || ''}
                onChange={(e) => updateObjective('expressiveAgeEquivalent', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ====== ARTICULATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Articulation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Error Patterns Noted</Label>
            <Textarea
              value={formData.objective.articulationErrors || ''}
              onChange={(e) => updateObjective('articulationErrors', e.target.value)}
              placeholder="Phonological processes, error sounds, positions..."
              className="min-h-[60px] text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Stimulability Notes</Label>
            <Input
              value={formData.objective.stimulabilityNotes || ''}
              onChange={(e) => updateObjective('stimulabilityNotes', e.target.value)}
              placeholder="Stimulable for /s/, /r/ not stimulable..."
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== PRAGMATIC / SOCIAL COMMUNICATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pragmatic / Social Communication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Joint Attention</Label>
              <Input
                value={formData.objective.pragmaticJointAttention || ''}
                onChange={(e) => updateObjective('pragmaticJointAttention', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Turn-Taking</Label>
              <Input
                value={formData.objective.pragmaticTurnTaking || ''}
                onChange={(e) => updateObjective('pragmaticTurnTaking', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Eye Contact</Label>
              <Input
                value={formData.objective.pragmaticEyeContact || ''}
                onChange={(e) => updateObjective('pragmaticEyeContact', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Topic Maintenance</Label>
              <Input
                value={formData.objective.pragmaticTopicMaintenance || ''}
                onChange={(e) => updateObjective('pragmaticTopicMaintenance', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ====== AAC ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm">AAC Assessment</CardTitle>
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="st-aacApplicable"
                checked={formData.objective.aacApplicable || false}
                onCheckedChange={(checked) =>
                  updateObjective('aacApplicable', !!checked)
                }
                disabled={readOnly}
                className="h-3 w-3"
              />
              <Label htmlFor="st-aacApplicable" className="text-xs text-slate-500">
                Applicable
              </Label>
            </div>
          </div>
        </CardHeader>
        {formData.objective.aacApplicable && (
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500">Current Communication System</Label>
              <Input
                value={formData.objective.aacCurrentSystem || ''}
                onChange={(e) => updateObjective('aacCurrentSystem', e.target.value)}
                placeholder="Gestures, PECS, speech-generating device..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Device Type (if applicable)</Label>
              <Input
                value={formData.objective.aacDeviceType || ''}
                onChange={(e) => updateObjective('aacDeviceType', e.target.value)}
                placeholder="iPad with TouchChat, Tobii Dynavox..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Symbol / Vocabulary Level</Label>
              <Input
                value={formData.objective.aacVocabularyLevel || ''}
                onChange={(e) => updateObjective('aacVocabularyLevel', e.target.value)}
                placeholder="Core vocabulary, 20+ symbols, picture-based..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">AAC Assessment Observations</Label>
              <Textarea
                value={formData.objective.aacObservations || ''}
                onChange={(e) => updateObjective('aacObservations', e.target.value)}
                placeholder="Access method, motivation, current use, barriers..."
                className="min-h-[60px] text-sm"
                readOnly={readOnly}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ====== STANDARDIZED ASSESSMENTS ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Standardized Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.meta.standardizedAssessment || ''}
            onChange={(e) => updateMeta('standardizedAssessment', e.target.value)}
            placeholder="Assessment name, scores, standard scores, percentile ranks..."
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

      {/* ====== ASSESSMENT ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Assessment / Clinical Impression</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.assessment.clinicalImpression || ''}
            onChange={(e) => updateAssessment('clinicalImpression', e.target.value)}
            placeholder="Clinical impression, communication deficits, functional impact..."
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
              placeholder="e.g. 2x/week x 6 months"
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">
              Skilled ST Need Justification (required for Medicaid)
            </Label>
            <Textarea
              value={formData.plan.skilledNeedJustification || ''}
              onChange={(e) => updatePlan('skilledNeedJustification', e.target.value)}
              placeholder="Why skilled SLP is required and cannot be met through a home program alone..."
              className="min-h-[80px] text-sm"
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
            <p className="text-[10px] text-slate-400 mt-0.5">
              Bilingual service is common in RGV — document explicitly
            </p>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Evaluation CPT</Label>
            {readOnly ? (
              <p className="text-sm mt-1">
                {formData.billing.evaluationComplexity
                  ? ST_EVAL_COMPLEXITY_LABELS[formData.billing.evaluationComplexity as STEvalComplexity]
                  : '—'}
              </p>
            ) : (
              <Select
                value={formData.billing.evaluationComplexity || '92523'}
                onValueChange={(v) => updateBilling('evaluationComplexity', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ST_EVAL_COMPLEXITY_LABELS).map(([k, label]) => (
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
