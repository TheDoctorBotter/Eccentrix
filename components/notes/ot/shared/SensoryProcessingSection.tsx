'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SensoryEntry, SensoryRating } from '@/types/notes/ot';
import {
  SENSORY_DOMAIN_LABELS,
  SENSORY_RATING_OPTIONS,
} from '@/types/notes/ot';

interface SensoryProcessingSectionProps {
  entries: SensoryEntry[];
  onChange: (entries: SensoryEntry[]) => void;
  readOnly?: boolean;
  /** Show a "change since last eval" column (for re-evaluation) */
  showChange?: boolean;
  changeValues?: Record<string, string>;
  onChangeValues?: (values: Record<string, string>) => void;
}

export default function SensoryProcessingSection({
  entries,
  onChange,
  readOnly,
  showChange,
  changeValues,
  onChangeValues,
}: SensoryProcessingSectionProps) {
  const update = (idx: number, field: keyof SensoryEntry, value: string) => {
    const updated = entries.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-slate-500 font-medium">Sensory Processing</Label>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left p-2 font-medium text-slate-600 w-32">Domain</th>
              <th className="text-left p-2 font-medium text-slate-600 w-36">Rating</th>
              {showChange && (
                <th className="text-left p-2 font-medium text-slate-600 w-36">Change</th>
              )}
              <th className="text-left p-2 font-medium text-slate-600">Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={entry.domain} className="border-b border-slate-100">
                <td className="p-2 text-sm text-slate-700">
                  {SENSORY_DOMAIN_LABELS[entry.domain]}
                </td>
                <td className="p-1">
                  {readOnly ? (
                    <span className="text-sm">{entry.rating || '—'}</span>
                  ) : (
                    <Select
                      value={entry.rating || ''}
                      onValueChange={(v) => update(idx, 'rating', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SENSORY_RATING_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                {showChange && (
                  <td className="p-1">
                    <Input
                      value={changeValues?.[entry.domain] || ''}
                      onChange={(e) =>
                        onChangeValues?.({
                          ...changeValues,
                          [entry.domain]: e.target.value,
                        })
                      }
                      placeholder="Improved / Same / Declined"
                      className="h-8 text-sm"
                      readOnly={readOnly}
                    />
                  </td>
                )}
                <td className="p-1">
                  <Input
                    value={entry.notes}
                    onChange={(e) => update(idx, 'notes', e.target.value)}
                    placeholder="Brief notes..."
                    className="h-8 text-sm"
                    readOnly={readOnly}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
