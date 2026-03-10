'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import type {
  OTFormData,
  OTGoalEntry,
  OTGoalCategory,
  OTGoalStatus,
  OTCuingLevel,
  OTSkillEntry,
  OTResponseToTreatment,
} from '@/types/notes/ot';
import {
  OT_GOAL_STATUS_OPTIONS,
  OT_CUING_LEVEL_OPTIONS,
  OT_RESPONSE_OPTIONS,
  OT_SKILL_LIBRARY,
  OT_GOAL_CATEGORY_LABELS,
  createEmptyOTFormData,
} from '@/types/notes/ot';
import type { TreatmentGoal } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OTDailySOAPProps {
  formData: OTFormData;
  onChange: (data: OTFormData) => void;
  visitDurationMinutes?: number;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OTDailySOAP({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: OTDailySOAPProps) {
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [loadedGoals, setLoadedGoals] = useState<TreatmentGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  // Initialize empty form
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptyOTFormData('daily_soap'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---- Goal loading ----
  // Goals are loaded from the treatment_goals API filtered by patient.
  // Since treatment_goals don't have a discipline column, we load all active
  // goals for the patient. A future migration can add discipline filtering.

  const loadGoals = useCallback(async () => {
    // Extract patientId from formData or skip
    // NoteEditor passes patientId through formData won't have it,
    // but the goals are already in the form if previously loaded.
    // We'll rely on the NoteEditor parent to provide context.
    // For now, skip loading if we already have addressed goals.
    if (formData.objective.goalsAddressed.length > 0) return;
  }, [formData.objective.goalsAddressed.length]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  // ---- Helpers ----

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

  // ---- Goal management ----

  const goalsAddressed = formData.objective.goalsAddressed || [];

  const updateGoal = (idx: number, updates: Partial<OTGoalEntry>) => {
    const updated = goalsAddressed.map((g, i) =>
      i === idx ? { ...g, ...updates } : g
    );
    updateObjective('goalsAddressed', updated);
  };

  const addManualGoal = () => {
    const newGoal: OTGoalEntry = {
      goalId: `manual_${Date.now()}`,
      goalText: '',
      goalCategory: 'other',
      status: 'In Progress',
      skillsWorked: [],
    };
    updateObjective('goalsAddressed', [...goalsAddressed, newGoal]);
  };

  const removeGoal = (idx: number) => {
    updateObjective(
      'goalsAddressed',
      goalsAddressed.filter((_, i) => i !== idx)
    );
  };

  const toggleGoalExpand = (goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  };

  // ---- Skill management within a goal ----

  const toggleSkill = (goalIdx: number, skillName: string) => {
    const goal = goalsAddressed[goalIdx];
    const existing = goal.skillsWorked.find((s) => s.skillName === skillName);
    if (existing) {
      updateGoal(goalIdx, {
        skillsWorked: goal.skillsWorked.filter((s) => s.skillName !== skillName),
      });
    } else {
      updateGoal(goalIdx, {
        skillsWorked: [
          ...goal.skillsWorked,
          {
            skillName,
            cuingLevel: 'Verbal Cue' as OTCuingLevel,
            accuracy: 50,
            notes: '',
          },
        ],
      });
    }
  };

  const updateSkill = (
    goalIdx: number,
    skillName: string,
    updates: Partial<OTSkillEntry>
  ) => {
    const goal = goalsAddressed[goalIdx];
    const updatedSkills = goal.skillsWorked.map((s) =>
      s.skillName === skillName ? { ...s, ...updates } : s
    );
    updateGoal(goalIdx, { skillsWorked: updatedSkills });
  };

  // ---- Render ----

  return (
    <div className="space-y-4">
      {/* ====== SUBJECTIVE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Subjective</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-slate-500">Caregiver Report</Label>
          <Textarea
            value={formData.subjective.caregiverReport}
            onChange={(e) => updateSubjective('caregiverReport', e.target.value)}
            placeholder="Caregiver report of progress, concerns, functional changes..."
            className="min-h-[80px] text-sm"
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== GOAL-BASED SKILL DOCUMENTATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Goal-Based Skill Documentation</CardTitle>
            {!readOnly && (
              <button
                type="button"
                onClick={addManualGoal}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Add Goal Manually
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {goalsAddressed.length === 0 && (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-center">
              <AlertCircle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
              <p className="text-sm text-amber-700">
                No active OT goals on file. Add goals manually above or in the
                patient record before documenting.
              </p>
            </div>
          )}

          {goalsAddressed.map((goal, goalIdx) => {
            const isExpanded =
              expandedGoals.has(goal.goalId) || goal.status !== 'Not Addressed';
            const skillLibrary =
              OT_SKILL_LIBRARY[goal.goalCategory] || [];

            return (
              <div
                key={goal.goalId}
                className="border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Goal header */}
                <div className="bg-slate-50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGoalExpand(goal.goalId)}
                      className="mt-0.5 text-slate-400 hover:text-slate-600"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="flex-1 space-y-2">
                      {/* Goal text */}
                      {readOnly ? (
                        <p className="text-sm text-slate-700">{goal.goalText}</p>
                      ) : (
                        <Textarea
                          value={goal.goalText}
                          onChange={(e) =>
                            updateGoal(goalIdx, { goalText: e.target.value })
                          }
                          placeholder="Goal text..."
                          className="min-h-[40px] text-sm"
                        />
                      )}
                      <div className="flex items-center gap-3">
                        {/* Category */}
                        <div className="w-40">
                          <Select
                            value={goal.goalCategory}
                            onValueChange={(v) =>
                              updateGoal(goalIdx, {
                                goalCategory: v as OTGoalCategory,
                                skillsWorked: [],
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(OT_GOAL_CATEGORY_LABELS).map(
                                ([k, label]) => (
                                  <SelectItem key={k} value={k}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Status */}
                        <div className="w-40">
                          <Select
                            value={goal.status}
                            onValueChange={(v) =>
                              updateGoal(goalIdx, {
                                status: v as OTGoalStatus,
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OT_GOAL_STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeGoal(goalIdx)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Skills section (hidden when Not Addressed) */}
                {isExpanded && goal.status !== 'Not Addressed' && (
                  <div className="p-3 space-y-3 border-t border-slate-200">
                    {/* Skill checkboxes from library */}
                    {skillLibrary.length > 0 && (
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">
                          Skills Worked
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {skillLibrary.map((skill) => {
                            const isChecked = goal.skillsWorked.some(
                              (s) => s.skillName === skill
                            );
                            return (
                              <label
                                key={skill}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    !readOnly && toggleSkill(goalIdx, skill)
                                  }
                                  disabled={readOnly}
                                  className="h-3 w-3"
                                />
                                {skill}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Free text skill for 'other' category */}
                    {goal.goalCategory === 'other' && !readOnly && (
                      <div>
                        <Label className="text-xs text-slate-500">
                          Add custom skill
                        </Label>
                        <Input
                          placeholder="Type skill name and press Enter..."
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val) {
                                toggleSkill(goalIdx, val);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Skill detail rows */}
                    {goal.skillsWorked.length > 0 && (
                      <div className="space-y-2">
                        {goal.skillsWorked.map((skill) => (
                          <div
                            key={skill.skillName}
                            className="bg-slate-50 rounded-md p-2 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-700">
                                {skill.skillName}
                              </span>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSkill(goalIdx, skill.skillName)
                                  }
                                  className="text-xs text-red-400 hover:text-red-600"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {/* Cuing level */}
                              <div>
                                <Label className="text-[10px] text-slate-400">
                                  Cuing Level
                                </Label>
                                <Select
                                  value={skill.cuingLevel}
                                  onValueChange={(v) =>
                                    updateSkill(goalIdx, skill.skillName, {
                                      cuingLevel: v as OTCuingLevel,
                                    })
                                  }
                                  disabled={readOnly}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {OT_CUING_LEVEL_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* Accuracy */}
                              <div>
                                <Label className="text-[10px] text-slate-400">
                                  Accuracy: {skill.accuracy}%
                                </Label>
                                <Slider
                                  value={[skill.accuracy]}
                                  onValueChange={([v]) =>
                                    updateSkill(goalIdx, skill.skillName, {
                                      accuracy: v,
                                    })
                                  }
                                  min={0}
                                  max={100}
                                  step={5}
                                  className="mt-1"
                                  disabled={readOnly}
                                />
                              </div>
                              {/* Notes */}
                              <div>
                                <Label className="text-[10px] text-slate-400">
                                  Notes
                                </Label>
                                <Input
                                  value={skill.notes}
                                  onChange={(e) =>
                                    updateSkill(goalIdx, skill.skillName, {
                                      notes: e.target.value,
                                    })
                                  }
                                  className="h-7 text-xs"
                                  placeholder="Optional..."
                                  readOnly={readOnly}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ====== GENERAL SESSION NOTES ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">General Session Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Response to treatment */}
          <div>
            <Label className="text-xs text-slate-500">Response to Treatment</Label>
            {readOnly ? (
              <p className="text-sm">
                {formData.objective.responseToTreatment || '—'}
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
                  {OT_RESPONSE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Caregiver present */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="caregiverPresent"
                checked={formData.objective.caregiverPresent}
                onCheckedChange={(checked) =>
                  updateObjective('caregiverPresent', !!checked)
                }
                disabled={readOnly}
              />
              <Label htmlFor="caregiverPresent" className="text-sm">
                Caregiver present and trained
              </Label>
            </div>
            {formData.objective.caregiverPresent && (
              <div>
                <Label className="text-xs text-slate-500">
                  What was caregiver trained on?
                </Label>
                <Textarea
                  value={formData.objective.caregiverTrainingContent}
                  onChange={(e) =>
                    updateObjective('caregiverTrainingContent', e.target.value)
                  }
                  placeholder="Describe caregiver training content..."
                  className="min-h-[60px] text-sm"
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>

          {/* Plan for next session */}
          <div>
            <Label className="text-xs text-slate-500">Plan for Next Session</Label>
            <Textarea
              value={formData.plan.planNextSession}
              onChange={(e) => updatePlan('planNextSession', e.target.value)}
              placeholder="Focus areas, modifications, goals for next visit..."
              className="min-h-[80px] text-sm"
              readOnly={readOnly}
            />
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
              <Label className="text-xs text-slate-500">CPT Codes</Label>
              <Input
                value={formData.billing.cptCodes.join(', ')}
                onChange={(e) =>
                  updateBilling(
                    'cptCodes',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="97530, 97110, 97129, 97535..."
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
                placeholder="F82, R27.8..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
