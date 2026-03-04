-- Add 'confirmed' value to the appointment_status enum
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'confirmed' AFTER 'scheduled';
