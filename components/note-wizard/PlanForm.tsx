import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface PlanFormProps {
  data?: {
    frequency_duration?: string;
    next_session_focus?: string;
    hep?: string;
    education_provided?: string;
  };
  onChange: (data: any) => void;
}

export default function PlanForm({
  data = {},
  onChange,
}: PlanFormProps) {
  const handleChange = (field: string, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
        <CardDescription>
          Treatment plan, frequency, and patient education
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency & Duration</Label>
          <Input
            id="frequency"
            placeholder="e.g., 2x/week for 4 weeks, 3x/week for 6 weeks"
            value={data.frequency_duration || ''}
            onChange={(e) => handleChange('frequency_duration', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="next_session">Next Session Focus</Label>
          <Textarea
            id="next_session"
            placeholder="e.g., Continue strengthening progression, advance balance activities, reassess ROM"
            value={data.next_session_focus || ''}
            onChange={(e) => handleChange('next_session_focus', e.target.value)}
            rows={2}
          />
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
