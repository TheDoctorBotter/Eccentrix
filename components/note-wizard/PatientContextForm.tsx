import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface PatientContextFormProps {
  data?: {
    identifier?: string;
    diagnosis?: string;
    reason_for_visit?: string;
  };
  onChange: (data: any) => void;
}

export default function PatientContextForm({ data = {}, onChange }: PatientContextFormProps) {
  const handleChange = (field: string, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Context</CardTitle>
        <CardDescription>Basic information about the patient and visit</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 text-sm">
            Use generic identifiers only (e.g., "Patient A", "Case 123"). Never enter names, DOB, or MRN.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="identifier">Identifier (Optional)</Label>
          <Input
            id="identifier"
            placeholder="e.g., Patient A, Case 123"
            value={data.identifier || ''}
            onChange={(e) => handleChange('identifier', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="diagnosis">Diagnosis/Condition</Label>
          <Input
            id="diagnosis"
            placeholder="e.g., R knee OA, L shoulder impingement"
            value={data.diagnosis || ''}
            onChange={(e) => handleChange('diagnosis', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason for Visit</Label>
          <Textarea
            id="reason"
            placeholder="e.g., Continued PT for knee strengthening and pain management"
            value={data.reason_for_visit || ''}
            onChange={(e) => handleChange('reason_for_visit', e.target.value)}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
