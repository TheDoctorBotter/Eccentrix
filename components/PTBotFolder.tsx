'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  FileCheck,
  FileX,
  FileText,
  Users,
} from 'lucide-react';

interface PTBotPatient {
  patient_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  created_at: string;
  has_consent_form: boolean;
  has_referral: boolean;
  note_count: number;
  file_count: number;
}

interface PTBotFolderProps {
  clinicId: string;
}

export function PTBotFolder({ clinicId }: PTBotFolderProps) {
  const [patients, setPatients] = useState<PTBotPatient[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPatients = async () => {
    if (patients.length > 0) return; // Already loaded
    setLoading(true);
    try {
      const res = await fetch(`/api/ptbot/patients-folder?clinic_id=${clinicId}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Error fetching PTBot patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    if (newOpen) {
      fetchPatients();
    }
  };

  // Pre-fetch count on mount
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/ptbot/patients-folder?clinic_id=${clinicId}`);
        if (res.ok) {
          const data = await res.json();
          setPatients(data);
        }
      } catch {
        // Silent fail for count pre-fetch
      }
    };
    fetchCount();
  }, [clinicId]);

  if (patients.length === 0 && !loading && !isOpen) {
    return null; // Don't show empty folder
  }

  return (
    <div className="mb-4">
      {/* Folder Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-violet-50 hover:border-violet-200 transition-colors cursor-pointer bg-gradient-to-r from-violet-50/50 to-white"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <FolderOpen className="h-5 w-5 text-violet-500" />
          ) : (
            <Folder className="h-5 w-5 text-violet-500" />
          )}
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-violet-400" />
            <span className="font-semibold text-slate-900">Telehealth Patients</span>
          </div>
          <Badge className="bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100">
            {patients.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Patient List */}
      {isOpen && (
        <div className="ml-6 mt-2 space-y-1 border-l-2 border-violet-100 pl-4">
          {loading ? (
            <div className="py-4 text-center text-sm text-slate-500">
              Loading patients...
            </div>
          ) : patients.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-500">
              <Users className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              No telehealth patients yet
            </div>
          ) : (
            patients.map((patient) => (
              <Link
                key={patient.patient_id}
                href={`/ptbot/patients/${patient.patient_id}`}
                className="block"
              >
                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-violet-50 hover:border-violet-200 transition-colors cursor-pointer">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm">
                      {patient.last_name?.toUpperCase()}, {patient.first_name}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {/* Consent Form Status */}
                      <span className={`flex items-center gap-1 text-xs ${
                        patient.has_consent_form ? 'text-emerald-600' : 'text-amber-500'
                      }`}>
                        {patient.has_consent_form ? (
                          <FileCheck className="h-3 w-3" />
                        ) : (
                          <FileX className="h-3 w-3" />
                        )}
                        Consent
                      </span>
                      {/* Referral Status */}
                      <span className={`flex items-center gap-1 text-xs ${
                        patient.has_referral ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        {patient.has_referral ? (
                          <FileCheck className="h-3 w-3" />
                        ) : (
                          <FileX className="h-3 w-3" />
                        )}
                        Referral
                      </span>
                      {/* Note Count */}
                      {patient.note_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-violet-500">
                          <FileText className="h-3 w-3" />
                          {patient.note_count} note{patient.note_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
