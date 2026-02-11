import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ProgressionStatus,
  PROGRESSION_OPTIONS,
  IMPAIRMENT_OPTIONS,
} from '@/lib/types';

interface AssessmentFormProps {
  data?: {
    progression?: ProgressionStatus;
    impairments?: string[];
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

  const impairments = data.impairments || [];

  const toggleImpairment = (impairment: string) => {
    const current = [...impairments];
    const index = current.indexOf(impairment);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(impairment);
    }
    handleChange('impairments', current);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assessment</CardTitle>
        <CardDescription>
          Clinical impression, progression, and skilled justification
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Progression Since Last Visit</Label>
          <div className="space-y-2">
            {PROGRESSION_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  data.progression === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => handleChange('progression', option.value)}
              >
                <Checkbox
                  id={`progression_${option.value}`}
                  checked={data.progression === option.value}
                  onCheckedChange={() => handleChange('progression', option.value)}
                />
                <Label
                  htmlFor={`progression_${option.value}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
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

        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            Key Impairments/Deficits
            <span className="text-red-500">*</span>
          </Label>
          <p className="text-sm text-slate-500">
            Select impairments to generate a skilled need statement for billing justification.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {IMPAIRMENT_OPTIONS.map((impairment) => (
              <div
                key={impairment}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                  impairments.includes(impairment)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => toggleImpairment(impairment)}
              >
                <Checkbox
                  id={`impairment_${impairment}`}
                  checked={impairments.includes(impairment)}
                  onCheckedChange={() => toggleImpairment(impairment)}
                />
                <Label
                  htmlFor={`impairment_${impairment}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {impairment}
                </Label>
              </div>
            ))}
          </div>
          {impairments.length > 0 && (
            <div className="text-sm text-blue-700 bg-blue-50 p-3 rounded-md border border-blue-200">
              {impairments.length} impairment{impairments.length !== 1 ? 's' : ''} selected.
              AI will generate a skilled need statement based on these selections.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="skilled_need" className="flex items-center gap-2">
            Skilled Need Statement (Optional Override)
          </Label>
          <Textarea
            id="skilled_need"
            placeholder="Leave blank to auto-generate from selected impairments, or type a custom statement"
            value={data.skilled_need || ''}
            onChange={(e) => handleChange('skilled_need', e.target.value)}
            rows={3}
            className="border-blue-300"
          />
          <p className="text-sm text-slate-500">
            If left blank, AI will generate a skilled need statement from your selected impairments above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
