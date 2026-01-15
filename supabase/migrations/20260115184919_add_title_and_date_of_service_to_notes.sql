/*
  # Add title and date_of_service to notes table

  1. Changes
    - Add `title` column (text) to store computed note title for display and search
    - Add `date_of_service` column (date) to store when the service was provided

  2. Notes
    - title format: "LAST NAME, FIRST NAME - NOTE_TYPE - YYYY-MM-DD"
    - date_of_service defaults to NULL to maintain backward compatibility
    - Existing notes will have NULL values until updated
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'title'
  ) THEN
    ALTER TABLE notes ADD COLUMN title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'date_of_service'
  ) THEN
    ALTER TABLE notes ADD COLUMN date_of_service date;
  END IF;
END $$;
