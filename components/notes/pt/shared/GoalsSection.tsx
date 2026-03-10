'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { GoalEntry, GoalProgressEntry } from '@/types/notes/pt';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// GoalEntryTable — used in Evaluation & Re-Evaluation for STG/LTG
// ---------------------------------------------------------------------------

interface GoalEntryTableProps {
  label: string;
  goals: GoalEntry[];
  onChange: (goals: GoalEntry[]) => void;
  readOnly?: boolean;
}

export function GoalEntryTable({ label, goals, onChange, readOnly }: GoalEntryTableProps) {
  const addGoal = () =>
    onChange([
      ...goals,
      { description: '', targetDate: '', baselineValue: '', targetValue: '' },
    ]);

  const removeGoal = (idx: number) =>
    onChange(goals.filter((_, i) => i !== idx));

  const update = (idx: number, field: keyof GoalEntry, value: string) => {
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
        <div key={idx} className="border border-slate-200 rounded-md p-3 space-y-2">
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
          <div className="grid grid-cols-3 gap-2">
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
// GoalProgressTable — used in Re-Evaluation & Discharge
// ---------------------------------------------------------------------------

interface GoalProgressTableProps {
  label: string;
  entries: GoalProgressEntry[];
  onChange: (entries: GoalProgressEntry[]) => void;
  readOnly?: boolean;
}

export function GoalProgressTable({
  label,
  entries,
  onChange,
  readOnly,
}: GoalProgressTableProps) {
  const addEntry = () =>
    onChange([
      ...entries,
      { description: '', priorBaseline: '', currentStatus: '', outcome: 'not_met' },
    ]);

  const removeEntry = (idx: number) =>
    onChange(entries.filter((_, i) => i !== idx));

  const update = (idx: number, field: keyof GoalProgressEntry, value: string) => {
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
                <th className="text-left p-2 font-medium text-slate-600 w-32">Prior Baseline</th>
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
                      value={entry.description}
                      onChange={(e) => update(idx, 'description', e.target.value)}
                      className="h-8 text-sm"
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={entry.priorBaseline}
                      onChange={(e) => update(idx, 'priorBaseline', e.target.value)}
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
                      <span className="text-sm">
                        {entry.outcome === 'met' ? 'Met' : entry.outcome === 'partially_met' ? 'Partially Met' : 'Not Met'}
                      </span>
                    ) : (
                      <Select
                        value={entry.outcome}
                        onValueChange={(v) => update(idx, 'outcome', v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="met">Met</SelectItem>
                          <SelectItem value="partially_met">Partially Met</SelectItem>
                          <SelectItem value="not_met">Not Met</SelectItem>
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
