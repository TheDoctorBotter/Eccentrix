/*
  # Add Provider Signature Fields to Branding Settings

  1. Changes
    - Add `provider_name` (text) - Name of the provider/clinician
    - Add `provider_credentials` (text) - Professional credentials (e.g., "PT, DPT")
    - Add `provider_license` (text) - License or ID number (e.g., "#1215276")
    - Add `signature_enabled` (boolean, default true) - Toggle to show/hide signature block

  2. Notes
    - These fields are used to generate a signature block on clinical notes
    - Signature format: "{provider_name}, {provider_credentials} {provider_license}"
    - Fields are optional and can be left empty
    - No PHI is stored in these fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branding_settings' AND column_name = 'provider_name'
  ) THEN
    ALTER TABLE branding_settings ADD COLUMN provider_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branding_settings' AND column_name = 'provider_credentials'
  ) THEN
    ALTER TABLE branding_settings ADD COLUMN provider_credentials text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branding_settings' AND column_name = 'provider_license'
  ) THEN
    ALTER TABLE branding_settings ADD COLUMN provider_license text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branding_settings' AND column_name = 'signature_enabled'
  ) THEN
    ALTER TABLE branding_settings ADD COLUMN signature_enabled boolean DEFAULT true;
  END IF;
END $$;