-- Fix branding_settings: add missing columns for full clinic branding support
-- These columns support separated address fields, storage paths, colors, and additional clinic identifiers.
-- Using ADD COLUMN IF NOT EXISTS to be safe against partial re-runs.

-- Storage path columns (to track the actual storage path separately from the signed URL)
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS logo_storage_path text;
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS letterhead_storage_path text;

-- Color branding columns
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#1e40af';
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#64748b';

-- Separated address fields (in addition to existing single 'address' column)
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS address_street text;
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS address_city text;
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS address_state text;
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS address_zip text;

-- Additional clinic identifier columns
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS fax text DEFAULT '';
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS npi text DEFAULT '';
ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS tax_id text DEFAULT '';
