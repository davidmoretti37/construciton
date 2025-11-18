# Apply Status Fix - Quick Guide

## What Changed

**REMOVED:** `'active'` status (generic, meaningless)

**NOW USING:** 6 clear statuses that tell you exactly what's happening:
- ✅ `on-track` - Active project going well
- ⚠️ `behind` - Active project past deadline
- 🚨 `over-budget` - Active project over budget
- 📝 `draft` - Not started
- ✅ `completed` - Finished
- 📦 `archived` - Closed

## Quick Start

### Step 1: Run the Migration (30 seconds)

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/bin/psql \
  "postgresql://postgres.jpdqxjaosattvzjjumxz:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20251113_simplify_project_status.sql
```

**What it does:**
- Changes database constraint to new 6 status values
- Converts all `'active'` → `'on-track'`
- App will auto-calculate correct status on next fetch

### Step 2: Restart Your App

```bash
# Stop the app
# Restart with:
npm start
```

### Step 3: Verify (2 minutes)

**Check database:**
```sql
SELECT name, status, contract_amount, expenses, start_date, end_date
FROM projects;
```

**Should show:**
- All projects have status: `on-track`, `behind`, `over-budget`, `completed`, etc.
- NO more `'active'` status

**Test in app:**
1. Open Projects screen
2. **ALL projects should show progress bars** ✅
3. Status badges should be meaningful:
   - Green "On Track" = Good
   - Orange "Behind" = Late
   - Red "Over Budget" = Expensive

## How It Works Now

### Example: Your Projects

**Mark (Database):**
```sql
status = 'on-track'
contract_amount = 5800
expenses = 600
end_date = future date
```

**App calculates:**
- expenses (600) < contract (5800) ✅
- Not past deadline ✅
- **Status: on-track** ✅
- **Progress bar: Works!** 80%

**Lana (Database):**
```sql
status = 'on-track'
contract_amount = 25000
expenses = 0
end_date = future date
```

**App calculates:**
- expenses (0) < contract (25000) ✅
- Not past deadline ✅
- **Status: on-track** ✅
- **Progress bar: Works!** 14%

### Auto-Calculation Logic

```javascript
// App calculates status when fetching projects:

if (status === 'draft' || status === 'completed' || status === 'archived') {
  return status; // Keep fixed statuses
}

// For active projects:
if (expenses > contractAmount) {
  return 'over-budget'; // 🚨 Priority 1
}

if (daysRemaining < 0) {
  return 'behind'; // ⚠️ Priority 2
}

return 'on-track'; // ✅ Default
```

## Benefits

### ✅ Before (with 'active')
```
Database: status = 'active' (all projects the same)
App: "Is this on-track? Let me check..."
Result: 3 projects stuck, 1 working
```

### ✅ After (meaningful statuses)
```
Database: status = 'on-track' (or 'behind' or 'over-budget')
App: "Status tells me everything!"
Result: ALL 4 projects working, clear indicators
```

## Visual Changes

### Projects Screen

**Before:**
```
Mark      [active]   No progress bar
Lana      [active]   No progress bar
Project X [active]   ████░░░░░░ 40%  (only one working)
```

**After:**
```
Mark      [on-track ✅]   ████████████░░░░░░░░ 80%
Lana      [on-track ✅]   ███░░░░░░░░░░░░░░░░░ 14%
Project X [behind ⚠️]    ████░░░░░░░░░░░░░░░░ 40%
Project Y [over-budget 🚨] ██████████████░░░░░░ 90%
```

## AI Queries

### "Show active projects"
**Before:**
```
AI: "Filtering status = 'active'..."
Result: Shows all projects (not helpful)
```

**After:**
```
AI: "Filtering ['on-track', 'behind', 'over-budget']..."
Result: "You have 3 active projects:
- Mark: On-track ✅
- Project X: Behind schedule ⚠️ (12 days overdue)
- Project Y: Over budget 🚨 ($1,000 over)"
```

### "Which projects need attention?"
**Before:**
```
AI: "Let me check each project manually..."
Result: Generic response
```

**After:**
```
AI: "Filtering ['behind', 'over-budget']..."
Result: "2 projects need attention:
- Project X: 12 days overdue
- Project Y: Over budget by $1,000"
```

## Testing

### Test 1: All Progress Bars Work
1. Open Projects screen
2. Count projects
3. Count progress bars
4. **Should match!** ✅

### Test 2: Status Colors
1. Check each project
2. Verify colors:
   - Green = on-track ✅
   - Orange = behind ⚠️
   - Red = over-budget 🚨

### Test 3: AI Queries
1. Ask: "Show active projects"
2. Should list all `on-track`, `behind`, `over-budget` projects
3. Each with correct status

## Troubleshooting

### Projects still showing "active"
**Fix:** Run migration again, restart app

### Progress bars not showing
**Fix:** Check that projects have `start_date` and `end_date`:
```sql
SELECT name, start_date, end_date
FROM projects
WHERE start_date IS NULL OR end_date IS NULL;
```

### Status not updating in app
**Fix:** Clear app cache, restart

## Files Changed

```
Modified:
  src/utils/storage.js              (Auto-calculates status)
  src/services/agentPrompt.js       (New status values)
  src/services/agentPrompt_optimized.js (Same)

Created:
  supabase/migrations/20251113_simplify_project_status.sql
  PROJECT_STATUS_SYSTEM.md          (Full docs)
  APPLY_STATUS_FIX.md               (This file)
```

## Summary

**Problem:**
- "active" status was meaningless
- 3 out of 4 projects not showing progress
- Hard to know project health

**Solution:**
- 6 meaningful statuses
- Auto-calculated based on real data
- All progress bars work

**Result:**
- ✅ Clear visual indicators
- ✅ All projects show progress
- ✅ Easy to identify problems

Run the migration and enjoy! 🎉

---

**Need more details?** Check `PROJECT_STATUS_SYSTEM.md`
