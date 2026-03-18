-- ============================================================================
-- BCBS Visit Benefits — Schema Migration
-- Run this SQL manually in your Supabase SQL editor
-- ============================================================================

-- 1. BCBS visit benefit periods (one per patient per plan year)
create table if not exists bcbs_visit_benefits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,

  -- Plan year
  benefit_year_start date not null,
  benefit_year_end date not null,

  -- Benefit structure type
  benefit_type text not null default 'pooled'
    check (benefit_type in ('pooled', 'split')),

  -- Pooled limit (used when benefit_type = 'pooled')
  total_visits_allowed integer null,
  total_visits_used integer not null default 0,

  -- Split limits (used when benefit_type = 'split')
  pt_visits_allowed integer null,
  pt_visits_used integer not null default 0,
  ot_visits_allowed integer null,
  ot_visits_used integer not null default 0,
  st_visits_allowed integer null,
  st_visits_used integer not null default 0,

  -- BCBS member info
  bcbs_member_id text null,
  bcbs_group_number text null,
  bcbs_plan_name text null,

  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null,
  last_updated_at timestamptz not null default now(),
  last_updated_by uuid null
);

-- Indexes
create index if not exists bcbs_benefits_patient_id_idx
  on bcbs_visit_benefits(patient_id);
create index if not exists bcbs_benefits_clinic_id_idx
  on bcbs_visit_benefits(clinic_id);
create index if not exists bcbs_benefits_active_idx
  on bcbs_visit_benefits(is_active);

-- 2. Visit usage log for BCBS (mirrors authorization_usage_log pattern)
create table if not exists bcbs_visit_log (
  id uuid primary key default gen_random_uuid(),
  benefit_id uuid not null references bcbs_visit_benefits(id) on delete cascade,
  visit_id uuid null references visits(id) on delete set null,
  patient_id uuid null,
  clinic_id uuid null references clinics(id),
  discipline text not null check (discipline in ('PT','OT','ST')),
  usage_type text not null check (usage_type in ('deduction','restore','adjustment')),
  visits_used integer not null default 1,
  before_balance integer null,
  after_balance integer null,
  date_of_service date null,
  therapist_id uuid null,
  note text null,
  created_at timestamptz not null default now(),
  created_by uuid null
);

create index if not exists bcbs_visit_log_benefit_id_idx
  on bcbs_visit_log(benefit_id);
create index if not exists bcbs_visit_log_visit_id_idx
  on bcbs_visit_log(visit_id);
create index if not exists bcbs_visit_log_created_at_idx
  on bcbs_visit_log(created_at desc);

-- 3. Auto-update last_updated_at trigger
create or replace function update_bcbs_benefit_timestamp()
returns trigger as $$
begin
  new.last_updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists bcbs_benefits_updated on bcbs_visit_benefits;
create trigger bcbs_benefits_updated
before update on bcbs_visit_benefits
for each row execute function update_bcbs_benefit_timestamp();

-- 4. Row Level Security
alter table bcbs_visit_benefits enable row level security;
alter table bcbs_visit_log enable row level security;

-- bcbs_visit_benefits policies
create policy "bcbs_benefits_select" on bcbs_visit_benefits for select
using (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = bcbs_visit_benefits.clinic_id
      or clinic_memberships.clinic_id = bcbs_visit_benefits.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

create policy "bcbs_benefits_insert" on bcbs_visit_benefits for insert
with check (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = bcbs_visit_benefits.clinic_id
      or clinic_memberships.clinic_id = bcbs_visit_benefits.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

create policy "bcbs_benefits_update" on bcbs_visit_benefits for update
using (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = bcbs_visit_benefits.clinic_id
      or clinic_memberships.clinic_id = bcbs_visit_benefits.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

-- bcbs_visit_log policies
create policy "bcbs_log_select" on bcbs_visit_log for select
using (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = bcbs_visit_log.clinic_id
      or clinic_memberships.clinic_id = bcbs_visit_log.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);

create policy "bcbs_log_insert" on bcbs_visit_log for insert
with check (
  is_super_admin(auth.uid())
  or exists (
    select 1 from clinic_memberships
    where clinic_memberships.user_id = auth.uid()
    and (
      clinic_memberships.clinic_id_ref = bcbs_visit_log.clinic_id
      or clinic_memberships.clinic_id = bcbs_visit_log.clinic_id
    )
    and clinic_memberships.is_active = true
  )
);
