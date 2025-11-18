# Contract Extras Fix - Summary

## Problem
When extras/change orders were added to projects, the system kept them in a separate `extras` array instead of updating the `contractAmount`. This caused:
- **Inconsistent contract amounts** shown for the same project
- AI sometimes showing base contract ($4,500)
- AI sometimes showing total with extras ($5,800)
- Confusion about the actual contract value

## Root Cause
The financial model was designed to keep:
- `contractAmount` = base contract (never changed)
- `extras` = array of change orders
- Total contract = `contractAmount + sum(extras)`

This separation made sense for tracking history, but caused UX issues.

## Solution Implemented
Changed the financial model to **permanently update `contractAmount`** when extras are added:

### 1. Updated AI Prompts
**Files Modified:**
- `src/services/agentPrompt.js` (lines 11-18)
- `src/services/agentPrompt_optimized.js` (lines 84-88, 114-118, 161-164, 216-227)

**Changes:**
- `contractAmount` now represents the **TOTAL contract value** (includes all extras)
- When extras are added, the amount is **added directly** to `contractAmount`
- Removed all references to `extras` array
- Updated all calculations to use `contractAmount` directly

**Before:**
```javascript
- contractAmount: Base contract value (NEVER includes extras)
- extras: Array of change orders [{amount, description}]
- Total contract: contractAmount + sum(extras[].amount)
```

**After:**
```javascript
- contractAmount: TOTAL contract value (includes base + all extras/change orders)
- IMPORTANT: When extras/change orders are added, ADD the amount directly to contractAmount
```

### 2. Updated Storage Logic
**Files Modified:**
- `src/utils/storage.js` (lines 437-440, 653-657)

**Changes:**
- Removed `extras` field from database saves
- Removed `extras` field from data transformation (database → app)
- `contractAmount` now stores the final total

### 3. Updated AI Examples
**Files Modified:**
- `src/services/agentPrompt_optimized.js` (lines 350-382)

**Changes:**
Updated the "Add extra" example to show correct behavior:

**Before:**
```json
{
  "contractAmount": 20000,
  "extras": [{"amount": 1500, "description": "tile work"}]
}
```

**After:**
```json
{
  "contractAmount": 21500  // Updated permanently
}
```

## How It Works Now

### Scenario: Adding an Extra
1. User: "Add $1,500 extra for tile work to Martinez project"
2. AI calculates: Previous $20,000 + Extra $1,500 = New Total $21,500
3. AI returns project data with `contractAmount: 21500`
4. When saved, database stores `contractAmount = 21500` (permanent)
5. Future queries will always show $21,500 as the contract amount

### AI Response Format
```json
{
  "text": "Previous contract: $20,000\nExtra added: $1,500 (tile work)\n**New contract total: $21,500**",
  "actions": [{
    "type": "save-project",
    "data": {
      "contractAmount": 21500  // Updated total
    }
  }]
}
```

## Testing Checklist

✅ **Query: "What's my income for Mark?"**
- Should consistently show the same contract amount
- Contract amount includes all extras that were added

✅ **Query: "Add $1,300 extra to Mark's project"**
- AI should calculate: Previous + Extra = New Total
- New `contractAmount` should be permanently updated
- Future queries should use the new amount

✅ **Query: "Show all projects"**
- All projects should show consistent contract amounts
- Budget chart should use correct totals

## Benefits

1. **Consistency** - Contract amount is always the same value
2. **Simplicity** - No need to calculate `contractAmount + extras`
3. **Clarity** - Users see one clear contract value
4. **Accuracy** - Financial calculations use correct totals

## Migration Note

**Existing projects with `extras` array:**
If any projects in the database have an `extras` field, they should be migrated:

```sql
-- One-time migration (if needed)
UPDATE projects
SET contract_amount = contract_amount + (
  SELECT COALESCE(SUM((extras_item->>'amount')::numeric), 0)
  FROM jsonb_array_elements(extras) AS extras_item
)
WHERE extras IS NOT NULL AND jsonb_array_length(extras) > 0;

-- Then remove the extras column
ALTER TABLE projects DROP COLUMN IF EXISTS extras;
```

## Conclusion

The fix ensures that `contractAmount` is the single source of truth for the total contract value. When extras/change orders are added, they permanently update the contract amount rather than being tracked separately.

**Result:** Consistent, clear contract amounts across all AI queries and visual components.
