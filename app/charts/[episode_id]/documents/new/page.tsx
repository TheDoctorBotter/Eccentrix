'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ClinicalDocType } from '@/lib/types';

interface PageProps {
  params: { episode_id: string };
}

export default function NewDocumentPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentClinic } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const episodeId = params.episode_id;
  const docType = (searchParams.get('type') || 'daily_note') as ClinicalDocType;

  useEffect(() => {
    if (currentClinic && episodeId) {
      createDocument();
    }
  }, [currentClinic, episodeId]);

  const createDocument = async () => {
    if (!currentClinic) {
      setError('No active clinic selected');
      return;
    }

    try {
      // Fetch episode details to get patient_id
      const episodeRes = await fetch(`/api/episodes/${episodeId}`);
      if (!episodeRes.ok) {
        throw new Error('Failed to fetch episode details');
      }
      const episode = await episodeRes.json();

      // Create the document
      const docRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: episodeId,
          clinic_id: currentClinic.clinic_id,
          patient_id: episode.patient_id,
          doc_type: docType,
          title: getDocTypeTitle(docType),
          date_of_service: new Date().toISOString().split('T')[0],
        }),
      });

      if (!docRes.ok) {
        const errorData = await docRes.json();
        throw new Error(errorData.error || 'Failed to create document');
      }

      const document = await docRes.json();

      // Redirect to the document editor
      router.push(`/notes/${document.id}`);
    } catch (err) {
      console.error('Error creating document:', err);
      setError(err instanceof Error ? err.message : 'Failed to create document');
    }
  };

  const getDocTypeTitle = (type: ClinicalDocType): string => {
    const titles: Record<ClinicalDocType, string> = {
      evaluation: 'Initial Evaluation',
      re_evaluation: 'Re-Evaluation',
      daily_note: 'Daily Note',
      progress_summary: 'Progress Summary',
      discharge_summary: 'Discharge Summary',
      uploaded_document: 'Uploaded Document',
    };
    return titles[type] || 'Document';
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => router.push(`/charts/${episodeId}`)}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            Back to Chart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Creating {getDocTypeTitle(docType)}...
        </h2>
        <p className="text-slate-600">Please wait while we set up your document</p>
      </div>
    </div>
  );
}
