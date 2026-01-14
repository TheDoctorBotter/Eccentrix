import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NoteType, NOTE_TYPE_LABELS } from '@/lib/types';
import { FileText, ClipboardCheck, TrendingUp, CheckCircle, GraduationCap } from 'lucide-react';

interface NoteTypeSelectorProps {
  onSelect: (type: NoteType) => void;
}

export default function NoteTypeSelector({ onSelect }: NoteTypeSelectorProps) {
  const noteTypes: Array<{ type: NoteType; icon: React.ReactNode; description: string }> = [
    {
      type: 'daily_soap',
      icon: <FileText className="h-8 w-8" />,
      description: 'Standard SOAP format for routine treatment sessions',
    },
    {
      type: 'pt_evaluation',
      icon: <ClipboardCheck className="h-8 w-8" />,
      description: 'Initial evaluation with comprehensive assessment',
    },
    {
      type: 'progress_note',
      icon: <TrendingUp className="h-8 w-8" />,
      description: 'Periodic review of treatment progress and goals',
    },
    {
      type: 'discharge_summary',
      icon: <CheckCircle className="h-8 w-8" />,
      description: 'Final summary documenting outcomes and recommendations',
    },
    {
      type: 'school_iep',
      icon: <GraduationCap className="h-8 w-8" />,
      description: 'School-based IEP documentation with educational focus',
    },
  ];

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {noteTypes.map(({ type, icon, description }) => (
        <Card
          key={type}
          className="border-2 border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group"
          onClick={() => onSelect(type)}
        >
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-blue-600 group-hover:text-blue-700">{icon}</div>
              <CardTitle className="text-lg">{NOTE_TYPE_LABELS[type]}</CardTitle>
            </div>
            <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
