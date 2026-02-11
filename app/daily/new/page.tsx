'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, UserCheck } from 'lucide-react';
import { NoteInputData, Template, Intervention, Episode } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import DateOfServiceForm from '@/components/note-wizard/DateOfServiceForm';
import PatientDemographicForm from '@/components/note-wizard/PatientDemographicForm';
import SubjectiveForm from '@/components/note-wizard/SubjectiveForm';
import ObjectiveForm from '@/components/note-wizard/ObjectiveForm';
import AssessmentForm from '@/components/note-wizard/AssessmentForm';
import PlanForm from '@/components/note-wizard/PlanForm';

function DailySoapNoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentClinic } = useAuth();

  const episodeId = searchParams.get('episode_id');

  const [inputData, setInputData] = useState<NoteInputData>({});
  const [template, setTemplate] = useState<Template | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Episode context state
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loadingEpisode, setLoadingEpisode] = useState(!!episodeId);
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    fetchInterventions();
    fetchDefaultTemplate();
  }, []);

  // Auto-load patient data when episode_id is present
  useEffect(() => {
    if (episodeId) {
      fetchEpisodeAndPrePopulate(episodeId);
    }
  }, [episodeId]);

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

  const fetchEpisodeAndPrePopulate = async (epId: string) => {
    setLoadingEpisode(true);
    try {
      // Fetch episode with patient data
      const episodeRes = await fetch(`/api/episodes/${epId}`);
      if (!episodeRes.ok) {
        throw new Error('Failed to fetch episode details');
      }
      const episodeData: Episode = await episodeRes.json();
      setEpisode(episodeData);

      // Build patient name from episode data
      const patientName = [episodeData.first_name, episodeData.last_name]
        .filter(Boolean)
        .join(' ');

      // Format DOB if present
      const dob = episodeData.date_of_birth
        ? new Date(episodeData.date_of_birth).toLocaleDateString('en-US')
        : undefined;

      // Determine diagnosis from episode or patient data
      const diagnosis = episodeData.diagnosis || episodeData.primary_diagnosis || undefined;

      // Pre-populate the form with patient demographics and today's date
      const prePopulatedData: NoteInputData = {
        dateOfService: new Date().toISOString().split('T')[0],
        patientDemographic: {
          patientName: patientName || undefined,
          dateOfBirth: dob,
          diagnosis: diagnosis,
          referralSource: episodeData.referring_physician || undefined,
        },
      };

      // Fetch the most recent note for this episode to carry forward ALL data
      const prevNoteData = await fetchPreviousNoteData(epId);
      if (prevNoteData) {
        // Carry forward objective data (interventions, assist level, tolerance)
        if (prevNoteData.objective) {
          prePopulatedData.objective = {
            interventions: prevNoteData.objective.interventions,
            assist_level: prevNoteData.objective.assist_level,
            tolerance: prevNoteData.objective.tolerance,
            // Don't carry forward key_measures - those are session-specific
          };
        }

        // Carry forward assessment data (impairments, progression)
        if (prevNoteData.assessment) {
          prePopulatedData.assessment = {
            impairments: prevNoteData.assessment.impairments,
            // Don't carry forward progression, response_to_treatment, or skilled_need - session-specific
          };
        }

        // Carry forward plan data (frequency, next session focus, hep)
        if (prevNoteData.plan) {
          prePopulatedData.plan = {
            frequency_duration: prevNoteData.plan.frequency_duration || episodeData.frequency || undefined,
            next_session_focus: prevNoteData.plan.next_session_focus,
            hep: prevNoteData.plan.hep,
            education_provided: prevNoteData.plan.education_provided,
          };
        } else if (episodeData.frequency) {
          prePopulatedData.plan = {
            frequency_duration: episodeData.frequency,
          };
        }
      } else if (episodeData.frequency) {
        // No previous note, but episode has frequency info
        prePopulatedData.plan = {
          frequency_duration: episodeData.frequency,
        };
      }

      setInputData(prePopulatedData);
      setAutoLoaded(true);
    } catch (err) {
      console.error('Error auto-loading episode data:', err);
      setError('Failed to auto-load patient data. You can still fill out the form manually.');
    } finally {
      setLoadingEpisode(false);
    }
  };

  const fetchPreviousNoteData = async (epId: string): Promise<NoteInputData | null> => {
    try {
      // Get the most recent document for this episode
      const res = await fetch(`/api/documents?episode_id=${epId}&doc_type=daily_note`);
      if (!res.ok) return null;

      const docs = await res.json();
      if (!docs || docs.length === 0) return null;

      // Documents are ordered by date_of_service desc, so first one is most recent
      const mostRecent = docs[0];
      return mostRecent.input_data || null;
    } catch {
      return null;
    }
  };

  const handleGenerateNote = async () => {
    if (!template) {
      setError('Missing template. Please refresh the page and try again.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      console.log('[Frontend] Sending generate note request...');
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
        let errorMessage = 'Failed to generate note';
        try {
          const errorData = await response.json();
          console.error('[Frontend] API error response:', errorData);

          errorMessage = errorData.error || errorMessage;

          if (errorData.details) {
            errorMessage += `. Details: ${errorData.details}`;
          }
        } catch (parseError) {
          console.error('[Frontend] Failed to parse error response:', parseError);
          errorMessage = `Server error (${response.status}). Please check the console logs.`;
        }
        throw new Error(errorMessage);
      }

      console.log('[Frontend] Note generated successfully');
      const generated = await response.json();

      if (!generated.note) {
        throw new Error('Generated note is empty. Please try again.');
      }

      console.log('[Frontend] Saving note to database...');
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
        const saveErrorData = await saveResponse.json().catch(() => ({}));
        console.error('[Frontend] Failed to save note:', saveErrorData);
        throw new Error(saveErrorData.error || 'Failed to save note to database');
      }

      const savedNote = await saveResponse.json();
      console.log('[Frontend] Note saved successfully');

      // If we have episode context, also create a document record linked to the episode
      if (episodeId && episode && currentClinic) {
        try {
          console.log('[Frontend] Creating document record for episode...');
          await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              episode_id: episodeId,
              clinic_id: currentClinic.clinic_id,
              patient_id: episode.patient_id,
              doc_type: 'daily_note',
              title: 'Daily Note',
              date_of_service: inputData.dateOfService || new Date().toISOString().split('T')[0],
              input_data: inputData,
              output_text: generated.note,
              billing_justification: generated.billing_justification,
              hep_summary: generated.hep_summary,
              template_id: template.id,
              legacy_note_id: savedNote.id,
            }),
          });
          console.log('[Frontend] Document record created successfully');
        } catch (docErr) {
          // Non-fatal - note was already saved, just log the error
          console.error('[Frontend] Failed to create document record:', docErr);
        }
      }

      router.push(`/notes/${savedNote.id}`);
    } catch (err) {
      console.error('[Frontend] Error in handleGenerateNote:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      setGenerating(false);
    }
  };

  const updateInputData = (section: keyof NoteInputData, data: any) => {
    setInputData((prev) => {
      const currentSection = prev[section];
      const updatedSection = typeof currentSection === 'object' && currentSection !== null
        ? { ...currentSection, ...data }
        : data;

      return {
        ...prev,
        [section]: updatedSection,
      };
    });
  };

  // Determine the back link based on context
  const backHref = episodeId ? `/charts/${episodeId}` : '/new';
  const backLabel = episodeId ? 'Back to Chart' : 'Change Note Type';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href={backHref}>
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
          <Badge variant="outline" className="text-lg px-4 py-2">
            Daily SOAP Note
          </Badge>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-8">Document Your Daily Visit</h1>

        {/* Auto-loaded patient banner */}
        {autoLoaded && episode && (
          <Alert className="mb-6 border-emerald-200 bg-emerald-50">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">
              Patient data auto-loaded for <strong>{episode.first_name} {episode.last_name}</strong>.
              Demographics and plan frequency have been pre-filled from the chart.
              You can edit any field before generating.
            </AlertDescription>
          </Alert>
        )}

        {/* Loading episode data spinner */}
        {loadingEpisode && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            <AlertDescription className="text-blue-800">
              Loading patient data from chart...
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <DateOfServiceForm
            value={inputData.dateOfService}
            onChange={(value) => setInputData((prev) => ({ ...prev, dateOfService: value }))}
          />

          <PatientDemographicForm
            data={inputData.patientDemographic}
            onChange={(data) => updateInputData('patientDemographic', data)}
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
              <Button onClick={handleGenerateNote} disabled={generating || loadingEpisode} size="lg" className="w-full">
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

export default function DailySoapNotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    }>
      <DailySoapNoteContent />
    </Suspense>
  );
}
