'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ArrowLeft, Database, Key, FileText } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Settings</h1>
          <p className="text-slate-600">
            Configure your PT Note Writer application
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Key className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle>API Configuration</CardTitle>
                  <CardDescription>
                    OpenAI API settings for note generation
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 bg-slate-50 rounded-lg border">
                <p className="text-sm text-slate-700 mb-2">
                  <strong>API Key Status:</strong>{' '}
                  {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
                    <span className="text-green-600">Configured via environment</span>
                  ) : (
                    <span className="text-orange-600">Not configured</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  Set OPENAI_API_KEY in your .env file to enable note generation.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle>Templates</CardTitle>
                  <CardDescription>
                    Manage note templates and default settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/templates">
                <Button>Manage Templates</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle>Data Storage</CardTitle>
                  <CardDescription>Database and storage information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-4 bg-slate-50 rounded-lg border">
                <p className="text-sm text-slate-700 mb-1">
                  <strong>Database:</strong> Supabase (PostgreSQL)
                </p>
                <p className="text-xs text-slate-500">
                  All notes and templates are stored securely in your Supabase
                  database.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-900">Privacy & Compliance</CardTitle>
              <CardDescription className="text-orange-700">
                Important information about PHI and data protection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-orange-900">
              <p>
                <strong>Do not enter Protected Health Information (PHI)</strong> such as:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Patient names, dates of birth, or addresses</li>
                <li>Medical record numbers or account numbers</li>
                <li>Social Security numbers</li>
                <li>Any other identifiable patient information</li>
              </ul>
              <p className="mt-3">
                All generated notes are <strong>drafts</strong> and must be reviewed
                and approved by a licensed clinician before use in patient records.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>
                <strong>PT Note Writer</strong> - AI-powered physical therapy
                documentation assistant
              </p>
              <p>Version 1.0.0</p>
              <p className="text-xs pt-2">
                This tool is designed to assist clinicians in creating professional
                documentation. It does not replace clinical judgment or the need for
                proper review and approval of all documentation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
