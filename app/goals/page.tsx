'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowRight,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import {
  TreatmentGoal,
  GoalProgressNote,
  GoalStatus,
  GoalType,
  GOAL_STATUS_LABELS,
  GOAL_STATUS_COLORS,
  Episode,
  Patient,
} from '@/lib/types';
import { toast } from 'sonner';

interface GoalWithProgress extends TreatmentGoal {
  progress_notes?: GoalProgressNote[];
}

interface GroupedGoals {
  episodeId: string;
  patientName: string;
  diagnosis?: string;
  goals: GoalWithProgress[];
}

export default function GoalsPage() {
  const { currentClinic, user, loading: authLoading } = useAuth();

  // Data state
  const [goals, setGoals] = useState<TreatmentGoal[]>([]);
  const [episodes, setEpisodes] = useState<(Episode & { first_name?: string; last_name?: string })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Expanded goals for viewing progress
  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(new Set());
  const [goalDetails, setGoalDetails] = useState<Record<string, GoalWithProgress>>({});
  const [loadingGoalId, setLoadingGoalId] = useState<string | null>(null);

  // Add goal dialog
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({
    episode_id: '',
    goal_type: 'short_term' as GoalType,
    description: '',
    baseline_value: '',
    target_value: '',
    unit_of_measure: '',
    target_date: '',
    parent_goal_id: '',
  });
  const [saving, setSaving] = useState(false);

  // Update progress dialog
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressGoal, setProgressGoal] = useState<TreatmentGoal | null>(null);
  const [progressForm, setProgressForm] = useState({
    current_value: '',
    progress_percentage: '',
    status: '' as GoalStatus | '',
    notes: '',
    date_recorded: new Date().toISOString().split('T')[0],
  });
  const [savingProgress, setSavingProgress] = useState(false);

  // Fetch data
  useEffect(() => {
    if (currentClinic?.clinic_id) {
      fetchData(currentClinic.clinic_id);
    }
  }, [currentClinic]);

  const fetchData = async (clinicId: string) => {
    setLoading(true);
    try {
      const [goalsRes, episodesRes, patientsRes] = await Promise.all([
        fetch(`/api/goals?clinic_id=${clinicId}`),
        fetch(`/api/episodes?clinic_id=${clinicId}&status=active`),
        fetch(`/api/patients?clinic_id=${clinicId}`),
      ]);

      if (goalsRes.ok) {
        setGoals(await goalsRes.json());
      }
      if (episodesRes.ok) {
        setEpisodes(await episodesRes.json());
      }
      if (patientsRes.ok) {
        setPatients(await patientsRes.json());
      }
    } catch (error) {
      console.error('Error fetching goals data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get patient name by id
  const getPatientName = (patientId: string): string => {
    const patient = patients.find((p) => p.id === patientId);
    if (patient) return `${patient.first_name} ${patient.last_name}`;
    return 'Unknown Patient';
  };

  // Get episode label
  const getEpisodeLabel = (episode: Episode & { first_name?: string; last_name?: string }): string => {
    const name = episode.first_name && episode.last_name
      ? `${episode.first_name} ${episode.last_name}`
      : getPatientName(episode.patient_id);
    const diag = episode.diagnosis ? ` - ${episode.diagnosis}` : '';
    return `${name}${diag}`;
  };

  // Filter goals
  const filteredGoals = useMemo(() => {
    let filtered = goals;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((g) => g.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter((g) => g.goal_type === typeFilter);
    }
    return filtered;
  }, [goals, statusFilter, typeFilter]);

  // Group goals by episode
  const groupedGoals = useMemo((): GroupedGoals[] => {
    const groups = new Map<string, GroupedGoals>();

    filteredGoals.forEach((goal) => {
      if (!groups.has(goal.episode_id)) {
        const episode = episodes.find((e) => e.id === goal.episode_id);
        const patientName = episode
          ? (episode.first_name && episode.last_name
              ? `${episode.first_name} ${episode.last_name}`
              : getPatientName(episode.patient_id))
          : getPatientName(goal.patient_id);

        groups.set(goal.episode_id, {
          episodeId: goal.episode_id,
          patientName,
          diagnosis: episode?.diagnosis || undefined,
          goals: [],
        });
      }
      groups.get(goal.episode_id)!.goals.push(goal);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.patientName.localeCompare(b.patientName)
    );
  }, [filteredGoals, episodes, patients]);

  // Toggle goal expansion and fetch details
  const toggleGoal = async (goalId: string) => {
    const newExpanded = new Set(expandedGoalIds);

    if (newExpanded.has(goalId)) {
      newExpanded.delete(goalId);
      setExpandedGoalIds(newExpanded);
      return;
    }

    newExpanded.add(goalId);
    setExpandedGoalIds(newExpanded);

    // Fetch detailed goal with progress notes if not already loaded
    if (!goalDetails[goalId]) {
      setLoadingGoalId(goalId);
      try {
        const res = await fetch(`/api/goals/${goalId}`);
        if (res.ok) {
          const data = await res.json();
          setGoalDetails((prev) => ({ ...prev, [goalId]: data }));
        }
      } catch (error) {
        console.error('Error fetching goal details:', error);
      } finally {
        setLoadingGoalId(null);
      }
    }
  };

  // Get LTGs for parent goal selector (for STGs)
  const longTermGoals = useMemo(() => {
    if (!newGoal.episode_id) return [];
    return goals.filter(
      (g) => g.episode_id === newGoal.episode_id && g.goal_type === 'long_term'
    );
  }, [goals, newGoal.episode_id]);

  // Handle add goal
  const handleAddGoal = async () => {
    if (!newGoal.episode_id || !newGoal.description || !currentClinic?.clinic_id) return;

    const episode = episodes.find((e) => e.id === newGoal.episode_id);
    if (!episode) return;

    setSaving(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: newGoal.episode_id,
          patient_id: episode.patient_id,
          clinic_id: currentClinic.clinic_id,
          goal_type: newGoal.goal_type,
          description: newGoal.description,
          baseline_value: newGoal.baseline_value || null,
          target_value: newGoal.target_value || null,
          unit_of_measure: newGoal.unit_of_measure || null,
          target_date: newGoal.target_date || null,
          parent_goal_id: (newGoal.parent_goal_id && newGoal.parent_goal_id !== 'none') ? newGoal.parent_goal_id : null,
          created_by: user?.id,
        }),
      });

      if (res.ok) {
        setAddGoalOpen(false);
        setNewGoal({
          episode_id: '',
          goal_type: 'short_term',
          description: '',
          baseline_value: '',
          target_value: '',
          unit_of_measure: '',
          target_date: '',
          parent_goal_id: '',
        });
        toast.success('Treatment goal created');
        // Refresh goals
        if (currentClinic.clinic_id) {
          const goalsRes = await fetch(`/api/goals?clinic_id=${currentClinic.clinic_id}`);
          if (goalsRes.ok) {
            setGoals(await goalsRes.json());
          }
        }
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || 'Failed to create goal');
      }
    } catch (error) {
      console.error('Error creating goal:', error);
      toast.error('Failed to create goal');
    } finally {
      setSaving(false);
    }
  };

  // Handle update progress
  const handleOpenProgress = (goal: TreatmentGoal) => {
    setProgressGoal(goal);
    setProgressForm({
      current_value: goal.current_value || '',
      progress_percentage: String(goal.progress_percentage || ''),
      status: '',
      notes: '',
      date_recorded: new Date().toISOString().split('T')[0],
    });
    setProgressOpen(true);
  };

  const handleSaveProgress = async () => {
    if (!progressGoal) return;

    setSavingProgress(true);
    try {
      const res = await fetch(`/api/goals/${progressGoal.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_recorded: progressForm.date_recorded,
          previous_value: progressGoal.current_value,
          current_value: progressForm.current_value || null,
          progress_percentage: progressForm.progress_percentage
            ? parseInt(progressForm.progress_percentage, 10)
            : null,
          status: progressForm.status ? progressForm.status : null,
          notes: progressForm.notes || null,
          recorded_by: user?.id,
        }),
      });

      if (res.ok) {
        setProgressOpen(false);
        // Clear cached details so they re-fetch
        setGoalDetails((prev) => {
          const updated = { ...prev };
          delete updated[progressGoal.id];
          return updated;
        });
        // Refresh goals list
        if (currentClinic?.clinic_id) {
          const goalsRes = await fetch(`/api/goals?clinic_id=${currentClinic.clinic_id}`);
          if (goalsRes.ok) {
            setGoals(await goalsRes.json());
          }
        }
      }
    } catch (error) {
      console.error('Error saving progress:', error);
    } finally {
      setSavingProgress(false);
    }
  };

  // Goal type badge
  const GoalTypeBadge = ({ type }: { type: GoalType }) => (
    <Badge
      variant="outline"
      className={
        type === 'long_term'
          ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
          : 'bg-sky-100 text-sky-700 border-sky-200'
      }
    >
      {type === 'long_term' ? 'LTG' : 'STG'}
    </Badge>
  );

  // Goal status badge
  const GoalStatusBadge = ({ status }: { status: GoalStatus }) => (
    <Badge variant="outline" className={GOAL_STATUS_COLORS[status]}>
      {GOAL_STATUS_LABELS[status]}
    </Badge>
  );

  // Progress color based on percentage
  const getProgressColor = (pct: number): string => {
    if (pct >= 80) return 'text-emerald-600';
    if (pct >= 50) return 'text-blue-600';
    if (pct >= 25) return 'text-amber-600';
    return 'text-slate-500';
  };

  // Count stats
  const stats = useMemo(() => {
    return {
      total: goals.length,
      active: goals.filter((g) => g.status === 'active').length,
      met: goals.filter((g) => g.status === 'met').length,
      notMet: goals.filter((g) => g.status === 'not_met').length,
    };
  }, [goals]);

  return (
    <>
      <TopNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Target className="h-6 w-6 text-blue-600" />
              Treatment Goals
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track and manage patient treatment goals and progress.
            </p>
          </div>
          <Button onClick={() => setAddGoalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Goal
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Target className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                  <p className="text-xs text-slate-500">Total Goals</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Circle className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{stats.met}</p>
                  <p className="text-xs text-slate-500">Met</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.notMet}</p>
                  <p className="text-xs text-slate-500">Not Met</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="met">Met</SelectItem>
              <SelectItem value="not_met">Not Met</SelectItem>
              <SelectItem value="modified">Modified</SelectItem>
              <SelectItem value="discontinued">Discontinued</SelectItem>
              <SelectItem value="deferred">Deferred</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="short_term">Short-Term (STG)</SelectItem>
              <SelectItem value="long_term">Long-Term (LTG)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Goals List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-1/3" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : groupedGoals.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Target className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">No goals found</p>
            <p className="text-sm mt-1">
              {statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Click "Add Goal" to create your first treatment goal.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedGoals.map((group) => (
              <Card key={group.episodeId}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="font-semibold">{group.patientName}</span>
                    {group.diagnosis && (
                      <span className="text-sm font-normal text-slate-500">
                        {group.diagnosis}
                      </span>
                    )}
                    <Badge variant="outline" className="ml-auto text-xs">
                      {group.goals.length} goal{group.goals.length !== 1 ? 's' : ''}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.goals.map((goal) => {
                    const isExpanded = expandedGoalIds.has(goal.id);
                    const details = goalDetails[goal.id];
                    const isLoadingDetails = loadingGoalId === goal.id;

                    return (
                      <div
                        key={goal.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        {/* Goal Summary Row */}
                        <div
                          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => toggleGoal(goal.id)}
                        >
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-mono text-slate-400">
                              #{goal.goal_number}
                            </span>
                            <GoalTypeBadge type={goal.goal_type} />
                            <GoalStatusBadge status={goal.status} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 truncate">
                              {goal.description}
                            </p>
                          </div>

                          {/* Progress Display */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {(goal.baseline_value || goal.target_value) && (
                              <div className="hidden md:flex items-center gap-1 text-xs text-slate-500">
                                <span>{goal.baseline_value || '?'}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-medium text-slate-700">
                                  {goal.current_value || '?'}
                                </span>
                                <ArrowRight className="h-3 w-3" />
                                <span>{goal.target_value || '?'}</span>
                                {goal.unit_of_measure && (
                                  <span className="text-slate-400">
                                    {goal.unit_of_measure}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-2 w-32">
                              <Progress
                                value={goal.progress_percentage}
                                className="h-2"
                              />
                              <span
                                className={`text-xs font-medium ${getProgressColor(
                                  goal.progress_percentage
                                )}`}
                              >
                                {goal.progress_percentage}%
                              </span>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenProgress(goal);
                              }}
                            >
                              <TrendingUp className="h-4 w-4 mr-1" />
                              Update
                            </Button>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="border-t bg-slate-50 p-4">
                            {/* Full description */}
                            <div className="mb-4">
                              <p className="text-sm text-slate-700">{goal.description}</p>
                            </div>

                            {/* Goal details grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                              {goal.baseline_value && (
                                <div>
                                  <p className="text-xs text-slate-500">Baseline</p>
                                  <p className="font-medium">
                                    {goal.baseline_value}
                                    {goal.unit_of_measure ? ` ${goal.unit_of_measure}` : ''}
                                  </p>
                                </div>
                              )}
                              {goal.current_value && (
                                <div>
                                  <p className="text-xs text-slate-500">Current</p>
                                  <p className="font-medium">
                                    {goal.current_value}
                                    {goal.unit_of_measure ? ` ${goal.unit_of_measure}` : ''}
                                  </p>
                                </div>
                              )}
                              {goal.target_value && (
                                <div>
                                  <p className="text-xs text-slate-500">Target</p>
                                  <p className="font-medium">
                                    {goal.target_value}
                                    {goal.unit_of_measure ? ` ${goal.unit_of_measure}` : ''}
                                  </p>
                                </div>
                              )}
                              {goal.target_date && (
                                <div>
                                  <p className="text-xs text-slate-500">Target Date</p>
                                  <p className="font-medium flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(goal.target_date).toLocaleDateString()}
                                  </p>
                                </div>
                              )}
                              {goal.met_date && (
                                <div>
                                  <p className="text-xs text-slate-500">Met Date</p>
                                  <p className="font-medium text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {new Date(goal.met_date).toLocaleDateString()}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-4">
                              <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <span>Progress</span>
                                <span className={getProgressColor(goal.progress_percentage)}>
                                  {goal.progress_percentage}%
                                </span>
                              </div>
                              <Progress value={goal.progress_percentage} className="h-3" />
                            </div>

                            {/* Progress History Timeline */}
                            <div>
                              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                Progress History
                              </h4>

                              {isLoadingDetails ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading history...
                                </div>
                              ) : details?.progress_notes &&
                                details.progress_notes.length > 0 ? (
                                <div className="space-y-0 relative">
                                  {/* Timeline line */}
                                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />

                                  {details.progress_notes.map(
                                    (note: GoalProgressNote, idx: number) => (
                                      <div
                                        key={note.id}
                                        className="flex gap-3 relative pb-4 last:pb-0"
                                      >
                                        <div className="flex-shrink-0 mt-1">
                                          <div
                                            className={`h-4 w-4 rounded-full border-2 ${
                                              idx === 0
                                                ? 'bg-blue-500 border-blue-500'
                                                : 'bg-white border-slate-300'
                                            }`}
                                          />
                                        </div>
                                        <div className="flex-1 bg-white border rounded-lg p-3 text-sm">
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-slate-500">
                                              {new Date(
                                                note.date_recorded
                                              ).toLocaleDateString()}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              {note.progress_percentage !== null &&
                                                note.progress_percentage !== undefined && (
                                                  <span
                                                    className={`text-xs font-medium ${getProgressColor(
                                                      note.progress_percentage
                                                    )}`}
                                                  >
                                                    {note.progress_percentage}%
                                                  </span>
                                                )}
                                              {note.status && (
                                                <GoalStatusBadge status={note.status} />
                                              )}
                                            </div>
                                          </div>
                                          {(note.previous_value || note.current_value) && (
                                            <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                                              {note.previous_value && (
                                                <span>{note.previous_value}</span>
                                              )}
                                              {note.previous_value && note.current_value && (
                                                <ArrowRight className="h-3 w-3" />
                                              )}
                                              {note.current_value && (
                                                <span className="font-medium text-slate-700">
                                                  {note.current_value}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                          {note.notes && (
                                            <p className="text-slate-600">{note.notes}</p>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-400 py-2">
                                  No progress notes recorded yet.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Goal Dialog */}
        <Dialog open={addGoalOpen} onOpenChange={setAddGoalOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Treatment Goal</DialogTitle>
              <DialogDescription>
                Create a new short-term or long-term treatment goal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Episode Selector */}
              <div className="space-y-2">
                <Label>Patient / Episode *</Label>
                <Select
                  value={newGoal.episode_id}
                  onValueChange={(v) =>
                    setNewGoal((prev) => ({ ...prev, episode_id: v, parent_goal_id: '' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a patient episode..." />
                  </SelectTrigger>
                  <SelectContent>
                    {episodes.map((ep) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        {getEpisodeLabel(ep)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Goal Type */}
              <div className="space-y-2">
                <Label>Goal Type *</Label>
                <Select
                  value={newGoal.goal_type}
                  onValueChange={(v) =>
                    setNewGoal((prev) => ({
                      ...prev,
                      goal_type: v as GoalType,
                      parent_goal_id: '',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short_term">Short-Term Goal (STG)</SelectItem>
                    <SelectItem value="long_term">Long-Term Goal (LTG)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  placeholder="Describe the treatment goal..."
                  value={newGoal.description}
                  onChange={(e) =>
                    setNewGoal((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                />
              </div>

              {/* Baseline and Target */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Baseline Value</Label>
                  <Input
                    placeholder="e.g., 30"
                    value={newGoal.baseline_value}
                    onChange={(e) =>
                      setNewGoal((prev) => ({
                        ...prev,
                        baseline_value: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Value</Label>
                  <Input
                    placeholder="e.g., 90"
                    value={newGoal.target_value}
                    onChange={(e) =>
                      setNewGoal((prev) => ({
                        ...prev,
                        target_value: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Unit of Measure */}
              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Input
                  placeholder="e.g., degrees, seconds, %"
                  value={newGoal.unit_of_measure}
                  onChange={(e) =>
                    setNewGoal((prev) => ({
                      ...prev,
                      unit_of_measure: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Target Date */}
              <div className="space-y-2">
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={newGoal.target_date}
                  onChange={(e) =>
                    setNewGoal((prev) => ({ ...prev, target_date: e.target.value }))
                  }
                />
              </div>

              {/* Parent Goal (for STGs only) */}
              {newGoal.goal_type === 'short_term' && newGoal.episode_id && (
                <div className="space-y-2">
                  <Label>Parent Long-Term Goal (optional)</Label>
                  <Select
                    value={newGoal.parent_goal_id}
                    onValueChange={(v) =>
                      setNewGoal((prev) => ({ ...prev, parent_goal_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Link to an LTG..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {longTermGoals.map((ltg) => (
                        <SelectItem key={ltg.id} value={ltg.id}>
                          LTG #{ltg.goal_number}: {ltg.description.substring(0, 60)}
                          {ltg.description.length > 60 ? '...' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddGoalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddGoal}
                disabled={!newGoal.episode_id || !newGoal.description || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Create Goal'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Update Progress Dialog */}
        <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Update Progress</DialogTitle>
              <DialogDescription>
                {progressGoal && (
                  <>
                    {progressGoal.goal_type === 'long_term' ? 'LTG' : 'STG'} #
                    {progressGoal.goal_number}: {progressGoal.description.substring(0, 80)}
                    {progressGoal.description.length > 80 ? '...' : ''}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={progressForm.date_recorded}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      date_recorded: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Current Value */}
              <div className="space-y-2">
                <Label>
                  Current Value
                  {progressGoal?.unit_of_measure
                    ? ` (${progressGoal.unit_of_measure})`
                    : ''}
                </Label>
                <Input
                  placeholder={
                    progressGoal?.current_value
                      ? `Previous: ${progressGoal.current_value}`
                      : 'Enter current value'
                  }
                  value={progressForm.current_value}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      current_value: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Progress Percentage */}
              <div className="space-y-2">
                <Label>Progress Percentage (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder={`Current: ${progressGoal?.progress_percentage || 0}%`}
                  value={progressForm.progress_percentage}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      progress_percentage: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Status Change */}
              <div className="space-y-2">
                <Label>Status Change (optional)</Label>
                <Select
                  value={progressForm.status}
                  onValueChange={(v) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      status: v as GoalStatus,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No change" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_change">No change</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="met">Met</SelectItem>
                    <SelectItem value="not_met">Not Met</SelectItem>
                    <SelectItem value="modified">Modified</SelectItem>
                    <SelectItem value="discontinued">Discontinued</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Progress notes..."
                  value={progressForm.notes}
                  onChange={(e) =>
                    setProgressForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setProgressOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveProgress} disabled={savingProgress}>
                {savingProgress ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Progress'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
