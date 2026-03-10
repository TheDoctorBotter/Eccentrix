'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Lock,
} from 'lucide-react';

// PT discipline forms
import PTDailySOAP from './pt/PTDailySOAP';
import PTEvaluation from './pt/PTEvaluation';
import PTReEvaluation from './pt/PTReEvaluation';
import PTDischarge from './pt/PTDischarge';
import type { PTFormData } from '@/types/notes/pt';
import { createEmptyPTFormData } from '@/types/notes/pt';

// OT discipline forms
import OTDailySOAP from './ot/OTDailySOAP';
import OTEvaluation from './ot/OTEvaluation';
import OTReEvaluation from './ot/OTReEvaluation';
import OTDischarge from './ot/OTDischarge';
import type { OTFormData } from '@/types/notes/ot';
import { createEmptyOTFormData } from '@/types/notes/ot';

// ST discipline forms
import STDailySOAP from './st/STDailySOAP';
import STEvaluation from './st/STEvaluation';
import STReEvaluation from './st/STReEvaluation';
import STDischarge from './st/STDischarge';
import type { STFormData } from '@/types/notes/st';
import { createEmptySTFormData } from '@/types/notes/st';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  visit_id: string | null;
  note_type: string | null;
  discipline: string | null;
  clinic_id: string | null;
  patient_id: string | null;
  therapist_id: string | null;
  form_data: Record<string, unknown> | null;
  ai_narrative: string | null;
  medical_necessity: string | null;
  status: string;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
}

export interface NoteEditorProps {
  discipline: 'PT' | 'OT' | 'ST';
  noteType: 'daily_soap' | 'evaluation' | 're_evaluation' | 'discharge';
  visitId: string;
  patientId: string;
  clinicId: string;
  therapistId?: string;
  existingNote?: Note;
  onFinalize: (note: Note) => void;
  /** Visit actual duration for 8-minute rule unit calculation */
  visitDurationMinutes?: number;
  /** Patient primary diagnosis for ICD-10 pre-population */
  patientDiagnosis?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NoteEditor({
  discipline,
  noteType,
  visitId,
  patientId,
  clinicId,
  therapistId,
  existingNote,
  onFinalize,
  visitDurationMinutes,
  patientDiagnosis,
}: NoteEditorProps) {
  // ---- State ----
  const [note, setNote] = useState<Note | null>(existingNote ?? null);
  const [formData, setFormData] = useState<Record<string, unknown>>(
    existingNote?.form_data ?? {}
  );
  const [narrative, setNarrative] = useState(existingNote?.ai_narrative ?? '');
  const [medicalNecessity, setMedicalNecessity] = useState(
    existingNote?.medical_necessity ?? ''
  );
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isFinalized = note?.status === 'final';

  // Debounce refs
  const narrativeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const necessityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when existingNote changes (e.g. after upsert on mount)
  useEffect(() => {
    if (existingNote) {
      setNote(existingNote);
      setFormData(existingNote.form_data ?? {});
      setNarrative(existingNote.ai_narrative ?? '');
      setMedicalNecessity(existingNote.medical_necessity ?? '');
    }
  }, [existingNote]);

  // ------------------------------------------------------------------
  // Auto-save helpers (debounced PATCH on blur)
  // ------------------------------------------------------------------

  const saveDraft = useCallback(
    async (fields: Record<string, unknown>) => {
      if (!note?.id || isFinalized) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save');
        }
        const updated = await res.json();
        setNote(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [note?.id, isFinalized]
  );

  const handleNarrativeBlur = useCallback(() => {
    if (narrativeTimer.current) clearTimeout(narrativeTimer.current);
    narrativeTimer.current = setTimeout(() => {
      saveDraft({ ai_narrative: narrative });
    }, 300);
  }, [narrative, saveDraft]);

  const handleNecessityBlur = useCallback(() => {
    if (necessityTimer.current) clearTimeout(necessityTimer.current);
    necessityTimer.current = setTimeout(() => {
      saveDraft({ medical_necessity: medicalNecessity });
    }, 300);
  }, [medicalNecessity, saveDraft]);

  // ------------------------------------------------------------------
  // Form data change handler (for future discipline-specific children)
  // ------------------------------------------------------------------

  const handleFormDataChange = useCallback(
    (updated: Record<string, unknown>) => {
      setFormData(updated);
      // Also persist form_data to the draft
      if (note?.id && !isFinalized) {
        saveDraft({ form_data: updated });
      }
    },
    [note?.id, isFinalized, saveDraft]
  );

  // ------------------------------------------------------------------
  // Discipline-specific form routing
  // ------------------------------------------------------------------

  const FormComponent = useMemo(() => {
    if (discipline === 'PT') {
      if (noteType === 'daily_soap') return PTDailySOAP;
      if (noteType === 'evaluation') return PTEvaluation;
      if (noteType === 're_evaluation') return PTReEvaluation;
      if (noteType === 'discharge') return PTDischarge;
    }
    if (discipline === 'OT') {
      if (noteType === 'daily_soap') return OTDailySOAP;
      if (noteType === 'evaluation') return OTEvaluation;
      if (noteType === 're_evaluation') return OTReEvaluation;
      if (noteType === 'discharge') return OTDischarge;
    }
    if (discipline === 'ST') {
      if (noteType === 'daily_soap') return STDailySOAP;
      if (noteType === 'evaluation') return STEvaluation;
      if (noteType === 're_evaluation') return STReEvaluation;
      if (noteType === 'discharge') return STDischarge;
    }
    return null;
  }, [discipline, noteType]);

  // Ensure discipline form data is initialized with the correct shape
  useEffect(() => {
    if (formData && !formData.meta) {
      if (discipline === 'PT') {
        const initial = createEmptyPTFormData(noteType);
        setFormData(initial as unknown as Record<string, unknown>);
      } else if (discipline === 'OT') {
        const initial = createEmptyOTFormData(noteType);
        setFormData(initial as unknown as Record<string, unknown>);
      } else if (discipline === 'ST') {
        const initial = createEmptySTFormData(noteType);
        setFormData(initial as unknown as Record<string, unknown>);
      }
    }
  }, [discipline, noteType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Generate Draft
  // ------------------------------------------------------------------

  const handleGenerate = async () => {
    if (!note?.id) return;
    setGenerating(true);
    setError(null);
    setMissingFields([]);

    try {
      const res = await fetch('/api/notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discipline,
          noteType,
          formData,
          patientContext: {
            patientId,
            clinicId,
            visitId,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Generation failed');
      }

      const result = await res.json();

      setNarrative(result.narrative);
      setMedicalNecessity(result.medicalNecessity || '');
      if (result.missingFields?.length) {
        setMissingFields(result.missingFields);
      }

      // Persist generated content to the draft
      await saveDraft({
        ai_narrative: result.narrative,
        medical_necessity: result.medicalNecessity || '',
        form_data: formData,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ------------------------------------------------------------------
  // Finalize
  // ------------------------------------------------------------------

  const handleFinalize = async () => {
    if (!note?.id) return;
    setFinalizing(true);
    setError(null);

    try {
      const res = await fetch(`/api/notes/${note.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: therapistId || '',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Finalization failed');
      }

      const result = await res.json();
      const finalizedNote = result.note as Note;
      setNote(finalizedNote);
      setConfirmOpen(false);
      onFinalize(finalizedNote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finalization failed');
    } finally {
      setFinalizing(false);
    }
  };

  // ------------------------------------------------------------------
  // Discipline labels
  // ------------------------------------------------------------------

  const disciplineLabel =
    discipline === 'PT'
      ? 'Physical Therapy'
      : discipline === 'OT'
        ? 'Occupational Therapy'
        : 'Speech Therapy';

  const noteTypeLabel =
    noteType === 'daily_soap'
      ? 'Daily SOAP Note'
      : noteType === 'evaluation'
        ? 'Evaluation'
        : noteType === 're_evaluation'
          ? 'Re-Evaluation'
          : 'Discharge Summary';

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {disciplineLabel} &mdash; {noteTypeLabel}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Visit: {visitId.slice(0, 8)}&hellip;
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFinalized && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              <Lock className="mr-1 h-3 w-3" />
              Finalized
            </Badge>
          )}
          {saving && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
          {saveSuccess && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Missing fields warning */}
      {missingFields.length > 0 && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Missing fields:</strong> The following clinically required
            fields were not provided and are noted as &quot;not documented&quot;
            in the draft:
            <ul className="mt-1 ml-4 list-disc">
              {missingFields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ============================================================== */}
      {/* 1) Form Section — discipline-specific content */}
      {/* ============================================================== */}
      {FormComponent ? (
        <FormComponent
          formData={formData as unknown as PTFormData & OTFormData & STFormData}
          onChange={(data: PTFormData | OTFormData | STFormData) =>
            handleFormDataChange(data as unknown as Record<string, unknown>)
          }
          readOnly={isFinalized}
          visitDurationMinutes={visitDurationMinutes}
          patientDiagnosis={patientDiagnosis}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical Data Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              <p>
                Discipline-specific form fields for{' '}
                <strong>{discipline}</strong> will be available soon.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================== */}
      {/* 2) Generate Draft Button */}
      {/* ============================================================== */}
      {!isFinalized && (
        <div className="flex justify-center">
          <Button
            onClick={handleGenerate}
            disabled={generating || !note?.id}
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Draft...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Draft
              </>
            )}
          </Button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3) Narrative Section */}
      {/* ============================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Narrative</CardTitle>
        </CardHeader>
        <CardContent>
          {isFinalized ? (
            <div className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 p-4 rounded-md">
              {narrative || 'No narrative generated.'}
            </div>
          ) : (
            <Textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              onBlur={handleNarrativeBlur}
              placeholder="AI-generated narrative will appear here. You can edit freely before finalizing."
              className="min-h-[200px] text-sm"
            />
          )}
        </CardContent>
      </Card>

      {/* ============================================================== */}
      {/* 4) Medical Necessity Section */}
      {/* ============================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Medical Necessity</CardTitle>
        </CardHeader>
        <CardContent>
          {isFinalized ? (
            <div className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 p-4 rounded-md">
              {medicalNecessity || 'No medical necessity statement generated.'}
            </div>
          ) : (
            <Textarea
              value={medicalNecessity}
              onChange={(e) => setMedicalNecessity(e.target.value)}
              onBlur={handleNecessityBlur}
              placeholder="Medical necessity justification will appear here after generation. You can edit freely before finalizing."
              className="min-h-[100px] text-sm"
            />
          )}
        </CardContent>
      </Card>

      {/* ============================================================== */}
      {/* 5) Finalize Button */}
      {/* ============================================================== */}
      {!isFinalized && (
        <div className="flex justify-end">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!note?.id || !narrative}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Finalize Note
          </Button>
        </div>
      )}

      {/* Finalize confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Note</DialogTitle>
            <DialogDescription>
              Finalized notes cannot be edited. Are you sure you want to
              finalize this {noteTypeLabel.toLowerCase()}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={finalizing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {finalizing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalizing...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Confirm Finalize
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
