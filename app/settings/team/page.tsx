'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

const ALL_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'pt', label: 'PT (Physical Therapist)' },
  { value: 'pta', label: 'PTA (Physical Therapist Assistant)' },
  { value: 'ot', label: 'OT (Occupational Therapist)' },
  { value: 'ota', label: 'OTA (Occupational Therapy Assistant)' },
  { value: 'slp', label: 'SLP (Speech-Language Pathologist)' },
  { value: 'slpa', label: 'SLPA (Speech-Language Pathology Assistant)' },
  { value: 'front_office', label: 'Front Office' },
  { value: 'biller', label: 'Biller' },
] as const;

interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  clinic_name: string;
}

export default function ManageTeamPage() {
  const { currentClinic, loading: authLoading, hasRole } = useAuth();
  const isAdmin = hasRole(['admin']);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Add member dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit role dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id) return;
    fetchMembers();
  }, [authLoading, currentClinic?.clinic_id]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/user/membership?clinic_id=${currentClinic?.clinic_id}`
      );
      if (!res.ok) throw new Error('Failed to fetch members');
      const data = await res.json();
      setMembers(data);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!addEmail || !addRole || !currentClinic) {
      toast.error('Email and role are required');
      return;
    }

    try {
      setAdding(true);

      // Look up user by email via our API
      const lookupRes = await fetch(
        `/api/user/lookup?email=${encodeURIComponent(addEmail)}`
      );

      if (!lookupRes.ok) {
        const err = await lookupRes.json();
        toast.error(err.error || 'User not found. They must sign up first.');
        return;
      }

      const { user_id } = await lookupRes.json();

      // Create membership
      const res = await fetch('/api/user/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id,
          clinic_name: currentClinic.clinic_name,
          clinic_id_ref: currentClinic.clinic_id,
          role: addRole,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to add member');
        return;
      }

      toast.success(`Added ${addEmail} as ${addRole}`);
      setAddDialogOpen(false);
      setAddEmail('');
      setAddRole('');
      fetchMembers();
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleEditRole = async () => {
    if (!editMember || !editRole || !currentClinic) return;

    try {
      setSaving(true);

      const res = await fetch('/api/user/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editMember.user_id,
          clinic_name: currentClinic.clinic_name,
          clinic_id_ref: currentClinic.clinic_id,
          role: editRole,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to update role');
        return;
      }

      toast.success(`Updated ${editMember.display_name} to ${editRole}`);
      setEditDialogOpen(false);
      setEditMember(null);
      fetchMembers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.display_name} from ${currentClinic?.clinic_name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/user/membership/${member.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to remove member');
        return;
      }

      toast.success(`Removed ${member.display_name}`);
      fetchMembers();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-700 border-purple-200',
      pt: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      pta: 'bg-blue-100 text-blue-700 border-blue-200',
      ot: 'bg-amber-100 text-amber-700 border-amber-200',
      ota: 'bg-orange-100 text-orange-700 border-orange-200',
      slp: 'bg-rose-100 text-rose-700 border-rose-200',
      slpa: 'bg-pink-100 text-pink-700 border-pink-200',
      front_office: 'bg-slate-100 text-slate-700 border-slate-200',
      biller: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    };
    return colors[role] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getRoleLabel = (role: string) => {
    return ALL_ROLES.find((r) => r.value === role)?.label || role;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-[400px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <p>Only administrators can manage team members.</p>
              <Link href="/settings">
                <Button variant="outline" className="mt-4">Back to Settings</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <CardTitle>Manage Team</CardTitle>
                  <CardDescription>
                    Add, remove, and change roles for team members at{' '}
                    {currentClinic?.clinic_name}
                  </CardDescription>
                </div>
              </div>
              <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Add Member
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 rounded" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-700">No team members</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Add team members to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id || member.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{member.display_name}</p>
                          {member.email && member.email !== member.display_name && (
                            <p className="text-sm text-slate-500">{member.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getRoleBadgeColor(member.role)}
                        >
                          {getRoleLabel(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditMember(member);
                              setEditRole(member.role);
                              setEditDialogOpen(true);
                            }}
                            title="Change role"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveMember(member)}
                            title="Remove member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Member Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                The user must have an account first (sign up at the login page).
                Enter their email to add them to this clinic.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="add-email">Email Address</Label>
                <Input
                  id="add-email"
                  type="email"
                  placeholder="user@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={adding}>
                {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Role</DialogTitle>
              <DialogDescription>
                Update the role for {editMember?.display_name}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleEditRole} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
