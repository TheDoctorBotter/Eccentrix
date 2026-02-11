/*
  # Add allergies and precautions to patients table

  These fields need to be stored at the patient level so they carry
  into every note automatically without manual re-entry.

  1. Changes
    - Add `allergies` TEXT column (e.g., "NKDA", "Penicillin, Latex")
    - Add `precautions` TEXT column (e.g., "Fall risk", "WB restrictions")
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'allergies'
  ) THEN
    ALTER TABLE patients ADD COLUMN allergies TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'precautions'
  ) THEN
    ALTER TABLE patients ADD COLUMN precautions TEXT;
  END IF;
END $$;
