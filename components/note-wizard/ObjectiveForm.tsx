import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Intervention, InterventionDetail, AssistLevel, ToleranceLevel, TOLERANCE_OPTIONS } from '@/lib/types';
import InterventionsCheckboxList from './InterventionsCheckboxList';

interface ObjectiveFormProps {
  data?: {
    interventions?: InterventionDetail[];
    assist_level?: AssistLevel;
    tolerance?: ToleranceLevel;
    key_measures?: string;
  };
  interventions: Intervention[];
  onChange: (data: any) => void;
}

const ASSIST_LEVELS: { value: AssistLevel; label: string }[] = [
  { value: 'Independent', label: 'Independent' },
  { value: 'SBA', label: 'SBA - Stand-by Assist' },
  { value: 'CGA', label: 'CGA - Contact Guard Assist' },
  { value: 'Min', label: 'Min - Minimal Assist' },
  { value: 'Mod', label: 'Mod - Moderate Assist' },
  { value: 'Max', label: 'Max - Maximal Assist' },
  { value: 'Dependent', label: 'Dependent' },
];

export default function ObjectiveForm({
  data = {},
  interventions,
  onChange,
}: ObjectiveFormProps) {
  const handleChange = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handleInterventionsChange = (selectedInterventions: InterventionDetail[]) => {
    handleChange('interventions', selectedInterventions);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objective</CardTitle>
        <CardDescription>
          Interventions performed, measurements, and observations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Interventions Performed</Label>
          <InterventionsCheckboxList
            interventions={interventions}
            selectedInterventions={data.interventions || []}
            onChange={handleInterventionsChange}
          />
        </div>

        <div className="space-y-3">
          <Label>Assist Level</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ASSIST_LEVELS.map((level) => (
              <div
                key={level.value}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                  data.assist_level === level.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => handleChange('assist_level', level.value)}
              >
                <Checkbox
                  id={`assist_${level.value}`}
                  checked={data.assist_level === level.value}
                  onCheckedChange={() => handleChange('assist_level', level.value)}
                />
                <Label
                  htmlFor={`assist_${level.value}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {level.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Tolerance to Treatment</Label>
          <div className="space-y-2">
            {TOLERANCE_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  data.tolerance === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => handleChange('tolerance', option.value)}
              >
                <Checkbox
                  id={`tolerance_${option.value}`}
                  checked={data.tolerance === option.value}
                  onCheckedChange={() => handleChange('tolerance', option.value)}
                />
                <Label
                  htmlFor={`tolerance_${option.value}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="key_measures">Key Measures & Observations</Label>
          <Textarea
            id="key_measures"
            placeholder="ROM, strength tests, functional measures, gait observations, etc."
            value={data.key_measures || ''}
            onChange={(e) => handleChange('key_measures', e.target.value)}
            rows={4}
          />
        </div>
      </CardContent>
    </Card>
  );
}
