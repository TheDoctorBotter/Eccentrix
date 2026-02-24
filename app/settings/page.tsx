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
import {
  Building2,
  Image,
  UserCircle,
  FileText,
  Database,
  Shield,
  ChevronRight,
  Settings as SettingsIcon,
  Stethoscope,
  ScrollText,
  ClipboardCheck,
  Send,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';

export default function SettingsPage() {

  const settingsCards = [
    {
      title: 'Clinic Settings',
      description: 'Manage clinic name, address, contact info, and basic configuration',
      icon: Building2,
      href: '/settings/clinic',
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
    },
    {
      title: 'Clinic Branding',
      description: 'Upload clinic logo and letterhead for professional documentation',
      icon: Image,
      href: '/settings/branding',
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Provider Signature',
      description: 'Configure therapist name, credentials, and license for document signing',
      icon: UserCircle,
      href: '/settings/branding',
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Document Templates',
      description: 'Upload and manage your clinic .docx templates for note export',
      icon: FileText,
      href: '/templates/manage',
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
    {
      title: 'Provider Profiles',
      description: 'Manage provider NPI, license, credentials, and scheduling preferences',
      icon: Stethoscope,
      href: '/settings/providers',
      iconColor: 'text-cyan-600',
      bgColor: 'bg-cyan-100',
    },
    {
      title: 'Audit Log',
      description: 'View HIPAA-compliant access and change audit trail',
      icon: ScrollText,
      href: '/audit',
      iconColor: 'text-slate-600',
      bgColor: 'bg-slate-100',
    },
    {
      title: 'CPT Codes',
      description: 'View and manage CPT/HCPCS billing codes for charge capture',
      icon: ClipboardCheck,
      href: '/billing',
      iconColor: 'text-rose-600',
      bgColor: 'bg-rose-100',
    },
    {
      title: 'TMHP / Billing Settings',
      description: 'Configure Tax ID, NPI, taxonomy code, and Medicaid provider ID for electronic claims',
      icon: Send,
      href: '/settings/billing',
      iconColor: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-100 rounded-lg">
              <SettingsIcon className="h-6 w-6 text-slate-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
          </div>
          <p className="text-slate-600">
            Configure Eccentrix EMR for your clinic
          </p>
        </div>

        {/* Settings Cards */}
        <div className="space-y-4">
          {settingsCards.map((card) => (
            <Link key={card.title} href={card.href}>
              <Card className="hover:border-emerald-200 hover:shadow-sm transition-all cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 ${card.bgColor} rounded-lg`}>
                        <card.icon className={`h-6 w-6 ${card.iconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{card.title}</h3>
                        <p className="text-sm text-slate-500">{card.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* System Information */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">System Information</h2>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-slate-500" />
                <div>
                  <CardTitle className="text-base">Data Storage</CardTitle>
                  <CardDescription>Database and storage information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-slate-50 rounded-lg border">
                <p className="text-sm text-slate-700 mb-1">
                  <strong>Database:</strong> Supabase (PostgreSQL)
                </p>
                <p className="text-xs text-slate-500">
                  All patient data, documents, and templates are stored securely in your
                  Supabase database.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-amber-600" />
                <div>
                  <CardTitle className="text-base text-amber-900">Privacy & Compliance</CardTitle>
                  <CardDescription className="text-amber-700">
                    Important information about PHI and data protection
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-amber-900">
              <p>
                <strong>Protected Health Information (PHI):</strong> Ensure compliance
                with HIPAA regulations when handling patient data.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Use secure connections and encrypted data storage</li>
                <li>Limit access to authorized personnel only</li>
                <li>Maintain audit logs of data access</li>
                <li>Follow your organization&apos;s security policies</li>
              </ul>
              <p className="pt-2">
                All generated notes are <strong>drafts</strong> and must be reviewed
                and finalized by a licensed clinician before becoming part of the
                patient record.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">About Eccentrix EMR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>
                <strong>Eccentrix EMR</strong> — Secure clinical documentation and patient
                chart management for physical therapy practices.
              </p>
              <p>Version 3.0.0</p>
              <p className="text-xs text-slate-400 pt-1">Powered by PTBot</p>
              <p className="text-xs pt-2">
                This system is designed to assist clinicians in creating professional
                documentation. It does not replace clinical judgment or the need for
                proper review and approval of all documentation.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
