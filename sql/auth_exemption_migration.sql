-- ==========================================================================
-- Auth Exemption Migration
-- Per-clinic authorization exemption for payer types like ECI, self-pay, etc.
--
-- Run this SQL manually in Supabase before deploying the code changes.
-- ==========================================================================

-- 1) Add auth-exempt payer types array to clinics table
--    Default is empty array — no change for any existing clinic.
alter table clinics
  add column if not exists auth_exempt_payers text[] not null default '{}';

comment on column clinics.auth_exempt_payers is
  'Payer types that do not require prior authorization for scheduling at this clinic. '
  'Example values: eci, self_pay, private_pay. Each clinic controls this independently.';

-- 2) Add payer_type to patients table
--    Nullable — existing patients are unaffected until staff sets their payer type.
alter table patients
  add column if not exists payer_type text null;

-- Add a check constraint for allowed values (allows null)
-- Using DO block to avoid error if constraint already exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'patients_payer_type_check'
  ) then
    alter table patients
      add constraint patients_payer_type_check
      check (payer_type is null or payer_type in (
        'medicaid',
        'medicare',
        'private_insurance',
        'eci',
        'self_pay',
        'tricare',
        'chip',
        'other'
      ));
  end if;
end $$;

comment on column patients.payer_type is
  'Insurance/program payer type. Used for auth exemption checks (e.g. ECI patients '
  'do not require prior authorization at clinics that have eci in auth_exempt_payers).';

-- 3) Add auth_exempt flag and reason to visits table for auditability
alter table visits
  add column if not exists auth_exempt boolean not null default false,
  add column if not exists auth_exempt_reason text null;

comment on column visits.auth_exempt is
  'True when this visit was scheduled without prior authorization because '
  'the patient payer type is in the clinic auth_exempt_payers list.';

comment on column visits.auth_exempt_reason is
  'Human-readable reason why this visit is auth-exempt (e.g. ECI program).';

-- 4) Seed Buckeye PT with ECI exemption
--    Replace the UUID below with the actual Buckeye PT clinic_id if different.
--    This is a no-op if the clinic_id doesn't match.
update clinics
  set auth_exempt_payers = array['eci']
  where id = 'd670e7f5-540c-41f2-98b3-8649f6355c6a';

-- 5) Verify Children's Therapy World is NOT updated
--    auth_exempt_payers should remain '{}' for all other clinics.
--    Run this SELECT to confirm:
-- select id, name, auth_exempt_payers from clinics order by name;
