-- ==========================================================================
-- ECCENTRIX EMR — Notes Table Extensions
-- Run this manually in the Supabase SQL Editor.
-- ==========================================================================

-- PHASE 2A: Add new columns (safe — uses IF NOT EXISTS)
-- -------------------------------------------------------
-- NOTE: Many columns may already exist (visit_id, clinic_id, patient_id,
-- status, finalized_at, finalized_by). The IF NOT EXISTS clause prevents errors.

alter table notes
  add column if not exists discipline text null,
  add column if not exists note_type text null,
  add column if not exists visit_id uuid references visits(id),
  add column if not exists clinic_id uuid references clinics(id),
  add column if not exists form_data jsonb null,
  add column if not exists ai_narrative text null,
  add column if not exists finalized_at timestamptz null,
  add column if not exists finalized_by uuid null,
  add column if not exists status text default 'draft',
  add column if not exists medical_necessity text null,
  add column if not exists therapist_id uuid null;

-- PHASE 2B: Check constraints
-- -------------------------------------------------------
-- These use DO blocks to avoid errors if constraints already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_discipline_check'
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_discipline_check
      CHECK (discipline IN ('PT','OT','ST') OR discipline IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_note_type_check'
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_note_type_check
      CHECK (note_type IN ('daily_soap','evaluation','re_evaluation','discharge') OR note_type IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_status_check'
  ) THEN
    ALTER TABLE notes
      ADD CONSTRAINT notes_status_check
      CHECK (status IN ('draft','final'));
  END IF;
END $$;

-- PHASE 2C: Indexes for performance
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS notes_visit_id_idx ON notes(visit_id);
CREATE INDEX IF NOT EXISTS notes_clinic_id_idx ON notes(clinic_id);
CREATE INDEX IF NOT EXISTS notes_status_idx ON notes(status);

-- PHASE 2D: Unique partial index to prevent duplicate drafts
-- -------------------------------------------------------
-- Only one draft per (visit_id, note_type) combination.
-- Multiple finalized notes are allowed historically.

CREATE UNIQUE INDEX IF NOT EXISTS notes_one_draft_per_visit_note_type
  ON notes(visit_id, note_type)
  WHERE status = 'draft';

-- PHASE 2E: RLS Policies
-- -------------------------------------------------------
-- Drop the open policy if it exists, then create clinic-scoped policies.

DROP POLICY IF EXISTS "Staff full access" ON notes;

-- SELECT: clinic members can read their own clinic notes
CREATE POLICY "notes_select" ON notes FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
    AND (
      clinic_memberships.clinic_id_ref = notes.clinic_id
      OR clinic_memberships.clinic_id = notes.clinic_id
    )
    AND clinic_memberships.is_active = true
  )
);

-- INSERT: active clinic members can create notes
CREATE POLICY "notes_insert" ON notes FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
    AND (
      clinic_memberships.clinic_id_ref = notes.clinic_id
      OR clinic_memberships.clinic_id = notes.clinic_id
    )
    AND clinic_memberships.is_active = true
  )
);

-- UPDATE: only allow updates when status is draft — finalized notes are immutable
CREATE POLICY "notes_update" ON notes FOR UPDATE
USING (
  status = 'draft'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM clinic_memberships
      WHERE clinic_memberships.user_id = auth.uid()
      AND (
        clinic_memberships.clinic_id_ref = notes.clinic_id
        OR clinic_memberships.clinic_id = notes.clinic_id
      )
      AND clinic_memberships.is_active = true
      AND clinic_memberships.role = ANY(ARRAY[
        'admin'::clinic_role,
        'clinic_admin'::clinic_role,
        'pt'::clinic_role,
        'ot'::clinic_role,
        'slp'::clinic_role
      ])
    )
  )
);

-- DELETE: admins only
CREATE POLICY "notes_delete" ON notes FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
    AND (
      clinic_memberships.clinic_id_ref = notes.clinic_id
      OR clinic_memberships.clinic_id = notes.clinic_id
    )
    AND clinic_memberships.is_active = true
    AND clinic_memberships.role = ANY(ARRAY['admin'::clinic_role,'clinic_admin'::clinic_role])
  )
);
