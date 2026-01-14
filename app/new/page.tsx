'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { NoteType } from '@/lib/types';
import NoteTypeSelector from '@/components/note-wizard/NoteTypeSelector';

export default function NewNotePage() {
  const router = useRouter();

  const handleNoteTypeSelect = (type: NoteType) => {
    if (type === 'daily_soap') {
      router.push('/daily/new');
    } else if (type === 'pt_evaluation') {
      router.push('/eval/new');
    }
  };

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
          <p className="text-slate-600">Select the type of outpatient documentation you need</p>
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
