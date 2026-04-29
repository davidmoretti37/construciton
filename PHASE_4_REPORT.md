# Phase 4 — Structured memory taxonomy: shipped (additive)

**Date:** 2026-04-28
**Phase goal:** Migrate user_memories from a freeform `category`-string-with-enum into a typed SVO triple store with kinds {fact, preference, rule, pattern, context_conditional}, without breaking the existing memory pipeline.
**Outcome:** ✅ Shipped clean and 100% reversible. New table `user_memory_facts` lives alongside the legacy `user_memories`. Memory service dual-writes new rows, dual-reads on recall. Backfill is a separate, dry-run-by-default script. **No production data was modified.** 30/30 suites, 399/399 tests pass.

**Critical safety property:** I did not write a single byte to `user_memories`. The existing 291 production rows are byte-identical to before Phase 4. To roll back: drop `user_memory_facts` and the system reverts to Phase 3 behavior with no data loss.

---

## 1 — What was built

| File | Status | Δ Lines | Purpose |
|---|---|---|---|
| Supabase migration (Mgmt API) | NEW | — | Created `user_memory_facts` table with kind enum, SVO columns, `superseded_by` self-FK for corrections, embedding column, RLS policies, btree + HNSW indexes. UNIQUE(user_id, kind, subject, predicate, object) for natural dedupe. |
| `backend/src/services/memory/memoryService.js` | MOD | +85 | New `CATEGORY_TO_KIND` mapping table. `extractUserFacts` prompt now also asks for `predicate` + `object`; on parse, dual-writes to legacy + typed tables (typed write skipped if SVO incomplete). `recallRelevant` queries the typed table after legacy and merges with subject+object dedupe. `formatRecallForPrompt` renders `[kind]` tag for typed entries, `[category]` for legacy; userMemories cap raised 8 → 12 to fit augmentation. |
| `backend/scripts/backfill-memory-facts.js` | NEW | 200 | Standalone backfill. Dry-run by default; `--apply` commits; `--user <uuid>` scopes. Idempotent (existing typed rows skipped). Source tag `backfilled` for clean rollback. Cost: ~$0.0002/row. |
| `backend/src/__tests__/memoryFacts.test.js` | NEW | 90 | 7 tests covering rendering paths + the legacy → kind mapping invariant. **All pass.** |

**Total:** ~375 LoC. Zero changes to RLS, zero changes to legacy table schema, zero changes to memory tool surface.

## 2 — Schema

```sql
CREATE TABLE public.user_memory_facts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT CHECK (kind IN ('fact','preference','rule','pattern','context_conditional')),
  subject TEXT NOT NULL,         -- "smith", "jose", "default_terms"
  predicate TEXT NOT NULL,       -- "prefers", "is_certified_for", "charges"
  object TEXT NOT NULL,          -- "morning visits", "electrical work", "$200/hr"
  confidence DOUBLE PRECISION DEFAULT 0.8,
  evidence_message_ids UUID[] DEFAULT '{}',
  source TEXT DEFAULT 'extracted',         -- 'extracted' | 'backfilled' | 'user_explicit'
  embedding vector(1536),
  reinforced_count INTEGER DEFAULT 1,
  superseded_by UUID REFERENCES user_memory_facts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  last_reinforced_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  UNIQUE (user_id, kind, subject, predicate, object)
);
```

Indexes:
- HNSW on embedding (m=16, ef_construction=64)
- btree on (user_id), (user_id, kind), (user_id, subject)
- partial btree on (user_id, last_reinforced_at DESC) WHERE superseded_by IS NULL

RLS: same pattern as `sms_messages` from the SMS work — owners see their own; supervisors see their owner's. Service role bypasses (used by backend writes).

`superseded_by` enables the correction pattern: instead of overwriting "Lana is supervisor", we insert "Mike is supervisor" and set `lana_row.superseded_by = mike_row.id`. Recall queries filter `WHERE superseded_by IS NULL` so only the current state surfaces, but history stays intact for audit.

## 3 — How writes flow now

```
User chats → Foreman responds → memoryService.extractUserFacts() runs post-turn
  → Haiku call: "extract durable facts as { category, subject, predicate, object, fact, full_context, confidence }"
  → For each parsed fact:
      1. UPSERT into user_memories (legacy, unchanged behavior)
      2. If predicate + object are present, UPSERT into user_memory_facts (new, typed)
         - kind = CATEGORY_TO_KIND[fact.category]
         - source = 'extracted'
         - same embedding
```

If the LLM returns a degraded response (no predicate/object), only the legacy row gets written. The typed table stays clean. No silent data quality degradation.

## 4 — How reads flow now

```
recallRelevant(userId, query) →
  semantic recall via match_chat_memory RPC (unchanged)
  → if no userMemories from semantic match:
      pull top 8 from user_memories ordered by confidence + last_used_at
  → ALSO pull top 8 from user_memory_facts ordered by confidence + last_reinforced_at
                                            WHERE superseded_by IS NULL
  → dedupe new entries against legacy by subject+object signature
  → merge, cap total at 12 to bound prompt insertion
formatRecallForPrompt(recall) →
  renders [kind] for typed entries, [category] for legacy
```

The agent sees one unified list. It doesn't know which table fed which entry. Transition is invisible to the agent's behavior.

## 5 — Reversibility

To roll back Phase 4 to Phase 3 behavior:

```sql
DROP TABLE public.user_memory_facts CASCADE;
```

That single statement:
- Removes the new table
- Removes any rows produced by extractUserFacts dual-writes
- Removes any rows produced by the backfill script
- Leaves `user_memories` (the legacy 291-row table) **completely untouched**
- The memoryService code still works — the typed-recall block is wrapped in try/catch and degrades silently when the table is gone

Code rollback (if you want to also remove the dual-write/dual-read code):
- Revert `memoryService.js` to the pre-P4 version. The legacy code path was preserved untouched, so this is a clean 3-way merge.

## 6 — Backfill (manual, opt-in)

The backfill script is **never auto-triggered.** You run it explicitly when you're ready to populate the typed table from existing facts.

```bash
# Dry run — prints what WOULD be written, exits without DB writes
node backend/scripts/backfill-memory-facts.js

# Scope to one user (e.g., your own account first):
node backend/scripts/backfill-memory-facts.js --user <auth-uuid>

# Apply for one user
node backend/scripts/backfill-memory-facts.js --user <auth-uuid> --apply

# Apply to all users (only after dry-run review)
node backend/scripts/backfill-memory-facts.js --apply
```

What it does per row:
1. Skips if a typed equivalent already exists (idempotent on re-run).
2. Calls Haiku once with the legacy fact to extract `{predicate, object}`.
3. Maps category → kind via the same table the live extractor uses.
4. Upserts with `source='backfilled'` so you can identify and roll back the backfill independently:
   ```sql
   DELETE FROM user_memory_facts WHERE source = 'backfilled';
   ```

Cost: ~$0.0002 per row (Haiku, ~50 input + ~50 output tokens). Current production: 291 rows × $0.0002 ≈ **$0.06 total** for full backfill.

## 7 — Test results

```
✓ 30 suites passed (+1 vs P3: memoryFacts)
✓ 399 tests passed (+7 vs P3)
✗ 0 failed
Time: 4.2s

Live DB sanity check:
  user_memories       291 rows (untouched)
  user_memory_facts     0 rows (correct — no auto-backfill)
```

## 8 — Cost / latency impact

- **Cost:** ~zero. The Haiku extraction call is unchanged in count and barely changed in token usage (the prompt is ~30 tokens longer to ask for predicate+object). Per-turn ~$0.0001 → ~$0.00012. Negligible.
- **Latency on recall:** added one Postgres query to `recallRelevant`. Fully indexed (idx_umf_user_active is partial on superseded_by). Live test: ~3ms. Imperceptible.
- **Storage:** new table starts at 0 rows. Will grow at ~5 rows/turn × extracted-fact rate. Estimated 1MB per active user per year — trivial.

## 9 — Decisions I made on your behalf (you said "make the best decision")

1. **Dual-write instead of cutover.** Legacy table keeps receiving new facts during the transition. Means rollback is loss-free. Cost is one extra DB upsert per fact (microseconds). Trade-off: I accepted slightly more data duplication for substantially safer rollback.

2. **Skipped the typed memory tool commands.** The original P4 plan called for `record_fact` and `query_facts` commands on the memory tool. I dropped them — the agent doesn't need to learn new vocabulary; the typed augmentation surfaces automatically through `recallRelevant`. Less prompt churn, less risk. Add later if usage data shows the agent would benefit from explicit typed access.

3. **Backfill is opt-in and source-tagged.** Auto-running a Haiku call per legacy row at boot felt presumptuous and would have surprised you with a Twilio-class bill if 10000 rows existed. Dry-run by default, `--apply` is explicit, `source='backfilled'` is the audit trail.

4. **`superseded_by` instead of overwrite.** A correction creates a new row pointing at the old one. Active recall filters on `superseded_by IS NULL` so the agent only sees the current truth. History is preserved. This is "event sourcing for facts" — common pattern in production memory systems.

## 10 — Risks I'm aware of for Phase 5

- **Backfill cost if the user has many other tenants.** 291 rows is fine, but a multi-tenant production load could be 10000+ rows. Backfill is opt-in so this is bounded; just flag for awareness.
- **CATEGORY_TO_KIND mapping is lossy in 2 places.** `worker_skill` and `project_insight` both → `fact` (the new taxonomy doesn't have a "skill" kind). If you find querying gets imprecise after backfill, we add `skill` as a sub-kind via tags or a new enum value. Reversible.
- **Embedding reuse across tables.** Both rows share the same embedding vector. If the typed row's `subject`/`predicate`/`object` rendering reads differently from `full_context`, semantic recall could return slightly weighted results. Acceptable for P4; revisit only if recall quality drops.

## 11 — Stop point

Phase 4 ships clean, fully reversible, and zero production data was modified. **Continuing to Phase 5 (sub-agents) without pausing per your instructions.** PHASE_5_REPORT.md will follow when sub-agents are wired and tested.
