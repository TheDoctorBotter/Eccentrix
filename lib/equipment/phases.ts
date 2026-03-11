export interface EquipmentPhase {
  id: string;
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  description: string;
}

export const EQUIPMENT_PHASES: EquipmentPhase[] = [
  {
    id: 'monitoring',
    label: 'Monitoring — Pending Referral',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-200',
    description:
      'Child identified as potentially benefiting from equipment. Watching and documenting.',
  },
  {
    id: 'referral_sent',
    label: 'Referral Sent',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-200',
    description: 'Referral has been initiated and sent to provider.',
  },
  {
    id: 'evaluation_completed',
    label: 'Evaluation Complete — Pending Delivery',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-200',
    description:
      'Mobility/orthotic evaluation completed. Equipment ordered and pending with provider.',
  },
  {
    id: 'equipment_received',
    label: 'Equipment Received',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-200',
    description: 'Equipment delivered to patient.',
  },
];

export const EQUIPMENT_TYPES = [
  { id: 'manual_wheelchair', label: 'Manual Wheelchair' },
  { id: 'power_wheelchair', label: 'Power Wheelchair' },
  { id: 'stroller_medical', label: 'Medical Stroller' },
  { id: 'gait_trainer', label: 'Gait Trainer' },
  { id: 'standing_frame', label: 'Standing Frame' },
  { id: 'afo_orthotics', label: 'AFO (Ankle-Foot Orthosis)' },
  { id: 'kafo_orthotics', label: 'KAFO (Knee-Ankle-Foot Orthosis)' },
  { id: 'smo_orthotics', label: 'SMO (Supra-Malleolar Orthosis)' },
  { id: 'upper_extremity_orthotics', label: 'Upper Extremity Orthotics' },
  { id: 'other', label: 'Other' },
];

export const PROVIDER_COMPANIES = [
  'National Seating and Mobility (NSM)',
  'NuMotion',
  'Hanger Clinic',
  'Ability Center',
  'Other',
];

export interface ProviderDirectoryEntry {
  id: string;
  name: string;
  company: string;
  providerType: 'atp' | 'orthotist';
  phone: string;
  email: string | null;
}

export const ATP_DIRECTORY: ProviderDirectoryEntry[] = [
  {
    id: 'michael_bird',
    name: 'Michael Bird, ATP',
    company: 'Travis Medical',
    providerType: 'atp',
    phone: '956-994-8405',
    email: 'michael.bird@travismedical.com',
  },
  {
    id: 'luis_garcia',
    name: 'Luis Garcia, ATP',
    company: 'National Seating and Mobility (NSM)',
    providerType: 'atp',
    phone: '956-994-8405',
    email: 'Luis.Garcia1@nsm-seating.com',
  },
  {
    id: 'rene_garcia',
    name: 'Rene Garcia, ATP',
    company: 'National Seating and Mobility (NSM)',
    providerType: 'atp',
    phone: '956-994-8405',
    email: 'Rene.Garcia@nsm-seating.com',
  },
];

export const ORTHOTIST_DIRECTORY: ProviderDirectoryEntry[] = [
  {
    id: 'hanger_edinburg',
    name: 'Hanger Clinic — Edinburg',
    company: 'Hanger Clinic',
    providerType: 'orthotist',
    phone: '956-682-4409',
    email: null,
  },
  {
    id: 'hanger_harlingen',
    name: 'Hanger Clinic — Harlingen',
    company: 'Hanger Clinic',
    providerType: 'orthotist',
    phone: '956-428-1160',
    email: null,
  },
  {
    id: 'hanger_brownsville',
    name: 'Hanger Clinic — Brownsville',
    company: 'Hanger Clinic',
    providerType: 'orthotist',
    phone: '956-646-1892',
    email: null,
  },
];

// Combined directory for unified search
export const PROVIDER_DIRECTORY: ProviderDirectoryEntry[] = [
  ...ATP_DIRECTORY,
  ...ORTHOTIST_DIRECTORY,
];

const STALE_THRESHOLD_DAYS = 30;

export function isStale(lastUpdatedAt: string): boolean {
  const updated = new Date(lastUpdatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= STALE_THRESHOLD_DAYS;
}

export function daysSinceUpdate(lastUpdatedAt: string): number {
  const updated = new Date(lastUpdatedAt);
  const now = new Date();
  return Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
}

export function getPhaseById(phaseId: string): EquipmentPhase | undefined {
  return EQUIPMENT_PHASES.find((p) => p.id === phaseId);
}

export function getEquipmentTypeLabel(typeId: string): string {
  return EQUIPMENT_TYPES.find((t) => t.id === typeId)?.label || typeId;
}
