'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, Stethoscope, UserCog } from 'lucide-react';
import { toast } from 'sonner';

interface CareTeamMember {
  id: string;
  episode_id: string;
  user_id: string;
  role: string;
  assigned_at: string;
}

interface ClinicStaff {
  user_id: string;
  email: string;
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  credentials?: string | null;
  has_provider_profile?: boolean;
  role: string;
  clinic_name: string;
}

interface AssignCareTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  patientId?: string;
  patientName: string;
  clinicId: string;
  onSaved?: () => void;
}

type Discipline = 'PT' | 'OT' | 'ST';

interface DisciplineAssignment {
  primary: string | null;
  assistants: string[];
}

const DISCIPLINES: Discipline[] = ['PT', 'OT', 'ST'];

const DISCIPLINE_STYLES: Record<Discipline, { border: string; bg: string; text: string; badge: string; label: string }> = {
  PT: { border: 'border-l-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Physical Therapy' },
  OT: { border: 'border-l-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Occupational Therapy' },
  ST: { border: 'border-l-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Speech Therapy' },
};

const ROLE_TO_DISCIPLINE: Record<string, Discipline> = {
  pt: 'PT', pta: 'PT', ot: 'OT', ota: 'OT', slp: 'ST', slpa: 'ST',
};

const PRIMARY_ROLES: Record<Discipline, string> = { PT: 'pt', OT: 'ot', ST: 'slp' };
const ASSISTANT_ROLES: Record<Discipline, string> = { PT: 'pta', OT: 'ota', ST: 'slpa' };

// Map credential abbreviations to disciplines for filtering staff into correct sections
const CREDENTIAL_TO_DISCIPLINE: Record<string, Discipline> = {
  PT: 'PT', DPT: 'PT', PTA: 'PT',
  OT: 'OT', OTR: 'OT', COTA: 'OT', OTA: 'OT',
  SLP: 'ST', 'CCC-SLP': 'ST', SLPA: 'ST', 'CF-SLP': 'ST',
};

// Credentials that indicate a primary (licensed) therapist vs assistant
const PRIMARY_CREDENTIALS = new Set(['PT', 'DPT', 'OT', 'OTR', 'SLP', 'CCC-SLP', 'CF-SLP']);
const ASSISTANT_CREDENTIALS = new Set(['PTA', 'COTA', 'OTA', 'SLPA']);

export function AssignCareTeamModal({
  open,
  onOpenChange,
  episodeId,
  patientId,
  patientName,
  clinicId,
  onSaved,
}: AssignCareTeamModalProps) {
  const [currentTeam, setCurrentTeam] = useState<CareTeamMember[]>([]);
  const [clinicStaff, setClinicStaff] = useState<ClinicStaff[]>([]);
  const [assignments, setAssignments] = useState<Record<Discipline, DisciplineAssignment>>({
    PT: { primary: null, assistants: [] },
    OT: { primary: null, assistants: [] },
    ST: { primary: null, assistants: [] },
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && episodeId && clinicId) {
      fetchData();
    }
  }, [open, episodeId, clinicId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, staffRes] = await Promise.all([
        fetch(`/api/care-team?episode_id=${episodeId}`),
        fetch(`/api/user/membership?clinic_id=${clinicId}`),
      ]);
      const teamData: CareTeamMember[] = teamRes.ok ? await teamRes.json() : [];
      const staffData: ClinicStaff[] = staffRes.ok ? await staffRes.json() : [];
      setCurrentTeam(teamData);
      setClinicStaff(staffData);

      // Pre-populate assignments from current team
      const newAssignments: Record<Discipline, DisciplineAssignment> = {
        PT: { primary: null, assistants: [] },
        OT: { primary: null, assistants: [] },
        ST: { primary: null, assistants: [] },
      };

      for (const member of teamData) {
        const disc = ROLE_TO_DISCIPLINE[member.role];
        if (!disc) continue;
        if (member.role === PRIMARY_ROLES[disc]) {
          newAssignments[disc].primary = member.user_id;
        } else if (member.role === ASSISTANT_ROLES[disc]) {
          newAssignments[disc].assistants.push(member.user_id);
        }
      }
      setAssignments(newAssignments);
    } catch (error) {
      console.error('Error loading care team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Compute desired full team
      const desired: { user_id: string; role: string }[] = [];
      for (const disc of DISCIPLINES) {
        const a = assignments[disc];
        if (a.primary) desired.push({ user_id: a.primary, role: PRIMARY_ROLES[disc] });
        for (const uid of a.assistants) {
          desired.push({ user_id: uid, role: ASSISTANT_ROLES[disc] });
        }
      }

      // Compute diff against current team
      const currentSet = new Set(currentTeam.map((m) => `${m.user_id}:${m.role}`));
      const desiredSet = new Set(desired.map((d) => `${d.user_id}:${d.role}`));

      const toRemove = currentTeam.filter((m) => !desiredSet.has(`${m.user_id}:${m.role}`));
      const toAdd = desired.filter((d) => !currentSet.has(`${d.user_id}:${d.role}`));

      // Execute removals and additions
      const ops: Promise<Response>[] = [];

      for (const m of toRemove) {
        ops.push(
          fetch('/api/care-team', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episode_id: episodeId, user_id: m.user_id }),
          })
        );
      }

      for (const d of toAdd) {
        ops.push(
          fetch('/api/care-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episode_id: episodeId, user_id: d.user_id, role: d.role }),
          })
        );
      }

      await Promise.all(ops);

      // After all add/remove ops are done, explicitly set the correct primary IDs
      // on the episode to avoid race conditions from parallel updates
      const allUserIds = desired.map((d) => d.user_id);
      const episodeUpdate: Record<string, unknown> = {
        care_team_ids: allUserIds.length > 0 ? allUserIds : [],
        primary_pt_id: assignments.PT.primary || null,
        primary_ot_id: assignments.OT.primary || null,
        primary_slp_id: assignments.ST.primary || null,
      };

      await fetch(`/api/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(episodeUpdate),
      });

      // Also write to patient_clinician_assignments if patientId is available
      if (patientId) {
        const assignmentOps: Promise<Response>[] = [];
        for (const disc of DISCIPLINES) {
          const a = assignments[disc];
          if (a.primary) {
            assignmentOps.push(
              fetch('/api/clinician-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  patient_id: patientId,
                  clinic_id: clinicId,
                  user_id: a.primary,
                  discipline: disc,
                  role: PRIMARY_ROLES[disc],
                }),
              })
            );
          }
          for (const uid of a.assistants) {
            assignmentOps.push(
              fetch('/api/clinician-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  patient_id: patientId,
                  clinic_id: clinicId,
                  user_id: uid,
                  discipline: disc,
                  role: ASSISTANT_ROLES[disc],
                }),
              })
            );
          }
        }
        // Fire and forget — non-critical
        Promise.all(assignmentOps).catch((err) =>
          console.error('Error syncing clinician assignments:', err)
        );
      }

      toast.success('Care team updated');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving care team:', error);
      toast.error('Failed to update care team');
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = (disc: Discipline, userId: string | null) => {
    setAssignments((prev) => ({
      ...prev,
      [disc]: { ...prev[disc], primary: prev[disc].primary === userId ? null : userId },
    }));
  };

  const toggleAssistant = (disc: Discipline, userId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [disc]: {
        ...prev[disc],
        assistants: prev[disc].assistants.includes(userId)
          ? prev[disc].assistants.filter((id) => id !== userId)
          : [...prev[disc].assistants, userId],
      },
    }));
  };

  const getStaffForDiscipline = (disc: Discipline, type: 'primary' | 'assistant') => {
    const credentialSet = type === 'primary' ? PRIMARY_CREDENTIALS : ASSISTANT_CREDENTIALS;
    const expectedRole = type === 'primary' ? PRIMARY_ROLES[disc] : ASSISTANT_ROLES[disc];

    return clinicStaff.filter((s) => {
      // First try matching by credentials (supports multi-credential strings like "PT, DPT")
      const credStr = s.credentials?.trim().toUpperCase() || '';
      if (credStr) {
        const creds = credStr.split(/[,\s/]+/).map((c) => c.trim()).filter(Boolean);
        const matchesDiscipline = creds.some((c) => CREDENTIAL_TO_DISCIPLINE[c] === disc);
        const matchesType = creds.some((c) => credentialSet.has(c));
        if (matchesDiscipline && matchesType) return true;
      }

      // Fall back to membership role (e.g. role='pt' matches PT primary, role='pta' matches PT assistant)
      if (s.role === expectedRole) return true;

      // Admin with no credentials won't appear unless they also have a clinical role
      return false;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign Care Team
          </DialogTitle>
          <DialogDescription>
            Assign therapists by discipline for{' '}
            <span className="font-medium">{patientName}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {DISCIPLINES.map((disc) => {
              const style = DISCIPLINE_STYLES[disc];
              const primaries = getStaffForDiscipline(disc, 'primary');
              const assistants = getStaffForDiscipline(disc, 'assistant');
              const hasStaff = primaries.length > 0 || assistants.length > 0;
              const hasAssignment =
                assignments[disc].primary || assignments[disc].assistants.length > 0;

              if (!hasStaff && !hasAssignment) return null;

              return (
                <div
                  key={disc}
                  className={`border rounded-lg border-l-4 ${style.border} p-3 space-y-3`}
                >
                  <Label className={`text-sm font-semibold ${style.text}`}>
                    {style.label}
                  </Label>

                  {/* Primary therapist */}
                  {primaries.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                        <Stethoscope className="h-3 w-3" />
                        Primary Therapist
                      </p>
                      <div className="space-y-1">
                        {primaries.map((staff) => (
                          <button
                            key={staff.user_id}
                            type="button"
                            onClick={() => setPrimary(disc, staff.user_id)}
                            className={`w-full flex items-center justify-between p-2 rounded border text-sm transition-colors ${
                              assignments[disc].primary === staff.user_id
                                ? `${style.bg} border-current`
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-medium">
                              {staff.display_name || staff.email}
                            </span>
                            <Badge
                              variant="outline"
                              className={style.badge}
                            >
                              {staff.credentials?.trim().toUpperCase() || disc}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assistants */}
                  {assistants.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                        <UserCog className="h-3 w-3" />
                        Assistant(s)
                      </p>
                      <div className="space-y-1">
                        {assistants.map((staff) => (
                          <label
                            key={staff.user_id}
                            className={`flex items-center justify-between p-2 rounded border cursor-pointer text-sm transition-colors ${
                              assignments[disc].assistants.includes(staff.user_id)
                                ? `${style.bg} border-current`
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={assignments[disc].assistants.includes(staff.user_id)}
                                onCheckedChange={() => toggleAssistant(disc, staff.user_id)}
                              />
                              <span className="font-medium">
                                {staff.display_name || staff.email}
                              </span>
                            </div>
                            <Badge
                              variant="outline"
                              className={style.badge}
                            >
                              {staff.credentials?.trim().toUpperCase() || disc}
                            </Badge>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasStaff && (
                    <p className="text-xs text-slate-400">
                      No {style.label} staff in this clinic
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 bg-white pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Assignments'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
