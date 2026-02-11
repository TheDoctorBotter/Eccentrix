import { useState, useMemo } from 'react';
import { Intervention, InterventionDetail } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InterventionsCheckboxListProps {
  interventions: Intervention[];
  selectedInterventions: InterventionDetail[];
  onChange: (interventions: InterventionDetail[]) => void;
}

export default function InterventionsCheckboxList({
  interventions,
  selectedInterventions,
  onChange,
}: InterventionsCheckboxListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const groupedInterventions = useMemo(() => {
    const groups: Record<string, Intervention[]> = {};
    interventions.forEach((intervention) => {
      if (!groups[intervention.category]) {
        groups[intervention.category] = [];
      }
      groups[intervention.category].push(intervention);
    });
    return groups;
  }, [interventions]);

  const filteredInterventions = useMemo(() => {
    if (!searchQuery.trim()) return groupedInterventions;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, Intervention[]> = {};

    Object.entries(groupedInterventions).forEach(([category, items]) => {
      const matchedItems = items.filter((item) =>
        item.name.toLowerCase().includes(query)
      );
      if (matchedItems.length > 0) {
        filtered[category] = matchedItems;
      }
    });

    return filtered;
  }, [groupedInterventions, searchQuery]);

  const isChecked = (interventionId: string) => {
    return selectedInterventions.some((si) => si.id === interventionId);
  };

  const getInterventionData = (interventionId: string) => {
    return selectedInterventions.find((si) => si.id === interventionId);
  };

  const handleToggle = (intervention: Intervention, checked: boolean) => {
    if (checked) {
      const newIntervention: InterventionDetail = {
        id: intervention.id,
        name: intervention.name,
        category: intervention.category,
        dosage: intervention.default_dosage || '',
        cues: intervention.default_cues || '',
      };
      onChange([...selectedInterventions, newIntervention]);
    } else {
      onChange(selectedInterventions.filter((si) => si.id !== intervention.id));
    }
  };

  const handleDosageChange = (interventionId: string, dosage: string) => {
    onChange(
      selectedInterventions.map((si) =>
        si.id === interventionId ? { ...si, dosage } : si
      )
    );
  };

  const handleCuesChange = (interventionId: string, cues: string) => {
    onChange(
      selectedInterventions.map((si) =>
        si.id === interventionId ? { ...si, cues } : si
      )
    );
  };

  const categoryOrder = [
    'Therapeutic Exercise',
    'Manual Therapy',
    'Neuromuscular Re-education',
    'Functional Training',
    'Therapeutic Activities',
    'Gait Training',
    'Balance Training',
    'Modalities',
    'Patient Education',
    'Other',
  ];

  const sortedCategories = Object.keys(filteredInterventions).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search interventions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <ScrollArea className="h-[500px] rounded-md border p-4">
        <div className="space-y-6">
          {sortedCategories.map((category) => (
            <div key={category} className="space-y-3">
              <h4 className="font-semibold text-sm text-slate-700 sticky top-0 bg-white py-2 border-b">
                {category}
              </h4>
              <div className="space-y-3 pl-2">
                {filteredInterventions[category].map((intervention) => {
                  const checked = isChecked(intervention.id);
                  const data = getInterventionData(intervention.id);

                  return (
                    <div key={intervention.id} className="space-y-2">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={intervention.id}
                          checked={checked}
                          onCheckedChange={(checked) =>
                            handleToggle(intervention, checked as boolean)
                          }
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <Label
                            htmlFor={intervention.id}
                            className="text-sm font-medium leading-none cursor-pointer"
                          >
                            {intervention.name}
                          </Label>

                          {checked && (
                            <div className="space-y-2 pl-1">
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <Input
                                    placeholder="Dosage (e.g., 3x10, 15 min)"
                                    value={data?.dosage || ''}
                                    onChange={(e) =>
                                      handleDosageChange(
                                        intervention.id,
                                        e.target.value
                                      )
                                    }
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="flex-1">
                                  <Input
                                    placeholder="Cues (optional)"
                                    value={data?.cues || ''}
                                    onChange={(e) =>
                                      handleCuesChange(
                                        intervention.id,
                                        e.target.value
                                      )
                                    }
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {sortedCategories.length === 0 && (
            <div className="text-center text-slate-500 py-8">
              No interventions found matching &quot;{searchQuery}&quot;
            </div>
          )}
        </div>
      </ScrollArea>

      {selectedInterventions.length > 0 && (
        <div className="text-sm text-slate-600 bg-blue-50 p-3 rounded-md border border-blue-200">
          {selectedInterventions.length} intervention
          {selectedInterventions.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}
