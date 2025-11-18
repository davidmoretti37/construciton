# How to Apply the Contract Extras Fix

## Quick Start

### Step 1: Run the Database Migration

Choose **ONE** of these options:

#### Option A: Using psql (Recommended)
```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/bin/psql \
  "postgresql://postgres.jpdqxjaosattvzjjumxz:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20251113_auto_calculate_contract_with_extras.sql
```

#### Option B: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Copy the contents of `supabase/migrations/20251113_auto_calculate_contract_with_extras.sql`
4. Paste into the editor
5. Click **Run**

### Step 2: Verify Migration Success

Run this query in Supabase SQL Editor:

```sql
-- Check that Mark's project has correct contract_amount
SELECT
  name,
  client,
  base_contract,
  extras,
  contract_amount,
  -- Verify calculation
  (base_contract + COALESCE((SELECT SUM((item->>'amount')::numeric)
                             FROM jsonb_array_elements(extras) AS item), 0)) as should_be
FROM public.projects
WHERE client = 'Mark';
```

**Expected result:**
- `base_contract` = 4500
- `extras` = `[{"amount": 1300, ...}]`
- `contract_amount` = 5800
- `should_be` = 5800

✅ If `contract_amount` = `should_be`, the migration worked!

### Step 3: Test the App

Restart your app and test these queries:

1. **"What's my income for Mark?"**
   - Should show: Contract: $5,800 (always)
   - Before fix: Sometimes $4,500, sometimes $5,800

2. **"Show all projects"**
   - Mark should show: $5,800 contract amount
   - Should be consistent every time

3. **"Add $500 extra for paint to Mark's project"**
   - AI should show: Base $4,500 + Extras $1,800 = Total $6,300
   - After saving, verify in database:
   ```sql
   SELECT name, base_contract, extras, contract_amount
   FROM projects WHERE client = 'Mark';
   ```
   - `contract_amount` should be 6300

## What Was Changed

### Files Modified:
1. ✅ `src/services/agentPrompt.js` - AI now handles extras properly
2. ✅ `src/services/agentPrompt_optimized.js` - Same for optimized prompt
3. ✅ `src/utils/storage.js` - Saves/loads `baseContract` and `extras`

### Files Created:
4. ✅ `supabase/migrations/20251113_auto_calculate_contract_with_extras.sql` - Database migration
5. ✅ `CONTRACT_EXTRAS_SYSTEM.md` - Complete documentation
6. ✅ `EXTRAS_FIX_SUMMARY.md` - Quick summary

## How It Works Now

### Database Structure:
```
Mark's Project:
├── base_contract = 4500       (original, never changes)
├── extras = [                 (history of changes)
│     {"amount": 1300, "description": "additional work", "dateAdded": "2025-11-03"}
│   ]
└── contract_amount = 5800     (AUTO-CALCULATED by trigger)
```

### When AI Queries:
- AI reads: `contractAmount = 5800` ✅ **Always correct!**
- AI sees: `extras = [...]` ✅ **History preserved!**
- No manual calculation needed

### When Adding Extras:
1. User: "Add $500 extra for paint"
2. AI creates:
   ```json
   {
     "extras": [
       {"amount": 1300, "description": "additional work", ...},
       {"amount": 500, "description": "paint", "dateAdded": "2025-11-13"}
     ]
   }
   ```
3. App saves to database
4. Database trigger automatically updates: `contract_amount = 6300`
5. Next query shows correct total

## Troubleshooting

### Migration fails with "column already exists"
**Solution:** Column exists but trigger might not. Run this:
```sql
CREATE OR REPLACE FUNCTION public.update_contract_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.contract_amount := COALESCE(NEW.base_contract, 0) +
    COALESCE(
      (SELECT SUM((item->>'amount')::numeric)
       FROM jsonb_array_elements(COALESCE(NEW.extras, '[]'::jsonb)) AS item),
      0
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_contract_amount ON public.projects;
CREATE TRIGGER trigger_update_contract_amount
  BEFORE INSERT OR UPDATE OF base_contract, extras ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contract_amount();
```

### AI still shows inconsistent amounts
1. Clear app cache (restart app)
2. Verify database has correct `contract_amount` values
3. Check that trigger is installed:
   ```sql
   SELECT trigger_name FROM information_schema.triggers
   WHERE event_object_table = 'projects';
   ```

### Want to see extras breakdown in UI?
The `extras` array is now available in project data:
```javascript
project.extras.forEach(extra => {
  console.log(`+ ${extra.description}: $${extra.amount} (${extra.dateAdded})`);
});
```

## Testing Commands

```bash
# Connect to your database
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/bin/psql \
  "postgresql://postgres.jpdqxjaosattvzjjumxz:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# View all projects with extras
SELECT name, base_contract,
       (SELECT SUM((item->>'amount')::numeric) FROM jsonb_array_elements(extras) AS item) as extras_sum,
       contract_amount
FROM projects
WHERE jsonb_array_length(extras) > 0;

# Test adding an extra (replace 'your-project-id')
UPDATE projects
SET extras = jsonb_insert(
  extras,
  '{999}',
  '{"amount": 500, "description": "test", "dateAdded": "2025-11-13"}'::jsonb
)
WHERE id = 'your-project-id'
RETURNING name, contract_amount;
```

## Summary

✅ **Database migration** adds `base_contract` column and auto-update trigger
✅ **Storage layer** saves/loads extras and base contract
✅ **AI prompts** updated to append extras instead of modifying contract
✅ **Auto-calculation** ensures AI always gets correct total
✅ **History preserved** via extras array

**Result:** Consistent contract amounts + full extras history! 🎉

---

**Need help?** Check `CONTRACT_EXTRAS_SYSTEM.md` for detailed documentation.
