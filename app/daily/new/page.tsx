'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { NoteInputData, Template, Intervention } from '@/lib/types';
import PatientContextForm from '@/components/note-wizard/PatientContextForm';
import SubjectiveForm from '@/components/note-wizard/SubjectiveForm';
import ObjectiveForm from '@/components/note-wizard/ObjectiveForm';
import AssessmentForm from '@/components/note-wizard/AssessmentForm';
import PlanForm from '@/components/note-wizard/PlanForm';

export default function DailySoapNotePage() {
  const router = useRouter();
  const [inputData, setInputData] = useState<NoteInputData>({});
  const [template, setTemplate] = useState<Template | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInterventions();
    fetchDefaultTemplate();
  }, []);

  const fetchInterventions = async () => {
    try {
      const response = await fetch('/api/interventions');
      if (response.ok) {
        const data = await response.json();
        setInterventions(data);
      }
    } catch (error) {
      console.error('Error fetching interventions:', error);
    }
  };

  const fetchDefaultTemplate = async () => {
    try {
      const response = await fetch('/api/templates?noteType=daily_soap');
      if (response.ok) {
        const templates = await response.json();
        const defaultTemplate = templates.find((t: Template) => t.is_default);
        if (defaultTemplate) {
          setTemplate(defaultTemplate);
        } else if (templates.length > 0) {
          setTemplate(templates[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching template:', error);
    }
  };

  const handleGenerateNote = async () => {
    if (!template) {
      setError('Missing template');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteType: 'daily_soap',
          inputData,
          template: template.content,
          styleSettings: template.style_settings,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate note');
      }

      const generated = await response.json();

      const saveResponse = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_type: 'daily_soap',
          input_data: inputData,
          output_text: generated.note,
          billing_justification: generated.billing_justification,
          hep_summary: generated.hep_summary,
          template_id: template.id,
        }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save note');
      }

      const savedNote = await saveResponse.json();
      router.push(`/notes/${savedNote.id}`);
    } catch (err) {
      console.error('Error generating note:', err);
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setGenerating(false);
    }
  };

  const updateInputData = (section: keyof NoteInputData, data: any) => {
    setInputData((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...data },
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href="/new">
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Change Note Type
            </Button>
          </Link>
          <Badge variant="outline" className="text-lg px-4 py-2">
            Daily SOAP Note
          </Badge>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-8">Document Your Daily Visit</h1>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <PatientContextForm
            data={inputData.patient_context}
            onChange={(data) => updateInputData('patient_context', data)}
          />

          <SubjectiveForm
            data={inputData.subjective}
            onChange={(data) => updateInputData('subjective', data)}
          />

          <ObjectiveForm
            data={inputData.objective}
            interventions={interventions}
            onChange={(data) => updateInputData('objective', data)}
          />

          <AssessmentForm
            data={inputData.assessment}
            onChange={(data) => updateInputData('assessment', data)}
          />

          <PlanForm
            data={inputData.plan}
            onChange={(data) => updateInputData('plan', data)}
          />

          <Card className="border-2 border-blue-200">
            <CardHeader>
              <CardTitle>Ready to Generate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 mb-4">
                Review your inputs above, then click the button below to generate your professional Daily SOAP note.
              </p>
              <Button onClick={handleGenerateNote} disabled={generating} size="lg" className="w-full">
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating Note...
                  </>
                ) : (
                  'Generate Daily SOAP Note'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
