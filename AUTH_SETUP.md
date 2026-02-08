# Buckeye EMR - Authentication Setup Guide

## Overview

Buckeye EMR now has full authentication and role-based access control implemented using Supabase Auth and Row Level Security (RLS).

## Features Implemented

### 1. Authentication
- ✅ Email/password sign-in
- ✅ Sign-out functionality
- ✅ Password reset flow
- ✅ Session management
- ✅ Protected routes (middleware)

### 2. Role-Based Access Control
Four roles supported:
- **Admin**: Full access, can manage users and settings
- **PT (Physical Therapist)**: Can finalize clinical documents, assign PTAs
- **PTA (Physical Therapist Assistant)**: Can create drafts, cannot finalize
- **Front Office**: Can view charts, manage demographics, cannot finalize

### 3. Database Security
- Row Level Security (RLS) enabled on all tables
- Clinic-based access control
- Episode-based care team assignments
- PT-only finalization enforcement at database level

## Setup Instructions

### Step 1: Run Database Migrations

Make sure you have Supabase CLI installed and your project linked.

```bash
# If using Supabase local development
npx supabase db push

# Or apply migrations manually in Supabase Dashboard
# Navigate to SQL Editor and run the migration files in order
```

### Step 2: Enable Supabase Auth

1. Go to your Supabase Dashboard
2. Navigate to Authentication → Settings
3. Enable Email provider
4. Configure email templates (optional)
5. Set Site URL to your production domain

### Step 3: Create First Admin User

**Option A: Via Supabase Dashboard**
1. Go to Authentication → Users
2. Click "Add User"
3. Enter email and password
4. Note the user ID

Then run this SQL in your Supabase SQL Editor:

```sql
-- Create a default clinic (if not exists)
INSERT INTO clinics (id, name, address, phone, email)
VALUES (
  gen_random_uuid(),
  'Buckeye Physical Therapy',
  '123 Main St',
  '555-0100',
  'info@buckeyept.com'
)
ON CONFLICT DO NOTHING
RETURNING id;

-- Add admin user to clinic (replace USER_ID and CLINIC_ID)
INSERT INTO clinic_memberships (user_id, clinic_id_ref, clinic_name, role, is_active)
VALUES (
  'USER_ID_FROM_AUTH_USERS',  -- Replace with actual user ID
  'CLINIC_ID_FROM_ABOVE',      -- Replace with clinic ID
  'Buckeye Physical Therapy',
  'admin',
  true
);
```

**Option B: Programmatic Setup (Recommended for Development)**

Create a setup script or use the Supabase SQL Editor:

```sql
-- Function to create first admin user and clinic
DO $$
DECLARE
  v_clinic_id UUID;
  v_admin_email TEXT := 'admin@buckeyept.com';
  v_admin_password TEXT := 'ChangeMe123!';
  v_user_id UUID;
BEGIN
  -- Check if clinic exists
  SELECT id INTO v_clinic_id FROM clinics WHERE name = 'Buckeye Physical Therapy';

  -- Create clinic if doesn't exist
  IF v_clinic_id IS NULL THEN
    INSERT INTO clinics (name, address, phone, email, is_active)
    VALUES (
      'Buckeye Physical Therapy',
      '123 Main Street',
      '555-0100',
      'info@buckeyept.com',
      true
    )
    RETURNING id INTO v_clinic_id;

    RAISE NOTICE 'Created clinic: %', v_clinic_id;
  END IF;

  -- Create admin user via Supabase Auth (manual step - see note below)
  RAISE NOTICE 'Please create user with email: % in Supabase Dashboard', v_admin_email;
  RAISE NOTICE 'Then add to clinic_memberships with clinic_id: %', v_clinic_id;

END $$;
```

### Step 4: Install Dependencies

```bash
npm install @supabase/auth-helpers-nextjs
npm install
```

### Step 5: Configure Environment Variables

Ensure your `.env.local` has:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 6: Start Development Server

```bash
npm run dev
```

Navigate to `http://localhost:3000` - you should be redirected to the sign-in page.

## User Management

### Creating New Users

1. **Admin creates user via Supabase Dashboard:**
   - Go to Authentication → Users
   - Click "Add User"
   - Enter email and temporary password
   - Send password to user securely

2. **Assign user to clinic:**
   ```sql
   INSERT INTO clinic_memberships (user_id, clinic_id_ref, clinic_name, role)
   VALUES (
     'user-id-from-auth',
     'clinic-id',
     'Clinic Name',
     'pt'  -- or 'pta', 'admin', 'front_office'
   );
   ```

3. **User changes password on first login:**
   - User signs in with temporary password
   - Redirect to password change page (TODO: implement)

### Assigning Users to Episodes (Care Team)

Only PT and Admin can assign users to episodes:

```sql
INSERT INTO episode_care_team (episode_id, user_id, role, assigned_by)
VALUES (
  'episode-id',
  'user-id',
  'pt',  -- or 'pta'
  auth.uid()  -- current user
);
```

This can also be done via the UI (TODO: implement UI).

## Access Control Rules

### Clinic Access
- Users can only see data for clinics they're assigned to
- Admins have full access to their clinic's data

### Episode Access
- **Admin/Front Office**: Can see all episodes in their clinic
- **PT/PTA**: Can only see episodes they're assigned to (via `episode_care_team`)

### Document Finalization
- Only PT and Admin can finalize these document types:
  - Evaluations
  - Re-evaluations
  - Progress Summaries
  - Discharge Summaries
- PTA can create drafts of daily notes but cannot finalize anything
- Enforced at both UI and database level (trigger)

## Security Features

### Row Level Security (RLS)
All tables have RLS enabled with policies that:
- Check clinic membership
- Verify role permissions
- Restrict access based on care team assignment

### Middleware Protection
- All routes except `/auth/*` require authentication
- Unauthenticated users are redirected to sign-in
- Authenticated users trying to access auth pages are redirected home

### Session Management
- Sessions are managed by Supabase
- Automatic refresh on page load
- Sign-out clears all client state

## UI Components

### AuthProvider
Wraps the entire app and provides:
- `user`: Current authenticated user
- `memberships`: User's clinic memberships
- `currentClinic`: Currently selected clinic
- `signOut()`: Sign out function
- `hasRole(roles)`: Check if user has specific role
- `canFinalize()`: Check if user can finalize documents

### Usage in Components
```tsx
import { useAuth } from '@/lib/auth-context';

function MyComponent() {
  const { user, currentClinic, hasRole, canFinalize } = useAuth();

  if (hasRole(['admin', 'pt'])) {
    // Show PT/Admin only features
  }

  if (canFinalize()) {
    // Show finalize button
  }

  return <div>Hello {user?.email}</div>;
}
```

### Server-Side Auth
```tsx
import { requireAuth, requireRole } from '@/lib/auth';

export default async function MyPage() {
  const user = await requireAuth(); // Throws if not authenticated

  // Or require specific role
  await requireRole('clinic-id', ['admin', 'pt']);

  return <div>Protected content</div>;
}
```

## Testing

### Test Accounts to Create

1. **Admin User**
   - Email: admin@buckeyept.com
   - Role: admin
   - Can: Everything

2. **PT User**
   - Email: pt@buckeyept.com
   - Role: pt
   - Can: View assigned episodes, finalize documents

3. **PTA User**
   - Email: pta@buckeyept.com
   - Role: pta
   - Can: View assigned episodes, create drafts (cannot finalize)

4. **Front Office User**
   - Email: front@buckeyept.com
   - Role: front_office
   - Can: View all episodes, manage demographics

### Test Scenarios

1. **Sign In/Out**
   - Sign in with each role
   - Verify correct role badge displayed
   - Sign out and verify redirect

2. **Clinic Switching**
   - Create user with multiple clinic memberships
   - Verify clinic switcher appears
   - Switch clinics and verify data changes

3. **Episode Access**
   - PT/PTA should only see assigned episodes
   - Admin/Front Office should see all clinic episodes

4. **Document Finalization**
   - PTA should NOT see finalize button
   - PT/Admin should see finalize button
   - Verify database prevents PTA from finalizing

## Troubleshooting

### "Authentication required" Error
- Check that middleware is not blocking necessary routes
- Verify Supabase environment variables are set
- Clear browser cookies and try again

### "Insufficient permissions" Error
- Verify user has correct role in `clinic_memberships`
- Check that user is assigned to the clinic
- Ensure user is on episode care team (for PT/PTA)

### RLS Policies Not Working
- Verify RLS is enabled on the table
- Check policy conditions match your use case
- Use Supabase SQL Editor to test policies directly

### Session Not Persisting
- Check that cookies are enabled in browser
- Verify Supabase URL and key are correct
- Check that middleware is refreshing session

## Next Steps

### Recommended Enhancements
1. **User Management UI**
   - Admin page to create/edit users
   - Assign users to clinics
   - Manage roles

2. **Password Change Flow**
   - Force password change on first login
   - Password reset via email

3. **Care Team Management UI**
   - Assign PT/PTA to episodes
   - Remove from care team
   - View all assignments

4. **Audit Logging**
   - Track who finalized what document
   - Log role changes
   - Log clinic access

5. **Multi-Factor Authentication**
   - Add MFA support via Supabase Auth

## Support

For issues or questions:
1. Check the Supabase Auth documentation
2. Review RLS policy logs in Supabase Dashboard
3. Check browser console for client-side errors
4. Review server logs for API errors

## Files Created/Modified

### New Files
- `supabase/migrations/20260208100000_add_authentication_and_rls.sql`
- `lib/auth.ts` - Server-side auth utilities
- `lib/auth-context.tsx` - Client-side auth provider
- `app/auth/sign-in/page.tsx` - Sign in page
- `app/auth/forgot-password/page.tsx` - Password reset page
- `middleware.ts` - Route protection
- `AUTH_SETUP.md` - This file

### Modified Files
- `package.json` - Added @supabase/auth-helpers-nextjs
- `components/layout/TopNav.tsx` - Added auth UI
- `app/layout.tsx` - Added AuthProvider

## Security Checklist

- [x] RLS enabled on all tables
- [x] Authentication required for all routes
- [x] Role-based access control implemented
- [x] Finalization rules enforced at database level
- [x] Session management configured
- [x] Middleware protecting routes
- [ ] Password complexity requirements (configure in Supabase)
- [ ] MFA enabled (optional)
- [ ] Audit logging (recommended)
- [ ] Rate limiting (configure in Supabase)

## Production Deployment

Before deploying to production:

1. **Configure Email Provider**
   - Set up SMTP or use Supabase email
   - Customize email templates
   - Test password reset flow

2. **Set Site URL**
   - Configure in Supabase → Auth → URL Configuration
   - Add production domain to allowed redirect URLs

3. **Review RLS Policies**
   - Test all policies with production-like data
   - Verify no data leaks between clinics

4. **Create Production Admin**
   - Create admin user via Supabase Dashboard
   - Use strong password
   - Enable MFA if available

5. **Monitor**
   - Set up error tracking
   - Monitor auth failures
   - Track suspicious activity

---

**Version:** 1.0
**Last Updated:** 2026-02-08
**Author:** Claude Code Session
