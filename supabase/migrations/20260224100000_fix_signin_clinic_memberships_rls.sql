-- ============================================================================
-- HOTFIX: Fix sign-in "Error checking account permissions"
--
-- Root cause: clinic_memberships RLS policies reference clinic_memberships
-- in their own subqueries, causing PostgreSQL to detect infinite recursion.
--
-- Fix: Use a SECURITY DEFINER function to check admin status. SECURITY
-- DEFINER functions bypass RLS entirely, so they can query clinic_memberships
-- without triggering the policy recursion.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- 1. Create a SECURITY DEFINER helper to check admin status (bypasses RLS)
CREATE OR REPLACE FUNCTION is_clinic_membership_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM clinic_memberships
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 2. Drop ALL existing clinic_memberships policies (from any migration)
--    Old permissive policies from 20260208000000:
DROP POLICY IF EXISTS "memberships_select_own" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_insert_policy" ON clinic_memberships;
DROP POLICY IF EXISTS "memberships_update_policy" ON clinic_memberships;
--    Restrictive policies from 20260208100000:
DROP POLICY IF EXISTS "clinic_memberships_select" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_insert" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_update" ON clinic_memberships;
DROP POLICY IF EXISTS "clinic_memberships_delete" ON clinic_memberships;

-- 3. Ensure RLS is enabled
ALTER TABLE clinic_memberships ENABLE ROW LEVEL SECURITY;

-- 4. SELECT: Users can see their own memberships.
--    No self-referencing subquery needed.
CREATE POLICY "clinic_memberships_select"
ON clinic_memberships FOR SELECT
USING (
  user_id = auth.uid()
  OR is_clinic_membership_admin()
);

-- 5. INSERT: Only admins can create memberships (uses SECURITY DEFINER function)
CREATE POLICY "clinic_memberships_insert"
ON clinic_memberships FOR INSERT
WITH CHECK (
  is_clinic_membership_admin()
);

-- 6. UPDATE: Only admins can update memberships (uses SECURITY DEFINER function)
CREATE POLICY "clinic_memberships_update"
ON clinic_memberships FOR UPDATE
USING (
  is_clinic_membership_admin()
);

-- 7. DELETE: Only admins can delete memberships (uses SECURITY DEFINER function)
CREATE POLICY "clinic_memberships_delete"
ON clinic_memberships FOR DELETE
USING (
  is_clinic_membership_admin()
);

-- 8. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
