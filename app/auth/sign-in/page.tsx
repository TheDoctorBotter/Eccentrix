'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (message: string) => {
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDebugInfo([]);

    try {
      addDebug('Starting sign in...');
      addDebug(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING'}`);
      addDebug(`Has API key: ${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`);

      addDebug('Calling signInWithPassword...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      addDebug(`Response received - User: ${!!data?.user}, Error: ${!!error}`);

      if (error) {
        addDebug(`Auth error: ${error.message}`);
        setError(error.message);
        return;
      }

      if (data.user) {
        addDebug('User authenticated, checking memberships...');

        const { data: memberships, error: membershipError } = await supabase
          .from('clinic_memberships')
          .select('*')
          .eq('user_id', data.user.id)
          .eq('is_active', true)
          .limit(1);

        addDebug(`Memberships: ${memberships?.length || 0}, Error: ${!!membershipError}`);

        if (membershipError) {
          addDebug(`Membership error: ${membershipError.message}`);
          setError('Error checking account permissions. Please try again.');
          await supabase.auth.signOut();
          return;
        }

        if (!memberships || memberships.length === 0) {
          addDebug('No clinic memberships found');
          setError('Your account is not assigned to any clinic. Please contact your administrator.');
          await supabase.auth.signOut();
          return;
        }

        addDebug('Sign in successful, redirecting...');
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      addDebug(`Exception caught: ${errorMsg}`);
      setError(`Network error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-emerald-600 items-center justify-center mb-4">
            <span className="text-white font-bold text-3xl">B</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Buckeye EMR</h1>
          <p className="text-slate-600">Sign in to your account</p>
        </div>

        {/* Sign In Card */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

              <div className="text-center text-sm text-slate-600">
                <Link
                  href="/auth/forgot-password"
                  className="text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>

              {/* Debug Info - visible on mobile */}
              {debugInfo.length > 0 && (
                <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200">
                  <p className="text-xs font-semibold mb-2">Debug Log:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {debugInfo.map((msg, i) => (
                      <p key={i} className="text-xs text-slate-600 font-mono break-all">
                        {msg}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-600">
          <p>
            Need access?{' '}
            <span className="text-slate-700">Contact your clinic administrator</span>
          </p>
        </div>
      </div>
    </div>
  );
}
