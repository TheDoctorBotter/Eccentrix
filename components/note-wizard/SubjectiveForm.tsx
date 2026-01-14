import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

interface SubjectiveFormProps {
  data?: {
    symptoms?: string;
    pain_level?: number;
    functional_limits?: string;
    goals?: string;
    red_flags?: boolean;
    red_flag_description?: string;
  };
  onChange: (data: any) => void;
}

export default function SubjectiveForm({ data = {}, onChange }: SubjectiveFormProps) {
  const handleChange = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subjective</CardTitle>
        <CardDescription>Patient-reported symptoms, pain, and functional status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="symptoms">Current Symptoms</Label>
          <Textarea
            id="symptoms"
            placeholder="e.g., Patient reports decreased pain with ADLs, stiffness in AM"
            value={data.symptoms || ''}
            onChange={(e) => handleChange('symptoms', e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Pain Level: {data.pain_level !== undefined ? data.pain_level : 0}/10</Label>
          <Slider
            value={[data.pain_level !== undefined ? data.pain_level : 0]}
            onValueChange={(val) => handleChange('pain_level', val[0])}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>No Pain</span>
            <span>Worst Pain</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="functional_limits">Functional Limitations</Label>
          <Textarea
            id="functional_limits"
            placeholder="e.g., Difficulty with stairs, unable to lift overhead"
            value={data.functional_limits || ''}
            onChange={(e) => handleChange('functional_limits', e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="goals">Patient Goals</Label>
          <Textarea
            id="goals"
            placeholder="e.g., Return to recreational tennis, improve sleep quality"
            value={data.goals || ''}
            onChange={(e) => handleChange('goals', e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50 border-red-200">
          <div className="space-y-1">
            <Label htmlFor="red_flags" className="text-red-900">
              Red Flags Present
            </Label>
            <p className="text-sm text-red-700">Severe symptoms requiring immediate attention or referral</p>
          </div>
          <Switch id="red_flags" checked={data.red_flags || false} onCheckedChange={(checked) => handleChange('red_flags', checked)} />
        </div>

        {data.red_flags && (
          <div className="space-y-2">
            <Label htmlFor="red_flag_desc">Red Flag Description</Label>
            <Textarea
              id="red_flag_desc"
              placeholder="Describe the concerning symptoms (e.g., numbness, weakness, bowel/bladder changes)"
              value={data.red_flag_description || ''}
              onChange={(e) => handleChange('red_flag_description', e.target.value)}
              rows={3}
              className="border-red-300"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
