'use client';

import { useEffect, useState } from 'react';
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
import { ChevronDown, ChevronRight, AlertCircle, Shield } from 'lucide-react';
import type {
  STFormData,
  STGoalEntry,
  STGoalCategory,
  STGoalStatus,
  STCuingLevel,
  STTargetEntry,
  STResponseToTreatment,
} from '@/types/notes/st';
import {
  ST_GOAL_STATUS_OPTIONS,
  ST_CUING_LEVEL_OPTIONS,
  ST_RESPONSE_OPTIONS,
  ST_TARGET_LIBRARY,
  ST_GOAL_CATEGORY_LABELS,
  createEmptySTFormData,
} from '@/types/notes/st';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface STDailySOAPProps {
  formData: STFormData;
  onChange: (data: STFormData) => void;
  visitDurationMinutes?: number;
  patientDiagnosis?: string;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function STDailySOAP({
  formData,
  onChange,
  patientDiagnosis,
  readOnly,
}: STDailySOAPProps) {
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  // Initialize empty form
  useEffect(() => {
    if (!formData.meta?.noteType) {
      onChange(createEmptySTFormData('daily_soap'));
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

  const updateGoal = (idx: number, updates: Partial<STGoalEntry>) => {
    const updated = goalsAddressed.map((g, i) =>
      i === idx ? { ...g, ...updates } : g
    );
    updateObjective('goalsAddressed', updated);
  };

  const addManualGoal = () => {
    const newGoal: STGoalEntry = {
      goalId: `manual_${Date.now()}`,
      goalText: '',
      goalCategory: 'other',
      status: 'In Progress',
      targetsWorked: [],
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

  // ---- Target management within a goal ----

  const toggleTarget = (goalIdx: number, targetName: string) => {
    const goal = goalsAddressed[goalIdx];
    const existing = goal.targetsWorked.find((t) => t.targetName === targetName);
    if (existing) {
      updateGoal(goalIdx, {
        targetsWorked: goal.targetsWorked.filter((t) => t.targetName !== targetName),
      });
    } else {
      updateGoal(goalIdx, {
        targetsWorked: [
          ...goal.targetsWorked,
          {
            targetName,
            cuingLevel: 'Verbal Model' as STCuingLevel,
            accuracy: 50,
            notes: '',
          },
        ],
      });
    }
  };

  const updateTarget = (
    goalIdx: number,
    targetName: string,
    updates: Partial<STTargetEntry>
  ) => {
    const goal = goalsAddressed[goalIdx];
    const updatedTargets = goal.targetsWorked.map((t) =>
      t.targetName === targetName ? { ...t, ...updates } : t
    );
    updateGoal(goalIdx, { targetsWorked: updatedTargets });
  };

  // AAC visibility: show AAC targets if goal category is 'aac' OR session toggle is checked
  const aacSessionToggle = formData.objective.aacAddressedThisSession;

  // ---- Visit counter display ----
  const visitNum = formData.billing.visitNumber;
  const authVisits = formData.billing.authorizedVisits;
  const remainingAfter = formData.billing.remainingVisitsAfterThis;

  // ---- Render ----

  return (
    <div className="space-y-4">
      {/* ====== SUBJECTIVE ====== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Subjective</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-slate-500">
            Caregiver Report on Communication
          </Label>
          <Textarea
            value={formData.subjective.caregiverReport}
            onChange={(e) => updateSubjective('caregiverReport', e.target.value)}
            placeholder="Caregiver report on communication at home since last session..."
            className="min-h-[80px] text-sm"
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      {/* ====== GOAL-BASED TARGET DOCUMENTATION ====== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Goal-Based Target Documentation</CardTitle>
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
                No active ST goals on file. Add goals manually above or in the
                patient record before documenting.
              </p>
            </div>
          )}

          {goalsAddressed.map((goal, goalIdx) => {
            const isExpanded =
              expandedGoals.has(goal.goalId) || goal.status !== 'Not Addressed';

            // Build target library: use category targets + AAC targets if applicable
            let targetLibrary = ST_TARGET_LIBRARY[goal.goalCategory] || [];
            if (
              goal.goalCategory !== 'aac' &&
              aacSessionToggle &&
              ST_TARGET_LIBRARY.aac.length > 0
            ) {
              // Append AAC targets when session toggle is on
              targetLibrary = [...targetLibrary, ...ST_TARGET_LIBRARY.aac];
            }

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
                        <div className="w-44">
                          <Select
                            value={goal.goalCategory}
                            onValueChange={(v) =>
                              updateGoal(goalIdx, {
                                goalCategory: v as STGoalCategory,
                                targetsWorked: [],
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(ST_GOAL_CATEGORY_LABELS).map(
                                ([k, label]) => (
                                  <SelectItem key={k} value={k}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-40">
                          <Select
                            value={goal.status}
                            onValueChange={(v) =>
                              updateGoal(goalIdx, {
                                status: v as STGoalStatus,
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ST_GOAL_STATUS_OPTIONS.map((opt) => (
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

                {/* Targets section (hidden when Not Addressed) */}
                {isExpanded && goal.status !== 'Not Addressed' && (
                  <div className="p-3 space-y-3 border-t border-slate-200">
                    {targetLibrary.length > 0 && (
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">
                          Targets Worked
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {targetLibrary.map((target) => {
                            const isChecked = goal.targetsWorked.some(
                              (t) => t.targetName === target
                            );
                            return (
                              <label
                                key={target}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() =>
                                    !readOnly && toggleTarget(goalIdx, target)
                                  }
                                  disabled={readOnly}
                                  className="h-3 w-3"
                                />
                                {target}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Free text target for 'other' category */}
                    {goal.goalCategory === 'other' && !readOnly && (
                      <div>
                        <Label className="text-xs text-slate-500">
                          Add custom target
                        </Label>
                        <Input
                          placeholder="Type target name and press Enter..."
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val) {
                                toggleTarget(goalIdx, val);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Target detail rows */}
                    {goal.targetsWorked.length > 0 && (
                      <div className="space-y-2">
                        {goal.targetsWorked.map((target) => (
                          <div
                            key={target.targetName}
                            className="bg-slate-50 rounded-md p-2 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-700">
                                {target.targetName}
                              </span>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleTarget(goalIdx, target.targetName)
                                  }
                                  className="text-xs text-red-400 hover:text-red-600"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-[10px] text-slate-400">
                                  Cuing Level
                                </Label>
                                <Select
                                  value={target.cuingLevel}
                                  onValueChange={(v) =>
                                    updateTarget(goalIdx, target.targetName, {
                                      cuingLevel: v as STCuingLevel,
                                    })
                                  }
                                  disabled={readOnly}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ST_CUING_LEVEL_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-400">
                                  Accuracy: {target.accuracy}%
                                </Label>
                                <Slider
                                  value={[target.accuracy]}
                                  onValueChange={([v]) =>
                                    updateTarget(goalIdx, target.targetName, {
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
                              <div>
                                <Label className="text-[10px] text-slate-400">
                                  Notes
                                </Label>
                                <Input
                                  value={target.notes}
                                  onChange={(e) =>
                                    updateTarget(goalIdx, target.targetName, {
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
                  {ST_RESPONSE_OPTIONS.map((opt) => (
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
                id="st-caregiverPresent"
                checked={formData.objective.caregiverPresent}
                onCheckedChange={(checked) =>
                  updateObjective('caregiverPresent', !!checked)
                }
                disabled={readOnly}
              />
              <Label htmlFor="st-caregiverPresent" className="text-sm">
                Caregiver present and trained
              </Label>
            </div>
            {formData.objective.caregiverPresent && (
              <div>
                <Label className="text-xs text-slate-500">
                  What communication strategy was caregiver trained on?
                </Label>
                <Textarea
                  value={formData.objective.caregiverTrainingContent}
                  onChange={(e) =>
                    updateObjective('caregiverTrainingContent', e.target.value)
                  }
                  placeholder="Communication strategies, modeling techniques, home practice..."
                  className="min-h-[60px] text-sm"
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>

          {/* AAC session toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="st-aacToggle"
              checked={formData.objective.aacAddressedThisSession}
              onCheckedChange={(checked) =>
                updateObjective('aacAddressedThisSession', !!checked)
              }
              disabled={readOnly}
            />
            <Label htmlFor="st-aacToggle" className="text-sm">
              AAC addressed this session
            </Label>
          </div>

          {/* Visit counter */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-medium text-slate-600">
                Visit Utilization
              </span>
            </div>
            {authVisits > 0 ? (
              <div className="text-sm text-slate-700">
                Visit{' '}
                <span className="font-semibold">{visitNum || '—'}</span> of{' '}
                <span className="font-semibold">{authVisits}</span> authorized
                visits
                {remainingAfter >= 0 && (
                  <span className="text-xs text-slate-500 ml-2">
                    ({remainingAfter} remaining after this session)
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Authorization data unavailable — enter manually below or check billing.
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              ST billed per visit — no timed units
            </p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div>
                <Label className="text-[10px] text-slate-400">Visit #</Label>
                <Input
                  type="number"
                  min={0}
                  value={visitNum || ''}
                  onChange={(e) =>
                    updateBilling('visitNumber', parseInt(e.target.value) || 0)
                  }
                  className="h-7 text-xs"
                  readOnly={readOnly}
                />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Authorized</Label>
                <Input
                  type="number"
                  min={0}
                  value={authVisits || ''}
                  onChange={(e) =>
                    updateBilling('authorizedVisits', parseInt(e.target.value) || 0)
                  }
                  className="h-7 text-xs"
                  readOnly={readOnly}
                />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Remaining</Label>
                <Input
                  type="number"
                  min={0}
                  value={remainingAfter || ''}
                  onChange={(e) =>
                    updateBilling(
                      'remainingVisitsAfterThis',
                      parseInt(e.target.value) || 0
                    )
                  }
                  className="h-7 text-xs"
                  readOnly={readOnly}
                />
              </div>
            </div>
          </div>

          {/* Plan for next session */}
          <div>
            <Label className="text-xs text-slate-500">Plan for Next Session</Label>
            <Textarea
              value={formData.plan.planNextSession}
              onChange={(e) => updatePlan('planNextSession', e.target.value)}
              placeholder="Target focus, strategy modifications, materials..."
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
                placeholder="92507, 92508, 92526..."
                className="h-8 text-sm"
                readOnly={readOnly}
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                ST billed per visit — no timed units
              </p>
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
                placeholder="F80.1, F80.2, R47.1..."
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
