'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Loader2,
  Printer,
  Trash2,
  Search,
  Check,
  Video,
  ExternalLink,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { HepProgram, Exercise, Episode, EXERCISE_CATEGORIES, BODY_REGIONS } from '@/lib/types';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function HepPage() {
  const { currentClinic, loading: authLoading, user } = useAuth();

  const [programs, setPrograms] = useState<HepProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New HEP dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Patient/Episode
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');

  // Step 2: Program details
  const [programName, setProgramName] = useState('');
  const [programFrequency, setProgramFrequency] = useState('');
  const [programInstructions, setProgramInstructions] = useState('');

  // Step 3: Exercise selection
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<
    Array<{
      exercise_id: string;
      exercise: Exercise;
      sets: string;
      reps: string;
      hold: string;
    }>
  >([]);

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id) return;
    fetchPrograms();
  }, [authLoading, currentClinic?.clinic_id]);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/hep?clinic_id=${currentClinic?.clinic_id}`);
      if (!res.ok) throw new Error('Failed to fetch HEP programs');
      const data = await res.json();
      setPrograms(data);
    } catch (error) {
      console.error('Error fetching HEP programs:', error);
      toast.error('Failed to load HEP programs');
    } finally {
      setLoading(false);
    }
  };

  const fetchEpisodes = async () => {
    try {
      const res = await fetch(
        `/api/episodes?clinic_id=${currentClinic?.clinic_id}&status=active`
      );
      if (res.ok) {
        const data = await res.json();
        setEpisodes(data);
      }
    } catch (error) {
      console.error('Error fetching episodes:', error);
    }
  };

  const fetchExercises = async () => {
    try {
      const res = await fetch(
        `/api/exercises?clinic_id=${currentClinic?.clinic_id}`
      );
      if (res.ok) {
        const data = await res.json();
        setAllExercises(data);
      }
    } catch (error) {
      console.error('Error fetching exercises:', error);
    }
  };

  const handleOpenCreateDialog = () => {
    setCreateStep(1);
    setSelectedEpisodeId('');
    setSelectedPatientId('');
    setProgramName('');
    setProgramFrequency('');
    setProgramInstructions('');
    setSelectedExercises([]);
    setExerciseSearch('');
    setCreateDialogOpen(true);
    fetchEpisodes();
    fetchExercises();
  };

  const handleEpisodeSelect = (episodeId: string) => {
    setSelectedEpisodeId(episodeId);
    const ep = episodes.find((e) => e.id === episodeId);
    if (ep) {
      setSelectedPatientId(ep.patient_id);
    }
  };

  const handleToggleExercise = (exercise: Exercise) => {
    setSelectedExercises((prev) => {
      const exists = prev.find((e) => e.exercise_id === exercise.id);
      if (exists) {
        return prev.filter((e) => e.exercise_id !== exercise.id);
      }
      return [
        ...prev,
        {
          exercise_id: exercise.id,
          exercise,
          sets: exercise.default_sets || '',
          reps: exercise.default_reps || '',
          hold: exercise.default_hold || '',
        },
      ];
    });
  };

  const handleUpdateExercisePrescription = (
    exerciseId: string,
    field: 'sets' | 'reps' | 'hold',
    value: string
  ) => {
    setSelectedExercises((prev) =>
      prev.map((e) =>
        e.exercise_id === exerciseId ? { ...e, [field]: value } : e
      )
    );
  };

  const handleCreateProgram = async () => {
    if (!selectedEpisodeId || !selectedPatientId || !programName) {
      toast.error('Please complete all required fields');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/hep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          episode_id: selectedEpisodeId,
          clinic_id: currentClinic?.clinic_id,
          name: programName,
          frequency: programFrequency || null,
          instructions: programInstructions || null,
          assigned_by: user?.id || null,
          exercises: selectedExercises.map((e, i) => ({
            exercise_id: e.exercise_id,
            sort_order: i,
            sets: e.sets || null,
            reps: e.reps || null,
            hold: e.hold || null,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to create HEP program');
      const data = await res.json();
      setPrograms((prev) => [data, ...prev]);
      setCreateDialogOpen(false);
      toast.success('HEP program created');
    } catch (error) {
      console.error('Error creating HEP program:', error);
      toast.error('Failed to create HEP program');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProgram = async (programId: string) => {
    if (!confirm('Are you sure you want to delete this HEP program?')) return;
    try {
      const res = await fetch(`/api/hep/${programId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete HEP program');
      setPrograms((prev) => prev.filter((p) => p.id !== programId));
      toast.success('HEP program deleted');
    } catch (error) {
      console.error('Error deleting HEP program:', error);
      toast.error('Failed to delete HEP program');
    }
  };

  const handlePrint = (program: HepProgram) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const exercises = program.exercises || (program as any).hep_program_exercises || [];
    const exerciseRows = exercises
      .map((pe: any) => {
        const ex = pe.exercise || pe;
        const videoLink = ex.video_url
          ? `<a href="${ex.video_url}" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 12px;">Watch Video</a>`
          : '';
        return `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${ex.name || 'N/A'}
              ${videoLink ? `<br/>${videoLink}` : ''}
            </td>
            <td style="padding: 8px; border: 1px solid #ddd;">${ex.instructions || pe.special_instructions || ''}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${pe.sets || ex.default_sets || ''}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${pe.reps || ex.default_reps || ''}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${pe.hold || ex.default_hold || ''}</td>
          </tr>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>HEP - ${program.name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 16px; color: #666; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th { background-color: #f3f4f6; padding: 8px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
            td { font-size: 13px; }
            .instructions { margin-top: 16px; font-size: 13px; color: #444; }
            .frequency { font-size: 14px; margin-bottom: 8px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Home Exercise Program: ${program.name}</h1>
          <h2>Start Date: ${program.start_date ? format(new Date(program.start_date), 'MM/dd/yyyy') : 'N/A'}</h2>
          ${program.frequency ? `<p class="frequency"><strong>Frequency:</strong> ${program.frequency}</p>` : ''}
          <table>
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Instructions</th>
                <th>Sets</th>
                <th>Reps</th>
                <th>Hold</th>
              </tr>
            </thead>
            <tbody>
              ${exerciseRows}
            </tbody>
          </table>
          ${program.instructions ? `<div class="instructions"><strong>Additional Instructions:</strong><br/>${program.instructions}</div>` : ''}
          <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #94a3b8; text-align: center;">
            Exercise videos powered by PTBot
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'completed':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'paused':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'discontinued':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const filteredExercisesForSelection = allExercises.filter((ex) => {
    if (!exerciseSearch) return true;
    return (
      ex.name.toLowerCase().includes(exerciseSearch.toLowerCase()) ||
      ex.category.toLowerCase().includes(exerciseSearch.toLowerCase()) ||
      ex.body_region?.toLowerCase().includes(exerciseSearch.toLowerCase())
    );
  });

  // Group programs by patient
  const groupedPrograms = programs.reduce(
    (acc, program) => {
      const patientId = program.patient_id || 'unknown';
      if (!acc[patientId]) {
        acc[patientId] = [];
      }
      acc[patientId].push(program);
      return acc;
    },
    {} as Record<string, HepProgram[]>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              HEP Management
            </h1>
            <p className="text-slate-500 mt-1">
              Create and manage home exercise programs for patients
              <span className="ml-2 text-xs text-blue-600 font-medium">Powered by PTBot</span>
            </p>
          </div>
          <Button className="gap-2" onClick={handleOpenCreateDialog}>
            <Plus className="h-4 w-4" />
            New HEP
          </Button>
        </div>

        {/* Programs List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : programs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">
                No HEP programs yet
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Create a home exercise program to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedPrograms).map(([patientId, patientPrograms]) => (
              <div key={patientId}>
                <h2 className="text-sm font-medium text-slate-500 mb-3 uppercase tracking-wide">
                  Patient: {patientId.slice(0, 8)}...
                </h2>
                <div className="space-y-3">
                  {(patientPrograms as HepProgram[]).map((program) => {
                    const isExpanded = expandedId === program.id;
                    const exercises =
                      program.exercises || (program as any).hep_program_exercises || [];
                    return (
                      <Card key={program.id}>
                        <CardHeader
                          className="cursor-pointer pb-3"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : program.id)
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <CardTitle className="text-base">
                                {program.name}
                              </CardTitle>
                              <Badge
                                variant="outline"
                                className={getStatusColor(program.status)}
                              >
                                {program.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">
                                {exercises.length} exercise
                                {exercises.length !== 1 ? 's' : ''}
                              </span>
                              <span className="text-xs text-slate-400">
                                {program.start_date
                                  ? format(
                                      new Date(program.start_date),
                                      'MMM d, yyyy'
                                    )
                                  : ''}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              )}
                            </div>
                          </div>
                          {program.frequency && (
                            <p className="text-xs text-slate-500 mt-1">
                              Frequency: {program.frequency}
                            </p>
                          )}
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="pt-0">
                            {exercises.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Exercise</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead className="text-center">Sets</TableHead>
                                    <TableHead className="text-center">Reps</TableHead>
                                    <TableHead className="text-center">Hold</TableHead>
                                    <TableHead>Instructions</TableHead>
                                    <TableHead className="text-center">Video</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {exercises.map((pe: any) => {
                                    const ex = pe.exercise || pe;
                                    return (
                                      <TableRow key={pe.id}>
                                        <TableCell className="font-medium">
                                          {ex.name || 'Unknown Exercise'}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="text-xs">
                                            {ex.category || 'N/A'}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {pe.sets || ex.default_sets || '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {pe.reps || ex.default_reps || '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {pe.hold || ex.default_hold || '-'}
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                                          {pe.special_instructions ||
                                            ex.instructions ||
                                            '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {ex.video_url ? (
                                            <a
                                              href={ex.video_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Video className="h-3.5 w-3.5" />
                                            </a>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="text-sm text-slate-500 py-4 text-center">
                                No exercises in this program
                              </p>
                            )}
                            {program.instructions && (
                              <div className="mt-3 p-3 bg-slate-50 rounded-md">
                                <p className="text-xs font-medium text-slate-700">
                                  Additional Instructions
                                </p>
                                <p className="text-sm text-slate-600 mt-1">
                                  {program.instructions}
                                </p>
                              </div>
                            )}
                            <div className="flex gap-2 mt-4">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => handlePrint(program)}
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Print HEP
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteProgram(program.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </Button>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create HEP Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Create New HEP Program - Step {createStep} of 3
              </DialogTitle>
              <DialogDescription>
                {createStep === 1 && 'Select a patient and episode'}
                {createStep === 2 && 'Set program details'}
                {createStep === 3 && 'Add exercises to the program'}
              </DialogDescription>
            </DialogHeader>

            {/* Step 1: Patient/Episode */}
            {createStep === 1 && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Active Episode / Patient</Label>
                  <Select
                    value={selectedEpisodeId}
                    onValueChange={handleEpisodeSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an episode..." />
                    </SelectTrigger>
                    <SelectContent>
                      {episodes.map((ep) => (
                        <SelectItem key={ep.id} value={ep.id}>
                          {ep.first_name} {ep.last_name} - {ep.diagnosis || 'No diagnosis'}{' '}
                          ({format(new Date(ep.start_date), 'MM/dd/yyyy')})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {episodes.length === 0 && (
                    <p className="text-xs text-slate-500">
                      No active episodes found for this clinic.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Program details */}
            {createStep === 2 && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="hep-name">Program Name *</Label>
                  <Input
                    id="hep-name"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    placeholder="e.g., Knee Strengthening HEP"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hep-freq">Frequency</Label>
                  <Input
                    id="hep-freq"
                    value={programFrequency}
                    onChange={(e) => setProgramFrequency(e.target.value)}
                    placeholder="e.g., 2x daily, 5 days/week"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hep-instructions">Additional Instructions</Label>
                  <Textarea
                    id="hep-instructions"
                    value={programInstructions}
                    onChange={(e) => setProgramInstructions(e.target.value)}
                    placeholder="General instructions for the program"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Exercise selection */}
            {createStep === 3 && (
              <div className="grid gap-4 py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search exercises..."
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="border rounded-md max-h-60 overflow-y-auto">
                  {filteredExercisesForSelection.map((ex) => {
                    const isSelected = selectedExercises.some(
                      (se) => se.exercise_id === ex.id
                    );
                    return (
                      <div
                        key={ex.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50 border-b last:border-b-0 ${
                          isSelected ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => handleToggleExercise(ex)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-slate-300'
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              {ex.name}
                              {ex.video_url && (
                                <Video className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {ex.category}
                              {ex.body_region ? ` - ${ex.body_region}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {ex.difficulty}
                        </Badge>
                      </div>
                    );
                  })}
                  {filteredExercisesForSelection.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">
                      No exercises found
                    </p>
                  )}
                </div>

                {/* Selected exercises with overrides */}
                {selectedExercises.length > 0 && (
                  <div className="mt-2">
                    <Label className="mb-2 block">
                      Selected Exercises ({selectedExercises.length})
                    </Label>
                    <div className="space-y-2">
                      {selectedExercises.map((se) => (
                        <div
                          key={se.exercise_id}
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-md"
                        >
                          <span className="text-sm font-medium flex-1 truncate">
                            {se.exercise.name}
                          </span>
                          <Input
                            className="w-16 h-8 text-xs"
                            placeholder="Sets"
                            value={se.sets}
                            onChange={(e) =>
                              handleUpdateExercisePrescription(
                                se.exercise_id,
                                'sets',
                                e.target.value
                              )
                            }
                          />
                          <Input
                            className="w-16 h-8 text-xs"
                            placeholder="Reps"
                            value={se.reps}
                            onChange={(e) =>
                              handleUpdateExercisePrescription(
                                se.exercise_id,
                                'reps',
                                e.target.value
                              )
                            }
                          />
                          <Input
                            className="w-16 h-8 text-xs"
                            placeholder="Hold"
                            value={se.hold}
                            onChange={(e) =>
                              handleUpdateExercisePrescription(
                                se.exercise_id,
                                'hold',
                                e.target.value
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {createStep > 1 && (
                <Button
                  variant="outline"
                  onClick={() => setCreateStep((s) => s - 1)}
                  disabled={saving}
                >
                  Back
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              {createStep < 3 ? (
                <Button
                  onClick={() => setCreateStep((s) => s + 1)}
                  disabled={
                    (createStep === 1 && !selectedEpisodeId) ||
                    (createStep === 2 && !programName)
                  }
                >
                  Next
                </Button>
              ) : (
                <Button onClick={handleCreateProgram} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Program
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
