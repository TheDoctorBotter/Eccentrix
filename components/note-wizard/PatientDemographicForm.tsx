import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface PatientDemographicFormProps {
  data?: {
    patientName?: string;
    dateOfBirth?: string;
    diagnosis?: string;
    treatmentDiagnosis?: string;
    referralSource?: string;
    insuranceId?: string;
    allergies?: string;
    precautions?: string;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="diagnosis">Medical Diagnosis</Label>
            <Input
              id="diagnosis"
              placeholder="e.g., R knee OA, L shoulder impingement"
              value={data.diagnosis || ''}
              onChange={(e) => handleChange('diagnosis', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="treatmentDiagnosis">Treatment Diagnosis</Label>
            <Input
              id="treatmentDiagnosis"
              placeholder="e.g., Decreased ROM, impaired gait"
              value={data.treatmentDiagnosis || ''}
              onChange={(e) => handleChange('treatmentDiagnosis', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="referralSource">Referring MD</Label>
            <Input
              id="referralSource"
              placeholder="e.g., Dr. Smith"
              value={data.referralSource || ''}
              onChange={(e) => handleChange('referralSource', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="insuranceId">Insurance ID</Label>
            <Input
              id="insuranceId"
              placeholder="e.g., BCBS 12345678"
              value={data.insuranceId || ''}
              onChange={(e) => handleChange('insuranceId', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="allergies">Allergies</Label>
            <Input
              id="allergies"
              placeholder="e.g., NKDA, Penicillin"
              value={data.allergies || ''}
              onChange={(e) => handleChange('allergies', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="precautions">Precautions</Label>
            <Input
              id="precautions"
              placeholder="e.g., Fall risk, weight bearing restrictions"
              value={data.precautions || ''}
              onChange={(e) => handleChange('precautions', e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
