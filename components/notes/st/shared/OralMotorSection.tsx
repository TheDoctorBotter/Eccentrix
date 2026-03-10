'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OralMotorExam } from '@/types/notes/st';

interface OralMotorSectionProps {
  exam: OralMotorExam;
  onChange: (exam: OralMotorExam) => void;
  readOnly?: boolean;
}

export default function OralMotorSection({
  exam,
  onChange,
  readOnly,
}: OralMotorSectionProps) {
  const update = (field: keyof OralMotorExam, value: string) =>
    onChange({ ...exam, [field]: value });

  return (
    <div className="space-y-3">
      <Label className="text-xs text-slate-500 font-medium">
        Oral Motor Examination
      </Label>
      <div className="space-y-2">
        <div>
          <Label className="text-[10px] text-slate-400">
            Lips: structure / function
          </Label>
          <Input
            value={exam.lips}
            onChange={(e) => update('lips', e.target.value)}
            placeholder="Lip closure, resting posture, symmetry..."
            className="h-8 text-sm"
            readOnly={readOnly}
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-400">
            Tongue: structure / function / ROM
          </Label>
          <Input
            value={exam.tongue}
            onChange={(e) => update('tongue', e.target.value)}
            placeholder="Lateralization, elevation, protrusion, symmetry..."
            className="h-8 text-sm"
            readOnly={readOnly}
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-400">
            Jaw: ROM / grading
          </Label>
          <Input
            value={exam.jaw}
            onChange={(e) => update('jaw', e.target.value)}
            placeholder="Range of motion, stability, grading..."
            className="h-8 text-sm"
            readOnly={readOnly}
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-400">
            Palate: structure / velopharyngeal function
          </Label>
          <Input
            value={exam.palate}
            onChange={(e) => update('palate', e.target.value)}
            placeholder="Palatal structure, symmetry, function observations..."
            className="h-8 text-sm"
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}
