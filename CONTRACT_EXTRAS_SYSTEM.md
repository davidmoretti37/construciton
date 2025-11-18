# Contract Extras System - Complete Solution

## Overview
This system keeps a **history of extras/change orders** while ensuring the AI **always gets the correct total contract amount**.

## The Problem (Before)
- Database stored `budget = 4500` (original contract)
- Database stored `extras = [{"amount": 1300, "dateAdded": "2025-11-03"}]` (separately)
- AI would sometimes show $4,500, sometimes show $5,800
- **Inconsistent** contract amounts for the same project

## The Solution (After)
Three-field system that **auto-calculates** the total:

### Database Schema
```sql
-- New columns in projects table
base_contract NUMERIC(10, 2)   -- Original contract (never changes): $4,500
extras JSONB                   -- Array of change orders: [{"amount": 1300, ...}]
contract_amount NUMERIC(10, 2) -- AUTO-CALCULATED: $5,800 (base + extras)
```

### How It Works

1. **Store original contract**:
   ```json
   {
     "baseContract": 4500,
     "extras": []
   }
   ```
   → Database calculates: `contract_amount = 4500`

2. **User adds extra**:
   ```json
   {
     "baseContract": 4500,
     "extras": [{"amount": 1300, "description": "additional work", "dateAdded": "2025-11-03"}]
   }
   ```
   → Database **automatically** recalculates: `contract_amount = 5800`

3. **AI always reads**:
   ```json
   {
     "baseContract": 4500,
     "contractAmount": 5800,  // ← Always correct!
     "extras": [...]           // ← History preserved!
   }
   ```

## Database Trigger (Auto-Update)

The migration creates a PostgreSQL trigger that automatically updates `contract_amount`:

```sql
CREATE OR REPLACE FUNCTION public.update_contract_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate: base + sum of all extras
  NEW.contract_amount := COALESCE(NEW.base_contract, 0) +
    COALESCE(
      (SELECT SUM((item->>'amount')::numeric)
       FROM jsonb_array_elements(COALESCE(NEW.extras, '[]'::jsonb)) AS item),
      0
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Triggers on:**
- INSERT (new project)
- UPDATE of `base_contract` or `extras`

## File Changes

### 1. Database Migration
**File:** `supabase/migrations/20251113_auto_calculate_contract_with_extras.sql`

**What it does:**
- Adds `base_contract` column
- Migrates existing data (budget → base_contract)
- Creates auto-update trigger
- Recalculates all existing `contract_amount` values

### 2. Storage Layer
**File:** `src/utils/storage.js`

**Changes:**
- **Save:** Stores `base_contract` and `extras` array
- **Read:** Returns `contractAmount` (auto-calculated), `baseContract`, and `extras`
- Database trigger handles the calculation

### 3. AI Prompts
**Files:**
- `src/services/agentPrompt.js`
- `src/services/agentPrompt_optimized.js`

**Changes:**
- AI now knows `contractAmount` is auto-calculated
- When adding extras, AI appends to `extras` array
- AI shows breakdown: "Base $4500 + Extras $1300 = Total $5800"

## AI Behavior Examples

### Query: "What's my income for Mark?"
**Before fix:**
- Sometimes: "Contract: $4,500" (showing base only)
- Sometimes: "Contract: $5,800" (if AI calculated base + extras)

**After fix:**
- Always: "Contract: $5,800" (database-calculated total)

### Query: "Add $500 extra for paint to Mark's project"
**AI Response:**
```json
{
  "text": "Base contract: $4,500\nPrevious extras: $1,300\nNew extra: $500 (paint)\n**New total: $6,300**",
  "actions": [{
    "type": "save-project",
    "data": {
      "baseContract": 4500,
      "extras": [
        {"amount": 1300, "description": "additional work", "dateAdded": "2025-11-03"},
        {"amount": 500, "description": "paint", "dateAdded": "2025-11-13"}
      ]
    }
  }]
}
```

**Database automatically sets:** `contract_amount = 6300`

## Benefits

### ✅ **For the AI**
- Always gets correct total via `contractAmount`
- No manual calculations needed
- Consistent across all queries

### ✅ **For the Owner**
- See history of extras in `extras` array
- Know original contract via `baseContract`
- See current total via `contractAmount`

### ✅ **For the System**
- Single source of truth (database trigger)
- No sync issues between fields
- Automatic recalculation on any change

## Visual Display

### In Projects Screen
```
Mark's Project
─────────────────────────
Base Contract:     $4,500
Extras Added:      $1,800
  • Additional work  $1,300
  • Paint            $500
─────────────────────────
Total Contract:    $6,300 ← Used for all calculations
Income Collected:  $1,300
Pending:           $5,000
```

### In AI Chat
```
User: "What's my income for Mark?"

AI: "Mark's Project Financial Details:
• Base Contract: $4,500
• Extras: $1,800 (2 change orders)
• Total Contract: $6,300
• Income Collected: $1,300
• Expenses: $600
• Profit: $700
• Pending Collection: $5,000"
```

## Migration Steps

### Step 1: Run the Migration
```bash
# Option A: Using Supabase CLI
supabase db execute -f supabase/migrations/20251113_auto_calculate_contract_with_extras.sql

# Option B: Using psql directly
psql "postgresql://your-connection-string" -f supabase/migrations/20251113_auto_calculate_contract_with_extras.sql

# Option C: Copy and paste SQL into Supabase SQL Editor
```

### Step 2: Verify Migration
```sql
-- Check that contract_amount is correct
SELECT
  name,
  client,
  base_contract,
  (SELECT SUM((item->>'amount')::numeric)
   FROM jsonb_array_elements(extras) AS item) as extras_total,
  contract_amount,
  -- Verify: contract_amount should equal base_contract + extras_total
  (base_contract +
   COALESCE((SELECT SUM((item->>'amount')::numeric)
             FROM jsonb_array_elements(extras) AS item), 0)) as calculated_total
FROM public.projects
WHERE extras IS NOT NULL AND jsonb_array_length(extras) > 0;
```

**Expected result:** `contract_amount = calculated_total` for all rows

### Step 3: Test Adding an Extra
```sql
-- Test: Add an extra to a project
UPDATE public.projects
SET extras = jsonb_insert(
  COALESCE(extras, '[]'::jsonb),
  '{999}',
  '{"amount": 500, "description": "test extra", "dateAdded": "2025-11-13"}'::jsonb
)
WHERE name = 'Mark';

-- Verify contract_amount was auto-updated
SELECT name, base_contract, extras, contract_amount
FROM public.projects
WHERE name = 'Mark';
```

**Expected:** `contract_amount` automatically increased by $500

## Data Structure Reference

### Project Object (In App)
```typescript
{
  id: string,
  name: string,
  client: string,

  // Financial fields
  baseContract: number,          // Original contract: 4500
  contractAmount: number,         // Total (auto-calc): 5800
  extras: Array<{
    amount: number,              // 1300
    description: string,         // "additional work"
    dateAdded: string            // "2025-11-03"
  }>,
  incomeCollected: number,       // Payments received
  expenses: number,              // Money spent
  profit: number,                // incomeCollected - expenses

  // ... other fields
}
```

### Database Columns
```sql
base_contract     NUMERIC(10, 2)  -- 4500.00
extras            JSONB           -- [{"amount":1300,...}]
contract_amount   NUMERIC(10, 2)  -- 5800.00 (auto-calculated)
income_collected  NUMERIC(10, 2)  -- Payments received
expenses          NUMERIC(10, 2)  -- Money spent
```

## Troubleshooting

### Issue: contract_amount not updating
**Cause:** Trigger not installed or not firing
**Fix:**
```sql
-- Reinstall trigger
DROP TRIGGER IF EXISTS trigger_update_contract_amount ON public.projects;
CREATE TRIGGER trigger_update_contract_amount
  BEFORE INSERT OR UPDATE OF base_contract, extras ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contract_amount();
```

### Issue: Existing projects showing $0 contract_amount
**Cause:** Migration didn't run or data needs recalculation
**Fix:**
```sql
-- Force recalculation for all projects
UPDATE public.projects
SET contract_amount = COALESCE(base_contract, budget, 0) +
  COALESCE(
    (SELECT SUM((item->>'amount')::numeric)
     FROM jsonb_array_elements(COALESCE(extras, '[]'::jsonb)) AS item),
    0
  );
```

### Issue: AI showing wrong contract amount
**Cause:** App cache or old data
**Fix:**
1. Restart the app
2. Clear AsyncStorage cache
3. Verify database has correct `contract_amount` values

## Testing Checklist

- [ ] Migration runs without errors
- [ ] Existing projects have `base_contract` populated
- [ ] Existing projects with extras have correct `contract_amount`
- [ ] Adding new extra triggers auto-update
- [ ] AI query "What's my income for Mark?" shows consistent amount
- [ ] AI query "Add $X extra" creates correct extras array
- [ ] Projects screen shows contract breakdown
- [ ] Financial calculations use `contractAmount` correctly

## Summary

**Old System:**
- Manual calculation: `contractAmount + sum(extras)`
- Inconsistent AI responses
- Complex logic

**New System:**
- Database trigger: `contract_amount = base_contract + sum(extras)`
- Always consistent
- Simple, automatic

**Result:** AI always gets the correct contract amount, and you keep full history of all extras for the owner to review! 🎉
