'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  Bell,
  Users,
  ChevronRight,
  Calendar,
  Stethoscope,
  Plus,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import {
  Episode,
  DocumentationAlert,
} from '@/lib/types';
import { format } from 'date-fns';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { currentClinic, loading: authLoading } = useAuth();

  console.log('Homepage render - currentClinic:', currentClinic);
  console.log('Homepage render - authLoading:', authLoading);

  // Temporarily simplified for debugging
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold">Homepage Test</h1>
        <p>Auth Loading: {authLoading ? 'true' : 'false'}</p>
        <p>Current Clinic: {currentClinic?.clinic_name || 'null'}</p>
      </main>
    </div>
  );
}
