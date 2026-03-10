'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PTIntervention, AssistLevel } from '@/types/notes/pt';
import { ASSIST_LEVEL_LABELS, PT_INTERVENTION_OPTIONS } from '@/types/notes/pt';

interface InterventionSelectorProps {
  interventions: PTIntervention[];
  onChange: (interventions: PTIntervention[]) => void;
  readOnly?: boolean;
}

export default function InterventionSelector({
  interventions,
  onChange,
  readOnly,
}: InterventionSelectorProps) {
  const selectedIds = new Set(interventions.map((i) => i.id));

  const toggleIntervention = (opt: (typeof PT_INTERVENTION_OPTIONS)[number]) => {
    if (selectedIds.has(opt.id)) {
      onChange(interventions.filter((i) => i.id !== opt.id));
    } else {
      onChange([
        ...interventions,
        {
          id: opt.id,
          name: opt.name,
          category: opt.category,
          bodyRegion: '',
          mode: 'time' as const,
          timeMinutes: 15,
          assistLevel: 'independent' as AssistLevel,
        },
      ]);
    }
  };

  const updateIntervention = (
    id: string,
    field: keyof PTIntervention,
    value: unknown
  ) => {
    onChange(
      interventions.map((i) =>
        i.id === id ? { ...i, [field]: value } : i
      )
    );
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-700">Interventions</h4>

      {/* Checkboxes */}
      <div className="grid grid-cols-2 gap-2">
        {PT_INTERVENTION_OPTIONS.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <Checkbox
              id={`intv-${opt.id}`}
              checked={selectedIds.has(opt.id)}
              onCheckedChange={() => !readOnly && toggleIntervention(opt)}
              disabled={readOnly}
            />
            <label
              htmlFor={`intv-${opt.id}`}
              className="text-sm text-slate-700 cursor-pointer"
            >
              {opt.name}
            </label>
          </div>
        ))}
      </div>

      {/* Detail fields for each selected intervention */}
      {interventions.map((intv) => (
        <div
          key={intv.id}
          className="border border-slate-200 rounded-md p-3 space-y-2 bg-slate-50"
        >
          <p className="text-sm font-medium text-slate-800">{intv.name}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {/* Body region */}
            <div>
              <Label className="text-xs text-slate-500">Body Region</Label>
              <Input
                value={intv.bodyRegion}
                onChange={(e) =>
                  updateIntervention(intv.id, 'bodyRegion', e.target.value)
                }
                className="h-8 text-sm"
                placeholder="e.g. bilateral LE"
                readOnly={readOnly}
              />
            </div>

            {/* Mode toggle */}
            <div>
              <Label className="text-xs text-slate-500">Mode</Label>
              <div className="flex gap-1 mt-1">
                <Button
                  type="button"
                  variant={intv.mode === 'sets_reps' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => !readOnly && updateIntervention(intv.id, 'mode', 'sets_reps')}
                  disabled={readOnly}
                >
                  Sets/Reps
                </Button>
                <Button
                  type="button"
                  variant={intv.mode === 'time' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => !readOnly && updateIntervention(intv.id, 'mode', 'time')}
                  disabled={readOnly}
                >
                  Time
                </Button>
              </div>
            </div>

            {/* Sets/Reps or Time */}
            {intv.mode === 'sets_reps' ? (
              <>
                <div>
                  <Label className="text-xs text-slate-500">Sets</Label>
                  <Input
                    type="number"
                    min={0}
                    value={intv.sets ?? ''}
                    onChange={(e) =>
                      updateIntervention(intv.id, 'sets', parseInt(e.target.value) || 0)
                    }
                    className="h-8 text-sm"
                    readOnly={readOnly}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Reps</Label>
                  <Input
                    type="number"
                    min={0}
                    value={intv.reps ?? ''}
                    onChange={(e) =>
                      updateIntervention(intv.id, 'reps', parseInt(e.target.value) || 0)
                    }
                    className="h-8 text-sm"
                    readOnly={readOnly}
                  />
                </div>
              </>
            ) : (
              <div>
                <Label className="text-xs text-slate-500">Minutes</Label>
                <Input
                  type="number"
                  min={0}
                  value={intv.timeMinutes ?? ''}
                  onChange={(e) =>
                    updateIntervention(intv.id, 'timeMinutes', parseInt(e.target.value) || 0)
                  }
                  className="h-8 text-sm"
                  readOnly={readOnly}
                />
              </div>
            )}

            {/* Assist level */}
            <div>
              <Label className="text-xs text-slate-500">Assist Level</Label>
              {readOnly ? (
                <p className="text-sm mt-1">
                  {ASSIST_LEVEL_LABELS[intv.assistLevel] || intv.assistLevel}
                </p>
              ) : (
                <Select
                  value={intv.assistLevel}
                  onValueChange={(v) =>
                    updateIntervention(intv.id, 'assistLevel', v)
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ASSIST_LEVEL_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
