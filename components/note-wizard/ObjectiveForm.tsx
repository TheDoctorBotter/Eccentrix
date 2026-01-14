import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { Intervention, InterventionDetail, AssistLevel } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
  const [selectedInterventions, setSelectedInterventions] = useState<InterventionDetail[]>(
    data.interventions || []
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentIntervention, setCurrentIntervention] = useState<Partial<InterventionDetail>>({});

  const handleChange = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const addIntervention = () => {
    if (!currentIntervention.id) return;

    const newIntervention: InterventionDetail = {
      id: currentIntervention.id,
      name: currentIntervention.name || '',
      dosage: currentIntervention.dosage,
      cues: currentIntervention.cues,
    };

    let updated;
    if (editingIndex !== null) {
      updated = [...selectedInterventions];
      updated[editingIndex] = newIntervention;
    } else {
      updated = [...selectedInterventions, newIntervention];
    }

    setSelectedInterventions(updated);
    handleChange('interventions', updated);
    setDialogOpen(false);
    setCurrentIntervention({});
    setEditingIndex(null);
  };

  const removeIntervention = (index: number) => {
    const updated = selectedInterventions.filter((_, i) => i !== index);
    setSelectedInterventions(updated);
    handleChange('interventions', updated);
  };

  const editIntervention = (index: number) => {
    setEditingIndex(index);
    setCurrentIntervention(selectedInterventions[index]);
    setDialogOpen(true);
  };

  const selectInterventionFromLibrary = (interventionId: string) => {
    const intervention = interventions.find((i) => i.id === interventionId);
    if (intervention) {
      setCurrentIntervention({
        id: intervention.id,
        name: intervention.name,
        dosage: intervention.default_dosage || '',
        cues: intervention.default_cues || '',
      });
    }
  };

  const groupedInterventions = interventions.reduce((acc, intervention) => {
    if (!acc[intervention.category]) {
      acc[intervention.category] = [];
    }
    acc[intervention.category].push(intervention);
    return acc;
  }, {} as Record<string, Intervention[]>);

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
          <div className="flex items-center justify-between">
            <Label>Interventions Performed</Label>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingIndex(null);
                    setCurrentIntervention({});
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Intervention
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingIndex !== null ? 'Edit' : 'Add'} Intervention
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Select from Library</Label>
                    <Select
                      value={currentIntervention.id}
                      onValueChange={selectInterventionFromLibrary}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an intervention" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(groupedInterventions).map(([category, items]) => (
                          <div key={category}>
                            <div className="px-2 py-1.5 text-sm font-semibold text-slate-900">
                              {category}
                            </div>
                            {items.map((intervention) => (
                              <SelectItem key={intervention.id} value={intervention.id}>
                                {intervention.name}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Intervention Name</Label>
                    <Input
                      value={currentIntervention.name || ''}
                      onChange={(e) =>
                        setCurrentIntervention({
                          ...currentIntervention,
                          name: e.target.value,
                          id: currentIntervention.id || 'custom',
                        })
                      }
                      placeholder="Custom intervention name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dosage (sets x reps, time, distance)</Label>
                    <Input
                      value={currentIntervention.dosage || ''}
                      onChange={(e) =>
                        setCurrentIntervention({
                          ...currentIntervention,
                          dosage: e.target.value,
                        })
                      }
                      placeholder="e.g., 3 x 10, 15 minutes, 200 feet"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Cues Provided</Label>
                    <Input
                      value={currentIntervention.cues || ''}
                      onChange={(e) =>
                        setCurrentIntervention({
                          ...currentIntervention,
                          cues: e.target.value,
                        })
                      }
                      placeholder="e.g., verbal cues for proper form, tactile cues"
                    />
                  </div>

                  <Button
                    onClick={addIntervention}
                    disabled={!currentIntervention.id || !currentIntervention.name}
                    className="w-full"
                  >
                    {editingIndex !== null ? 'Update' : 'Add'} Intervention
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {selectedInterventions.length > 0 ? (
            <div className="space-y-2">
              {selectedInterventions.map((intervention, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between p-3 border rounded-lg bg-slate-50"
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">
                      {intervention.name}
                    </div>
                    {intervention.dosage && (
                      <div className="text-sm text-slate-600">
                        Dosage: {intervention.dosage}
                      </div>
                    )}
                    {intervention.cues && (
                      <div className="text-sm text-slate-600">
                        Cues: {intervention.cues}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => editIntervention(index)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIntervention(index)}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic p-4 border border-dashed rounded-lg text-center">
              No interventions added yet
            </div>
          )}
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
