'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Plus,
  Settings,
  BookOpen,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { Note, NOTE_TYPE_LABELS } from '@/lib/types';
import { format } from 'date-fns';

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    await seedDatabaseIfNeeded();
    await fetchRecentNotes();
  };

  const seedDatabaseIfNeeded = async () => {
    try {
      const response = await fetch('/api/seed', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        if (!data.skipped) {
          console.log('Database seeded successfully');
        }
      }
    } catch (error) {
      console.error('Error seeding database:', error);
    }
  };

  const fetchRecentNotes = async () => {
    try {
      const response = await fetch('/api/notes?limit=10');
      if (response.ok) {
        const data = await response.json();
        setNotes(data);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setNotes(notes.filter((note) => note.id !== id));
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              PT Note Writer
            </h1>
            <p className="text-slate-600">
              AI-powered physical therapy documentation
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/templates">
              <Button variant="outline" size="lg">
                <BookOpen className="mr-2 h-5 w-5" />
                Templates
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" size="lg">
                <Settings className="mr-2 h-5 w-5" />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        <Alert className="mb-8 border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>Important:</strong> This generates draft documentation.
            Clinician must review all content before use. Do not enter Protected
            Health Information (PHI).
          </AlertDescription>
        </Alert>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card className="border-2 border-slate-200 hover:border-blue-300 transition-colors cursor-pointer">
            <Link href="/new">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">Create New Note</CardTitle>
                    <CardDescription className="mt-2">
                      Generate a professional PT note with AI assistance
                    </CardDescription>
                  </div>
                  <Plus className="h-12 w-12 text-blue-600" />
                </div>
              </CardHeader>
            </Link>
          </Card>

          <Card className="border-2 border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Total Notes</span>
                  <span className="text-2xl font-bold text-slate-900">
                    {notes.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">This Week</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {
                      notes.filter(
                        (n) =>
                          new Date(n.created_at) >
                          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                      ).length
                    }
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Recent Notes</CardTitle>
            <CardDescription>
              Your recently generated documentation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-slate-500">
                Loading notes...
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4">No notes yet</p>
                <Link href="/new">
                  <Button>Create Your First Note</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline">
                          {NOTE_TYPE_LABELS[note.note_type]}
                        </Badge>
                        <span className="text-sm text-slate-500">
                          {format(
                            new Date(note.created_at),
                            'MMM d, yyyy h:mm a'
                          )}
                        </span>
                      </div>
                      {note.input_data?.patient_context?.diagnosis && (
                        <p className="text-sm text-slate-700">
                          {note.input_data.patient_context.diagnosis}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/notes/${note.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteNote(note.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
