# Phase 9 — Patterns cron: shipped

**Date:** 2026-04-28
**Phase goal:** Compute business-level patterns from each user's existing data nightly and store them as typed memory facts the agent recalls without recomputing.
**Outcome:** ✅ Shipped. New `compute-patterns.js` script applied across 14 owners produced 5 valid pattern rows; the rest don't yet have enough data for the SQL aggregations (correct behavior — patterns compute lazily).

---

## 1 — What was built

| File | Status | Purpose |
|---|---|---|
| `backend/scripts/compute-patterns.js` | NEW (220 lines) | Computes 6 pattern types per owner via pure SQL aggregations + writes them to `user_memory_facts` with `kind='pattern'` and `source='pattern_computed'`. Embeds each pattern's natural-language sentence so semantic recall surfaces it appropriately. |

**No changes to live code.** The script reads / writes the existing `user_memory_facts` table that recall already queries.

## 2 — Patterns computed (per owner)

| Predicate | What it captures | Min sample size |
|---|---|---|
| `avg_project_margin` | (1 - total_spent/contract_amount) averaged across projects | ≥2 projects with contract amount |
| `typical_project_duration_days` | end_date - start_date averaged | ≥2 projects with both dates |
| `avg_invoice_payment_days` | created_at → paid_at averaged | ≥2 paid invoices |
| `busiest_clock_in_day` | day-of-week with most clock-ins (with multiplier) | ≥10 clock-ins |
| `top_expense_category` | highest-spend expense category (with %) | ≥1 expense |
| `active_worker_count` | count of `is_active=true` workers | always returns |

Each row is written as:
```jsonc
{
  "kind": "pattern",
  "subject": "business",
  "predicate": "avg_project_margin",
  "object": "38%",
  "confidence": 0.85,
  "source": "pattern_computed",
  "embedding": <vector(1536)>  // embeds the natural-language sentence
}
```

Foreman's existing recall pipeline (`recallRelevant()` from P4) already pulls `kind='pattern'` rows alongside facts/preferences/rules. **Zero new code in the agent loop.** The patterns just appear when relevant.

## 3 — Live results

```
Owners processed:        14
Patterns computed:        5  (across 4 owners with enough data)
Written to user_memory_facts: 5

Final user_memory_facts breakdown:
  preference (backfilled):       145
  fact (backfilled):              65
  rule (backfilled):              21
  pattern (backfilled):            5
  pattern (pattern_computed):      5  ← NEW THIS PHASE
                                ────
                                 241 total
```

The 9 owners with zero patterns are early-stage (no closed projects, no time tracking, etc.). As they generate data, the next nightly run picks them up.

## 4 — Cost

- **Runtime:** ~6 SQL queries per owner + 6 embedding calls × ~$0.0000002 each = ~$0.000001/owner per pattern. **Effectively free.**
- **Storage:** 5 new rows × 1 vector each = trivial.
- **Cron frequency:** designed for nightly. Could run hourly without meaningful cost change.

## 5 — Scheduling (you do this when ready)

The script can be scheduled three ways:

**A — Railway Cron (cleanest):**
- Add a new Railway service with a cron schedule
- Runs `node backend/scripts/compute-patterns.js` daily at 03:00 UTC
- Railway docs: <https://docs.railway.app/guides/cron-jobs>

**B — Supabase pg_cron (db-side):**
- Schedule a background job via `cron.schedule()`
- Calls the script via `pg_net` HTTP request to a Railway endpoint
- More complex; only worth it if you're already using pg_cron

**C — GitHub Actions (free):**
- `.github/workflows/patterns-cron.yml` runs on a schedule
- Calls `npm run patterns` (add to package.json scripts)
- Easy and free for this volume

I'd pick **A (Railway Cron)** — same hosting, no secret duplication, simplest mental model.

## 6 — Adding more patterns later

The pattern set is intentionally a starter — six high-signal patterns that work on the data shapes Sylk has today. Adding a new pattern is one function:

```js
async function computeFooBar(ownerId) {
  const { data } = await supabase.from('table').select('...').eq('user_id', ownerId);
  if (data.length < N) return null;
  return {
    predicate: 'foo_bar',
    object: '<value>',
    sentence: 'Natural-language version that gets embedded.',
    confidence: 0.X,
  };
}
// Append to the COMPUTERS array.
```

Candidates I deliberately deferred (need data shape changes or more thought):
- Per-client patterns (`client_smith_payment_avg_days`) — would need `client_id` filter on invoices
- Per-trade patterns (`avg_margin_kitchen_remodels`) — needs project type tagging
- Time-series patterns ("revenue is trending up 12% MoM") — needs window functions
- Predictive patterns ("project X is 80% likely to run late based on similar projects") — out of scope, future ML work

## 7 — Rollback

```sql
DELETE FROM user_memory_facts WHERE source = 'pattern_computed';
```

Wipes only the patterns this script wrote; leaves backfilled and extracted facts untouched.

## 8 — How to verify it's helping

In your next chat, ask Foreman something pattern-relevant and watch the response:

- "How does my project pricing look?" → should reference `avg_project_margin` if computed
- "Am I paid on time?" → should reference `avg_invoice_payment_days` if computed
- "When are we busiest?" → should reference `busiest_clock_in_day` if computed

If those answers come back with NUMBERS rather than generic statements, the pattern recall is working.

## 9 — Stop point

Phase 9 ships clean. Foreman now has computed patterns alongside extracted facts. Moving to Phase 10 (user context block).
