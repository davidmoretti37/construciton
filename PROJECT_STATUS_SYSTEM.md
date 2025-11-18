# Project Status System - Simplified

## Overview
Removed the confusing "active" status. Now we only use **meaningful statuses** that tell you exactly what's happening with each project.

## Status Values

### **6 Simple Statuses:**

```
1. draft         → Project not started yet
2. on-track      → Active project going well ✅
3. behind        → Active project past deadline ⚠️
4. over-budget   → Active project over budget 🚨
5. completed     → Project finished ✅
6. archived      → Project closed/archived
```

## How Status is Calculated

### **Draft, Completed, Archived**
- Set manually when creating/finishing/archiving projects
- Never auto-calculated

### **On-Track, Behind, Over-Budget**
- **Auto-calculated** based on real data
- Calculated every time you fetch projects from database

**Logic:**
```javascript
if (status === 'draft' || status === 'completed' || status === 'archived') {
  return status; // Keep as-is
}

// For active projects, calculate based on data:
if (expenses > contractAmount) {
  return 'over-budget'; // 🚨 Spending too much!
}

if (daysRemaining < 0) {
  return 'behind'; // ⚠️ Past deadline!
}

return 'on-track'; // ✅ Everything good!
```

**Priority:** `over-budget` > `behind` > `on-track`

## Examples

### Example 1: New Project
```javascript
{
  name: "Kitchen Remodel",
  startDate: "2025-11-13",
  endDate: "2025-12-13",
  contractAmount: 10000,
  expenses: 0
}
```
**Status:** `on-track` ✅
- Within budget (0 < 10000)
- On schedule (30 days remaining)

### Example 2: Behind Schedule
```javascript
{
  name: "Bathroom Fix",
  startDate: "2025-10-01",
  endDate: "2025-11-01", // Past!
  contractAmount: 5000,
  expenses: 2000
}
```
**Status:** `behind` ⚠️
- Past end date (daysRemaining = -12)
- Even though within budget

### Example 3: Over Budget
```javascript
{
  name: "Deck Building",
  startDate: "2025-11-01",
  endDate: "2025-12-15",
  contractAmount: 8000,
  expenses: 9000 // More than contract!
}
```
**Status:** `over-budget` 🚨
- Expenses exceed contract
- Even though on schedule

### Example 4: Both Issues
```javascript
{
  name: "Addition",
  startDate: "2025-09-01",
  endDate: "2025-10-15", // Past!
  contractAmount: 15000,
  expenses: 18000 // Over budget!
}
```
**Status:** `over-budget` 🚨
- Both issues, but "over-budget" has priority
- Shows worst problem first

## Database Schema

```sql
ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (status IN (
  'draft',
  'on-track',
  'behind',
  'over-budget',
  'completed',
  'archived'
));
```

**Default:** `'on-track'`

## In the App

### **Fetching Projects**
```javascript
const projects = await fetchProjects();

// Status is auto-calculated for each project
projects.forEach(project => {
  console.log(project.status); // 'on-track', 'behind', or 'over-budget'
});
```

### **Filtering Active Projects**
```javascript
const activeProjects = projects.filter(p =>
  ['on-track', 'behind', 'over-budget'].includes(p.status)
);
```

### **Color Coding**
```javascript
const getStatusColor = (status) => {
  switch (status) {
    case 'on-track': return '#10B981'; // Green ✅
    case 'behind': return '#F59E0B'; // Orange ⚠️
    case 'over-budget': return '#EF4444'; // Red 🚨
    case 'completed': return '#6366F1'; // Blue
    case 'draft': return '#9CA3AF'; // Gray
    case 'archived': return '#6B7280'; // Dark gray
  }
};
```

## AI Behavior

### Query: "Show me active projects"
```javascript
// AI filters for:
['on-track', 'behind', 'over-budget']

// Response shows each project with its status:
"You have 3 active projects:
- Kitchen Remodel: On-track ✅
- Bathroom Fix: Behind schedule ⚠️
- Deck Building: Over budget 🚨"
```

### Query: "Which projects need attention?"
```javascript
// AI filters for problems:
['behind', 'over-budget']

// Response highlights issues:
"2 projects need attention:
- Bathroom Fix: 12 days overdue
- Deck Building: $1,000 over budget"
```

## Migration

### **Before Fix:**
```
Database: status = 'active' (all projects)
Result: Only projects with dates show progress
```

### **After Fix:**
```
Database: status = 'on-track' (calculated)
Result: ALL projects show progress + meaningful status
```

### **Run Migration:**
```bash
psql "postgresql://your-connection" \
  -f supabase/migrations/20251113_simplify_project_status.sql
```

**What it does:**
1. Updates constraint to 6 new status values
2. Changes all `'active'` → `'on-track'`
3. App will recalculate status on next fetch

## Visual Examples

### Projects Screen
```
┌─────────────────────────────────┐
│ Kitchen Remodel        ✅       │
│ on-track                        │
│ ████████████░░░░░░░░ 60%        │
│ $6,000 / $10,000                │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Bathroom Fix           ⚠️       │
│ behind schedule                 │
│ ████████████████░░░░ 80%        │
│ 12 days overdue                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Deck Building          🚨       │
│ over budget                     │
│ ████████████████████ 100%       │
│ $9,000 / $8,000 (+$1,000)       │
└─────────────────────────────────┘
```

### Status Badges
```javascript
// on-track
<View style={{backgroundColor: '#10B981'}}>
  <Text>On Track</Text>
</View>

// behind
<View style={{backgroundColor: '#F59E0B'}}>
  <Text>Behind Schedule</Text>
</View>

// over-budget
<View style={{backgroundColor: '#EF4444'}}>
  <Text>Over Budget</Text>
</View>
```

## Benefits

### ✅ **Before (with 'active')**
- Database: `status = 'active'`
- App: Confused, had to calculate "is it on-track?"
- Result: Progress bars only worked sometimes

### ✅ **After (meaningful statuses)**
- Database: `status = 'on-track'` or `'behind'` or `'over-budget'`
- App: Knows exactly what's happening
- Result: All progress bars work, clear visual indicators

## Testing

### Test 1: On-Track Project
```sql
INSERT INTO projects (name, client, base_contract, expenses, start_date, end_date, status)
VALUES ('Test Project', 'John', 5000, 1000, CURRENT_DATE, CURRENT_DATE + 30, 'on-track');

-- Fetch and verify:
-- expenses (1000) < contract (5000) ✅
-- daysRemaining (30) > 0 ✅
-- Status should be: 'on-track' ✅
```

### Test 2: Behind Project
```sql
INSERT INTO projects (name, client, base_contract, expenses, start_date, end_date, status)
VALUES ('Late Project', 'Jane', 5000, 1000, CURRENT_DATE - 60, CURRENT_DATE - 30, 'on-track');

-- Fetch and verify:
-- endDate is 30 days ago
-- App should calculate: 'behind' ⚠️
```

### Test 3: Over-Budget Project
```sql
INSERT INTO projects (name, client, base_contract, expenses, start_date, end_date, status)
VALUES ('Expensive Project', 'Bob', 5000, 6000, CURRENT_DATE, CURRENT_DATE + 30, 'on-track');

-- Fetch and verify:
-- expenses (6000) > contract (5000)
-- App should calculate: 'over-budget' 🚨
```

## Troubleshooting

### Issue: Progress bars not showing
**Cause:** Projects missing `start_date` or `end_date`
**Fix:** Add dates to projects
```sql
UPDATE projects
SET start_date = CURRENT_DATE,
    end_date = CURRENT_DATE + 30
WHERE start_date IS NULL OR end_date IS NULL;
```

### Issue: All projects showing "on-track"
**Cause:** Calculation logic not running
**Fix:** Restart app, clear cache, re-fetch projects

### Issue: Status not updating
**Cause:** Database constraint blocking update
**Fix:** Verify constraint has all 6 status values
```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'projects_status_check';
```

## Summary

**Old System:**
- `active` (generic, meaningless)
- Progress bars sometimes worked
- Hard to know project health

**New System:**
- 6 clear statuses
- Progress bars always work
- Instant visual feedback on project health

**Result:** Simple, clear, and automatic! 🎉

---

## Quick Reference

| Status | When | Visual | Priority |
|--------|------|--------|----------|
| draft | Not started | Gray | - |
| on-track | Active, good | Green ✅ | 3 (lowest) |
| behind | Past deadline | Orange ⚠️ | 2 |
| over-budget | Over budget | Red 🚨 | 1 (highest) |
| completed | Finished | Blue | - |
| archived | Closed | Dark gray | - |

**Active Projects:** `on-track` + `behind` + `over-budget`
**Needs Attention:** `behind` + `over-budget`
