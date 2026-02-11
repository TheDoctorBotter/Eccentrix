import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { NEXT_SESSION_FOCUS_OPTIONS } from '@/lib/types';

interface PlanFormProps {
  data?: {
    frequency_duration?: string;
    next_session_focus?: string[];
    hep?: string;
    education_provided?: string;
  };
  onChange: (data: any) => void;
}

export default function PlanForm({
  data = {},
  onChange,
}: PlanFormProps) {
  const handleChange = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const selectedFocus = data.next_session_focus || [];

  const toggleFocus = (focus: string) => {
    const current = [...selectedFocus];
    const index = current.indexOf(focus);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(focus);
    }
    handleChange('next_session_focus', current);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
        <CardDescription>
          Treatment plan, frequency, and patient education
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency & Duration</Label>
          <Input
            id="frequency"
            placeholder="e.g., 2x/week for 4 weeks, 3x/week for 6 weeks"
            value={data.frequency_duration || ''}
            onChange={(e) => handleChange('frequency_duration', e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <Label>Next Session Focus</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NEXT_SESSION_FOCUS_OPTIONS.map((focus) => (
              <div
                key={focus}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                  selectedFocus.includes(focus)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => toggleFocus(focus)}
              >
                <Checkbox
                  id={`focus_${focus}`}
                  checked={selectedFocus.includes(focus)}
                  onCheckedChange={() => toggleFocus(focus)}
                />
                <Label
                  htmlFor={`focus_${focus}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {focus}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hep">Home Exercise Program (HEP)</Label>
          <Textarea
            id="hep"
            placeholder="List exercises, frequency, and any modifications. e.g., Quad sets 3x10 2x/day, heel slides 3x10 2x/day, standing hip abduction 2x10 1x/day"
            value={data.hep || ''}
            onChange={(e) => handleChange('hep', e.target.value)}
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="education">Patient Education Provided</Label>
          <Textarea
            id="education"
            placeholder="e.g., Posture education, activity modification, pain management strategies, fall prevention"
            value={data.education_provided || ''}
            onChange={(e) => handleChange('education_provided', e.target.value)}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
