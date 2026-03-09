'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
  startOfDay,
  endOfDay,
  isToday,
  differenceInMinutes,
  setHours,
  setMinutes,
} from 'date-fns';
import { formatLocalDate, toLocalDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Clock,
  User,
  Loader2,
  Search,
  MapPin,
  Repeat,
  X,
  Smartphone,
  ExternalLink,
  Phone,
  FileText,
  Undo2,
  Minimize2,
  Info,
  AlertCircle,
} from 'lucide-react';
import { VisitAuthSummary } from '@/components/schedule/VisitAuthSummary';
import { useAuth } from '@/lib/auth-context';
import {
  Visit,
  Note,
  AppointmentStatus,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
  Patient,
  Discipline,
  DISCIPLINE_LABELS,
  DISCIPLINE_COLORS,
  resolveDiscipline,
} from '@/lib/types';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Constants (same as main schedule)
// ---------------------------------------------------------------------------

const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const AUTO_REFRESH_MS = 60_000;

const VISIT_TYPE_OPTIONS = [
  { value: 'treatment', label: 'Treatment' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 're_evaluation', label: 'Re-Evaluation' },
  { value: 'discharge', label: 'Discharge' },
];

const STATUS_ACTIONS: { from: AppointmentStatus[]; to: AppointmentStatus; label: string }[] = [
  { from: ['scheduled'], to: 'confirmed', label: 'Confirm' },
  { from: ['scheduled', 'confirmed'], to: 'checked_in', label: 'Check In' },
  { from: ['checked_in', 'in_progress'], to: 'checked_out', label: 'Check Out' },
  { from: ['checked_in', 'in_progress', 'checked_out'], to: 'completed', label: 'Complete' },
  { from: ['scheduled', 'confirmed', 'checked_in', 'in_progress'], to: 'no_show', label: 'No Show' },
  { from: ['scheduled', 'confirmed', 'checked_in', 'in_progress'], to: 'cancelled', label: 'Cancel' },
  { from: ['no_show', 'cancelled'], to: 'scheduled', label: 'Reschedule' },
];

const DISCIPLINE_BG: Record<string, string> = {
  PT: 'bg-blue-50 hover:bg-blue-100',
  OT: 'bg-lime-50 hover:bg-lime-100',
  ST: 'bg-yellow-50 hover:bg-yellow-100',
};
const DISCIPLINE_BORDER_COLOR: Record<string, string> = {
  PT: 'border-blue-300',
  OT: 'border-lime-300',
  ST: 'border-yellow-300',
};
const DEFAULT_DISCIPLINE_BG = 'bg-blue-50 hover:bg-blue-100';

const STATUS_BORDER: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-slate-400',
  confirmed: 'border-l-green-500',
  checked_in: 'border-l-orange-500',
  in_progress: 'border-l-amber-500',
  checked_out: 'border-l-teal-500',
  completed: 'border-l-teal-600',
  no_show: 'border-l-red-500',
  cancelled: 'border-l-red-400',
  rescheduled: 'border-l-orange-500',
};

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-100 text-slate-600 border-slate-200',
  confirmed: 'bg-green-100 text-green-700 border-green-200',
  checked_in: 'bg-orange-100 text-orange-700 border-orange-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  checked_out: 'bg-teal-100 text-teal-700 border-teal-200',
  completed: 'bg-teal-100 text-teal-700 border-teal-200',
  no_show: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-red-50 text-red-500 border-red-200',
  rescheduled: 'bg-orange-100 text-orange-700 border-orange-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TherapistOption {
  user_id: string;
  name: string;
  primary_discipline?: string;
}

function timeToMinutesSinceMidnight(dateStr: string): number {
  const d = toLocalDate(dateStr);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToTop(minutes: number): number {
  const minutesSinceStart = minutes - START_HOUR * 60;
  return (minutesSinceStart / 60) * HOUR_HEIGHT;
}

function formatTime12h(dateStr: string): string {
  return formatLocalDate(dateStr, 'h:mm a');
}

interface AppointmentFormData {
  patient_id: string;
  therapist_user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  visit_type: string;
  discipline: string;
  location: string;
  notes: string;
  is_recurring: boolean;
  recurrence_weeks: number;
  recurrence_days: string[];
  auth_id: string;
}

interface PatientAuth {
  id: string;
  discipline: string | null;
  auth_number: string | null;
  authorized_visits: number | null;
  used_visits: number;
  remaining_visits: number | null;
  start_date: string;
  end_date: string;
  status: string;
  auth_type: string;
  units_authorized: number | null;
  units_used: number | null;
}

// ---------------------------------------------------------------------------
// Fullscreen Schedule Page
// ---------------------------------------------------------------------------

export default function FullscreenSchedulePage() {
  const router = useRouter();
  const { currentClinic, loading: authLoading, isEmrMode } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live clock
  const [now, setNow] = useState(new Date());

  // View state
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 0 }),
    [currentDate]
  );

  // Data
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);

  // Filters
  const [filterTherapist, setFilterTherapist] = useState<string>('all');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');

  // Dialogs
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [newApptOpen, setNewApptOpen] = useState(false);

  // New appointment form
  const [formData, setFormData] = useState<AppointmentFormData>({
    patient_id: '',
    therapist_user_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00',
    end_time: '09:45',
    visit_type: 'treatment',
    discipline: 'PT',
    location: '',
    notes: '',
    is_recurring: false,
    recurrence_weeks: 8,
    recurrence_days: ['MO'] as string[],
    auth_id: '',
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [patientAuths, setPatientAuths] = useState<PatientAuth[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [selectedVisitNote, setSelectedVisitNote] = useState<Note | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  // Completion dialog state
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [completeDurationOption, setCompleteDurationOption] = useState<string>('');
  const [completeCustomMinutes, setCompleteCustomMinutes] = useState('');
  const [completeShortenedReason, setCompleteShortenedReason] = useState('');
  const [completeValidationError, setCompleteValidationError] = useState('');

  // Drag-and-drop state
  const [draggingVisit, setDraggingVisit] = useState<Visit | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragOverMinute, setDragOverMinute] = useState<number | null>(null);
  const dragGrabOffsetRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Live clock — update every second
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchVisits = useCallback(async () => {
    if (!currentClinic?.clinic_id) return;
    setLoadingVisits(true);
    try {
      let from: string;
      let to: string;
      if (viewMode === 'week') {
        from = startOfDay(weekStart).toISOString();
        to = endOfDay(addDays(weekStart, 6)).toISOString();
      } else {
        from = startOfDay(currentDate).toISOString();
        to = endOfDay(currentDate).toISOString();
      }

      const [visitsRes, smsRes] = await Promise.all([
        fetch(`/api/visits?clinic_id=${currentClinic.clinic_id}&from=${from}&to=${to}`),
        fetch(`/api/appointments/sms?from=${from}&to=${to}`),
      ]);

      if (!visitsRes.ok) throw new Error('Failed to fetch visits');
      const visitsData: Visit[] = await visitsRes.json();

      let smsData: Visit[] = [];
      if (smsRes.ok) {
        smsData = await smsRes.json();
      }

      setVisits([...visitsData, ...smsData]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load appointments');
    } finally {
      setLoadingVisits(false);
    }
  }, [currentClinic?.clinic_id, weekStart, currentDate, viewMode]);

  const fetchPatients = useCallback(async () => {
    if (!currentClinic?.clinic_id) return;
    try {
      const res = await fetch(`/api/patients?clinic_id=${currentClinic.clinic_id}`);
      if (res.ok) setPatients(await res.json());
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  }, [currentClinic?.clinic_id]);

  const fetchTherapists = useCallback(async () => {
    if (!currentClinic?.clinic_id) return;
    try {
      const res = await fetch(`/api/clinic-members?clinic_id=${currentClinic.clinic_id}`);
      if (res.ok) {
        const data = await res.json();
        setTherapists(
          data
            .filter((m: { role: string; is_active: boolean }) =>
              ['pt', 'pta', 'ot', 'ota', 'slp', 'slpa'].includes(m.role) && m.is_active
            )
            .map((m: { user_id: string; display_name?: string; email?: string; primary_discipline?: string; role?: string }) => ({
              user_id: m.user_id,
              name: m.display_name || m.email || m.user_id,
              primary_discipline: m.primary_discipline || 'PT',
              role: m.role,
            }))
        );
      }
    } catch (err) {
      console.error('Error fetching therapists:', err);
    }
  }, [currentClinic?.clinic_id]);

  const fetchPatientAuths = useCallback(async (patientId: string) => {
    if (!patientId || !currentClinic?.clinic_id) {
      setPatientAuths([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        patient_id: patientId,
        clinic_id: currentClinic.clinic_id,
        status: 'approved',
      });
      const res = await fetch(`/api/authorizations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPatientAuths(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching patient auths:', err);
    }
  }, [currentClinic?.clinic_id]);

  useEffect(() => {
    if (formData.patient_id) {
      fetchPatientAuths(formData.patient_id);
    } else {
      setPatientAuths([]);
    }
  }, [formData.patient_id, fetchPatientAuths]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  useEffect(() => {
    fetchPatients();
    fetchTherapists();
  }, [fetchPatients, fetchTherapists]);

  // Auto-refresh visits every 60 seconds
  useEffect(() => {
    const id = setInterval(() => {
      fetchVisits();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchVisits]);

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (viewMode === 'week') setCurrentDate((d: Date) => subWeeks(d, 1));
    else setCurrentDate((d: Date) => addDays(d, -1));
  };
  const goNext = () => {
    if (viewMode === 'week') setCurrentDate((d: Date) => addWeeks(d, 1));
    else setCurrentDate((d: Date) => addDays(d, 1));
  };

  // ---------------------------------------------------------------------------
  // Filtered visits
  // ---------------------------------------------------------------------------

  const filteredVisits = useMemo(() => {
    let result = visits;
    if (filterTherapist !== 'all') result = result.filter((v: Visit) => v.therapist_user_id === filterTherapist);
    if (filterDiscipline !== 'all') result = result.filter((v: Visit) => resolveDiscipline(v.discipline) === filterDiscipline);
    return result;
  }, [visits, filterTherapist, filterDiscipline]);

  const daysToRender = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [viewMode, currentDate, weekStart]);

  // ---------------------------------------------------------------------------
  // Day-view therapist columns
  // ---------------------------------------------------------------------------

  const dayViewTherapists = useMemo(() => {
    if (viewMode !== 'day') return [];
    let list = therapists;
    if (filterTherapist !== 'all') {
      list = list.filter((t: TherapistOption) => t.user_id === filterTherapist);
    }
    if (filterDiscipline !== 'all') {
      list = list.filter((t: TherapistOption) => {
        const disc = (t.primary_discipline || 'PT').toUpperCase();
        return disc === filterDiscipline;
      });
    }
    return list;
  }, [viewMode, therapists, filterTherapist, filterDiscipline]);

  const dayViewHasUnassigned = useMemo(() => {
    if (viewMode !== 'day') return false;
    return filteredVisits
      .filter((v: Visit) => isSameDay(toLocalDate(v.start_time), currentDate))
      .some((v: Visit) => !v.therapist_user_id || !dayViewTherapists.some((t: TherapistOption) => t.user_id === v.therapist_user_id));
  }, [viewMode, filteredVisits, currentDate, dayViewTherapists]);

  const dayViewColumnCount = dayViewTherapists.length + (dayViewHasUnassigned ? 1 : 0);

  const visitsForDay = useCallback(
    (day: Date) => filteredVisits.filter((v: Visit) => isSameDay(toLocalDate(v.start_time), day)),
    [filteredVisits]
  );

  const visitsForDayAndTherapist = useCallback(
    (day: Date, therapistId: string | null) =>
      filteredVisits.filter((v: Visit) => {
        if (!isSameDay(toLocalDate(v.start_time), day)) return false;
        if (therapistId === null) {
          return !v.therapist_user_id || !dayViewTherapists.some((t: TherapistOption) => t.user_id === v.therapist_user_id);
        }
        return v.therapist_user_id === therapistId;
      }),
    [filteredVisits, dayViewTherapists]
  );

  // ---------------------------------------------------------------------------
  // Appointment click handler
  // ---------------------------------------------------------------------------

  const handleVisitClick = (visit: Visit) => {
    setSelectedVisit(visit);
    setSelectedVisitNote(null);
    setDetailsOpen(true);
    if (visit.status === 'completed') {
      setLoadingNote(true);
      fetch(`/api/notes?visit_id=${visit.id}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((notes: Note[]) => setSelectedVisitNote(notes.length > 0 ? notes[0] : null))
        .catch(() => setSelectedVisitNote(null))
        .finally(() => setLoadingNote(false));
    }
  };

  // ---------------------------------------------------------------------------
  // Status update
  // ---------------------------------------------------------------------------

  const handleStatusChange = async (visitId: string, newStatus: AppointmentStatus, completionData?: { actual_duration_minutes: number; shortened_visit_reason?: string }) => {
    setUpdatingStatus(true);
    try {
      const visit = visits.find((v: Visit) => v.id === visitId);
      const isSms = visit?.source === 'sms' && visit?.sms_appointment_id;

      let res: Response;
      if (isSms) {
        res = await fetch(`/api/appointments/sms/${visit.sms_appointment_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            clinic_id: currentClinic?.clinic_id,
            therapist_user_id: visit.therapist_user_id || null,
          }),
        });
      } else {
        const updateBody: Record<string, unknown> = { status: newStatus };
        if (newStatus === 'scheduled') {
          updateBody.cancelled_at = null;
          updateBody.cancel_reason = null;
        }
        if (newStatus === 'completed' && completionData) {
          updateBody.actual_duration_minutes = completionData.actual_duration_minutes;
          if (completionData.shortened_visit_reason) {
            updateBody.shortened_visit_reason = completionData.shortened_visit_reason;
          }
        }
        res = await fetch(`/api/visits/${visitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        });
      }

      if (!res.ok) throw new Error('Failed to update status');
      const updated = await res.json();

      const statusUpdate: Partial<Visit> = { status: newStatus };
      if (newStatus === 'completed' && completionData) {
        statusUpdate.actual_duration_minutes = completionData.actual_duration_minutes;
        statusUpdate.shortened_visit_reason = completionData.shortened_visit_reason || null;
      }
      setVisits((prev: Visit[]) => prev.map((v: Visit) => (v.id === visitId ? { ...v, ...statusUpdate } : v)));
      setSelectedVisit((prev: Visit | null) => (prev && prev.id === visitId ? { ...prev, ...statusUpdate } : prev));
      toast.success(`Status updated to ${APPOINTMENT_STATUS_LABELS[newStatus]}`);

      if (isSms && newStatus === 'completed' && updated._createdVisit) {
        toast.success('Visit record auto-created from SMS appointment');
      }

      if (newStatus === 'completed') {
        const completedVisitId = (isSms && updated._createdVisit?.id)
          ? updated._createdVisit.id
          : visitId.replace(/^sms-/, '');

        let authIdToDecrement = visit?.auth_id || (updated as Record<string, unknown>).auth_id;

        if (!authIdToDecrement && visit?.patient_id && visit?.discipline) {
          try {
            const params = new URLSearchParams({
              patient_id: visit.patient_id,
              clinic_id: currentClinic?.clinic_id || '',
              status: 'approved',
              discipline: visit.discipline,
            });
            const authRes = await fetch(`/api/authorizations?${params}`);
            if (authRes.ok) {
              const auths = await authRes.json();
              if (Array.isArray(auths) && auths.length > 0) {
                const nowStr = new Date().toISOString().split('T')[0];
                const active = auths.filter(
                  (a: { start_date: string; end_date: string }) =>
                    a.start_date <= nowStr && a.end_date >= nowStr
                );
                if (active.length > 0) {
                  authIdToDecrement = active[0].id;
                  toast.info('Auto-linked visit to active authorization');
                }
              }
            }
          } catch { /* non-critical */ }
        }

        if (authIdToDecrement && completedVisitId && !completedVisitId.startsWith('sms-')) {
          try {
            await fetch('/api/authorizations/decrement', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ auth_id: authIdToDecrement, visit_id: completedVisitId }),
            });
          } catch { /* non-critical */ }
        }

        const noteVisitId = completedVisitId;
        // Skip redirect in paper mode — notes are written on paper, not in EMR
        if (noteVisitId && !noteVisitId.startsWith('sms-') && isEmrMode) {
          toast.success('Redirecting to SOAP note...');
          router.push(`/daily/new?visit_id=${noteVisitId}`);
          return;
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete visit
  // ---------------------------------------------------------------------------

  const handleDeleteVisit = async (visitId: string) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    try {
      const res = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setVisits((prev: Visit[]) => prev.filter((v: Visit) => v.id !== visitId));
      setDetailsOpen(false);
      setSelectedVisit(null);
      toast.success('Appointment deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete appointment');
    }
  };

  // ---------------------------------------------------------------------------
  // Create appointment
  // ---------------------------------------------------------------------------

  const handleCreateAppointment = async () => {
    if (!currentClinic?.clinic_id) {
      toast.error('No clinic selected. Please select a clinic first.');
      return;
    }
    setSubmitting(true);
    try {
      const startISO = new Date(`${formData.date}T${formData.start_time}:00`).toISOString();
      const endISO = new Date(`${formData.date}T${formData.end_time}:00`).toISOString();

      if (formData.is_recurring) {
        const dayStr = formData.recurrence_days.join(',');
        const rrule = `FREQ=WEEKLY;COUNT=${formData.recurrence_weeks};BYDAY=${dayStr}`;
        const res = await fetch('/api/visits/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: currentClinic.clinic_id,
            patient_id: formData.patient_id || null,
            therapist_user_id: formData.therapist_user_id || null,
            start_time: startISO,
            end_time: endISO,
            visit_type: formData.visit_type,
            discipline: formData.discipline || 'PT',
            location: formData.location || null,
            notes: formData.notes || null,
            recurrence_rule: rrule,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create recurring appointments');
        }
        const result = await res.json();
        toast.success(`Created ${result.count} recurring appointments`);
      } else {
        const res = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: currentClinic.clinic_id,
            patient_id: formData.patient_id || null,
            therapist_user_id: formData.therapist_user_id || null,
            start_time: startISO,
            end_time: endISO,
            visit_type: formData.visit_type,
            discipline: formData.discipline || 'PT',
            location: formData.location || null,
            notes: formData.notes || null,
            source: 'manual',
            auth_id: formData.auth_id || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create appointment');
        }
        toast.success('Appointment created');
      }

      setNewApptOpen(false);
      resetForm();
      fetchVisits();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create appointment';
      console.error(err);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback(
    (e: React.DragEvent, visit: Visit) => {
      const status = visit.status || 'scheduled';
      if (['completed', 'cancelled', 'no_show'].includes(status)) { e.preventDefault(); return; }
      if (visit.source === 'sms') { e.preventDefault(); return; }
      setDraggingVisit(visit);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', visit.id);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const grabY = e.clientY - rect.top;
      dragGrabOffsetRef.current = (grabY / HOUR_HEIGHT) * 60;
      if (e.dataTransfer.setDragImage) {
        const el = e.target as HTMLElement;
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, grabY);
      }
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggingVisit(null);
    setDragOverDay(null);
    setDragOverMinute(null);
  }, []);

  const calcDropMinute = useCallback((e: React.DragEvent, columnEl: HTMLElement) => {
    const rect = columnEl.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const rawMinute = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60 - dragGrabOffsetRef.current;
    return Math.round(rawMinute / 15) * 15;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, dayKey: string, columnEl: HTMLElement) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverDay(dayKey);
      setDragOverMinute(calcDropMinute(e, columnEl));
    },
    [calcDropMinute]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOverDay(null);
      setDragOverMinute(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetDay: Date, columnEl: HTMLElement) => {
      e.preventDefault();
      if (!draggingVisit) return;
      const dropMinute = calcDropMinute(e, columnEl);
      const visit = draggingVisit;
      const durationMin = differenceInMinutes(toLocalDate(visit.end_time), toLocalDate(visit.start_time));
      const endMinute = dropMinute + durationMin;

      if (dropMinute < START_HOUR * 60 || endMinute > END_HOUR * 60) {
        toast.error('Cannot drop outside schedule hours');
        handleDragEnd();
        return;
      }

      const dateStr = format(targetDay, 'yyyy-MM-dd');
      const pad = (n: number) => n.toString().padStart(2, '0');
      const newStartISO = new Date(`${dateStr}T${pad(Math.floor(dropMinute / 60))}:${pad(dropMinute % 60)}:00`).toISOString();
      const newEndISO = new Date(`${dateStr}T${pad(Math.floor(endMinute / 60))}:${pad(endMinute % 60)}:00`).toISOString();

      setVisits((prev: Visit[]) =>
        prev.map((v: Visit) => (v.id === visit.id ? { ...v, start_time: newStartISO, end_time: newEndISO } : v))
      );
      handleDragEnd();

      try {
        const res = await fetch(`/api/visits/${visit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_time: newStartISO, end_time: newEndISO }),
        });
        if (!res.ok) throw new Error('Failed to reschedule');
        toast.success('Appointment rescheduled');
      } catch (err) {
        console.error(err);
        toast.error('Failed to reschedule appointment');
        setVisits((prev: Visit[]) =>
          prev.map((v: Visit) => (v.id === visit.id ? { ...v, start_time: visit.start_time, end_time: visit.end_time } : v))
        );
      }
    },
    [draggingVisit, calcDropMinute, handleDragEnd]
  );

  const resetForm = () => {
    setFormData({
      patient_id: '',
      therapist_user_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '09:00',
      end_time: '09:45',
      visit_type: 'treatment',
      discipline: 'PT',
      location: '',
      notes: '',
      is_recurring: false,
      recurrence_weeks: 8,
      recurrence_days: ['MO'],
      auth_id: '',
    });
    setPatientSearch('');
    setPatientAuths([]);
  };

  // ---------------------------------------------------------------------------
  // Patient search filter
  // ---------------------------------------------------------------------------

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 20);
    const q = patientSearch.toLowerCase();
    return patients
      .filter(
        (p: Patient) =>
          p.first_name.toLowerCase().includes(q) ||
          p.last_name.toLowerCase().includes(q) ||
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [patients, patientSearch]);

  // ---------------------------------------------------------------------------
  // Resolve names
  // ---------------------------------------------------------------------------

  const getPatientName = useCallback(
    (patientId: string | null | undefined) => {
      if (!patientId) return 'No patient';
      const p = patients.find((pt: Patient) => pt.id === patientId);
      return p ? `${p.first_name} ${p.last_name}` : 'Unknown Patient';
    },
    [patients]
  );

  const getTherapistName = useCallback(
    (therapistId: string | null | undefined) => {
      if (!therapistId) return 'Unassigned';
      const t = therapists.find((th: TherapistOption) => th.user_id === therapistId);
      return t ? t.name : 'Unknown';
    },
    [therapists]
  );

  // ---------------------------------------------------------------------------
  // Header label
  // ---------------------------------------------------------------------------

  const headerLabel = useMemo(() => {
    if (viewMode === 'day') return format(currentDate, 'EEEE, MMMM d, yyyy');
    const end = addDays(weekStart, 6);
    if (weekStart.getMonth() === end.getMonth()) {
      return `${format(weekStart, 'MMMM d')} - ${format(end, 'd, yyyy')}`;
    }
    return `${format(weekStart, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  }, [viewMode, currentDate, weekStart]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      {/* ----------------------------------------------------------------- */}
      {/* Floating toolbar                                                  */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-slate-50/80 backdrop-blur-sm z-50">
        {/* Left: clock + date label */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">{headerLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{format(now, 'h:mm:ss a')}</span>
          </div>
          {loadingVisits && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('day')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'day' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'week' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Week
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={goPrev}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={goNext}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Therapist filter */}
          <Select value={filterTherapist} onValueChange={setFilterTherapist}>
            <SelectTrigger className="w-[160px] h-7 text-xs">
              <SelectValue placeholder="All Therapists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Therapists</SelectItem>
              {therapists.map((t: TherapistOption) => (
                <SelectItem key={t.user_id} value={t.user_id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Discipline filter */}
          <div className="flex items-center border rounded-md overflow-hidden h-7">
            {(['all', 'PT', 'OT', 'ST'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setFilterDiscipline(d)}
                className={`px-2 py-0.5 text-xs font-medium border-r last:border-r-0 transition-colors ${
                  filterDiscipline === d
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {d === 'all' ? 'All' : d}
              </button>
            ))}
          </div>

          {/* New Appointment */}
          <Button
            onClick={() => { resetForm(); setNewApptOpen(true); }}
            size="sm"
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => window.close()}
            title="Close window"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* F11 hint */}
      <div className="text-center text-[10px] text-slate-400 py-0.5 bg-slate-50/50 border-b select-none">
        Press <kbd className="px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-mono text-[9px]">F11</kbd> for true fullscreen
        <span className="mx-2 text-slate-300">|</span>
        Auto-refreshes every 60s
        <span className="mx-2 text-slate-300">|</span>
        {currentClinic?.clinic_name}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Calendar grid                                                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Day headers */}
        <div
          className="grid border-b bg-slate-50 flex-shrink-0"
          style={{
            gridTemplateColumns: viewMode === 'day' && dayViewColumnCount > 0
              ? `52px repeat(${dayViewColumnCount}, 1fr)`
              : `52px repeat(${daysToRender.length}, 1fr)`,
          }}
        >
          <div className="border-r p-1.5 text-xs text-slate-400 text-center">
            <Clock className="h-3 w-3 mx-auto" />
          </div>
          {viewMode === 'day' && dayViewColumnCount > 0 ? (
            <>
              {dayViewTherapists.map((t: TherapistOption) => (
                <div
                  key={t.user_id}
                  className={`p-1.5 text-center border-r last:border-r-0 ${isToday(currentDate) ? 'bg-blue-50' : ''}`}
                >
                  <div className="text-[10px] font-semibold text-slate-800 truncate">{t.name}</div>
                  <div className="text-[9px] text-slate-500 uppercase">{t.primary_discipline || 'PT'}</div>
                </div>
              ))}
              {dayViewHasUnassigned && (
                <div className={`p-1.5 text-center border-r last:border-r-0 ${isToday(currentDate) ? 'bg-blue-50' : ''}`}>
                  <div className="text-[10px] font-semibold text-slate-400 truncate">Unassigned</div>
                </div>
              )}
            </>
          ) : (
            daysToRender.map((day: Date) => (
              <div
                key={day.toISOString()}
                className={`p-1.5 text-center border-r last:border-r-0 ${isToday(day) ? 'bg-blue-50' : ''}`}
              >
                <div className="text-[10px] text-slate-500 uppercase">{format(day, 'EEE')}</div>
                <div className={`text-base font-semibold ${isToday(day) ? 'text-blue-600' : 'text-slate-800'}`}>
                  {format(day, 'd')}
                </div>
                <div className="text-[10px] text-slate-400">{format(day, 'MMM')}</div>
              </div>
            ))
          )}
        </div>

        {/* Scrollable time grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: viewMode === 'day' && dayViewColumnCount > 0
                ? `52px repeat(${dayViewColumnCount}, 1fr)`
                : `52px repeat(${daysToRender.length}, 1fr)`,
              height: `${TOTAL_HOURS * HOUR_HEIGHT}px`,
            }}
          >
            {/* Time gutter */}
            <div className="border-r relative">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-0 left-0 flex items-start justify-end pr-1.5 -mt-2"
                  style={{ top: `${i * HOUR_HEIGHT}px` }}
                >
                  <span className="text-[10px] text-slate-400">
                    {format(setMinutes(setHours(new Date(), START_HOUR + i), 0), 'h a')}
                  </span>
                </div>
              ))}
            </div>

            {/* Day view: therapist sub-columns */}
            {viewMode === 'day' && dayViewColumnCount > 0 ? (
              <>
                {dayViewTherapists.map((t: TherapistOption) => {
                  const colVisits = visitsForDayAndTherapist(currentDate, t.user_id);
                  const dayKey = `${currentDate.toISOString()}-${t.user_id}`;
                  const isDropTarget = dragOverDay === dayKey;
                  return (
                    <div
                      key={dayKey}
                      className={`relative border-r last:border-r-0 ${isToday(currentDate) ? 'bg-blue-50/30' : ''} ${isDropTarget ? 'bg-blue-50/50' : ''}`}
                      onDragOver={(e) => handleDragOver(e, dayKey, e.currentTarget as HTMLElement)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, currentDate, e.currentTarget as HTMLElement)}
                    >
                      {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                        <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: `${i * HOUR_HEIGHT}px` }} />
                      ))}
                      {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                        <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-dashed border-slate-50" style={{ top: `${i * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }} />
                      ))}
                      {isToday(currentDate) && (() => {
                        const nowMinutes = now.getHours() * 60 + now.getMinutes();
                        if (nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60) {
                          return (
                            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${minutesToTop(nowMinutes)}px` }}>
                              <div className="flex items-center">
                                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                                <div className="flex-1 h-px bg-red-500" />
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {isDropTarget && dragOverMinute != null && draggingVisit && (() => {
                        const indicatorTop = minutesToTop(dragOverMinute);
                        const durationMin = differenceInMinutes(toLocalDate(draggingVisit.end_time), toLocalDate(draggingVisit.start_time));
                        const indicatorHeight = (durationMin / 60) * HOUR_HEIGHT;
                        return (
                          <div
                            className="absolute left-1 right-1 z-30 pointer-events-none rounded-md border-2 border-dashed border-blue-400 bg-blue-100/30"
                            style={{ top: `${Math.max(indicatorTop, 0)}px`, height: `${Math.max(indicatorHeight, 20)}px` }}
                          />
                        );
                      })()}
                      {colVisits.map((visit: Visit) => {
                        const startMin = timeToMinutesSinceMidnight(visit.start_time);
                        const endMin = timeToMinutesSinceMidnight(visit.end_time);
                        const top = minutesToTop(startMin);
                        const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                        const status: AppointmentStatus = visit.status || 'scheduled';
                        const isCancelled = status === 'cancelled';
                        const isNoShow = status === 'no_show';
                        const isInactive = isCancelled || isNoShow;
                        const discipline = resolveDiscipline(visit.discipline);
                        const typeBg = isInactive ? 'bg-red-50/60 hover:bg-red-100/60' : (DISCIPLINE_BG[discipline] || DEFAULT_DISCIPLINE_BG);
                        const statusBorder = STATUS_BORDER[status] || STATUS_BORDER.scheduled;
                        const isSmsAppt = visit.source === 'sms';
                        const isPtbot = (visit.source as string) === 'ptbot';
                        const isDraggable = !isInactive && visit.source !== 'sms';
                        const isBeingDragged = draggingVisit?.id === visit.id;
                        return (
                          <button
                            key={visit.id}
                            draggable={isDraggable}
                            onDragStart={(e) => handleDragStart(e, visit)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleVisitClick(visit)}
                            className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 text-left transition-colors cursor-pointer z-10 overflow-hidden ${statusBorder} ${typeBg} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isBeingDragged ? 'opacity-40' : ''}`}
                            style={{ top: `${Math.max(top, 0)}px`, height: `${Math.max(height, 20)}px` }}
                          >
                            <div className={`text-xs font-semibold text-slate-900 truncate flex items-center gap-1 ${isInactive ? 'line-through text-red-400' : ''}`}>
                              {visit.patient_name || getPatientName(visit.patient_id)}
                            </div>
                            {height > 30 && (
                              <div className={`text-[10px] text-slate-600 truncate ${isInactive ? 'line-through text-red-300' : ''}`}>
                                {formatTime12h(visit.start_time)} - {formatTime12h(visit.end_time)}
                              </div>
                            )}
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[8px] font-semibold px-1 py-px rounded ${DISCIPLINE_COLORS[discipline]?.badge || DISCIPLINE_COLORS.PT.badge}`}>
                                {discipline}
                              </span>
                              {isSmsAppt && <span className="text-[8px] font-semibold px-1 py-px rounded bg-slate-200 text-slate-600">SMS</span>}
                              {isPtbot && <span className="text-[8px] font-semibold px-1 py-px rounded bg-indigo-100 text-indigo-600">App</span>}
                              {height > 40 && (
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_BADGE[status] || STATUS_BADGE.scheduled}`}>
                                  {APPOINTMENT_STATUS_LABELS[status]}
                                </Badge>
                              )}
                            </div>
                            {status === 'completed' && visit.actual_duration_minutes != null && (() => {
                              const schedMin = differenceInMinutes(toLocalDate(visit.end_time), toLocalDate(visit.start_time));
                              if (visit.actual_duration_minutes !== schedMin) {
                                return (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[9px] text-amber-700">{schedMin}&rarr;{visit.actual_duration_minutes} min</span>
                                    {visit.shortened_visit_reason && (
                                      <span className="group relative">
                                        <Info className="h-3 w-3 text-amber-500 cursor-help" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] text-white bg-slate-800 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 max-w-[200px] truncate">
                                          {visit.shortened_visit_reason}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {/* Unassigned column */}
                {dayViewHasUnassigned && (() => {
                  const colVisits = visitsForDayAndTherapist(currentDate, null);
                  const dayKey = `${currentDate.toISOString()}-unassigned`;
                  const isDropTarget = dragOverDay === dayKey;
                  return (
                    <div
                      key={dayKey}
                      className={`relative border-r last:border-r-0 ${isToday(currentDate) ? 'bg-blue-50/30' : ''} ${isDropTarget ? 'bg-blue-50/50' : ''}`}
                      onDragOver={(e) => handleDragOver(e, dayKey, e.currentTarget as HTMLElement)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, currentDate, e.currentTarget as HTMLElement)}
                    >
                      {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                        <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: `${i * HOUR_HEIGHT}px` }} />
                      ))}
                      {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                        <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-dashed border-slate-50" style={{ top: `${i * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }} />
                      ))}
                      {colVisits.map((visit: Visit) => {
                        const startMin = timeToMinutesSinceMidnight(visit.start_time);
                        const endMin = timeToMinutesSinceMidnight(visit.end_time);
                        const top = minutesToTop(startMin);
                        const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                        const status: AppointmentStatus = visit.status || 'scheduled';
                        const isCancelled = status === 'cancelled';
                        const isNoShow = status === 'no_show';
                        const isInactive = isCancelled || isNoShow;
                        const discipline = resolveDiscipline(visit.discipline);
                        const typeBg = isInactive ? 'bg-red-50/60 hover:bg-red-100/60' : (DISCIPLINE_BG[discipline] || DEFAULT_DISCIPLINE_BG);
                        const statusBorder = STATUS_BORDER[status] || STATUS_BORDER.scheduled;
                        const isSmsAppt = visit.source === 'sms';
                        const isPtbot = (visit.source as string) === 'ptbot';
                        const isDraggable = !isInactive && visit.source !== 'sms';
                        const isBeingDragged = draggingVisit?.id === visit.id;
                        return (
                          <button
                            key={visit.id}
                            draggable={isDraggable}
                            onDragStart={(e) => handleDragStart(e, visit)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleVisitClick(visit)}
                            className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 text-left transition-colors cursor-pointer z-10 overflow-hidden ${statusBorder} ${typeBg} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isBeingDragged ? 'opacity-40' : ''}`}
                            style={{ top: `${Math.max(top, 0)}px`, height: `${Math.max(height, 20)}px` }}
                          >
                            <div className={`text-xs font-semibold text-slate-900 truncate flex items-center gap-1 ${isInactive ? 'line-through text-red-400' : ''}`}>
                              {visit.patient_name || getPatientName(visit.patient_id)}
                            </div>
                            {height > 30 && (
                              <div className={`text-[10px] text-slate-600 truncate ${isInactive ? 'line-through text-red-300' : ''}`}>
                                {formatTime12h(visit.start_time)} - {formatTime12h(visit.end_time)}
                              </div>
                            )}
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[8px] font-semibold px-1 py-px rounded ${DISCIPLINE_COLORS[discipline]?.badge || DISCIPLINE_COLORS.PT.badge}`}>
                                {discipline}
                              </span>
                              {isSmsAppt && <span className="text-[8px] font-semibold px-1 py-px rounded bg-slate-200 text-slate-600">SMS</span>}
                              {isPtbot && <span className="text-[8px] font-semibold px-1 py-px rounded bg-indigo-100 text-indigo-600">App</span>}
                              {height > 40 && (
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_BADGE[status] || STATUS_BADGE.scheduled}`}>
                                  {APPOINTMENT_STATUS_LABELS[status]}
                                </Badge>
                              )}
                            </div>
                            {status === 'completed' && visit.actual_duration_minutes != null && (() => {
                              const schedMin = differenceInMinutes(toLocalDate(visit.end_time), toLocalDate(visit.start_time));
                              if (visit.actual_duration_minutes !== schedMin) {
                                return (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[9px] text-amber-700">{schedMin}&rarr;{visit.actual_duration_minutes} min</span>
                                    {visit.shortened_visit_reason && (
                                      <span className="group relative">
                                        <Info className="h-3 w-3 text-amber-500 cursor-help" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] text-white bg-slate-800 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 max-w-[200px] truncate">
                                          {visit.shortened_visit_reason}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            ) : (
            /* Week view: standard day columns */
            daysToRender.map((day: Date) => {
              const dayVisits = visitsForDay(day);
              const dayKey = day.toISOString();
              const isDropTarget = dragOverDay === dayKey;
              return (
                <div
                  key={dayKey}
                  className={`relative border-r last:border-r-0 ${isToday(day) ? 'bg-blue-50/30' : ''} ${isDropTarget ? 'bg-blue-50/50' : ''}`}
                  onDragOver={(e) => handleDragOver(e, dayKey, e.currentTarget as HTMLElement)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, day, e.currentTarget as HTMLElement)}
                >
                  {/* Hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: `${i * HOUR_HEIGHT}px` }} />
                  ))}
                  {/* Half-hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-dashed border-slate-50" style={{ top: `${i * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }} />
                  ))}

                  {/* Current time indicator */}
                  {isToday(day) && (() => {
                    const nowMinutes = now.getHours() * 60 + now.getMinutes();
                    if (nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60) {
                      return (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${minutesToTop(nowMinutes)}px` }}>
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                            <div className="flex-1 h-px bg-red-500" />
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Drop indicator line */}
                  {isDropTarget && dragOverMinute != null && draggingVisit && (() => {
                    const indicatorTop = minutesToTop(dragOverMinute);
                    const durationMin = differenceInMinutes(toLocalDate(draggingVisit.end_time), toLocalDate(draggingVisit.start_time));
                    const indicatorHeight = (durationMin / 60) * HOUR_HEIGHT;
                    return (
                      <div
                        className="absolute left-1 right-1 z-30 pointer-events-none rounded-md border-2 border-dashed border-blue-400 bg-blue-100/30"
                        style={{ top: `${Math.max(indicatorTop, 0)}px`, height: `${Math.max(indicatorHeight, 20)}px` }}
                      />
                    );
                  })()}

                  {/* Appointment blocks */}
                  {dayVisits.map((visit: Visit) => {
                    const startMin = timeToMinutesSinceMidnight(visit.start_time);
                    const endMin = timeToMinutesSinceMidnight(visit.end_time);
                    const top = minutesToTop(startMin);
                    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                    const status: AppointmentStatus = visit.status || 'scheduled';
                    const isCancelled = status === 'cancelled';
                    const isNoShow = status === 'no_show';
                    const isInactive = isCancelled || isNoShow;
                    const discipline = resolveDiscipline(visit.discipline);

                    const typeBg = isInactive
                      ? 'bg-red-50/60 hover:bg-red-100/60'
                      : (DISCIPLINE_BG[discipline] || DEFAULT_DISCIPLINE_BG);
                    const statusBorder = STATUS_BORDER[status] || STATUS_BORDER.scheduled;

                    const isSmsAppt = visit.source === 'sms';
                    const isPtbot = (visit.source as string) === 'ptbot';
                    const isDraggable = !isInactive && visit.source !== 'sms';
                    const isBeingDragged = draggingVisit?.id === visit.id;

                    return (
                      <button
                        key={visit.id}
                        draggable={isDraggable}
                        onDragStart={(e) => handleDragStart(e, visit)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleVisitClick(visit)}
                        className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 text-left transition-colors cursor-pointer z-10 overflow-hidden ${statusBorder} ${typeBg} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isBeingDragged ? 'opacity-40' : ''}`}
                        style={{ top: `${Math.max(top, 0)}px`, height: `${Math.max(height, 20)}px` }}
                      >
                        <div className={`text-xs font-semibold text-slate-900 truncate flex items-center gap-1 ${isInactive ? 'line-through text-red-400' : ''}`}>
                          {visit.patient_name || getPatientName(visit.patient_id)}
                        </div>
                        {height > 30 && (
                          <div className={`text-[10px] text-slate-600 truncate ${isInactive ? 'line-through text-red-300' : ''}`}>
                            {formatTime12h(visit.start_time)} - {formatTime12h(visit.end_time)}
                          </div>
                        )}
                        {height > 48 && (
                          <div className="text-[10px] text-slate-500 truncate">
                            {visit.therapist_name || getTherapistName(visit.therapist_user_id)}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[8px] font-semibold px-1 py-px rounded ${DISCIPLINE_COLORS[discipline]?.badge || DISCIPLINE_COLORS.PT.badge}`}>
                            {discipline}
                          </span>
                          {isSmsAppt && (
                            <span className="text-[8px] font-semibold px-1 py-px rounded bg-slate-200 text-slate-600">SMS</span>
                          )}
                          {isPtbot && (
                            <span className="text-[8px] font-semibold px-1 py-px rounded bg-indigo-100 text-indigo-600">App</span>
                          )}
                          {height > 40 && (
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_BADGE[status] || STATUS_BADGE.scheduled}`}>
                              {APPOINTMENT_STATUS_LABELS[status]}
                            </Badge>
                          )}
                        </div>
                        {/* Shortened visit indicator on completed cards */}
                        {status === 'completed' && visit.actual_duration_minutes != null && (() => {
                          const schedMin = differenceInMinutes(
                            toLocalDate(visit.end_time),
                            toLocalDate(visit.start_time)
                          );
                          if (visit.actual_duration_minutes !== schedMin) {
                            return (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[9px] text-amber-700">
                                  {schedMin}&rarr;{visit.actual_duration_minutes} min
                                </span>
                                {visit.shortened_visit_reason && (
                                  <span className="group relative">
                                    <Info className="h-3 w-3 text-amber-500 cursor-help" />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] text-white bg-slate-800 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 max-w-[200px] truncate">
                                      {visit.shortened_visit_reason}
                                    </span>
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </button>
                    );
                  })}
                </div>
              );
            })
            )}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* Appointment Details Dialog                                          */}
      {/* =================================================================== */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogDescription>View and manage this appointment.</DialogDescription>
          </DialogHeader>
          {selectedVisit && (
            <div className="space-y-4">
              {selectedVisit.source === 'sms' && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-violet-50 border border-violet-200">
                  <Smartphone className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-medium text-violet-700">Booked via SMS (Buckeye Scheduler)</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium">{selectedVisit.patient_name || getPatientName(selectedVisit.patient_id)}</span>
                </div>
                {selectedVisit.patient_id && (
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => window.open(`/patients/${selectedVisit.patient_id}`, '_blank')}>
                    <ExternalLink className="h-3 w-3" /> Open Record
                  </Button>
                )}
              </div>
              {selectedVisit.sms_patient_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-500" />
                  <a href={`tel:${selectedVisit.sms_patient_phone}`} className="text-sm text-blue-600 hover:underline">{selectedVisit.sms_patient_phone}</a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                <span className="text-sm">
                  {formatLocalDate(selectedVisit.start_time, 'EEEE, MMM d, yyyy')} -- {formatTime12h(selectedVisit.start_time)} - {formatTime12h(selectedVisit.end_time)}{' '}
                  ({differenceInMinutes(parseISO(selectedVisit.end_time), parseISO(selectedVisit.start_time))} min)
                </span>
              </div>

              {/* Actual duration (shown when different from scheduled) */}
              {selectedVisit.status === 'completed' && selectedVisit.actual_duration_minutes != null && (() => {
                const scheduledMin = differenceInMinutes(
                  parseISO(selectedVisit.end_time),
                  parseISO(selectedVisit.start_time)
                );
                if (selectedVisit.actual_duration_minutes !== scheduledMin) {
                  return (
                    <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <div className="font-medium text-amber-800">
                          Scheduled: {scheduledMin} min → Actual: {selectedVisit.actual_duration_minutes} min
                        </div>
                        {selectedVisit.shortened_visit_reason && (
                          <div className="text-amber-700 mt-0.5">
                            {selectedVisit.shortened_visit_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">{selectedVisit.therapist_name || getTherapistName(selectedVisit.therapist_user_id)}</span>
              </div>
              {selectedVisit.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-600">{selectedVisit.location}</span>
                </div>
              )}
              <div className="text-sm flex items-center gap-3">
                <Badge variant="outline" className={DISCIPLINE_COLORS[resolveDiscipline(selectedVisit.discipline)]?.badge || DISCIPLINE_COLORS.PT.badge}>
                  {DISCIPLINE_LABELS[resolveDiscipline(selectedVisit.discipline)]}
                </Badge>
                {selectedVisit.visit_type && <span className="capitalize text-slate-600">{selectedVisit.visit_type.replace('_', ' ')}</span>}
              </div>
              {selectedVisit.patient_id && currentClinic?.clinic_id && (
                <VisitAuthSummary patientId={selectedVisit.patient_id} clinicId={currentClinic.clinic_id} discipline={selectedVisit.discipline} />
              )}
              {selectedVisit.recurrence_group_id && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Repeat className="h-3 w-3" /> Recurring series
                  {selectedVisit.recurrence_rule && <span className="text-xs text-slate-400">({selectedVisit.recurrence_rule})</span>}
                </div>
              )}
              {selectedVisit.notes && (
                <div className="text-sm">
                  <span className="text-slate-500">Notes: </span>
                  <span className="text-slate-700">{selectedVisit.notes}</span>
                </div>
              )}
              <div>
                {(() => {
                  const s: AppointmentStatus = selectedVisit.status || 'scheduled';
                  return <Badge variant="outline" className={APPOINTMENT_STATUS_COLORS[s]}>{APPOINTMENT_STATUS_LABELS[s]}</Badge>;
                })()}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {STATUS_ACTIONS.filter((a) => a.from.includes(selectedVisit.status || 'scheduled')).map((action) => (
                  <Button
                    key={action.to}
                    size="sm"
                    variant={action.to === 'cancelled' || action.to === 'no_show' ? 'destructive' : 'outline'}
                    disabled={updatingStatus}
                    onClick={() => {
                      if (action.to === 'cancelled') {
                        setPendingCancelId(selectedVisit.id);
                        setCancelConfirmOpen(true);
                      } else if (action.to === 'completed') {
                        const scheduledMin = differenceInMinutes(
                          parseISO(selectedVisit.end_time),
                          parseISO(selectedVisit.start_time)
                        );
                        const scheduledStr = String(scheduledMin);
                        const presetOptions = ['15', '30', '45', '60', '90'];
                        setCompleteDurationOption(presetOptions.includes(scheduledStr) ? scheduledStr : 'custom');
                        setCompleteCustomMinutes(presetOptions.includes(scheduledStr) ? '' : scheduledStr);
                        setCompleteShortenedReason('');
                        setCompleteValidationError('');
                        setCompleteConfirmOpen(true);
                      } else {
                        handleStatusChange(selectedVisit.id, action.to);
                      }
                    }}
                  >
                    {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    {action.label}
                  </Button>
                ))}
                {selectedVisit.status === 'completed' && (
                  <>
                    {selectedVisitNote?.status === 'final' ? (
                      <Button size="sm" variant="outline" disabled title="Cannot undo — note has been finalized" className="opacity-50">
                        <Undo2 className="h-3 w-3 mr-1" /> Undo Complete
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={updatingStatus || loadingNote} onClick={() => setUndoConfirmOpen(true)}>
                        {loadingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Undo2 className="h-3 w-3 mr-1" />}
                        Undo Complete
                      </Button>
                    )}
                  </>
                )}
              </div>
              {selectedVisit.status === 'completed' && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  {loadingNote ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Loading note...</div>
                  ) : selectedVisitNote ? (
                    <>
                      <Badge variant="outline" className={selectedVisitNote.status === 'final' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                        <FileText className="h-3 w-3 mr-1" /> {selectedVisitNote.status === 'final' ? 'Final' : 'Draft'}
                      </Badge>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(`/notes/${selectedVisitNote.id}`)}>
                        <FileText className="h-3 w-3" /> Open Note
                      </Button>
                    </>
                  ) : isEmrMode ? (
                    <>
                      <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200"><FileText className="h-3 w-3 mr-1" /> Missing</Badge>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(`/daily/new?visit_id=${selectedVisit.id}`)}>
                        <FileText className="h-3 w-3" /> Create Note
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedVisit && selectedVisit.source !== 'sms' && (
              <Button variant="destructive" size="sm" onClick={() => handleDeleteVisit(selectedVisit.id)}>Delete</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>Are you sure you want to cancel this appointment? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelConfirmOpen(false)}>Keep Appointment</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={updatingStatus}
              onClick={async () => {
                if (pendingCancelId) await handleStatusChange(pendingCancelId, 'cancelled');
                setCancelConfirmOpen(false);
                setPendingCancelId(null);
              }}
            >
              {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo Complete Confirmation Dialog */}
      <Dialog open={undoConfirmOpen} onOpenChange={setUndoConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Undo Complete</DialogTitle>
            <DialogDescription>This will reopen the visit and revert the SOAP note to draft. Continue?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setUndoConfirmOpen(false)}>Keep Completed</Button>
            <Button
              size="sm"
              disabled={updatingStatus}
              onClick={async () => {
                if (!selectedVisit) return;
                setUpdatingStatus(true);
                try {
                  const res = await fetch(`/api/visits/${selectedVisit.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'checked_in' }),
                  });
                  if (!res.ok) throw new Error('Failed to revert status');
                  if (selectedVisitNote && selectedVisitNote.status === 'draft') {
                    await fetch(`/api/notes/${selectedVisitNote.id}`, { method: 'DELETE' });
                  }
                  const statusUpdate = { status: 'checked_in' as AppointmentStatus };
                  setVisits((prev: Visit[]) => prev.map((v: Visit) => (v.id === selectedVisit.id ? { ...v, ...statusUpdate } : v)));
                  setSelectedVisit((prev: Visit | null) => (prev && prev.id === selectedVisit.id ? { ...prev, ...statusUpdate } : prev));
                  setSelectedVisitNote(null);
                  toast.success('Visit reopened — status set to Checked In');
                  setDetailsOpen(false);
                } catch (err) {
                  console.error(err);
                  toast.error('Failed to undo completion');
                } finally {
                  setUpdatingStatus(false);
                  setUndoConfirmOpen(false);
                }
              }}
            >
              {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Yes, Undo Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* Complete Visit Dialog — Duration & Shortened Visit                  */}
      {/* =================================================================== */}
      <Dialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Visit</DialogTitle>
            <DialogDescription>
              Confirm the actual duration performed for this visit.
            </DialogDescription>
          </DialogHeader>
          {selectedVisit && (() => {
            const scheduledMin = differenceInMinutes(
              parseISO(selectedVisit.end_time),
              parseISO(selectedVisit.start_time)
            );
            const actualMin = completeDurationOption === 'custom'
              ? parseInt(completeCustomMinutes, 10) || 0
              : parseInt(completeDurationOption, 10) || 0;
            const isShortened = actualMin > 0 && actualMin < scheduledMin;

            return (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-slate-500">Scheduled Duration</Label>
                  <div className="text-sm font-medium text-slate-900 mt-1">{scheduledMin} min</div>
                </div>
                <div className="space-y-2">
                  <Label>Actual Duration Performed</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {['15', '30', '45', '60', '90'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                          completeDurationOption === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                        onClick={() => { setCompleteDurationOption(opt); setCompleteValidationError(''); }}
                      >
                        {opt} min
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        completeDurationOption === 'custom'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                      onClick={() => { setCompleteDurationOption('custom'); setCompleteValidationError(''); }}
                    >
                      Custom
                    </button>
                  </div>
                  {completeDurationOption === 'custom' && (
                    <Input
                      type="number"
                      min="1"
                      max="240"
                      placeholder="Minutes"
                      value={completeCustomMinutes}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCompleteCustomMinutes(e.target.value); setCompleteValidationError(''); }}
                      className="w-32 mt-1"
                    />
                  )}
                </div>
                {isShortened && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      Shortened Visit Reason
                      <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      placeholder="Document reason for shortened visit (e.g. arrived late, child fatigue, parent request)"
                      value={completeShortenedReason}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setCompleteShortenedReason(e.target.value); setCompleteValidationError(''); }}
                      rows={2}
                    />
                  </div>
                )}
                {completeValidationError && (
                  <div className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {completeValidationError}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCompleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={updatingStatus}
              onClick={async () => {
                if (!selectedVisit) return;
                const scheduledMin = differenceInMinutes(
                  parseISO(selectedVisit.end_time),
                  parseISO(selectedVisit.start_time)
                );
                const actualMin = completeDurationOption === 'custom'
                  ? parseInt(completeCustomMinutes, 10) || 0
                  : parseInt(completeDurationOption, 10) || 0;
                if (actualMin <= 0) { setCompleteValidationError('Actual duration must be greater than 0.'); return; }
                if (actualMin > 240) { setCompleteValidationError('Actual duration must be 240 minutes or less.'); return; }
                if (actualMin < scheduledMin && !completeShortenedReason.trim()) { setCompleteValidationError('Please document why the visit was shorter than scheduled.'); return; }
                setCompleteConfirmOpen(false);
                await handleStatusChange(selectedVisit.id, 'completed', {
                  actual_duration_minutes: actualMin,
                  shortened_visit_reason: actualMin < scheduledMin ? completeShortenedReason.trim() : undefined,
                });
              }}
            >
              {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* New Appointment Dialog                                              */}
      {/* =================================================================== */}
      <Dialog open={newApptOpen} onOpenChange={setNewApptOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Appointment</DialogTitle>
            <DialogDescription>Schedule a new appointment for a patient.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Patient search */}
            <div className="space-y-2">
              <Label>Patient</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search patients by name..." value={patientSearch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPatientSearch(e.target.value)} className="pl-8" />
              </div>
              {formData.patient_id && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    {getPatientName(formData.patient_id)}
                    <button onClick={() => setFormData((p: AppointmentFormData) => ({ ...p, patient_id: '' }))} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                  </Badge>
                </div>
              )}
              {!formData.patient_id && patientSearch.trim() && (
                <div className="border rounded-md max-h-32 overflow-y-auto">
                  {filteredPatients.length === 0 ? (
                    <div className="p-2 text-sm text-slate-500">No patients found</div>
                  ) : (
                    filteredPatients.map((p: Patient) => (
                      <button
                        key={p.id}
                        onClick={() => { setFormData((prev: AppointmentFormData) => ({ ...prev, patient_id: p.id })); setPatientSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                      >
                        <span>{p.first_name} {p.last_name}</span>
                        {p.date_of_birth && <span className="text-xs text-slate-400">DOB: {p.date_of_birth}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Authorization selection */}
            {formData.patient_id && patientAuths.length > 0 && (
              <div className="space-y-2">
                <Label>Authorization</Label>
                <div className="space-y-1">
                  {patientAuths
                    .filter((a) => !formData.discipline || a.discipline === formData.discipline || !a.discipline)
                    .map((auth) => {
                      const remaining = auth.auth_type === 'units'
                        ? (auth.units_authorized ?? 0) - (auth.units_used ?? 0)
                        : auth.remaining_visits ?? ((auth.authorized_visits ?? 0) - auth.used_visits);
                      const isSelected = formData.auth_id === auth.id;
                      const isLow = remaining <= 3;
                      return (
                        <button
                          key={auth.id}
                          type="button"
                          onClick={() => setFormData((p: AppointmentFormData) => ({ ...p, auth_id: isSelected ? '' : auth.id }))}
                          className={`w-full text-left px-3 py-2 text-sm rounded border transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {auth.discipline && (
                                <span className={`inline-block w-2 h-2 rounded-full ${auth.discipline === 'PT' ? 'bg-blue-500' : auth.discipline === 'OT' ? 'bg-lime-500' : 'bg-yellow-500'}`} />
                              )}
                              <span className="font-medium">{auth.discipline || 'All'} Auth{auth.auth_number ? ` #${auth.auth_number}` : ''}</span>
                            </div>
                            <span className={`font-mono text-xs ${isLow ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                              {remaining} {auth.auth_type === 'units' ? 'units' : 'visits'} left
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {auth.start_date} - {auth.end_date}
                            {remaining === 0 && <span className="ml-2 text-red-600 font-medium">EXHAUSTED</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
                {formData.auth_id && <p className="text-xs text-blue-600">Visit will be linked to this authorization</p>}
              </div>
            )}
            {formData.patient_id && patientAuths.length === 0 && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">No active authorizations found for this patient</div>
            )}

            {/* Therapist */}
            <div className="space-y-2">
              <Label>Therapist</Label>
              <Select
                value={formData.therapist_user_id}
                onValueChange={(val: string) => {
                  const selected = therapists.find((t: TherapistOption) => t.user_id === val);
                  setFormData((p: AppointmentFormData) => ({ ...p, therapist_user_id: val, discipline: selected?.primary_discipline || p.discipline }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select therapist" /></SelectTrigger>
                <SelectContent>
                  {therapists.map((t: TherapistOption) => (
                    <SelectItem key={t.user_id} value={t.user_id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date and times */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={formData.date} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((p: AppointmentFormData) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={formData.start_time} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((p: AppointmentFormData) => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={formData.end_time} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((p: AppointmentFormData) => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>

            {/* Visit type */}
            <div className="space-y-2">
              <Label>Visit Type</Label>
              <Select value={formData.visit_type} onValueChange={(val: string) => setFormData((p: AppointmentFormData) => ({ ...p, visit_type: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Discipline */}
            <div className="space-y-2">
              <Label>Discipline</Label>
              <Select value={formData.discipline} onValueChange={(val: string) => setFormData((p: AppointmentFormData) => ({ ...p, discipline: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PT">PT - Physical Therapy</SelectItem>
                  <SelectItem value="OT">OT - Occupational Therapy</SelectItem>
                  <SelectItem value="ST">ST - Speech Therapy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Input placeholder="Room, gym, pool..." value={formData.location} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((p: AppointmentFormData) => ({ ...p, location: e.target.value }))} />
            </div>

            {/* Recurrence toggle */}
            <div className="space-y-3 p-3 border rounded-md bg-slate-50">
              <div className="flex items-center gap-3">
                <Switch checked={formData.is_recurring} onCheckedChange={(checked: boolean) => setFormData((p: AppointmentFormData) => ({ ...p, is_recurring: checked }))} />
                <Label className="flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Recurring Appointment</Label>
              </div>
              {formData.is_recurring && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Repeat weekly for how many weeks?</Label>
                    <Input type="number" min={1} max={52} value={formData.recurrence_weeks} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((p: AppointmentFormData) => ({ ...p, recurrence_weeks: parseInt(e.target.value) || 1 }))} className="w-24" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Days of the week</Label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { key: 'SU', label: 'Sun' }, { key: 'MO', label: 'Mon' }, { key: 'TU', label: 'Tue' },
                        { key: 'WE', label: 'Wed' }, { key: 'TH', label: 'Thu' }, { key: 'FR', label: 'Fri' }, { key: 'SA', label: 'Sat' },
                      ].map((day) => {
                        const isSelected = formData.recurrence_days.includes(day.key);
                        return (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() => {
                              setFormData((p: AppointmentFormData) => {
                                const days = isSelected ? p.recurrence_days.filter((d: string) => d !== day.key) : [...p.recurrence_days, day.key];
                                return { ...p, recurrence_days: days.length === 0 ? [day.key] : days };
                              });
                            }}
                            className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Additional notes..." value={formData.notes} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData((p: AppointmentFormData) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewApptOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAppointment} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {formData.is_recurring ? 'Create Series' : 'Create Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
