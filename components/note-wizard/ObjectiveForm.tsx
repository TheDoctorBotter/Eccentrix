import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Intervention, InterventionDetail, AssistLevel } from '@/lib/types';
import InterventionsCheckboxList from './InterventionsCheckboxList';

interface ObjectiveFormProps {
  data?: {
    interventions?: InterventionDetail[];
    assist_level?: AssistLevel;
    tolerance?: string;
    key_measures?: string;
  };
  interventions: Intervention[];
  onChange: (data: any) => void;
}

const ASSIST_LEVELS: AssistLevel[] = [
  'Independent',
  'SBA',
  'CGA',
  'Min',
  'Mod',
  'Max',
  'Dependent',
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
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Interventions Performed</Label>
          <InterventionsCheckboxList
            interventions={interventions}
            selectedInterventions={data.interventions || []}
            onChange={handleInterventionsChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assist_level">Assist Level</Label>
          <Select
            value={data.assist_level}
            onValueChange={(value) => handleChange('assist_level', value)}
          >
            <SelectTrigger id="assist_level">
              <SelectValue placeholder="Select assist level" />
            </SelectTrigger>
            <SelectContent>
              {ASSIST_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tolerance">Tolerance to Treatment</Label>
          <Select
            value={data.tolerance}
            onValueChange={(value) => handleChange('tolerance', value)}
          >
            <SelectTrigger id="tolerance">
              <SelectValue placeholder="Select tolerance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Good">Good - minimal symptoms</SelectItem>
              <SelectItem value="Fair">Fair - moderate symptoms</SelectItem>
              <SelectItem value="Poor">Poor - significant symptoms</SelectItem>
            </SelectContent>
          </Select>
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
