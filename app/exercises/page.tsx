'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Plus,
  Dumbbell,
  ChevronDown,
  ChevronUp,
  Loader2,
  Filter,
  ClipboardPlus,
  Video,
  ExternalLink,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { Exercise, EXERCISE_CATEGORIES, BODY_REGIONS, HepProgram } from '@/lib/types';
import { toast } from 'sonner';

export default function ExercisesPage() {
  const { currentClinic, loading: authLoading, hasRole, user } = useAuth();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [bodyRegionFilter, setBodyRegionFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add Exercise dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newExercise, setNewExercise] = useState({
    name: '',
    description: '',
    category: '',
    body_region: '',
    difficulty: 'moderate' as string,
    equipment: '',
    default_sets: '',
    default_reps: '',
    default_hold: '',
    default_frequency: '',
    instructions: '',
    precautions: '',
    progression_notes: '',
    video_url: '',
    thumbnail_url: '',
  });

  // Add to HEP dialog
  const [hepDialogOpen, setHepDialogOpen] = useState(false);
  const [selectedExerciseForHep, setSelectedExerciseForHep] = useState<Exercise | null>(null);
  const [hepPrograms, setHepPrograms] = useState<HepProgram[]>([]);
  const [selectedHepProgramId, setSelectedHepProgramId] = useState('');
  const [hepSets, setHepSets] = useState('');
  const [hepReps, setHepReps] = useState('');
  const [hepHold, setHepHold] = useState('');
  const [addingToHep, setAddingToHep] = useState(false);

  const canManageExercises = hasRole(['pt', 'admin']);

  // Fetch exercises
  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id) return;
    fetchExercises();
  }, [authLoading, currentClinic?.clinic_id]);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/exercises?clinic_id=${currentClinic?.clinic_id}`
      );
      if (!res.ok) throw new Error('Failed to fetch exercises');
      const data = await res.json();
      setExercises(data);
    } catch (error) {
      console.error('Error fetching exercises:', error);
      toast.error('Failed to load exercises');
    } finally {
      setLoading(false);
    }
  };

  // Filter exercises
  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (
        searchQuery &&
        !ex.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !ex.description?.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      if (categoryFilter !== 'all' && ex.category !== categoryFilter) return false;
      if (bodyRegionFilter !== 'all' && ex.body_region !== bodyRegionFilter) return false;
      if (difficultyFilter !== 'all' && ex.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [exercises, searchQuery, categoryFilter, bodyRegionFilter, difficultyFilter]);

  const handleAddExercise = async () => {
    if (!newExercise.name || !newExercise.category) {
      toast.error('Name and category are required');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newExercise,
          clinic_id: currentClinic?.clinic_id,
        }),
      });
      if (!res.ok) throw new Error('Failed to create exercise');
      const data = await res.json();
      setExercises((prev) => [...prev, data]);
      setAddDialogOpen(false);
      setNewExercise({
        name: '',
        description: '',
        category: '',
        body_region: '',
        difficulty: 'moderate',
        equipment: '',
        default_sets: '',
        default_reps: '',
        default_hold: '',
        default_frequency: '',
        instructions: '',
        precautions: '',
        progression_notes: '',
        video_url: '',
        thumbnail_url: '',
      });
      toast.success('Exercise added to library');
    } catch (error) {
      console.error('Error adding exercise:', error);
      toast.error('Failed to add exercise');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHepDialog = async (exercise: Exercise) => {
    setSelectedExerciseForHep(exercise);
    setHepSets(exercise.default_sets || '');
    setHepReps(exercise.default_reps || '');
    setHepHold(exercise.default_hold || '');
    setHepDialogOpen(true);

    // Fetch active HEP programs
    try {
      const res = await fetch(
        `/api/hep?clinic_id=${currentClinic?.clinic_id}&status=active`
      );
      if (res.ok) {
        const data = await res.json();
        setHepPrograms(data);
      }
    } catch (error) {
      console.error('Error fetching HEP programs:', error);
    }
  };

  const handleAddToHep = async () => {
    if (!selectedHepProgramId || !selectedExerciseForHep) {
      toast.error('Please select a HEP program');
      return;
    }
    try {
      setAddingToHep(true);
      const res = await fetch(`/api/hep/${selectedHepProgramId}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise_id: selectedExerciseForHep.id,
          sets: hepSets || null,
          reps: hepReps || null,
          hold: hepHold || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add exercise to HEP');
      toast.success('Exercise added to HEP program');
      setHepDialogOpen(false);
      setSelectedHepProgramId('');
    } catch (error) {
      console.error('Error adding to HEP:', error);
      toast.error('Failed to add exercise to HEP program');
    } finally {
      setAddingToHep(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'moderate':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'hard':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'advanced':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Stretching: 'bg-purple-100 text-purple-700 border-purple-200',
      Strengthening: 'bg-blue-100 text-blue-700 border-blue-200',
      'Range of Motion': 'bg-cyan-100 text-cyan-700 border-cyan-200',
      Stabilization: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      Balance: 'bg-teal-100 text-teal-700 border-teal-200',
      Cardio: 'bg-rose-100 text-rose-700 border-rose-200',
      'Functional Training': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Neuromuscular Re-education': 'bg-violet-100 text-violet-700 border-violet-200',
      Proprioception: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    };
    return colors[category] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
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
              <Dumbbell className="h-6 w-6" />
              Exercise Library
            </h1>
            <p className="text-slate-500 mt-1">
              Browse and manage exercises for home exercise programs
              <span className="ml-2 text-xs text-blue-600 font-medium">Powered by PTBot</span>
            </p>
          </div>
          {canManageExercises && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Exercise
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Exercise</DialogTitle>
                  <DialogDescription>
                    Add a new exercise to your clinic library.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="ex-name">Exercise Name *</Label>
                    <Input
                      id="ex-name"
                      value={newExercise.name}
                      onChange={(e) =>
                        setNewExercise((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g., Hamstring Stretch"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category *</Label>
                      <Select
                        value={newExercise.category}
                        onValueChange={(v) =>
                          setNewExercise((prev) => ({ ...prev, category: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXERCISE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Body Region</Label>
                      <Select
                        value={newExercise.body_region}
                        onValueChange={(v) =>
                          setNewExercise((prev) => ({ ...prev, body_region: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select body region" />
                        </SelectTrigger>
                        <SelectContent>
                          {BODY_REGIONS.map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Difficulty</Label>
                      <Select
                        value={newExercise.difficulty}
                        onValueChange={(v) =>
                          setNewExercise((prev) => ({ ...prev, difficulty: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ex-equipment">Equipment</Label>
                      <Input
                        id="ex-equipment"
                        value={newExercise.equipment}
                        onChange={(e) =>
                          setNewExercise((prev) => ({
                            ...prev,
                            equipment: e.target.value,
                          }))
                        }
                        placeholder="e.g., Resistance band"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ex-description">Description</Label>
                    <Textarea
                      id="ex-description"
                      value={newExercise.description}
                      onChange={(e) =>
                        setNewExercise((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Brief description of the exercise"
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ex-instructions">Instructions</Label>
                    <Textarea
                      id="ex-instructions"
                      value={newExercise.instructions}
                      onChange={(e) =>
                        setNewExercise((prev) => ({
                          ...prev,
                          instructions: e.target.value,
                        }))
                      }
                      placeholder="Step-by-step instructions"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="ex-sets">Default Sets</Label>
                      <Input
                        id="ex-sets"
                        value={newExercise.default_sets}
                        onChange={(e) =>
                          setNewExercise((prev) => ({
                            ...prev,
                            default_sets: e.target.value,
                          }))
                        }
                        placeholder="e.g., 3"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ex-reps">Default Reps</Label>
                      <Input
                        id="ex-reps"
                        value={newExercise.default_reps}
                        onChange={(e) =>
                          setNewExercise((prev) => ({
                            ...prev,
                            default_reps: e.target.value,
                          }))
                        }
                        placeholder="e.g., 10"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ex-hold">Default Hold</Label>
                      <Input
                        id="ex-hold"
                        value={newExercise.default_hold}
                        onChange={(e) =>
                          setNewExercise((prev) => ({
                            ...prev,
                            default_hold: e.target.value,
                          }))
                        }
                        placeholder="e.g., 30s"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ex-freq">Default Frequency</Label>
                      <Input
                        id="ex-freq"
                        value={newExercise.default_frequency}
                        onChange={(e) =>
                          setNewExercise((prev) => ({
                            ...prev,
                            default_frequency: e.target.value,
                          }))
                        }
                        placeholder="e.g., 2x/day"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ex-precautions">Precautions</Label>
                    <Textarea
                      id="ex-precautions"
                      value={newExercise.precautions}
                      onChange={(e) =>
                        setNewExercise((prev) => ({
                          ...prev,
                          precautions: e.target.value,
                        }))
                      }
                      placeholder="Any precautions or contraindications"
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ex-progression">Progression Notes</Label>
                    <Textarea
                      id="ex-progression"
                      value={newExercise.progression_notes}
                      onChange={(e) =>
                        setNewExercise((prev) => ({
                          ...prev,
                          progression_notes: e.target.value,
                        }))
                      }
                      placeholder="How to progress this exercise"
                      rows={2}
                    />
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      PTBot Video (optional)
                    </p>
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="ex-video">Video URL</Label>
                        <Input
                          id="ex-video"
                          value={newExercise.video_url}
                          onChange={(e) =>
                            setNewExercise((prev) => ({
                              ...prev,
                              video_url: e.target.value,
                            }))
                          }
                          placeholder="https://ptbot.ai/exercises/video.mp4"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="ex-thumbnail">Thumbnail URL</Label>
                        <Input
                          id="ex-thumbnail"
                          value={newExercise.thumbnail_url}
                          onChange={(e) =>
                            setNewExercise((prev) => ({
                              ...prev,
                              thumbnail_url: e.target.value,
                            }))
                          }
                          placeholder="https://ptbot.ai/exercises/thumbnail.jpg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddExercise} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Exercise
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {EXERCISE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bodyRegionFilter} onValueChange={setBodyRegionFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Body Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {BODY_REGIONS.map((region) => (
                <SelectItem key={region} value={region}>
                  {region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <p className="text-sm text-slate-500 mb-4">
          {filteredExercises.length} exercise{filteredExercises.length !== 1 ? 's' : ''} found
        </p>

        {/* Exercise Grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : filteredExercises.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Dumbbell className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">No exercises found</h3>
              <p className="text-sm text-slate-500 mt-1">
                {searchQuery || categoryFilter !== 'all' || bodyRegionFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Add exercises to get started'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredExercises.map((exercise) => {
              const isExpanded = expandedId === exercise.id;
              return (
                <Card
                  key={exercise.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setExpandedId(isExpanded ? null : exercise.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{exercise.name}</CardTitle>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge
                        variant="outline"
                        className={getCategoryColor(exercise.category)}
                      >
                        {exercise.category}
                      </Badge>
                      {exercise.body_region && (
                        <Badge variant="outline" className="text-xs">
                          {exercise.body_region}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={getDifficultyColor(exercise.difficulty)}
                      >
                        {exercise.difficulty}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {exercise.equipment && (
                      <p className="text-xs text-slate-500 mb-2">
                        Equipment: {exercise.equipment}
                      </p>
                    )}
                    {exercise.default_sets || exercise.default_reps || exercise.default_hold ? (
                      <div className="flex gap-3 text-xs text-slate-600">
                        {exercise.default_sets && <span>Sets: {exercise.default_sets}</span>}
                        {exercise.default_reps && <span>Reps: {exercise.default_reps}</span>}
                        {exercise.default_hold && <span>Hold: {exercise.default_hold}</span>}
                      </div>
                    ) : null}

                    {/* Video thumbnail indicator */}
                    {exercise.video_url && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Video className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">PTBot Video</span>
                      </div>
                    )}

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {/* PTBot Video */}
                        {exercise.video_url && (
                          <div>
                            <p className="text-xs font-medium text-slate-700 mb-2 flex items-center gap-1">
                              <Video className="h-3.5 w-3.5 text-blue-500" />
                              Exercise Video (PTBot)
                            </p>
                            <div className="rounded-lg overflow-hidden bg-black aspect-video">
                              <video
                                controls
                                preload="metadata"
                                poster={exercise.thumbnail_url || undefined}
                                className="w-full h-full"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <source src={exercise.video_url} />
                                Your browser does not support video playback.
                              </video>
                            </div>
                            <a
                              href={exercise.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open in new tab <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                        {exercise.description && (
                          <div>
                            <p className="text-xs font-medium text-slate-700 mb-1">
                              Description
                            </p>
                            <p className="text-sm text-slate-600">
                              {exercise.description}
                            </p>
                          </div>
                        )}
                        {exercise.instructions && (
                          <div>
                            <p className="text-xs font-medium text-slate-700 mb-1">
                              Instructions
                            </p>
                            <p className="text-sm text-slate-600 whitespace-pre-line">
                              {exercise.instructions}
                            </p>
                          </div>
                        )}
                        {exercise.precautions && (
                          <div>
                            <p className="text-xs font-medium text-red-600 mb-1">
                              Precautions
                            </p>
                            <p className="text-sm text-red-600">
                              {exercise.precautions}
                            </p>
                          </div>
                        )}
                        {exercise.progression_notes && (
                          <div>
                            <p className="text-xs font-medium text-slate-700 mb-1">
                              Progression
                            </p>
                            <p className="text-sm text-slate-600">
                              {exercise.progression_notes}
                            </p>
                          </div>
                        )}
                        <div className="pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenHepDialog(exercise);
                            }}
                          >
                            <ClipboardPlus className="h-3.5 w-3.5" />
                            Add to HEP
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add to HEP Dialog */}
        <Dialog open={hepDialogOpen} onOpenChange={setHepDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to HEP Program</DialogTitle>
              <DialogDescription>
                Add &quot;{selectedExerciseForHep?.name}&quot; to a home exercise program.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Select HEP Program</Label>
                <Select
                  value={selectedHepProgramId}
                  onValueChange={setSelectedHepProgramId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a program..." />
                  </SelectTrigger>
                  <SelectContent>
                    {hepPrograms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hepPrograms.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No active HEP programs found. Create one from the HEP page first.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="hep-sets">Sets</Label>
                  <Input
                    id="hep-sets"
                    value={hepSets}
                    onChange={(e) => setHepSets(e.target.value)}
                    placeholder="e.g., 3"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hep-reps">Reps</Label>
                  <Input
                    id="hep-reps"
                    value={hepReps}
                    onChange={(e) => setHepReps(e.target.value)}
                    placeholder="e.g., 10"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hep-hold">Hold</Label>
                  <Input
                    id="hep-hold"
                    value={hepHold}
                    onChange={(e) => setHepHold(e.target.value)}
                    placeholder="e.g., 30s"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setHepDialogOpen(false)}
                disabled={addingToHep}
              >
                Cancel
              </Button>
              <Button onClick={handleAddToHep} disabled={addingToHep || !selectedHepProgramId}>
                {addingToHep && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add to Program
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
