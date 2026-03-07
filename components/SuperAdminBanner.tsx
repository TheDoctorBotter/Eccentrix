'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Persistent banner shown when a super admin is operating inside a specific
 * clinic context. Provides a way to exit back to the super admin dashboard.
 * This banner is only visible to super admins who have selected a clinic.
 */
export function SuperAdminBanner() {
  const { isSuperAdmin, currentClinic } = useAuth();
  const router = useRouter();

  // Only show when super admin is inside a clinic context
  if (!isSuperAdmin || !currentClinic) return null;

  return (
    <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" />
        <span>
          <strong>Super Admin</strong> — Viewing as{' '}
          <strong>{currentClinic.clinic_name}</strong>
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-white hover:bg-purple-700 h-7"
        onClick={() => router.push('/super-admin')}
      >
        Exit to Dashboard
      </Button>
    </div>
  );
}
