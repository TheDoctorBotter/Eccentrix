-- Equipment & Orthotics Tracking — Migration SQL
-- Run this manually in the Supabase SQL editor.

-- Main equipment referral tracking table
create table if not exists equipment_referrals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  equipment_type text not null check (equipment_type in (
    'manual_wheelchair',
    'power_wheelchair',
    'stroller_medical',
    'gait_trainer',
    'standing_frame',
    'afo_orthotics',
    'kafo_orthotics',
    'smo_orthotics',
    'upper_extremity_orthotics',
    'other'
  )),
  equipment_description text null,
  phase text not null default 'monitoring' check (phase in (
    'monitoring',
    'referral_sent',
    'evaluation_completed',
    'equipment_received'
  )),
  provider_company text null,
  provider_contact_name text null,
  provider_contact_phone text null,
  provider_contact_email text null,
  referral_sent_date date null,
  evaluation_date date null,
  evaluation_notes text null,
  equipment_received_date date null,
  notes text null,
  last_updated_at timestamptz not null default now(),
  last_updated_by uuid null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  is_active boolean not null default true
);

-- Indexes for performance
create index if not exists equipment_referrals_clinic_id_idx
  on equipment_referrals(clinic_id);
create index if not exists equipment_referrals_patient_id_idx
  on equipment_referrals(patient_id);
create index if not exists equipment_referrals_phase_idx
  on equipment_referrals(phase);
create index if not exists equipment_referrals_last_updated_idx
  on equipment_referrals(last_updated_at);

-- RLS: match existing clinic_memberships pattern
alter table equipment_referrals enable row level security;

create policy "equipment_referrals_select" on equipment_referrals for select
using (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = equipment_referrals.clinic_id
      or clinic_memberships.clinic_id = equipment_referrals.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

create policy "equipment_referrals_insert" on equipment_referrals for insert
with check (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = equipment_referrals.clinic_id
      or clinic_memberships.clinic_id = equipment_referrals.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

create policy "equipment_referrals_update" on equipment_referrals for update
using (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = equipment_referrals.clinic_id
      or clinic_memberships.clinic_id = equipment_referrals.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

-- Trigger to auto-update last_updated_at on any change
create or replace function update_equipment_referral_timestamp()
returns trigger as $$
begin
  new.last_updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger equipment_referrals_updated
before update on equipment_referrals
for each row execute function update_equipment_referral_timestamp();
