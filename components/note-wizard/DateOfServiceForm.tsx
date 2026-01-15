import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from 'lucide-react';

interface DateOfServiceFormProps {
  value?: string;
  onChange: (value: string) => void;
}

export default function DateOfServiceForm({ value, onChange }: DateOfServiceFormProps) {
  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <CardTitle>Date of Service</CardTitle>
        </div>
        <CardDescription>When was this service provided?</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="dateOfService">Service Date</Label>
          <Input
            id="dateOfService"
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}
