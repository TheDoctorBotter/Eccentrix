import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AssessmentFormProps {
  data?: {
    progression?: 'better' | 'same' | 'worse';
    impairments?: string;
    skilled_need?: string;
    response_to_treatment?: string;
  };
  onChange: (data: any) => void;
}

export default function AssessmentForm({
  data = {},
  onChange,
}: AssessmentFormProps) {
  const handleChange = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assessment</CardTitle>
        <CardDescription>
          Clinical impression, progression, and skilled justification
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="progression">Progression Since Last Visit</Label>
          <Select
            value={data.progression}
            onValueChange={(value) => handleChange('progression', value)}
          >
            <SelectTrigger id="progression">
              <SelectValue placeholder="Select progression status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="better">
                Better - showing improvement
              </SelectItem>
              <SelectItem value="same">
                Same - plateau or no significant change
              </SelectItem>
              <SelectItem value="worse">
                Worse - regression or increased symptoms
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="response">Response to Treatment</Label>
          <Textarea
            id="response"
            placeholder="e.g., Patient demonstrated improved tolerance to therapeutic activities with decreased compensatory patterns"
            value={data.response_to_treatment || ''}
            onChange={(e) => handleChange('response_to_treatment', e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="impairments">Key Impairments/Deficits</Label>
          <Textarea
            id="impairments"
            placeholder="e.g., Decreased knee flexion ROM, 4/5 quad strength, impaired single leg stance"
            value={data.impairments || ''}
            onChange={(e) => handleChange('impairments', e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="skilled_need" className="flex items-center gap-2">
            Skilled Need Statement
            <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="skilled_need"
            placeholder="Explain why skilled PT services are necessary (required for billing justification). e.g., Skilled therapeutic exercise and neuromuscular re-education required to address impaired movement patterns and functional deficits"
            value={data.skilled_need || ''}
            onChange={(e) => handleChange('skilled_need', e.target.value)}
            rows={3}
            className="border-blue-300"
          />
          <p className="text-sm text-slate-500">
            This statement justifies the medical necessity of skilled PT services for insurance billing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
