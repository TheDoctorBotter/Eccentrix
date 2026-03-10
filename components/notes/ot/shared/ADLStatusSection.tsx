'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ADLEntry, ADLAssistLevel } from '@/types/notes/ot';
import { ADL_AREA_LABELS, ADL_ASSIST_LEVEL_OPTIONS } from '@/types/notes/ot';

interface ADLStatusSectionProps {
  entries: ADLEntry[];
  onChange: (entries: ADLEntry[]) => void;
  readOnly?: boolean;
}

export default function ADLStatusSection({
  entries,
  onChange,
  readOnly,
}: ADLStatusSectionProps) {
  const update = (idx: number, value: string) => {
    const updated = entries.map((e, i) =>
      i === idx ? { ...e, assistLevel: value as ADLAssistLevel } : e
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-slate-500 font-medium">
        Self-Care / ADL Status
      </Label>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left p-2 font-medium text-slate-600 w-32">
                Area
              </th>
              <th className="text-left p-2 font-medium text-slate-600">
                Assist Level
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={entry.area} className="border-b border-slate-100">
                <td className="p-2 text-sm text-slate-700">
                  {ADL_AREA_LABELS[entry.area]}
                </td>
                <td className="p-1">
                  {readOnly ? (
                    <span className="text-sm">{entry.assistLevel || '—'}</span>
                  ) : (
                    <Select
                      value={entry.assistLevel || ''}
                      onValueChange={(v) => update(idx, v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select level..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ADL_ASSIST_LEVEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
