import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PatientDemographicFormProps {
  data?: {
    patientName?: string;
    dateOfBirth?: string;
    diagnosis?: string;
    referralSource?: string;
  };
  onChange: (data: any) => void;
}

export default function PatientDemographicForm({ data = {}, onChange }: PatientDemographicFormProps) {
  const handleChange = (field: string, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Demographic</CardTitle>
        <CardDescription>Basic demographic information about the patient</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="patientName">Patient Name</Label>
          <Input
            id="patientName"
            placeholder="e.g., John Smith"
            value={data.patientName || ''}
            onChange={(e) => handleChange('patientName', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={data.dateOfBirth || ''}
            onChange={(e) => handleChange('dateOfBirth', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="diagnosis">Diagnosis</Label>
          <Input
            id="diagnosis"
            placeholder="e.g., R knee OA, L shoulder impingement"
            value={data.diagnosis || ''}
            onChange={(e) => handleChange('diagnosis', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="referralSource">Referral Source</Label>
          <Input
            id="referralSource"
            placeholder="e.g., Dr. Smith, Self-referral"
            value={data.referralSource || ''}
            onChange={(e) => handleChange('referralSource', e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
