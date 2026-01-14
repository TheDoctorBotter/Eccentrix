'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { NoteType, NOTE_TYPE_LABELS, NoteInputData, Template, Intervention } from '@/lib/types';
import NoteTypeSelector from '@/components/note-wizard/NoteTypeSelector';
import PatientContextForm from '@/components/note-wizard/PatientContextForm';
import SubjectiveForm from '@/components/note-wizard/SubjectiveForm';
import ObjectiveForm from '@/components/note-wizard/ObjectiveForm';
import AssessmentForm from '@/components/note-wizard/AssessmentForm';
import PlanForm from '@/components/note-wizard/PlanForm';

export default function NewNotePage() {
  const router = useRouter();
  const [step, setStep] = useState<'type' | 'form' | 'generate'>('type');
  const [noteType, setNoteType] = useState<NoteType | null>(null);
  const [inputData, setInputData] = useState<NoteInputData>({});
  const [template, setTemplate] = useState<Template | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInterventions();
  }, []);

  useEffect(() => {
    if (noteType) {
      fetchDefaultTemplate();
    }
  }, [noteType]);

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
      const response = await fetch(`/api/templates?noteType=${noteType}`);
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

  const handleNoteTypeSelect = (type: NoteType) => {
    setNoteType(type);
    setStep('form');
  };

  const handleGenerateNote = async () => {
    if (!noteType || !template) {
      setError('Missing note type or template');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      console.log('Generating note with:', { noteType, inputData });

      const response = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteType,
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
      console.log('Note generated successfully');

      const saveResponse = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_type: noteType,
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
      console.log('Note saved with ID:', savedNote.id);
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

  if (step === 'type') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>

          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Create New Note</h1>
            <p className="text-slate-600">Select the type of documentation you need</p>
          </div>

          <Alert className="mb-8 border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <strong>Privacy Notice:</strong> Do not enter Protected Health Information (PHI) such as patient names, dates of birth, or medical record numbers. Use generic identifiers only.
            </AlertDescription>
          </Alert>

          <NoteTypeSelector onSelect={handleNoteTypeSelect} />
        </div>
      </div>
    );
  }

  if (step === 'form' && noteType) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => setStep('type')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Change Note Type
            </Button>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {NOTE_TYPE_LABELS[noteType]}
            </Badge>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-8">Document Your Visit</h1>

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
                  Review your inputs above, then click the button below to generate your professional note.
                </p>
                <Button onClick={handleGenerateNote} disabled={generating} size="lg" className="w-full">
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Generating Note...
                    </>
                  ) : (
                    'Generate Note'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
