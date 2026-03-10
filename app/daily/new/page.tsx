'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, UserCheck, Calendar } from 'lucide-react';
import { NoteInputData, Template, Intervention, Episode, Visit, resolveDiscipline, DISCIPLINE_LABELS } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { ensureSoapHeaders } from '@/lib/note-utils';
import DateOfServiceForm from '@/components/note-wizard/DateOfServiceForm';
import PatientDemographicForm from '@/components/note-wizard/PatientDemographicForm';
import SubjectiveForm from '@/components/note-wizard/SubjectiveForm';
import ObjectiveForm from '@/components/note-wizard/ObjectiveForm';
import AssessmentForm from '@/components/note-wizard/AssessmentForm';
import PlanForm from '@/components/note-wizard/PlanForm';

function DailySoapNoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentClinic, isPaperMode } = useAuth();

  // Paper mode clinics cannot create EMR documents
  useEffect(() => {
    if (isPaperMode) {
      router.replace('/');
    }
  }, [isPaperMode, router]);

  const episodeId = searchParams.get('episode_id');
  const visitId = searchParams.get('visit_id');

  const [inputData, setInputData] = useState<NoteInputData>({});
  const [template, setTemplate] = useState<Template | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Episode context state
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loadingEpisode, setLoadingEpisode] = useState(!!episodeId || !!visitId);
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Visit context state (for auto-generated SOAP notes from completed visits)
  const [visitData, setVisitData] = useState<Visit | null>(null);

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

  // Auto-load visit data when visit_id is present (from schedule page completion)
  useEffect(() => {
    if (visitId && !episodeId) {
      fetchVisitAndPrePopulate(visitId);
    }
  }, [visitId]);

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

  const fetchVisitAndPrePopulate = async (vId: string) => {
    setLoadingEpisode(true);
    try {
      // Check if a note already exists for this visit — redirect to it instead of generating new
      const existingNotesRes = await fetch(`/api/notes?visit_id=${vId}`);
      if (existingNotesRes.ok) {
        const existingNotes = await existingNotesRes.json();
        if (existingNotes.length > 0) {
          router.replace(`/notes/${existingNotes[0].id}`);
          return;
        }
      }

      // Fetch visit data
      const visitRes = await fetch(`/api/visits/${vId}`);
      if (!visitRes.ok) {
        throw new Error('Failed to fetch visit details');
      }
      const visit: Visit = await visitRes.json();
      setVisitData(visit);

      // Extract date of service and times from visit
      const startDate = new Date(visit.start_time);
      const endDate = new Date(visit.end_time);
      const dateOfService = startDate.toISOString().split('T')[0];
      const startTime = startDate.toTimeString().slice(0, 5); // HH:MM
      const endTime = endDate.toTimeString().slice(0, 5);

      // Pre-populate form with visit data
      const prePopulatedData: NoteInputData = {
        dateOfService,
        startTime,
        endTime,
        patientDemographic: {},
      };

      // Fetch patient data if patient_id is available
      if (visit.patient_id) {
        try {
          const patientRes = await fetch(`/api/patients/${visit.patient_id}`);
          if (patientRes.ok) {
            const patient = await patientRes.json();
            const patientName = [patient.first_name, patient.last_name]
              .filter(Boolean)
              .join(' ') || patient.name || undefined;

            const dob = patient.date_of_birth
              ? new Date(patient.date_of_birth).toISOString().split('T')[0]
              : undefined;

            prePopulatedData.patientDemographic = {
              patientName,
              dateOfBirth: dob,
              diagnosis: patient.diagnosis || patient.primary_diagnosis || undefined,
              insuranceId: patient.insurance_id || undefined,
              allergies: patient.allergies || undefined,
              precautions: patient.precautions || undefined,
            };
          }
        } catch (patErr) {
          console.error('Error fetching patient data for visit:', patErr);
        }
      }

      // If the visit has an episode_id, try to also load episode-level data
      if (visit.episode_id) {
        try {
          const episodeRes = await fetch(`/api/episodes/${visit.episode_id}`);
          if (episodeRes.ok) {
            const episodeData: Episode = await episodeRes.json();
            setEpisode(episodeData);

            // Enrich demographics from episode if not already set
            const diagnosisCodes = episodeData.diagnosis_codes as string[] | null;
            const medicalDx = diagnosisCodes && diagnosisCodes.length > 0
              ? diagnosisCodes.join(', ')
              : (episodeData.diagnosis || episodeData.primary_diagnosis || undefined);

            const treatmentDxCodes = episodeData.treatment_diagnosis_codes as Array<{ code: string; description: string }> | null;
            const treatmentDx = treatmentDxCodes && treatmentDxCodes.length > 0
              ? treatmentDxCodes.map(d => `${d.code} - ${d.description}`).join(', ')
              : undefined;

            prePopulatedData.patientDemographic = {
              ...prePopulatedData.patientDemographic,
              diagnosis: prePopulatedData.patientDemographic?.diagnosis || medicalDx,
              treatmentDiagnosis: treatmentDx,
              referralSource: episodeData.referring_physician || undefined,
              insuranceId: prePopulatedData.patientDemographic?.insuranceId || episodeData.insurance_id || undefined,
              allergies: prePopulatedData.patientDemographic?.allergies || episodeData.allergies || undefined,
              precautions: prePopulatedData.patientDemographic?.precautions || episodeData.precautions || undefined,
            };

            if (episodeData.frequency) {
              prePopulatedData.plan = { frequency_duration: episodeData.frequency };
            }

            // Also try to carry forward from previous notes in this episode
            const prevNoteData = await fetchPreviousNoteData(visit.episode_id);
            if (prevNoteData) {
              if (prevNoteData.objective) {
                prePopulatedData.objective = {
                  interventions: prevNoteData.objective.interventions,
                  assist_level: prevNoteData.objective.assist_level,
                  tolerance: prevNoteData.objective.tolerance,
                };
              }
              if (prevNoteData.assessment) {
                prePopulatedData.assessment = {
                  impairments: prevNoteData.assessment.impairments,
                };
              }
              if (prevNoteData.plan) {
                prePopulatedData.plan = {
                  frequency_duration: prevNoteData.plan.frequency_duration || episodeData.frequency || undefined,
                  next_session_focus: prevNoteData.plan.next_session_focus,
                  hep: prevNoteData.plan.hep,
                  education_provided: prevNoteData.plan.education_provided,
                };
              }
            }
          }
        } catch (epErr) {
          console.error('Error fetching episode data for visit:', epErr);
        }
      }

      setInputData(prePopulatedData);
      setAutoLoaded(true);
    } catch (err) {
      console.error('Error auto-loading visit data:', err);
      setError('Failed to auto-load visit data. You can still fill out the form manually.');
    } finally {
      setLoadingEpisode(false);
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

      // Format DOB as YYYY-MM-DD for the date input field
      const dob = episodeData.date_of_birth
        ? new Date(episodeData.date_of_birth).toISOString().split('T')[0]
        : undefined;

      // Use ICD-10 codes from episode when available, fall back to text diagnosis
      const diagnosisCodes = episodeData.diagnosis_codes as string[] | null;
      const medicalDx = diagnosisCodes && diagnosisCodes.length > 0
        ? diagnosisCodes.join(', ')
        : (episodeData.diagnosis || episodeData.primary_diagnosis || undefined);

      // Extract treatment diagnosis from ICD-10 codes if available
      const treatmentDxCodes = episodeData.treatment_diagnosis_codes as Array<{ code: string; description: string }> | null;
      const treatmentDx = treatmentDxCodes && treatmentDxCodes.length > 0
        ? treatmentDxCodes.map(d => `${d.code} - ${d.description}`).join(', ')
        : undefined;

      // Pre-populate the form with patient demographics and today's date
      const prePopulatedData: NoteInputData = {
        dateOfService: new Date().toISOString().split('T')[0],
        patientDemographic: {
          patientName: patientName || undefined,
          dateOfBirth: dob,
          diagnosis: medicalDx,
          treatmentDiagnosis: treatmentDx,
          referralSource: episodeData.referring_physician || undefined,
          insuranceId: episodeData.insurance_id || undefined,
          allergies: episodeData.allergies || undefined,
          precautions: episodeData.precautions || undefined,
        },
      };

      // Fetch the most recent note for this episode to carry forward ALL data
      const prevNoteData = await fetchPreviousNoteData(epId);
      if (prevNoteData) {
        // Carry forward demographic fields that aren't set from episode
        if (prevNoteData.patientDemographic) {
          prePopulatedData.patientDemographic = {
            ...prePopulatedData.patientDemographic,
            treatmentDiagnosis: prePopulatedData.patientDemographic?.treatmentDiagnosis || prevNoteData.patientDemographic.treatmentDiagnosis,
            allergies: prePopulatedData.patientDemographic?.allergies || prevNoteData.patientDemographic.allergies,
            precautions: prePopulatedData.patientDemographic?.precautions || prevNoteData.patientDemographic.precautions,
            insuranceId: prePopulatedData.patientDemographic?.insuranceId || prevNoteData.patientDemographic.insuranceId,
          };
        }

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
          discipline: resolveDiscipline(visitData?.discipline),
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

      console.log('[Frontend] Raw generated.note (first 400 chars):', generated.note.substring(0, 400));
      console.log('[Frontend] Has SUBJECTIVE in raw note:', /SUBJECTIVE/i.test(generated.note));

      // Ensure SOAP headers are always present in the output text
      const noteText = ensureSoapHeaders(generated.note);

      console.log('[Frontend] After ensureSoapHeaders (first 400 chars):', noteText.substring(0, 400));
      console.log('[Frontend] Has SUBJECTIVE after enforcement:', /SUBJECTIVE/i.test(noteText));

      console.log('[Frontend] Saving note to database...');
      const saveResponse = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_type: 'daily_soap',
          input_data: inputData,
          output_text: noteText,
          billing_justification: null,
          hep_summary: null,
          template_id: template.id,
          clinic_id: currentClinic?.clinic_id || null,
          patient_id: visitData?.patient_id || episode?.patient_id || null,
          visit_id: visitId || null,
        }),
      });

      if (!saveResponse.ok) {
        const saveErrorData = await saveResponse.json().catch(() => ({}));
        console.error('[Frontend] Failed to save note:', saveErrorData);
        throw new Error(saveErrorData.error || 'Failed to save note to database');
      }

      const savedNote = await saveResponse.json();
      console.log('[Frontend] Note saved successfully');

      // Create a document record linked to the patient's episode
      const effectivePatientId = visitData?.patient_id || episode?.patient_id;
      const clinicId = currentClinic?.clinic_id;
      if (effectivePatientId && clinicId) {
        try {
          let docEpisodeId = episodeId || visitData?.episode_id || episode?.id;

          // If no episode_id available, look up the patient's active episode
          if (!docEpisodeId) {
            const epRes = await fetch(`/api/episodes?patient_id=${effectivePatientId}&status=active`);
            if (epRes.ok) {
              const episodes = await epRes.json();
              if (episodes.length > 0) {
                docEpisodeId = episodes[0].id;
              }
            }
          }

          if (docEpisodeId) {
            console.log('[Frontend] Creating document record for episode...');
            await fetch('/api/documents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                episode_id: docEpisodeId,
                clinic_id: clinicId,
                patient_id: effectivePatientId,
                doc_type: 'daily_note',
                title: 'Daily Note',
                date_of_service: inputData.dateOfService || new Date().toISOString().split('T')[0],
                input_data: inputData,
                output_text: noteText,
                billing_justification: null,
                hep_summary: null,
                template_id: template.id,
                legacy_note_id: savedNote.id,
              }),
            });
            console.log('[Frontend] Document record created successfully');
          } else {
            console.log('[Frontend] No episode found for patient — skipping document creation');
          }
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
  const backHref = episodeId ? `/charts/${episodeId}` : visitId ? '/schedule' : '/new';
  const backLabel = episodeId ? 'Back to Chart' : visitId ? 'Back to Schedule' : 'Change Note Type';

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
            {DISCIPLINE_LABELS[resolveDiscipline(visitData?.discipline)]} Daily Note
          </Badge>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-8">Document Your Daily Visit</h1>

        {/* Auto-loaded patient banner */}
        {autoLoaded && episode && !visitData && (
          <Alert className="mb-6 border-emerald-200 bg-emerald-50">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">
              Patient data auto-loaded for <strong>{episode.first_name} {episode.last_name}</strong>.
              Demographics and plan frequency have been pre-filled from the chart.
              You can edit any field before generating.
            </AlertDescription>
          </Alert>
        )}

        {/* Auto-loaded from completed visit banner */}
        {autoLoaded && visitData && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Calendar className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              SOAP note pre-filled from completed visit ({visitData.visit_type === 'evaluation' ? 'Evaluation' : 'Treatment'}).
              Date of service, times{inputData.patientDemographic?.patientName ? ', and patient demographics' : ''} have been pre-populated.
              Review and complete all sections before generating.
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
            startTime={inputData.startTime}
            endTime={inputData.endTime}
            onChange={(value) => setInputData((prev) => ({ ...prev, dateOfService: value }))}
            onStartTimeChange={(value) => setInputData((prev) => ({ ...prev, startTime: value }))}
            onEndTimeChange={(value) => setInputData((prev) => ({ ...prev, endTime: value }))}
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
            discipline={resolveDiscipline(visitData?.discipline)}
            onChange={(data) => updateInputData('assessment', data)}
          />

          <PlanForm
            data={inputData.plan}
            discipline={resolveDiscipline(visitData?.discipline)}
            onChange={(data) => updateInputData('plan', data)}
          />

          <Card className="border-2 border-blue-200">
            <CardHeader>
              <CardTitle>Ready to Generate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 mb-4">
                Review your inputs above, then click the button below to generate your {DISCIPLINE_LABELS[resolveDiscipline(visitData?.discipline)]} Daily Note.
              </p>
              <Button onClick={handleGenerateNote} disabled={generating || loadingEpisode} size="lg" className="w-full">
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating Note...
                  </>
                ) : (
                  'Generate Daily Note'
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
