'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  FunctionalMobilityEntry,
  BalanceEntry,
  GaitEntry,
  AssistLevel,
} from '@/types/notes/pt';
import { ASSIST_LEVEL_LABELS } from '@/types/notes/pt';

// ---------------------------------------------------------------------------
// Functional Mobility
// ---------------------------------------------------------------------------

const MOBILITY_ACTIVITIES = [
  'Sit to Stand',
  'Transfers',
  'Ambulation',
  'Stairs',
];

interface FunctionalMobilitySectionProps {
  mobility: FunctionalMobilityEntry[];
  balance: BalanceEntry[];
  gait: GaitEntry;
  onMobilityChange: (entries: FunctionalMobilityEntry[]) => void;
  onBalanceChange: (entries: BalanceEntry[]) => void;
  onGaitChange: (gait: GaitEntry) => void;
  readOnly?: boolean;
}

const BALANCE_TYPES = ['Static Sitting', 'Static Standing', 'Dynamic'];

function AssistSelect({
  value,
  onChange,
  readOnly,
}: {
  value: AssistLevel;
  onChange: (v: AssistLevel) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <span className="text-sm text-slate-700">
        {ASSIST_LEVEL_LABELS[value] || value}
      </span>
    );
  }
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssistLevel)}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ASSIST_LEVEL_LABELS).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function FunctionalMobilitySection({
  mobility,
  balance,
  gait,
  onMobilityChange,
  onBalanceChange,
  onGaitChange,
  readOnly,
}: FunctionalMobilitySectionProps) {
  // Ensure we have entries for all default activities
  const ensuredMobility: FunctionalMobilityEntry[] = MOBILITY_ACTIVITIES.map(
    (activity) =>
      mobility.find((m) => m.activity === activity) || {
        activity,
        assistLevel: 'independent' as AssistLevel,
      }
  );

  const ensuredBalance: BalanceEntry[] = BALANCE_TYPES.map(
    (type) =>
      balance.find((b) => b.type === type) || {
        type,
        level: 'independent' as AssistLevel,
      }
  );

  const updateMobility = (activity: string, level: AssistLevel) => {
    const updated = ensuredMobility.map((m) =>
      m.activity === activity ? { ...m, assistLevel: level } : m
    );
    onMobilityChange(updated);
  };

  const updateBalance = (type: string, level: AssistLevel) => {
    const updated = ensuredBalance.map((b) =>
      b.type === type ? { ...b, level } : b
    );
    onBalanceChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Functional Mobility */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-slate-700">Functional Mobility</h4>
        <div className="grid grid-cols-2 gap-2">
          {ensuredMobility.map((m) => (
            <div key={m.activity} className="flex items-center gap-2">
              <span className="text-sm text-slate-600 w-28 shrink-0">{m.activity}</span>
              <AssistSelect
                value={m.assistLevel}
                onChange={(v) => updateMobility(m.activity, v)}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Balance */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-slate-700">Balance</h4>
        <div className="grid grid-cols-2 gap-2">
          {ensuredBalance.map((b) => (
            <div key={b.type} className="flex items-center gap-2">
              <span className="text-sm text-slate-600 w-28 shrink-0">{b.type}</span>
              <AssistSelect
                value={b.level}
                onChange={(v) => updateBalance(b.type, v)}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Gait */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-slate-700">Gait</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-500">Pattern</Label>
            <Input
              value={gait.pattern}
              onChange={(e) => onGaitChange({ ...gait, pattern: e.target.value })}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Deviations</Label>
            <Input
              value={gait.deviations}
              onChange={(e) => onGaitChange({ ...gait, deviations: e.target.value })}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Assistive Device</Label>
            <Input
              value={gait.assistiveDevice}
              onChange={(e) => onGaitChange({ ...gait, assistiveDevice: e.target.value })}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Distance</Label>
            <Input
              value={gait.distance}
              onChange={(e) => onGaitChange({ ...gait, distance: e.target.value })}
              className="h-8 text-sm"
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
