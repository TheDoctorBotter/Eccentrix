'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface DeletePatientDialogProps {
  patientId: string;
  patientName: string;
}

export function DeletePatientDialog({ patientId, patientName }: DeletePatientDialogProps) {
  const router = useRouter();
  const { hasRole, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show to admins
  if (!hasRole(['admin'])) {
    return null;
  }

  const handleDelete = async () => {
    const adminEmail = email || user?.email;
    if (!adminEmail) {
      setError('Email is required. Please enter your admin email address.');
      return;
    }
    if (!password) {
      setError('Please enter your admin password.');
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/patients/${patientId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password,
          reason: reason || 'Patient removed by admin',
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to delete patient');
      }

      // Success - redirect to home with refresh
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Error deleting patient:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete patient');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Pre-fill email from auth context
      setEmail(user?.email || '');
    }
    if (!newOpen) {
      setPassword('');
      setReason('');
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Delete Patient
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Patient
          </DialogTitle>
          <DialogDescription>
            This will remove <strong>{patientName}</strong> from your caseload and discharge all active episodes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Enter your admin credentials to confirm deletion.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="delete-email">Admin Email *</Label>
            <Input
              id="delete-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={deleting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-password">Admin Password *</Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={deleting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password) {
                  handleDelete();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-reason">Reason (optional)</Label>
            <Input
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Test patient, duplicate record"
              disabled={deleting}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-2"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? 'Deleting...' : 'Delete Patient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
