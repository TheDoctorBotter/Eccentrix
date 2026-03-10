'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { STEvalGoalEntry, STGoalCategory, STGoalProgressEntry } from '@/types/notes/st';
import { ST_GOAL_CATEGORY_LABELS } from '@/types/notes/st';

// ---------------------------------------------------------------------------
// STGoalEntryTable — used in ST Evaluation & Re-Evaluation for STG/LTG
// ---------------------------------------------------------------------------

interface STGoalEntryTableProps {
  label: string;
  goals: STEvalGoalEntry[];
  onChange: (goals: STEvalGoalEntry[]) => void;
  readOnly?: boolean;
}

export function STGoalEntryTable({
  label,
  goals,
  onChange,
  readOnly,
}: STGoalEntryTableProps) {
  const addGoal = () =>
    onChange([
      ...goals,
      {
        description: '',
        targetDate: '',
        baselineValue: '',
        targetValue: '',
        category: 'other',
      },
    ]);

  const removeGoal = (idx: number) =>
    onChange(goals.filter((_, i) => i !== idx));

  const update = (idx: number, field: keyof STEvalGoalEntry, value: string) => {
    const updated = goals.map((g, i) =>
      i === idx ? { ...g, [field]: value } : g
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700">{label}</h4>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addGoal}>
            <Plus className="h-3 w-3 mr-1" />
            Add Goal
          </Button>
        )}
      </div>
      {goals.map((goal, idx) => (
        <div
          key={idx}
          className="border border-slate-200 rounded-md p-3 space-y-2"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Label className="text-xs text-slate-500">Goal Description</Label>
              <Textarea
                value={goal.description}
                onChange={(e) => update(idx, 'description', e.target.value)}
                className="min-h-[60px] text-sm"
                readOnly={readOnly}
              />
            </div>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeGoal(idx)}
                className="text-red-500 hover:text-red-700 mt-4"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label className="text-xs text-slate-500">Target Date</Label>
              <Input
                type="date"
                value={goal.targetDate}
                onChange={(e) => update(idx, 'targetDate', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Baseline</Label>
              <Input
                value={goal.baselineValue}
                onChange={(e) => update(idx, 'baselineValue', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Target</Label>
              <Input
                value={goal.targetValue}
                onChange={(e) => update(idx, 'targetValue', e.target.value)}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Category</Label>
              {readOnly ? (
                <p className="text-sm mt-1">
                  {ST_GOAL_CATEGORY_LABELS[goal.category as STGoalCategory] || goal.category}
                </p>
              ) : (
                <Select
                  value={goal.category || 'other'}
                  onValueChange={(v) => update(idx, 'category', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ST_GOAL_CATEGORY_LABELS).map(([k, lbl]) => (
                      <SelectItem key={k} value={k}>
                        {lbl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      ))}
      {goals.length === 0 && (
        <p className="text-xs text-slate-400 italic">No goals added yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STGoalProgressTable — used in ST Re-Evaluation & Discharge
// ---------------------------------------------------------------------------

interface STGoalProgressTableProps {
  label: string;
  entries: STGoalProgressEntry[];
  onChange: (entries: STGoalProgressEntry[]) => void;
  readOnly?: boolean;
}

export function STGoalProgressTable({
  label,
  entries,
  onChange,
  readOnly,
}: STGoalProgressTableProps) {
  const addEntry = () =>
    onChange([
      ...entries,
      { goalText: '', priorStatus: '', currentStatus: '', outcome: 'Not Met' },
    ]);

  const removeEntry = (idx: number) =>
    onChange(entries.filter((_, i) => i !== idx));

  const update = (
    idx: number,
    field: keyof STGoalProgressEntry,
    value: string
  ) => {
    const updated = entries.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700">{label}</h4>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="h-3 w-3 mr-1" />
            Add Goal
          </Button>
        )}
      </div>
      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-2 font-medium text-slate-600">Goal</th>
                <th className="text-left p-2 font-medium text-slate-600 w-32">Prior Status</th>
                <th className="text-left p-2 font-medium text-slate-600 w-32">Current Status</th>
                <th className="text-left p-2 font-medium text-slate-600 w-36">Outcome</th>
                {!readOnly && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="p-1">
                    <Input
                      value={entry.goalText}
                      onChange={(e) => update(idx, 'goalText', e.target.value)}
                      className="h-8 text-sm"
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={entry.priorStatus}
                      onChange={(e) => update(idx, 'priorStatus', e.target.value)}
                      className="h-8 text-sm"
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={entry.currentStatus}
                      onChange={(e) => update(idx, 'currentStatus', e.target.value)}
                      className="h-8 text-sm"
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="p-1">
                    {readOnly ? (
                      <span className="text-sm">{entry.outcome}</span>
                    ) : (
                      <Select
                        value={entry.outcome}
                        onValueChange={(v) => update(idx, 'outcome', v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Met">Met</SelectItem>
                          <SelectItem value="Partially Met">Partially Met</SelectItem>
                          <SelectItem value="Not Met">Not Met</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(idx)}
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
      {entries.length === 0 && (
        <p className="text-xs text-slate-400 italic">No goal progress entries.</p>
      )}
    </div>
  );
}
