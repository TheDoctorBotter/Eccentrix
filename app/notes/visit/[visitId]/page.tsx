'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import NoteEditor, { Note } from '@/components/notes/NoteEditor';

type Discipline = 'PT' | 'OT' | 'ST';
type NoteType = 'daily_soap' | 'evaluation' | 're_evaluation' | 'discharge';

interface Visit {
  id: string;
  discipline: string | null;
  patient_id: string | null;
  clinic_id: string | null;
  therapist_user_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
}

export default function VisitNotePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const visitId = params.visitId as string;
  const noteTypeParam = (searchParams.get('type') as NoteType) || 'daily_soap';

  const [visit, setVisit] = useState<Visit | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visitId) {
      loadVisitAndNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId, noteTypeParam]);

  async function loadVisitAndNote() {
    setLoading(true);
    setError(null);

    try {
      // 1) Load visit record
      const visitRes = await fetch(`/api/visits/${visitId}`);
      if (!visitRes.ok) {
        throw new Error('Visit not found');
      }
      const visitData: Visit = await visitRes.json();
      setVisit(visitData);

      // 2) Check for existing note for this visit + note_type
      const notesRes = await fetch(
        `/api/notes?visit_id=${visitId}&limit=1`
      );
      if (!notesRes.ok) {
        throw new Error('Failed to fetch notes');
      }

      const notesData: Note[] = await notesRes.json();
      // Filter to matching note_type
      const existing = notesData.find(
        (n) => n.note_type === noteTypeParam
      );

      if (existing) {
        // Draft (or final) already exists — load it
        setNote(existing);
      } else {
        // No note exists — create exactly one draft via upsert
        const createRes = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note_type: noteTypeParam,
            visit_id: visitId,
            discipline: resolveDiscipline(visitData.discipline),
            clinic_id: visitData.clinic_id || null,
            patient_id: visitData.patient_id || null,
            therapist_id: visitData.therapist_user_id || null,
            status: 'draft',
            input_data: {},
            output_text: '',
          }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to create draft note');
        }

        const newNote: Note = await createRes.json();
        setNote(newNote);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function resolveDiscipline(d: string | null | undefined): Discipline {
    if (d === 'OT') return 'OT';
    if (d === 'ST') return 'ST';
    return 'PT';
  }

  function handleFinalize(finalizedNote: Note) {
    setNote(finalizedNote);
  }

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading visit documentation...
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Error state
  // --------------------------------------------------------------------------

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/schedule">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Schedule
            </Button>
          </Link>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const discipline = resolveDiscipline(visit?.discipline);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/schedule">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Schedule
          </Button>
        </Link>

        {note && visit && (
          <NoteEditor
            discipline={discipline}
            noteType={noteTypeParam}
            visitId={visitId}
            patientId={visit.patient_id || ''}
            clinicId={visit.clinic_id || ''}
            therapistId={visit.therapist_user_id || undefined}
            existingNote={note}
            onFinalize={handleFinalize}
          />
        )}
      </div>
    </div>
  );
}
