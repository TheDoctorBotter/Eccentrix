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
  role: string;
  clinic_name: string;
}

interface AssignCareTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  patientName: string;
  clinicId: string;
  onSaved?: () => void;
}

export function AssignCareTeamModal({
  open,
  onOpenChange,
  episodeId,
  patientName,
  clinicId,
  onSaved,
}: AssignCareTeamModalProps) {
  const [currentTeam, setCurrentTeam] = useState<CareTeamMember[]>([]);
  const [clinicStaff, setClinicStaff] = useState<ClinicStaff[]>([]);
  const [selectedPt, setSelectedPt] = useState<string | null>(null);
  const [selectedPtas, setSelectedPtas] = useState<string[]>([]);
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
      // Fetch current care team
      const teamRes = await fetch(`/api/care-team?episode_id=${episodeId}`);
      const teamData = teamRes.ok ? await teamRes.json() : [];
      setCurrentTeam(teamData);

      // Fetch clinic staff (all memberships for this clinic)
      const staffRes = await fetch(`/api/user/membership?clinic_id=${clinicId}`);
      const staffData = staffRes.ok ? await staffRes.json() : [];
      setClinicStaff(staffData);

      // Pre-select current assignments
      const ptMember = teamData.find((m: CareTeamMember) => m.role === 'pt');
      setSelectedPt(ptMember?.user_id || null);

      const ptaMembers = teamData
        .filter((m: CareTeamMember) => m.role === 'pta')
        .map((m: CareTeamMember) => m.user_id);
      setSelectedPtas(ptaMembers);
    } catch (error) {
      console.error('Error loading care team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Determine what needs to be added and removed
      const currentPt = currentTeam.find((m) => m.role === 'pt');
      const currentPtaIds = currentTeam
        .filter((m) => m.role === 'pta')
        .map((m) => m.user_id);

      // Handle PT changes
      if (currentPt && currentPt.user_id !== selectedPt) {
        // Remove old PT
        await fetch('/api/care-team', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode_id: episodeId, user_id: currentPt.user_id }),
        });
      }
      if (selectedPt && selectedPt !== currentPt?.user_id) {
        // Add new PT
        await fetch('/api/care-team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode_id: episodeId, user_id: selectedPt, role: 'pt' }),
        });
      }

      // Handle PTA changes
      const ptasToRemove = currentPtaIds.filter((id) => !selectedPtas.includes(id));
      const ptasToAdd = selectedPtas.filter((id) => !currentPtaIds.includes(id));

      for (const userId of ptasToRemove) {
        await fetch('/api/care-team', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode_id: episodeId, user_id: userId }),
        });
      }

      for (const userId of ptasToAdd) {
        await fetch('/api/care-team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episode_id: episodeId, user_id: userId, role: 'pta' }),
        });
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

  const ptStaff = clinicStaff.filter((s) => s.role === 'pt');
  const ptaStaff = clinicStaff.filter((s) => s.role === 'pta');

  const togglePta = (userId: string) => {
    setSelectedPtas((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign Care Team
          </DialogTitle>
          <DialogDescription>
            Assign therapists for <span className="font-medium">{patientName}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* PT Selection (single-select) */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                <Stethoscope className="h-4 w-4 text-emerald-600" />
                Primary PT
              </Label>
              {ptStaff.length === 0 ? (
                <p className="text-sm text-slate-500">No PTs in this clinic</p>
              ) : (
                <div className="space-y-2">
                  {ptStaff.map((staff) => (
                    <label
                      key={staff.user_id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPt === staff.user_id
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedPt(
                        selectedPt === staff.user_id ? null : staff.user_id
                      )}
                    >
                      <span className="text-sm font-medium">{staff.email}</span>
                      <Badge
                        variant="outline"
                        className="bg-emerald-100 text-emerald-700 border-emerald-200"
                      >
                        PT
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* PTA Selection (multi-select) */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                <UserCog className="h-4 w-4 text-blue-600" />
                PTA(s)
              </Label>
              {ptaStaff.length === 0 ? (
                <p className="text-sm text-slate-500">No PTAs in this clinic</p>
              ) : (
                <div className="space-y-2">
                  {ptaStaff.map((staff) => (
                    <label
                      key={staff.user_id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPtas.includes(staff.user_id)
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedPtas.includes(staff.user_id)}
                          onCheckedChange={() => togglePta(staff.user_id)}
                        />
                        <span className="text-sm font-medium">{staff.email}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-blue-100 text-blue-700 border-blue-200"
                      >
                        PTA
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
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
