# Worker Invitation System - Fix Summary

## Issues Found & Fixed

### 1. **Invitation Visibility Issue** ✅
- **Problem**: Workers couldn't see pending invitations matching their email
- **Cause**: RLS policy only allowed viewing worker records where `user_id = auth.uid()`, but pending invitations have `user_id = NULL`
- **Fix**: Created new RLS policy to allow workers to see pending invites by email

### 2. **Invitation Acceptance Issue** ✅
- **Problem**: Workers couldn't accept invitations (update status from pending to active)
- **Cause**: No RLS policy allowed workers to UPDATE pending worker records
- **Fix**: Created new RLS policy to allow workers to claim pending invites

### 3. **Database Schema Errors** ✅
- **Problem**: Query referenced non-existent `projects.client` column
- **Cause**: Column was removed in migration `20251115_remove_client_field.sql`
- **Fix**: Updated `getWorkerAssignments()` function to remove `client` column reference

---

## Required Database Migrations

Run these **TWO migrations** in your Supabase SQL Editor (in order):

### Migration 1: Fix Invitation Visibility

```sql
-- =====================================================
-- Fix Worker Invitation Visibility
-- =====================================================
-- This migration adds RLS policy to allow workers to see
-- pending invitations that match their email address
-- Created: 2025-11-19

-- First, we need to create a function to get the current user's email
-- because we cannot directly query auth.users in RLS policies
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Drop the policy if it already exists (idempotent migration)
DROP POLICY IF EXISTS "Workers can view pending invites by email" ON public.workers;

-- Add policy for workers to view pending invites by email
-- This allows a worker who signs up with an email to see
-- if there are any pending invitations for that email
CREATE POLICY "Workers can view pending invites by email"
ON public.workers FOR SELECT
USING (
  email = public.get_current_user_email()
  AND status = 'pending'
  AND user_id IS NULL
);

-- Add comment for documentation
COMMENT ON POLICY "Workers can view pending invites by email" ON public.workers IS
'Allows workers to see pending invitations that match their authenticated email address, even if user_id is not yet set';
```

### Migration 2: Fix Invitation Acceptance

```sql
-- =====================================================
-- Fix Worker Invite Acceptance
-- =====================================================
-- Allow workers to update their own pending invitation
-- to claim it by setting user_id
-- Created: 2025-11-19

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Workers can claim pending invites" ON public.workers;

-- Create policy to allow workers to update pending invites that match their email
-- This allows them to "claim" the invitation by setting user_id
CREATE POLICY "Workers can claim pending invites"
ON public.workers FOR UPDATE
USING (
  email = public.get_current_user_email()
  AND status = 'pending'
  AND user_id IS NULL
)
WITH CHECK (
  email = public.get_current_user_email()
  AND status = 'active'
  AND user_id = auth.uid()
);

-- Add comment for documentation
COMMENT ON POLICY "Workers can claim pending invites" ON public.workers IS
'Allows workers to claim (update) pending invitations that match their email by setting user_id and status to active';
```

---

## Code Changes Made

### 1. **Created Reusable Hook** (`src/hooks/useWorkerInvites.js`)
- Checks for pending invitations based on user's email
- Auto-loads on mount
- Provides `refetch()` function for manual refresh

### 2. **Created Invite Handler Component** (`src/components/WorkerInviteHandler.js`)
- Reusable component that shows InvitePopup when invitations exist
- Can be added to any worker screen

### 3. **Updated All Worker Screens**
Added `<WorkerInviteHandler />` to:
- `TimeClockScreen.js`
- `WorkerAssignmentsScreen.js`
- `WorkerTimesheetScreen.js`

### 4. **Fixed Database Queries**
- Updated `getWorkerAssignments()` to remove `client` column reference
- Added better error logging to `acceptInvite()` function

---

## How It Works Now

### Admin Flow:
1. Admin creates worker with email: `john@example.com`
2. Worker record created:
   ```json
   {
     "email": "john@example.com",
     "status": "pending",
     "user_id": null,
     "owner_id": "<admin_user_id>"
   }
   ```

### Worker Flow:
1. John signs up with email: `john@example.com`
2. John opens the app → any worker screen loads
3. `WorkerInviteHandler` runs automatically
4. `useWorkerInvites` hook queries for invitations:
   ```sql
   SELECT * FROM workers
   WHERE email = get_current_user_email()
   AND status = 'pending'
   AND user_id IS NULL
   ```
5. **Invitation popup appears!**
6. John clicks "Accept"
7. Record updated:
   ```json
   {
     "email": "john@example.com",
     "status": "active",
     "user_id": "<john_user_id>",
     "owner_id": "<admin_user_id>"
   }
   ```
8. John is now fully linked and has access to assignments, time clock, etc.

---

## Testing Steps

1. **Run both migrations** in Supabase SQL Editor
2. **Create test invitation**:
   - As admin, go to Workers screen
   - Add worker with email: `test-worker@example.com`
   - Fill in name, trade, rate
3. **Sign up as worker**:
   - Log out
   - Sign up with email: `test-worker@example.com`
   - Complete worker onboarding
4. **Verify invitation appears**:
   - Should see invitation popup immediately
   - Shows owner name, trade, pay rate
5. **Accept invitation**:
   - Click "Accept"
   - Should reload and have access to worker features
6. **Verify in database**:
   - Check that worker record has `user_id` set
   - Check that `status` changed from `pending` to `active`

---

## Console Logs to Watch For

### Successful Flow:
```
✅ useWorkerInvites - Checking for invites with email: john@example.com
✅ getPendingInvites - Found invites: [...]
✅ acceptInvite - Attempting to accept invite: {...}
✅ acceptInvite - Update result: [{ status: "active", user_id: "..." }]
```

### If Issues:
```
❌ Error accepting invite: [error details]
❌ acceptInvite - No rows updated. Worker may have already been accepted
```

---

## Summary

All changes have been made to:
- ✅ Allow workers to **see** pending invitations by email (SELECT policy)
- ✅ Allow workers to **accept** pending invitations (UPDATE policy)
- ✅ Show invitations on **all worker screens** (not just time clock)
- ✅ Fix database schema errors (removed `client` column references)
- ✅ Add better error logging for debugging

After running the two migrations, the invitation system should work perfectly! 🎉
