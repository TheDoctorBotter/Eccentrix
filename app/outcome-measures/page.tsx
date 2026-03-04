'use client';

import { useEffect, useState, useMemo } from 'react';
import { formatLocalDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Loader2,
  BarChart3,
  ArrowRight,
  Calendar,
  Info,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import {
  OutcomeMeasureDefinition,
  OutcomeMeasureScore,
  OutcomeMeasureQuestion,
  Episode,
  Patient,
} from '@/lib/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export default function OutcomeMeasuresPage() {
  const { currentClinic, user, loading: authLoading } = useAuth();

  // Data state
  const [definitions, setDefinitions] = useState<OutcomeMeasureDefinition[]>([]);
  const [recentScores, setRecentScores] = useState<(OutcomeMeasureScore & {
    measure_name?: string;
    measure_abbreviation?: string;
    measure_category?: string;
    measure_higher_is_better?: boolean;
    measure_mcid?: number;
    measure_score_interpretation?: string;
    patient_name?: string;
  })[]>([]);
  const [episodes, setEpisodes] = useState<(Episode & { first_name?: string; last_name?: string })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Administer dialog state
  const [administerOpen, setAdministerOpen] = useState(false);
  const [selectedMeasure, setSelectedMeasure] = useState<OutcomeMeasureDefinition | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [manualScore, setManualScore] = useState('');
  const [scoreDate, setScoreDate] = useState(new Date().toISOString().split('T')[0]);
  const [scoreNotes, setScoreNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedScore, setSavedScore] = useState<{ score: number; interpretation: string } | null>(null);

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMeasureId, setHistoryMeasureId] = useState('');
  const [historyPatientId, setHistoryPatientId] = useState('');
  const [historyScores, setHistoryScores] = useState<(OutcomeMeasureScore & {
    measure_name?: string;
    measure_abbreviation?: string;
    measure_mcid?: number;
    measure_higher_is_better?: boolean;
  })[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Derived data
  const categories = useMemo(() => {
    const cats = new Set(definitions.map((d) => d.category).filter(Boolean));
    return Array.from(cats).sort() as string[];
  }, [definitions]);

  const filteredDefinitions = useMemo(() => {
    let filtered = definitions;
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((d) => d.category === categoryFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.abbreviation.toLowerCase().includes(q) ||
          (d.description && d.description.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [definitions, categoryFilter, searchQuery]);

  // Fetch data
  useEffect(() => {
    if (currentClinic?.clinic_id) {
      fetchData(currentClinic.clinic_id);
    }
  }, [currentClinic]);

  const fetchData = async (clinicId: string) => {
    setLoading(true);
    try {
      const [defsRes, scoresRes, episodesRes, patientsRes] = await Promise.all([
        fetch('/api/outcome-measures?is_active=true'),
        fetch(`/api/outcome-measures/scores?clinic_id=${clinicId}&limit=20`),
        fetch(`/api/episodes?clinic_id=${clinicId}&status=active`),
        fetch(`/api/patients?clinic_id=${clinicId}`),
      ]);

      if (defsRes.ok) {
        const data = await defsRes.json();
        setDefinitions(data);
      }
      if (scoresRes.ok) {
        const data = await scoresRes.json();
        setRecentScores(data);
      }
      if (episodesRes.ok) {
        const data = await episodesRes.json();
        setEpisodes(data);
      }
      if (patientsRes.ok) {
        const data = await patientsRes.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Error fetching outcome measures data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate score from answers
  const calculateScore = (): number => {
    if (selectedMeasure?.questions && selectedMeasure.questions.length > 0) {
      return Object.values(answers).reduce((sum, val) => sum + val, 0);
    }
    return parseFloat(manualScore) || 0;
  };

  // Get interpretation for a given score
  const getInterpretation = (measure: OutcomeMeasureDefinition, score: number): string => {
    if (!measure.score_interpretation) return '';
    try {
      const interp = typeof measure.score_interpretation === 'string'
        ? JSON.parse(measure.score_interpretation)
        : measure.score_interpretation;

      if (Array.isArray(interp)) {
        for (const range of interp) {
          if (score >= range.min && score <= range.max) {
            return range.label || range.interpretation || '';
          }
        }
      }
      return '';
    } catch {
      return String(measure.score_interpretation);
    }
  };

  // Open administer dialog
  const handleAdminister = (measure: OutcomeMeasureDefinition) => {
    setSelectedMeasure(measure);
    setAnswers({});
    setManualScore('');
    setScoreDate(new Date().toISOString().split('T')[0]);
    setScoreNotes('');
    setSavedScore(null);
    setSelectedEpisodeId('');
    setAdministerOpen(true);
  };

  // Save score
  const handleSaveScore = async () => {
    if (!selectedMeasure || !selectedEpisodeId) return;

    const episode = episodes.find((e) => e.id === selectedEpisodeId);
    if (!episode) return;

    const score = calculateScore();

    setSaving(true);
    try {
      const res = await fetch('/api/outcome-measures/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: episode.patient_id,
          episode_id: selectedEpisodeId,
          clinic_id: currentClinic?.clinic_id,
          measure_id: selectedMeasure.id,
          date_administered: scoreDate,
          raw_score: score,
          percentage_score:
            selectedMeasure.max_score > 0
              ? Math.round((score / selectedMeasure.max_score) * 100)
              : null,
          answers: selectedMeasure.questions && selectedMeasure.questions.length > 0 ? answers : null,
          administered_by: user?.id,
          notes: scoreNotes || null,
        }),
      });

      if (res.ok) {
        const interpretation = getInterpretation(selectedMeasure, score);
        setSavedScore({ score, interpretation });

        // Refresh recent scores
        if (currentClinic?.clinic_id) {
          const scoresRes = await fetch(
            `/api/outcome-measures/scores?clinic_id=${currentClinic.clinic_id}&limit=20`
          );
          if (scoresRes.ok) {
            setRecentScores(await scoresRes.json());
          }
        }
      }
    } catch (error) {
      console.error('Error saving score:', error);
    } finally {
      setSaving(false);
    }
  };

  // View patient history for a measure
  const handleViewHistory = async (measureId: string, patientId: string) => {
    setHistoryMeasureId(measureId);
    setHistoryPatientId(patientId);
    setHistoryOpen(true);
    setHistoryLoading(true);

    try {
      const res = await fetch(
        `/api/outcome-measures/scores?patient_id=${patientId}&measure_id=${measureId}`
      );
      if (res.ok) {
        setHistoryScores(await res.json());
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
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

  // Get category color
  const getCategoryColor = (cat?: string | null): string => {
    switch (cat?.toLowerCase()) {
      case 'pain':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'function':
      case 'functional':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'balance':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'disability':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'upper extremity':
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 'lower extremity':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'pediatric':
        return 'bg-pink-100 text-pink-700 border-pink-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Are all questions answered?
  const allQuestionsAnswered = (): boolean => {
    if (!selectedMeasure?.questions || selectedMeasure.questions.length === 0) {
      return manualScore !== '' && !isNaN(parseFloat(manualScore));
    }
    return selectedMeasure.questions.every((q) => answers[q.id] !== undefined);
  };

  return (
    <>
      <TopNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            Outcome Measures
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Administer standardized outcome measures and track patient progress over time.
          </p>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search measures by name or abbreviation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Measure Definition Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {filteredDefinitions.map((measure) => (
                <Card
                  key={measure.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{measure.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs font-mono">
                            {measure.abbreviation}
                          </Badge>
                          {measure.category && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${getCategoryColor(measure.category)}`}
                            >
                              {measure.category}
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {measure.description && (
                      <p className="text-sm text-slate-600 line-clamp-2">
                        {measure.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        Score range: {measure.min_score} - {measure.max_score}
                      </span>
                      {measure.mcid !== null && measure.mcid !== undefined && (
                        <span>MCID: {measure.mcid}</span>
                      )}
                      <span>
                        {measure.higher_is_better ? 'Higher = Better' : 'Lower = Better'}
                      </span>
                    </div>

                    {measure.questions && measure.questions.length > 0 && (
                      <p className="text-xs text-slate-400">
                        {measure.questions.length} question{measure.questions.length !== 1 ? 's' : ''}
                      </p>
                    )}

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleAdminister(measure)}
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Administer
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {filteredDefinitions.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-lg font-medium">No measures found</p>
                  <p className="text-sm">Try adjusting your search or category filter.</p>
                </div>
              )}
            </div>

            {/* Recent Scores Section */}
            {recentScores.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Recent Scores
                </h2>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50">
                            <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                            <th className="text-left py-3 px-4 font-medium text-slate-600">Measure</th>
                            <th className="text-left py-3 px-4 font-medium text-slate-600">Patient</th>
                            <th className="text-right py-3 px-4 font-medium text-slate-600">Score</th>
                            <th className="text-right py-3 px-4 font-medium text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentScores.map((score) => (
                            <tr key={score.id} className="border-b last:border-b-0 hover:bg-slate-50">
                              <td className="py-3 px-4 text-slate-600">
                                {formatLocalDate(score.date_administered, 'MM/dd/yyyy')}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-medium text-slate-900">
                                  {score.measure_abbreviation || score.measure_name || 'Unknown'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                {getPatientName(score.patient_id)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="font-mono font-semibold text-slate-900">
                                  {score.raw_score}
                                </span>
                                {score.percentage_score !== null && score.percentage_score !== undefined && (
                                  <span className="text-xs text-slate-400 ml-1">
                                    ({score.percentage_score}%)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleViewHistory(score.measure_id, score.patient_id)
                                  }
                                >
                                  <BarChart3 className="h-4 w-4 mr-1" />
                                  History
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* Administer Dialog */}
        <Dialog open={administerOpen} onOpenChange={setAdministerOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Administer {selectedMeasure?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedMeasure?.abbreviation} - Score range: {selectedMeasure?.min_score} to{' '}
                {selectedMeasure?.max_score}
                {selectedMeasure?.mcid !== null && selectedMeasure?.mcid !== undefined
                  ? ` | MCID: ${selectedMeasure.mcid}`
                  : ''}
              </DialogDescription>
            </DialogHeader>

            {savedScore ? (
              <div className="py-6 text-center space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
                  <p className="text-sm text-emerald-600 font-medium mb-1">Score Saved</p>
                  <p className="text-4xl font-bold text-emerald-700">{savedScore.score}</p>
                  {savedScore.interpretation && (
                    <p className="text-sm text-emerald-600 mt-2">
                      {savedScore.interpretation}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setAdministerOpen(false)}
                >
                  Close
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Episode Selector */}
                <div className="space-y-2">
                  <Label>Patient / Episode</Label>
                  <Select value={selectedEpisodeId} onValueChange={setSelectedEpisodeId}>
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

                {/* Date */}
                <div className="space-y-2">
                  <Label>Date Administered</Label>
                  <Input
                    type="date"
                    value={scoreDate}
                    onChange={(e) => setScoreDate(e.target.value)}
                  />
                </div>

                {/* Questions or Manual Score */}
                {selectedMeasure?.questions && selectedMeasure.questions.length > 0 ? (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Questions</Label>
                    {selectedMeasure.questions.map((question: OutcomeMeasureQuestion, idx: number) => (
                      <div
                        key={question.id}
                        className="border rounded-lg p-4 space-y-2"
                      >
                        <p className="text-sm font-medium">
                          {idx + 1}. {question.text}
                        </p>
                        <div className="space-y-1">
                          {question.options.map((option) => (
                            <label
                              key={option.value}
                              className={`flex items-center gap-3 p-2 rounded cursor-pointer text-sm hover:bg-slate-50 ${
                                answers[question.id] === option.value
                                  ? 'bg-blue-50 border border-blue-200'
                                  : 'border border-transparent'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`question-${question.id}`}
                                value={option.value}
                                checked={answers[question.id] === option.value}
                                onChange={() =>
                                  setAnswers((prev) => ({
                                    ...prev,
                                    [question.id]: option.value,
                                  }))
                                }
                                className="text-blue-600"
                              />
                              <span>
                                {option.label}{' '}
                                <span className="text-slate-400">({option.value})</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Running total */}
                    <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">
                        Current Score
                      </span>
                      <span className="text-2xl font-bold text-slate-900">
                        {calculateScore()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Score</Label>
                    <Input
                      type="number"
                      placeholder={`Enter score (${selectedMeasure?.min_score} - ${selectedMeasure?.max_score})`}
                      value={manualScore}
                      onChange={(e) => setManualScore(e.target.value)}
                      min={selectedMeasure?.min_score}
                      max={selectedMeasure?.max_score}
                    />
                  </div>
                )}

                {/* Live Interpretation */}
                {selectedMeasure && allQuestionsAnswered() && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-700">Interpretation</p>
                      <p className="text-sm text-blue-600">
                        {getInterpretation(selectedMeasure, calculateScore()) ||
                          'No interpretation available for this score.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="Any additional notes about this administration..."
                    value={scoreNotes}
                    onChange={(e) => setScoreNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAdministerOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveScore}
                    disabled={!selectedEpisodeId || !allQuestionsAnswered() || saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Score'
                    )}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Score History
              </DialogTitle>
              <DialogDescription>
                {historyScores.length > 0
                  ? `${historyScores[0]?.measure_name || historyScores[0]?.measure_abbreviation || 'Measure'} - ${getPatientName(historyPatientId)}`
                  : 'Loading...'}
              </DialogDescription>
            </DialogHeader>

            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : historyScores.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p>No scores found for this combination.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Chart */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={[...historyScores]
                        .reverse()
                        .map((s) => ({
                          date: formatLocalDate(s.date_administered, 'MM/dd/yyyy'),
                          score: s.raw_score,
                          fullDate: s.date_administered,
                        }))}
                      margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      {historyScores[0]?.measure_mcid && (
                        <ReferenceLine
                          y={historyScores[0].measure_mcid}
                          stroke="#f59e0b"
                          strokeDasharray="5 5"
                          label={{
                            value: `MCID: ${historyScores[0].measure_mcid}`,
                            position: 'right',
                            fill: '#f59e0b',
                            fontSize: 11,
                          }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Score Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Date</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-600">Score</th>
                        <th className="text-center py-2 px-3 font-medium text-slate-600">Change</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyScores.map((score, idx) => {
                        const prevScore = historyScores[idx + 1];
                        const change = prevScore
                          ? score.raw_score - prevScore.raw_score
                          : null;
                        const higherIsBetter = score.measure_higher_is_better ?? true;
                        const isImprovement = change !== null
                          ? (higherIsBetter ? change > 0 : change < 0)
                          : null;

                        return (
                          <tr key={score.id} className="border-b last:border-b-0">
                            <td className="py-2 px-3 text-slate-600">
                              {formatLocalDate(score.date_administered, 'MM/dd/yyyy')}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold">
                              {score.raw_score}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {change !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                                    isImprovement
                                      ? 'text-emerald-600'
                                      : change === 0
                                        ? 'text-slate-400'
                                        : 'text-red-600'
                                  }`}
                                >
                                  {isImprovement ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : change === 0 ? (
                                    <Minus className="h-3 w-3" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3" />
                                  )}
                                  {change > 0 ? '+' : ''}{change}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">--</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-xs">
                              {score.notes || '--'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
