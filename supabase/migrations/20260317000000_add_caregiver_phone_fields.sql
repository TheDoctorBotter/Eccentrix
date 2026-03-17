-- Add caregiver contact fields to patients table
-- and contact_phone to appointments table for Eccentrix Scheduler SMS reminders.

alter table patients
  add column if not exists caregiver_name text null,
  add column if not exists caregiver_phone text null,
  add column if not exists preferred_contact text not null
    default 'caregiver'
    check (preferred_contact in ('caregiver', 'patient', 'both'));

comment on column patients.caregiver_name is
  'Caregiver/guardian name — Mom / Dad / Guardian';
comment on column patients.caregiver_phone is
  'Caregiver/guardian phone — primary contact for pediatric patients. Used by Eccentrix Scheduler for SMS reminders.';
comment on column patients.preferred_contact is
  'Which phone number to use for SMS reminders: caregiver, patient, or both';

-- Add contact_phone to appointments so the scheduler always has the right number
-- even if the patient record is later updated.
alter table appointments
  add column if not exists contact_phone text null;

comment on column appointments.contact_phone is
  'Phone number for SMS reminders for this appointment. Copied from patient caregiver_phone or phone at booking time.';

-- Also add contact_phone to visits (EMR-side bookings)
alter table visits
  add column if not exists contact_phone text null;

comment on column visits.contact_phone is
  'Phone number for reminders. Copied from patient caregiver_phone or phone at booking time.';
