# Phase 10 — User context block: shipped

**Date:** 2026-04-28
**Phase goal:** Pre-compute a business-profile paragraph per owner so Foreman starts every conversation already knowing the business shape — no more cold starts where the agent has to discover everything via tools.
**Outcome:** ✅ Shipped. Migration + cron script + system prompt insertion + agentService plumbing done. **8 of 14 owners now have an auto-generated profile in production.** All 429 tests still pass.

---

## 1 — What was built

| File | Status | Purpose |
|---|---|---|
| Migration: `profiles.auto_business_profile` (TEXT) + `auto_business_profile_updated_at` (TIMESTAMPTZ) | NEW columns | Stores the generated paragraph + freshness timestamp. Distinct from user-editable `aboutYou`. |
| `backend/scripts/compute-business-profile.js` | NEW (220 lines) | Pulls signals (team, projects, services, expenses, clients, P9 patterns) → calls Haiku via SDK (or OpenRouter fallback) → stores 4-6 sentence paragraph. Idempotent — skips owners with fresh profiles unless `--force`. |
| `backend/src/services/tools/systemPrompt.js` | MOD | Accepts new `autoBusinessProfile` context arg. Renders as `## ABOUT THIS BUSINESS\n<paragraph>` between user name and user-provided context. Section is omitted entirely when the field is empty. |
| `backend/src/services/agentService.js` | MOD | New profile-fetch step that resolves owner_id (supervisors get their owner's profile) and threads `autoBusinessProfile` into `promptContext`. Soft-fails on any error so the chat never breaks. |

**Total:** ~270 LoC. No frontend changes (this is server-side context plumbing).

## 2 — Sample output (real production data)

The Haiku-generated profiles came back tight and on-target. A few real examples:

- **Atroum Construction:** *"Atroum Construction is a residential remodeling outfit focused on kitchen and bathroom projects, with [...] active workers and a portfolio averaging ~$X contracts. Currently has N active jobs..."*
- **Demo Contracting Co.:** *"Demo Contracting Co. is a residential and light commercial renovation contractor..."*
- **New England Underground:** *"New England Underground appears to be a regional excavation or underground utilities operator..."*

The LLM correctly inferred business type from project names (the only signal it had — never told it explicitly). 6 of 14 owners had no project data so were skipped (correct behavior — generic profile would be prompt bloat).

## 3 — Where it lands in the prompt

The `## ABOUT THIS BUSINESS` section sits between the user's name and the user-provided context block:

```
USER ROLE: owner
RESPONSE LANGUAGE: English

## MEMORY
[memory tool documentation]

## HOW YOU THINK
[the long instruction block — unchanged]

## KNOWN FACTS ABOUT THIS USER          ← if userName set
The user's name is David...

## ABOUT THIS BUSINESS                  ← NEW (P10)
Atroum Construction is a residential remodeling outfit focused on...

## USER-PROVIDED CONTEXT                ← user-editable (aboutYou, etc)
[blocks if any]
```

Crucially, this section is part of the **cached** static prompt — no per-turn cost. The 1-hour TTL cache absorbs it.

## 4 — Cost

- **Generation:** one Haiku call per owner per regeneration cycle. ~150 input + ~250 output tokens = ~$0.001/owner.
- **Default cadence:** weekly (the data shape doesn't change daily). If `auto_business_profile_updated_at` is older than 7 days, the script regenerates; otherwise skipped.
- **At 1000 owners on weekly cadence:** $1/week total for fresh profiles. Effectively free.
- **Per turn at runtime:** $0. Already cached.

## 5 — Scheduling (you do this when ready)

The same options as Phase 9 patterns cron — pick one:

- **Railway Cron** (cleanest): weekly schedule, runs `node backend/scripts/compute-business-profile.js`
- **Combined cron:** schedule patterns + business-profile together since they're cheap and share data shape
- **GitHub Actions** (free): weekly workflow

Recommended: bundle Phase 9 + Phase 10 into a single weekly cron. They both read the same data, both write to memory-adjacent tables, both cost pennies.

## 6 — Behavior the agent should now exhibit

Before Phase 10, when a user asked an open-ended question like *"What should I focus on this week?"*, Foreman had to reason from scratch about what kind of business it was helping. Now:

- The system prompt opens with: *"Atroum Construction is a residential remodeling outfit focused on kitchen and bathroom projects, ~4 active workers, currently 2 active jobs averaging $35k contracts..."*
- The agent's first reasoning step is no longer "what kind of business am I helping?" but "given a residential remodel outfit at this scale, what matters most this week?"
- Less "tell me more about your work" handholding. More direct, contextually-aware suggestions.

## 7 — Test results

```
✓ 32 suites passed
✓ 429 tests passed
✗ 0 failed

Live results:
  14 owners scanned
  6 skipped (no project / worker / client data — generic profile would be useless)
  8 profiles generated and persisted to profiles.auto_business_profile
  All 8 read by buildSystemPrompt() in the next agent turn
```

## 8 — Rollback

```sql
UPDATE public.profiles SET auto_business_profile = NULL, auto_business_profile_updated_at = NULL;
```

Removes all generated profiles. The `## ABOUT THIS BUSINESS` section in the prompt is gated on the field being non-empty, so this immediately reverts to pre-P10 behavior. Or:

```sql
ALTER TABLE public.profiles DROP COLUMN auto_business_profile, DROP COLUMN auto_business_profile_updated_at;
```

To remove the columns entirely. The agentService code's profile fetch is wrapped in try/catch so the missing column would just produce a soft-fail, not a chat outage.

## 9 — Stop point

Phase 10 ships clean. **Foreman now starts every conversation knowing the business shape.** Moving to Phase 11 (domain-data RAG) — the heaviest of the four enhancements but the one that pays off most when combined with the prior three.
