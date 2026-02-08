'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestSupabasePage() {
  const [status, setStatus] = useState<string>('Testing...');
  const [details, setDetails] = useState<any>({});

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      // Check environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      setDetails({
        url: supabaseUrl || 'MISSING',
        hasKey: !!supabaseKey,
        keyLength: supabaseKey?.length || 0,
      });

      if (!supabaseUrl || !supabaseKey) {
        setStatus('❌ Missing environment variables');
        return;
      }

      // Try a simple query
      const { data, error } = await supabase
        .from('clinics')
        .select('id, name')
        .limit(1);

      if (error) {
        setStatus(`❌ Error: ${error.message}`);
        console.error('Supabase error:', error);
      } else {
        setStatus('✅ Connection successful!');
        console.log('Supabase data:', data);
      }
    } catch (err: any) {
      setStatus(`❌ Exception: ${err.message}`);
      console.error('Test error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Supabase Connection Test</h1>

        <div className="space-y-4">
          <div>
            <h2 className="font-semibold mb-2">Status:</h2>
            <p className="text-lg">{status}</p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">Environment Variables:</h2>
            <pre className="bg-slate-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>

          <div>
            <h2 className="font-semibold mb-2">Expected Format:</h2>
            <pre className="bg-slate-100 p-4 rounded text-sm">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...`}
            </pre>
          </div>

          <button
            onClick={testConnection}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Test Again
          </button>
        </div>
      </div>
    </div>
  );
}
