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
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
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
// Constants
// ---------------------------------------------------------------------------

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 6;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;

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

// Background color by discipline
const DISCIPLINE_BG: Record<string, string> = {
  PT: 'bg-blue-50 hover:bg-blue-100',
  OT: 'bg-amber-50 hover:bg-amber-100',
  ST: 'bg-rose-50 hover:bg-rose-100',
};
const DISCIPLINE_BORDER_COLOR: Record<string, string> = {
  PT: 'border-blue-300',
  OT: 'border-amber-300',
  ST: 'border-rose-300',
};
const DEFAULT_DISCIPLINE_BG = 'bg-blue-50 hover:bg-blue-100';

// Left border stripe by status
const STATUS_BORDER: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-slate-400',
  confirmed: 'border-l-green-500',
  checked_in: 'border-l-yellow-500',
  in_progress: 'border-l-amber-500',
  checked_out: 'border-l-teal-500',
  completed: 'border-l-teal-600',
  no_show: 'border-l-red-500',
  cancelled: 'border-l-red-400',
  rescheduled: 'border-l-orange-500',
};

// Status badge classes
const STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-slate-100 text-slate-600 border-slate-200',
  confirmed: 'bg-green-100 text-green-700 border-green-200',
  checked_in: 'bg-yellow-100 text-yellow-700 border-yellow-200',
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
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const router = useRouter();
  const { currentClinic, loading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

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
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [selectedVisitNote, setSelectedVisitNote] = useState<Note | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  // Drag-and-drop state
  const [draggingVisit, setDraggingVisit] = useState<Visit | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragOverMinute, setDragOverMinute] = useState<number | null>(null);
  const dragGrabOffsetRef = useRef<number>(0); // minutes from start of visit to grab point

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

      console.log('[Schedule] fetchVisits — clinic_id:', currentClinic.clinic_id, 'from:', from, 'to:', to);

      // Fetch EMR visits and SMS appointments in parallel
      const [visitsRes, smsRes] = await Promise.all([
        fetch(`/api/visits?clinic_id=${currentClinic.clinic_id}&from=${from}&to=${to}`),
        fetch(`/api/appointments/sms?from=${from}&to=${to}`),
      ]);

      console.log('[Schedule] visits response status:', visitsRes.status);
      console.log('[Schedule] sms response status:', smsRes.status);

      if (!visitsRes.ok) {
        const errText = await visitsRes.text();
        console.error('[Schedule] visits API error:', errText);
        throw new Error('Failed to fetch visits');
      }
      const visitsData: Visit[] = await visitsRes.json();
      console.log('[Schedule] visits from EMR:', visitsData.length, 'results');
      if (visitsData.length > 0) {
        console.log('[Schedule] first visit:', JSON.stringify(visitsData[0]));
      }

      // SMS appointments are optional — don't fail the whole load if they error
      let smsData: Visit[] = [];
      if (smsRes.ok) {
        smsData = await smsRes.json();
        console.log('[Schedule] SMS appointments:', smsData.length, 'results');
      } else {
        const smsErr = await smsRes.text();
        console.warn('[Schedule] SMS appointments API error:', smsErr);
      }

      const merged = [...visitsData, ...smsData];
      console.log('[Schedule] total merged appointments:', merged.length);

      // Merge: EMR visits first, then SMS appointments
      setVisits(merged);
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
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
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
        const therapistMembers = data
          .filter((m: { role: string; is_active: boolean }) =>
            ['pt', 'pta', 'ot', 'ota', 'slp', 'slpa'].includes(m.role) && m.is_active
          )
          .map((m: { user_id: string; display_name?: string; email?: string; primary_discipline?: string }) => ({
            user_id: m.user_id,
            name: m.display_name || m.email || m.user_id,
            primary_discipline: m.primary_discipline || 'PT',
          }));
        setTherapists(therapistMembers);
      }
    } catch (err) {
      console.error('Error fetching therapists:', err);
    }
  }, [currentClinic?.clinic_id]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  useEffect(() => {
    fetchPatients();
    fetchTherapists();
  }, [fetchPatients, fetchTherapists]);

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      const top8am = (8 - START_HOUR) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = top8am;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (viewMode === 'week') {
      setCurrentDate((d: Date) => subWeeks(d, 1));
    } else {
      setCurrentDate((d: Date) => addDays(d, -1));
    }
  };
  const goNext = () => {
    if (viewMode === 'week') {
      setCurrentDate((d: Date) => addWeeks(d, 1));
    } else {
      setCurrentDate((d: Date) => addDays(d, 1));
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered visits
  // ---------------------------------------------------------------------------

  const filteredVisits = useMemo(() => {
    let result = visits;
    if (filterTherapist !== 'all') {
      result = result.filter((v: Visit) => v.therapist_user_id === filterTherapist);
    }
    if (filterDiscipline !== 'all') {
      result = result.filter((v: Visit) => resolveDiscipline(v.discipline) === filterDiscipline);
    }
    return result;
  }, [visits, filterTherapist, filterDiscipline]);

  // ---------------------------------------------------------------------------
  // Days to render
  // ---------------------------------------------------------------------------

  const daysToRender = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [viewMode, currentDate, weekStart]);

  // ---------------------------------------------------------------------------
  // Get visits for a specific day
  // ---------------------------------------------------------------------------

  const visitsForDay = useCallback(
    (day: Date) =>
      filteredVisits.filter((v: Visit) => isSameDay(toLocalDate(v.start_time), day)),
    [filteredVisits]
  );

  // ---------------------------------------------------------------------------
  // Appointment click handler
  // ---------------------------------------------------------------------------

  const handleVisitClick = (visit: Visit) => {
    setSelectedVisit(visit);
    setSelectedVisitNote(null);
    setDetailsOpen(true);

    // Fetch note for this visit if completed
    if (visit.status === 'completed') {
      setLoadingNote(true);
      fetch(`/api/notes?visit_id=${visit.id}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((notes: Note[]) => {
          setSelectedVisitNote(notes.length > 0 ? notes[0] : null);
        })
        .catch(() => setSelectedVisitNote(null))
        .finally(() => setLoadingNote(false));
    }
  };

  // ---------------------------------------------------------------------------
  // Status update
  // ---------------------------------------------------------------------------

  const handleStatusChange = async (visitId: string, newStatus: AppointmentStatus) => {
    setUpdatingStatus(true);
    try {
      // Find the visit to check if it's an SMS appointment
      const visit = visits.find((v: Visit) => v.id === visitId);
      const isSms = visit?.source === 'sms' && visit?.sms_appointment_id;

      let res: Response;
      if (isSms) {
        // Route to SMS appointment API
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
        // Route to regular visits API
        const updateBody: Record<string, unknown> = { status: newStatus };
        // Clear cancellation fields when rescheduling
        if (newStatus === 'scheduled') {
          updateBody.cancelled_at = null;
          updateBody.cancel_reason = null;
        }
        res = await fetch(`/api/visits/${visitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        });
      }

      if (!res.ok) throw new Error('Failed to update status');
      const updated = await res.json();

      // Update local state — for SMS appointments, update the status on the Visit-shaped object
      const statusUpdate = { status: newStatus };
      setVisits((prev: Visit[]) => prev.map((v: Visit) => (v.id === visitId ? { ...v, ...statusUpdate } : v)));
      setSelectedVisit((prev: Visit | null) => (prev && prev.id === visitId ? { ...prev, ...statusUpdate } : prev));

      toast.success(`Status updated to ${APPOINTMENT_STATUS_LABELS[newStatus]}`);

      // If an SMS appointment was completed, a Visit record was auto-created
      if (isSms && newStatus === 'completed' && updated._createdVisit) {
        toast.success('Visit record auto-created from SMS appointment');
      }

      // When a visit is marked completed, redirect to SOAP note wizard
      if (newStatus === 'completed') {
        // For SMS appointments, use the auto-created Visit record ID
        const noteVisitId = (isSms && updated._createdVisit?.id)
          ? updated._createdVisit.id
          : visitId.replace(/^sms-/, ''); // strip sms- prefix if present

        // Only redirect for real visit IDs (not sms- prefixed without a created visit)
        if (noteVisitId && !noteVisitId.startsWith('sms-')) {
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
    if (!currentClinic?.clinic_id) return;
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
      // Don't allow dragging completed/cancelled/no-show visits
      const status = visit.status || 'scheduled';
      if (['completed', 'cancelled', 'no_show'].includes(status)) {
        e.preventDefault();
        return;
      }
      // Don't drag SMS appointments (they have separate APIs)
      if (visit.source === 'sms') {
        e.preventDefault();
        return;
      }

      setDraggingVisit(visit);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', visit.id);

      // Calculate grab offset: how many minutes from the top of the appointment the user grabbed
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const grabY = e.clientY - rect.top;
      const grabMinutes = (grabY / HOUR_HEIGHT) * 60;
      dragGrabOffsetRef.current = grabMinutes;

      // Make the drag image semi-transparent
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
    // Snap to 15-minute intervals
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
    // Only clear if actually leaving the column (not entering a child)
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
      const durationMin = differenceInMinutes(
        toLocalDate(visit.end_time),
        toLocalDate(visit.start_time)
      );

      // Build new start/end times
      const endMinute = dropMinute + durationMin;

      // Clamp to valid range
      if (dropMinute < START_HOUR * 60 || endMinute > END_HOUR * 60) {
        toast.error('Cannot drop outside schedule hours');
        handleDragEnd();
        return;
      }

      const dateStr = format(targetDay, 'yyyy-MM-dd');
      const pad = (n: number) => n.toString().padStart(2, '0');
      const newStartHour = Math.floor(dropMinute / 60);
      const newStartMin = dropMinute % 60;
      const newEndHour = Math.floor(endMinute / 60);
      const newEndMin = endMinute % 60;
      const newStartISO = new Date(
        `${dateStr}T${pad(newStartHour)}:${pad(newStartMin)}:00`
      ).toISOString();
      const newEndISO = new Date(
        `${dateStr}T${pad(newEndHour)}:${pad(newEndMin)}:00`
      ).toISOString();

      // Optimistic update
      setVisits((prev: Visit[]) =>
        prev.map((v: Visit) =>
          v.id === visit.id
            ? { ...v, start_time: newStartISO, end_time: newEndISO }
            : v
        )
      );
      handleDragEnd();

      try {
        const res = await fetch(`/api/visits/${visit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_time: newStartISO,
            end_time: newEndISO,
          }),
        });
        if (!res.ok) throw new Error('Failed to reschedule');
        toast.success('Appointment rescheduled');
      } catch (err) {
        console.error(err);
        toast.error('Failed to reschedule appointment');
        // Revert optimistic update
        setVisits((prev: Visit[]) =>
          prev.map((v: Visit) =>
            v.id === visit.id
              ? { ...v, start_time: visit.start_time, end_time: visit.end_time }
              : v
          )
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
    });
    setPatientSearch('');
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
    if (viewMode === 'day') {
      return format(currentDate, 'EEEE, MMMM d, yyyy');
    }
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
      <>
        <TopNav />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ----------------------------------------------------------------- */}
        {/* Toolbar                                                           */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle */}
            <div className="flex border rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'day'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'week'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Week
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Therapist filter */}
            <Select value={filterTherapist} onValueChange={setFilterTherapist}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="All Therapists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Therapists</SelectItem>
                {therapists.map((t: TherapistOption) => (
                  <SelectItem key={t.user_id} value={t.user_id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Discipline filter */}
            <div className="flex items-center border rounded-md overflow-hidden h-9">
              {(['all', 'PT', 'OT', 'ST'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setFilterDiscipline(d)}
                  className={`px-2.5 py-1 text-xs font-medium border-r last:border-r-0 transition-colors ${
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
              onClick={() => {
                resetForm();
                setNewApptOpen(true);
              }}
              size="sm"
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Date header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">{headerLabel}</h2>
          {loadingVisits && (
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Color legend                                                      */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-600">
          {/* Discipline */}
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Discipline:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-50 border border-blue-300" />PT</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-50 border border-amber-300" />OT</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-rose-50 border border-rose-300" />ST</span>

          <span className="text-slate-300">|</span>

          {/* Status (left border) */}
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Status:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-l-[3px] border-l-slate-400 bg-slate-50" />Scheduled</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-l-[3px] border-l-green-500 bg-slate-50" />Confirmed</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-l-[3px] border-l-yellow-500 bg-slate-50" />Checked In</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-l-[3px] border-l-teal-600 bg-slate-50" />Completed</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-l-[3px] border-l-red-500 bg-red-50/60 line-through" />No Show</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border-l-[3px] border-l-red-400 bg-red-50/60 line-through" />Cancelled</span>

          <span className="text-slate-300">|</span>

          {/* Source */}
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Source:</span>
          <span className="flex items-center gap-1"><span className="text-[8px] font-semibold px-1 py-px rounded bg-slate-200 text-slate-600">SMS</span>Buckeye</span>
          <span className="flex items-center gap-1"><span className="text-[8px] font-semibold px-1 py-px rounded bg-indigo-100 text-indigo-600">App</span>PTBot</span>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Calendar grid                                                     */}
        {/* ----------------------------------------------------------------- */}
        <div className="border rounded-lg bg-white overflow-hidden">
          {/* Day headers */}
          <div
            className="grid border-b bg-slate-50"
            style={{
              gridTemplateColumns: `64px repeat(${daysToRender.length}, 1fr)`,
            }}
          >
            {/* Time gutter header */}
            <div className="border-r p-2 text-xs text-slate-400 text-center">
              <Clock className="h-3 w-3 mx-auto" />
            </div>
            {daysToRender.map((day: Date) => (
              <div
                key={day.toISOString()}
                className={`p-2 text-center border-r last:border-r-0 ${
                  isToday(day) ? 'bg-blue-50' : ''
                }`}
              >
                <div className="text-xs text-slate-500 uppercase">
                  {format(day, 'EEE')}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isToday(day) ? 'text-blue-600' : 'text-slate-800'
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <div className="text-xs text-slate-400">{format(day, 'MMM')}</div>
              </div>
            ))}
          </div>

          {/* Scrollable time grid */}
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ height: 'calc(100vh - 310px)', minHeight: '400px' }}
          >
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `64px repeat(${daysToRender.length}, 1fr)`,
                height: `${TOTAL_HOURS * HOUR_HEIGHT}px`,
              }}
            >
              {/* Time gutter */}
              <div className="border-r relative">
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-0 left-0 flex items-start justify-end pr-2 -mt-2"
                    style={{ top: `${i * HOUR_HEIGHT}px` }}
                  >
                    <span className="text-xs text-slate-400">
                      {format(setMinutes(setHours(new Date(), START_HOUR + i), 0), 'h a')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {daysToRender.map((day: Date) => {
                const dayVisits = visitsForDay(day);
                const dayKey = day.toISOString();
                const isDropTarget = dragOverDay === dayKey;
                return (
                  <div
                    key={dayKey}
                    className={`relative border-r last:border-r-0 ${
                      isToday(day) ? 'bg-blue-50/30' : ''
                    } ${isDropTarget ? 'bg-blue-50/50' : ''}`}
                    onDragOver={(e) =>
                      handleDragOver(e, dayKey, e.currentTarget as HTMLElement)
                    }
                    onDragLeave={handleDragLeave}
                    onDrop={(e) =>
                      handleDrop(e, day, e.currentTarget as HTMLElement)
                    }
                  >
                    {/* Hour lines */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: `${i * HOUR_HEIGHT}px` }}
                      />
                    ))}
                    {/* Half-hour lines */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={`half-${i}`}
                        className="absolute left-0 right-0 border-t border-dashed border-slate-50"
                        style={{ top: `${i * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday(day) && (() => {
                      const now = new Date();
                      const nowMinutes = now.getHours() * 60 + now.getMinutes();
                      if (nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60) {
                        return (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: `${minutesToTop(nowMinutes)}px` }}
                          >
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
                      const durationMin = differenceInMinutes(
                        toLocalDate(draggingVisit.end_time),
                        toLocalDate(draggingVisit.start_time)
                      );
                      const indicatorHeight = (durationMin / 60) * HOUR_HEIGHT;
                      return (
                        <div
                          className="absolute left-1 right-1 z-30 pointer-events-none rounded-md border-2 border-dashed border-blue-400 bg-blue-100/30"
                          style={{
                            top: `${Math.max(indicatorTop, 0)}px`,
                            height: `${Math.max(indicatorHeight, 20)}px`,
                          }}
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

                      // Discipline-based background + status left border
                      const typeBg = isInactive
                        ? 'bg-red-50/60 hover:bg-red-100/60'
                        : (DISCIPLINE_BG[discipline] || DEFAULT_DISCIPLINE_BG);
                      const statusBorder = STATUS_BORDER[status] || STATUS_BORDER.scheduled;

                      // Source tag
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
                          style={{
                            top: `${Math.max(top, 0)}px`,
                            height: `${Math.max(height, 20)}px`,
                          }}
                        >
                          <div className={`text-xs font-semibold text-slate-900 truncate flex items-center gap-1 ${isInactive ? 'line-through text-red-400' : ''}`}>
                            {visit.patient_name || getPatientName(visit.patient_id)}
                          </div>
                          {height > 30 && (
                            <div className={`text-[10px] text-slate-600 truncate ${isInactive ? 'line-through text-red-300' : ''}`}>
                              {formatTime12h(visit.start_time)} -{' '}
                              {formatTime12h(visit.end_time)}
                            </div>
                          )}
                          {height > 48 && (
                            <div className="text-[10px] text-slate-500 truncate">
                              {visit.therapist_name || getTherapistName(visit.therapist_user_id)}
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-0.5">
                            {/* Discipline tag */}
                            <span className={`text-[8px] font-semibold px-1 py-px rounded ${DISCIPLINE_COLORS[discipline]?.badge || DISCIPLINE_COLORS.PT.badge}`}>
                              {discipline}
                            </span>
                            {/* Source tag */}
                            {isSmsAppt && (
                              <span className="text-[8px] font-semibold px-1 py-px rounded bg-slate-200 text-slate-600">
                                SMS
                              </span>
                            )}
                            {isPtbot && (
                              <span className="text-[8px] font-semibold px-1 py-px rounded bg-indigo-100 text-indigo-600">
                                App
                              </span>
                            )}
                            {/* Status badge */}
                            {height > 40 && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${STATUS_BADGE[status] || STATUS_BADGE.scheduled}`}
                              >
                                {APPOINTMENT_STATUS_LABELS[status]}
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
            <DialogDescription>
              View and manage this appointment.
            </DialogDescription>
          </DialogHeader>
          {selectedVisit && (
            <div className="space-y-4">
              {/* SMS source badge */}
              {selectedVisit.source === 'sms' && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-violet-50 border border-violet-200">
                  <Smartphone className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-medium text-violet-700">
                    Booked via SMS (Buckeye Scheduler)
                  </span>
                </div>
              )}

              {/* Patient */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium">
                    {selectedVisit.patient_name || getPatientName(selectedVisit.patient_id)}
                  </span>
                </div>
                {selectedVisit.patient_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1 h-7"
                    onClick={() => {
                      window.open(`/patients/${selectedVisit.patient_id}`, '_blank');
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Record
                  </Button>
                )}
              </div>

              {/* Phone number (for SMS appointments) */}
              {selectedVisit.sms_patient_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-500" />
                  <a
                    href={`tel:${selectedVisit.sms_patient_phone}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {selectedVisit.sms_patient_phone}
                  </a>
                </div>
              )}

              {/* Time */}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                <span className="text-sm">
                  {formatLocalDate(selectedVisit.start_time, 'EEEE, MMM d, yyyy')}
                  {' -- '}
                  {formatTime12h(selectedVisit.start_time)} -{' '}
                  {formatTime12h(selectedVisit.end_time)}
                  {' '}
                  ({differenceInMinutes(
                    parseISO(selectedVisit.end_time),
                    parseISO(selectedVisit.start_time)
                  )}{' '}
                  min)
                </span>
              </div>

              {/* Therapist */}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">
                  {selectedVisit.therapist_name ||
                    getTherapistName(selectedVisit.therapist_user_id)}
                </span>
              </div>

              {/* Location */}
              {selectedVisit.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-600">{selectedVisit.location}</span>
                </div>
              )}

              {/* Discipline + Visit type */}
              <div className="text-sm flex items-center gap-3">
                <Badge variant="outline" className={DISCIPLINE_COLORS[resolveDiscipline(selectedVisit.discipline)]?.badge || DISCIPLINE_COLORS.PT.badge}>
                  {DISCIPLINE_LABELS[resolveDiscipline(selectedVisit.discipline)]}
                </Badge>
                {selectedVisit.visit_type && (
                  <span className="capitalize text-slate-600">{selectedVisit.visit_type.replace('_', ' ')}</span>
                )}
              </div>

              {/* Recurrence info */}
              {selectedVisit.recurrence_group_id && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Repeat className="h-3 w-3" />
                  Recurring series
                  {selectedVisit.recurrence_rule && (
                    <span className="text-xs text-slate-400">({selectedVisit.recurrence_rule})</span>
                  )}
                </div>
              )}

              {/* Notes */}
              {selectedVisit.notes && (
                <div className="text-sm">
                  <span className="text-slate-500">Notes: </span>
                  <span className="text-slate-700">{selectedVisit.notes}</span>
                </div>
              )}

              {/* Status badge */}
              <div>
                {(() => {
                  const s: AppointmentStatus = selectedVisit.status || 'scheduled';
                  return (
                    <Badge
                      variant="outline"
                      className={APPOINTMENT_STATUS_COLORS[s]}
                    >
                      {APPOINTMENT_STATUS_LABELS[s]}
                    </Badge>
                  );
                })()}
              </div>

              {/* Status actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {STATUS_ACTIONS.filter((a) =>
                  a.from.includes(selectedVisit.status || 'scheduled')
                ).map((action) => (
                  <Button
                    key={action.to}
                    size="sm"
                    variant={action.to === 'cancelled' || action.to === 'no_show' ? 'destructive' : 'outline'}
                    disabled={updatingStatus}
                    onClick={() => {
                      if (action.to === 'cancelled') {
                        setPendingCancelId(selectedVisit.id);
                        setCancelConfirmOpen(true);
                      } else {
                        handleStatusChange(selectedVisit.id, action.to);
                      }
                    }}
                  >
                    {updatingStatus ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    {action.label}
                  </Button>
                ))}

                {/* Undo Complete (Bug 2) */}
                {selectedVisit.status === 'completed' && (
                  <>
                    {selectedVisitNote?.status === 'final' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        title="Cannot undo — note has been finalized"
                        className="opacity-50"
                      >
                        <Undo2 className="h-3 w-3 mr-1" />
                        Undo Complete
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingStatus || loadingNote}
                        onClick={() => setUndoConfirmOpen(true)}
                      >
                        {loadingNote ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Undo2 className="h-3 w-3 mr-1" />
                        )}
                        Undo Complete
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* SOAP Note actions for completed visits */}
              {selectedVisit.status === 'completed' && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  {loadingNote ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading note...
                    </div>
                  ) : selectedVisitNote ? (
                    <>
                      <Badge
                        variant="outline"
                        className={
                          selectedVisitNote.status === 'final'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        {selectedVisitNote.status === 'final' ? 'Final' : 'Draft'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => router.push(`/notes/${selectedVisitNote.id}`)}
                      >
                        <FileText className="h-3 w-3" />
                        Open Note
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                        <FileText className="h-3 w-3 mr-1" />
                        Missing
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => router.push(`/daily/new?visit_id=${selectedVisit.id}`)}
                      >
                        <FileText className="h-3 w-3" />
                        Create Note
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedVisit && selectedVisit.source !== 'sms' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteVisit(selectedVisit.id)}
              >
                Delete
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* Cancel Confirmation Dialog                                          */}
      {/* =================================================================== */}
      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelConfirmOpen(false)}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={updatingStatus}
              onClick={async () => {
                if (pendingCancelId) {
                  await handleStatusChange(pendingCancelId, 'cancelled');
                }
                setCancelConfirmOpen(false);
                setPendingCancelId(null);
              }}
            >
              {updatingStatus ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* Undo Complete Confirmation Dialog                                   */}
      {/* =================================================================== */}
      <Dialog open={undoConfirmOpen} onOpenChange={setUndoConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Undo Complete</DialogTitle>
            <DialogDescription>
              This will reopen the visit and revert the SOAP note to draft. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setUndoConfirmOpen(false)}>
              Keep Completed
            </Button>
            <Button
              size="sm"
              disabled={updatingStatus}
              onClick={async () => {
                if (!selectedVisit) return;
                setUpdatingStatus(true);
                try {
                  // Revert visit status to checked_in
                  const res = await fetch(`/api/visits/${selectedVisit.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'checked_in' }),
                  });
                  if (!res.ok) throw new Error('Failed to revert status');

                  // Delete the draft note so a fresh one can be generated on next completion
                  if (selectedVisitNote && selectedVisitNote.status === 'draft') {
                    await fetch(`/api/notes/${selectedVisitNote.id}`, {
                      method: 'DELETE',
                    });
                  }

                  // Update local state
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
              {updatingStatus ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Yes, Undo Complete
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
            <DialogDescription>
              Schedule a new appointment for a patient.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Patient search */}
            <div className="space-y-2">
              <Label>Patient</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search patients by name..."
                  value={patientSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPatientSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              {formData.patient_id && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    {getPatientName(formData.patient_id)}
                    <button
                      onClick={() => setFormData((p: AppointmentFormData) => ({ ...p, patient_id: '' }))}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
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
                        onClick={() => {
                          setFormData((prev: AppointmentFormData) => ({ ...prev, patient_id: p.id }));
                          setPatientSearch('');
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                      >
                        <span>
                          {p.first_name} {p.last_name}
                        </span>
                        {p.date_of_birth && (
                          <span className="text-xs text-slate-400">
                            DOB: {p.date_of_birth}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Therapist */}
            <div className="space-y-2">
              <Label>Therapist</Label>
              <Select
                value={formData.therapist_user_id}
                onValueChange={(val: string) => {
                  const selected = therapists.find((t: TherapistOption) => t.user_id === val);
                  setFormData((p: AppointmentFormData) => ({
                    ...p,
                    therapist_user_id: val,
                    discipline: selected?.primary_discipline || p.discipline,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select therapist" />
                </SelectTrigger>
                <SelectContent>
                  {therapists.map((t: TherapistOption) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date and times */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setFormData((p: AppointmentFormData) => ({ ...p, date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setFormData((p: AppointmentFormData) => ({ ...p, start_time: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setFormData((p: AppointmentFormData) => ({ ...p, end_time: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Visit type */}
            <div className="space-y-2">
              <Label>Visit Type</Label>
              <Select
                value={formData.visit_type}
                onValueChange={(val: string) =>
                  setFormData((p: AppointmentFormData) => ({ ...p, visit_type: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Discipline */}
            <div className="space-y-2">
              <Label>Discipline</Label>
              <Select
                value={formData.discipline}
                onValueChange={(val: string) =>
                  setFormData((p: AppointmentFormData) => ({ ...p, discipline: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PT">PT — Physical Therapy</SelectItem>
                  <SelectItem value="OT">OT — Occupational Therapy</SelectItem>
                  <SelectItem value="ST">ST — Speech Therapy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Input
                placeholder="Room, gym, pool..."
                value={formData.location}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setFormData((p: AppointmentFormData) => ({ ...p, location: e.target.value }))
                }
              />
            </div>

            {/* Recurrence toggle */}
            <div className="space-y-3 p-3 border rounded-md bg-slate-50">
              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.is_recurring}
                  onCheckedChange={(checked: boolean) =>
                    setFormData((p: AppointmentFormData) => ({ ...p, is_recurring: checked }))
                  }
                />
                <Label className="flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5" />
                  Recurring Appointment
                </Label>
              </div>

              {formData.is_recurring && (
                <div className="space-y-3 pl-1">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">
                      Repeat weekly for how many weeks?
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      value={formData.recurrence_weeks}
                      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                        setFormData((p: AppointmentFormData) => ({
                          ...p,
                          recurrence_weeks: parseInt(e.target.value) || 1,
                        }))
                      }
                      className="w-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">Days of the week</Label>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { key: 'SU', label: 'Sun' },
                        { key: 'MO', label: 'Mon' },
                        { key: 'TU', label: 'Tue' },
                        { key: 'WE', label: 'Wed' },
                        { key: 'TH', label: 'Thu' },
                        { key: 'FR', label: 'Fri' },
                        { key: 'SA', label: 'Sat' },
                      ].map((day) => {
                        const isSelected = formData.recurrence_days.includes(day.key);
                        return (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() => {
                              setFormData((p: AppointmentFormData) => {
                                const days = isSelected
                                  ? p.recurrence_days.filter((d: string) => d !== day.key)
                                  : [...p.recurrence_days, day.key];
                                return {
                                  ...p,
                                  recurrence_days:
                                    days.length === 0 ? [day.key] : days,
                                };
                              });
                            }}
                            className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
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
              <Textarea
                placeholder="Additional notes..."
                value={formData.notes}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setFormData((p: AppointmentFormData) => ({ ...p, notes: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewApptOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAppointment} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {formData.is_recurring ? 'Create Series' : 'Create Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
