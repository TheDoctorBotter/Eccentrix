'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import type { ROMEntry } from '@/types/notes/pt';

interface ROMTableProps {
  entries: ROMEntry[];
  onChange: (entries: ROMEntry[]) => void;
  readOnly?: boolean;
}

const EMPTY_ROM: ROMEntry = {
  joint: '',
  movement: '',
  active: '',
  passive: '',
  normal: '',
};

export default function ROMTable({ entries, onChange, readOnly }: ROMTableProps) {
  const addRow = () => onChange([...entries, { ...EMPTY_ROM }]);

  const removeRow = (idx: number) =>
    onChange(entries.filter((_, i) => i !== idx));

  const update = (idx: number, field: keyof ROMEntry, value: string) => {
    const updated = entries.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700">Range of Motion</h4>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" />
            Add Row
          </Button>
        )}
      </div>
      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-2 font-medium text-slate-600">Joint</th>
                <th className="text-left p-2 font-medium text-slate-600">Movement</th>
                <th className="text-left p-2 font-medium text-slate-600">Active</th>
                <th className="text-left p-2 font-medium text-slate-600">Passive</th>
                <th className="text-left p-2 font-medium text-slate-600">Normal</th>
                {!readOnly && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  {(['joint', 'movement', 'active', 'passive', 'normal'] as const).map(
                    (field) => (
                      <td key={field} className="p-1">
                        <Input
                          value={entry[field]}
                          onChange={(e) => update(idx, field, e.target.value)}
                          className="h-8 text-sm"
                          readOnly={readOnly}
                        />
                      </td>
                    )
                  )}
                  {!readOnly && (
                    <td className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(idx)}
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
        <p className="text-xs text-slate-400 italic">No ROM entries. Click &quot;Add Row&quot; to start.</p>
      )}
    </div>
  );
}
