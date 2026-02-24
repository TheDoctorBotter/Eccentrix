-- ============================================================================
-- HOTFIX: Fix sign-in "infinite recursion detected in policy for
-- relation clinic_memberships"
--
-- Root cause: ANY policy on clinic_memberships that references
-- clinic_memberships (even via SECURITY DEFINER function) triggers
-- PostgreSQL's infinite recursion detection.
--
-- Fix: Use only a direct column check (user_id = auth.uid()) with no
-- subqueries or function calls that touch clinic_memberships.
-- Admin management of memberships goes through the service role key
-- (supabaseAdmin) which bypasses RLS entirely.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- 1. Drop ALL existing clinic_memberships policies (from any migration)
DROP POLICY IF EXISTS "memberships_select_own" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_insert_policy" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_update_policy" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_select" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_insert" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_update" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_delete" ON clinic_memberships;

-- 2. Ensure RLS is enabled
ALTER TABLE clinic_memberships ENABLE ROW LEVEL SECURITY;

-- 3. SELECT: Users can see their own memberships only.
--    Simple direct column check — no subqueries, no recursion possible.
CREATE POLICY "clinic_memberships_select"
ON clinic_memberships FOR SELECT
USING (user_id = auth.uid());

-- 4. INSERT/UPDATE/DELETE: No client-side policies.
--    Managing memberships (add/edit/remove team members) must go through
--    the service role key (supabaseAdmin), which bypasses RLS entirely.
--    This is the most secure approach for membership management.

-- 5. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
