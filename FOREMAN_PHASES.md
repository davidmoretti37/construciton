# Foreman 2.0 — Phased Refactor Plan

**Date:** 2026-04-28
**Companion doc:** `FOREMAN_AUDIT.md` (current state)
**Status:** PROPOSAL — awaiting approval before any code changes

---

## Guiding constraints (from the brief)

1. **Phase 1 = MCP-readiness minimum.** Nothing else.
2. **No regressions.** Existing chat must work between phases.
3. **One phase at a time.** Each ends with a STOP point.
4. **No bundled phases, no scope creep mid-phase.**
5. **Concrete verification per phase** — same 10 representative prompts every time, plus phase-specific tests.

## The 10 baseline test prompts (reused every phase)

These cover the major intent buckets. Every phase must keep all 10 working with no regression in result quality, latency, or cost.

| # | Prompt | What it exercises |
|---|---|---|
| 1 | "What's happening today?" | `briefing` intent, `get_business_briefing` |
| 2 | "Create a project for the Smiths at 123 Oak St — kitchen remodel, $45k" | `project` intent, project-preview card emission, NOT calling search_projects first |
| 3 | "Send the Davis estimate to Carolyn" | `share_document` tool + sms/email action |
| 4 | "Delete the last expense I added" | Destructive guard — must ASK before firing `delete_expense` |
| 5 | "How much did Jose work this week?" | `worker` intent, `get_worker_metrics` or `get_payroll_summary` |
| 6 | "Find the Martinez kitchen project" | `search_projects` |
| 7 | "Text Carolyn we'll be 30 minutes late" | New SMS tool `send_sms` (must confirm in same turn) |
| 8 | "What's my route today?" | `service_plan` intent, `get_daily_route` |
| 9 | "Clock in Miguel" | Worker action `clock_in_worker` |
| 10 | "Who owes me money?" | `financial` intent, `get_ar_aging` |

Per phase: run these 10, document any divergence in `PHASE_N_REPORT.md`.

---

## Phase 1 — MCP-ready foundation

**Goal:** Replace the flat keyword router with a metadata-driven hierarchical routing + approval-gate system, so external MCP tools register with a single object and flow through unchanged.

**Risk:** **Medium.** The actual routing decision changes for every chat turn. Mostly mechanical (categorize 55 tools), but the routing-substitution is a behavior change that must match-or-improve the current keyword router on every test prompt.

**Estimated effort:** 2–3 focused days.

### What changes (file paths)

**New files:**
- `backend/src/services/tools/registry.js` — single source of truth. Exports `TOOL_REGISTRY` (Map of `name → { definition, handler, metadata }`), plus `register({ name, definition, handler, metadata })`, `getTool(name)`, `getToolsByCategory(cat)`, `listAll()`, `routeByMetadata(intent, hints)`.
- `backend/src/services/tools/categories.js` — enum of categories: `projects | estimates | invoices | financial | bank | workers | scheduling | service_plans | documents | reports | sms | settings | search | briefing | memory | mcp_<provider>`. Subcategory and tag fields for finer-grain filtering when MCP fans out.
- `backend/src/services/approvalGate.js` — generalizes `destructiveGuard.js`. Takes `{ tool, args, messages, metadata }` and returns `{ verdict: 'PROCEED' | 'BLOCK' | 'PENDING_USER_APPROVAL', reason, action_summary? }`. Branches on `metadata.risk_level` (`read | write_safe | write_destructive | external_write`).

**Modified files:**
- `backend/src/services/tools/definitions.js` — every tool entry gets a sibling `metadata` block:
  ```js
  {
    type: 'function',
    function: { name: 'delete_project', ... },
    metadata: {
      category: 'projects',
      risk_level: 'write_destructive',
      requires_approval: true,
      model_tier_required: 'haiku',
      supports_supervisor: false,
      tags: ['cascade'],
    }
  }
  ```
  No fields removed, no current consumers broken — additive only.
- `backend/src/services/tools/handlers.js` — no functional change; the registry uses the existing `TOOL_HANDLERS` map.
- `backend/src/services/agentService.js` — Phase 1 substitutes `routeToolsAsync` with `registry.routeByMetadata(intent, hints)`. The intent classifier (`localRouter` + regex fallback) is **kept** — it produces the category, registry filters by category. The destructive-action call site (`verifyDestructive`) is replaced with a single `approvalGate.check(toolCall, metadata, messages)` call that branches on `metadata.risk_level`.
- `backend/src/services/toolRouter.js` — kept as the **classifier** (intent → category). Tool selection is moved to the registry. Eventually `toolRouter.js` becomes thinner; in this phase it stays as-is to keep the diff small.
- Frontend: `frontend/src/screens/ChatScreen.js` — handle a new SSE event `pending_approval` (`{ type, tool, action_summary }`) by showing an inline confirm card. On user OK, frontend posts `{ approval: 'granted', tool, args }` back; agent loop resumes. On deny, agent receives an injected message ("user declined") and proceeds.

**Migrations:** none (DB).

### What this phase enables (and what it doesn't)

**Enables:**
- A new MCP tool can register with `register({ name, definition, handler, metadata: { category: 'mcp_quickbooks', risk_level: 'external_write', requires_approval: true } })` and immediately flow through routing + approval gates.
- Generalized approval works for any tool tagged `write_destructive` or `external_write`. The hardcoded `DESTRUCTIVE_TOOLS` set goes away.
- Risk-level visible to the planner (next phases can use it).

**Does NOT yet enable:**
- Streaming reasoning visible to the user (Phase 3).
- Step-list multi-step plans (Phase 2).
- Structured memory taxonomy (Phase 4).
- Sub-agent dispatch (Phase 5).
- An actual MCP client. **MCP-ready ≠ MCP-shipped.** This phase only ensures the registry shape is right for MCP; wiring an MCP HTTP client is a separate future phase.

### Verification criteria

1. **Run all 10 baseline prompts** through `/api/chat/agent`. For each: same model selected, same primary tool fired, same response shape. Record diff if any.
2. **Approval gate test:** prompt #4 ("Delete the last expense I added") must emit a `pending_approval` SSE event with an `action_summary` describing what would be deleted (the actual expense row). User taps confirm → tool fires. User taps deny → agent acknowledges and stops. Run twice (confirm and deny path).
3. **External-write simulation:** add a fake tool `mcp_test_external_write` registered as `risk_level: 'external_write'`. Prompt: "run the mcp_test_external_write tool with foo=bar". Expected: `pending_approval` event before any execution.
4. **Tool registration completeness:** assert every entry in `toolDefinitions` has a `metadata.category` and `metadata.risk_level`. Test in `tools.test.js`.
5. **Cost regression check:** before/after average input + output tokens across the 10 prompts. Target ≤ baseline (Phase 1 should be neutral; caching is already on).
6. **Latency regression check:** P50 first-token latency on prompts 1, 6, 9 (read-heavy). Target within ±100ms of baseline.
7. **Existing tests pass:** `npx jest src/__tests__/` — no regressions in `tools.test.js`, `agentService.test.js`, `toolRouter.test.js`, `sms.test.js`.

### Stop point

Run the verification, paste results into `PHASE_1_REPORT.md`, and pause. Do **not** start Phase 2 until the report is reviewed.

---

## Phase 2 — Multi-step planner upgrade

**Goal:** Upgrade the planner from "1–2 sentence plan_text + complexity tag" to a structured step-list the agent loop tracks.

**Risk:** **Medium.** New behavior in the loop. Existing simple/standard requests must short-circuit (no step list) to avoid latency regression.

**Estimated effort:** 2 days.

### What changes

**Modified files:**
- `backend/src/services/planner.js` — when `complexity === 'complex'`, also return:
  ```ts
  steps?: Array<{ id: number, action: string, tools_likely: string[], depends_on?: number[] }>
  ```
  Length cap 5. Simple/standard plans skip the step list entirely.
- `backend/src/services/agentService.js` — when `plan.steps` is present, the loop tracks step status (`pending | in_progress | completed | failed`) and passes the step context to the LLM at each iteration. Failed step → replan (re-uses existing `MAX_REPLANS = 1`).
- `backend/src/services/planVerifier.js` — verifier now sees `plan.steps` and reports per-step alignment.

**New SSE events:** `step_started`, `step_completed`, `step_failed` (frontend wiring deferred to Phase 3).

### Verification criteria

1. All 10 baseline prompts: prompts 1–10 with `complexity ≠ 'complex'` should have **identical** behavior to Phase 1 (no step list emitted).
2. **Complex prompt test:** "Create a service plan for Davis Pool Care, weekly visits Tuesday morning, attach the standard cleaning checklist, and email them the welcome packet." Expected: planner emits 3+ steps, agent fires `create_service_visit` (or service-plan-preview card) → then `share_document`. Verifier reports `aligned: true`.
3. **Failed-step recovery:** mock a tool failure mid-plan; agent must replan within `MAX_REPLANS = 1` and emit `step_failed` then `step_started` for replacement step.
4. **No latency regression on simple/standard:** P50 first-token latency on prompts 1, 6, 9 must match Phase 1.

### Stop point

`PHASE_2_REPORT.md` with verification results. Pause for review.

---

## Phase 3 — Streaming transparent reasoning

**Goal:** Make the inside of the agent loop visible to the user. Today the only thing they see is the final text + the planner sentence. Stream tool-start, tool-result-arrived, step-progress, and the agent's own reasoning between calls.

**Risk:** **Medium.** This is a UX change — most of the risk is on the mobile rendering side, not the backend. Easy to roll back via a feature flag.

**Estimated effort:** 1.5–2 days.

### What changes

**Backend (additive SSE events):**
- `tool_started` `{ name, args_summary, category, risk_level }`
- `tool_completed` `{ name, duration_ms, ok }`
- `agent_thinking` `{ text }` — short prose between tool calls (already in Anthropic streaming response; we just forward it)
- `step_started` / `step_completed` (from Phase 2, now actually wired through)

**Frontend (`frontend/src/screens/ChatScreen.js`):**
- New "Foreman is doing X…" inline status card under the assistant bubble. Lists tool calls in flight with category icons. Collapses on completion to a single "Used 3 tools" line.
- Plan text (already emitted) gets rendered as a dim italic line above the response bubble.
- Feature flag: `EXPO_PUBLIC_FOREMAN_TRANSPARENT_REASONING=false` falls back to current behavior.

### Verification criteria

1. All 10 baseline prompts produce visible `tool_started` and `tool_completed` events for each tool fired. Manual visual check of mobile rendering.
2. With flag off, behavior matches Phase 2 byte-for-byte.
3. Latency check: first user-visible token (now the plan or first `tool_started`) within 800ms — better than Phase 2's first-text latency.

### Stop point

`PHASE_3_REPORT.md`.

---

## Phase 4 — Structured memory taxonomy

**Goal:** Replace the freeform `user_memories.category` enum with a proper typed bucket model, so memory lookups and writes are type-safe and the agent can target specific memory types ("show me only this user's pricing patterns").

**Risk:** **HIGH.** This touches existing user data. Migration must be reversible. Behavior of the existing memory tool must not break mid-migration.

**Estimated effort:** 3–4 days, with explicit checkpoint pauses inside the phase.

### What changes

**DB migration (`supabase/migrations/...`):**
- New table `user_memory_facts` with typed columns: `kind` ENUM(`fact | preference | rule | pattern | context_conditional`), `subject`, `predicate`, `object`, `confidence`, `evidence_message_ids`, `embedding`, `expires_at`.
- Backfill script: classify existing `user_memories` rows into the new taxonomy via Haiku batch calls, write to `user_memory_facts`. Keep `user_memories` intact for two phases (Phase 4 + Phase 5) as fallback.
- Reversibility: drop `user_memory_facts` and the agent falls back to `user_memories`. No data loss.

**Modified files:**
- `backend/src/services/memory/memoryService.js` — `extractUserFacts` now writes into typed buckets. `recallRelevant` queries both tables during transition.
- `backend/src/services/memoryTool.js` — new commands `query_facts(kind, subject?)` for typed read, `record_fact(kind, ...)` for typed write. Existing file-based commands kept.

### Verification criteria

1. Run all 10 baseline prompts: behavior unchanged (memory recall must work via either source during transition).
2. **Migration dry-run test:** classify 100 sample existing rows; manual review for bucket accuracy ≥ 90%.
3. **Typed-recall test:** prompt "what pricing patterns do I have for kitchens?" → agent calls `memory.query_facts('pattern', 'pricing')` and gets only pattern-typed rows.
4. **Reversibility test:** drop `user_memory_facts` table, agent still works via the legacy `user_memories` path. No errors in logs.

### Stop point

`PHASE_4_REPORT.md`. **Extra-careful review** before Phase 5 — the cleanup of legacy `user_memories` happens at the start of Phase 5 only after confirming the new system runs clean for at least a week of real usage.

---

## Phase 5 — Sub-agents + error-recovery polish

**Goal:** Spawn dedicated sub-agents for very-complex multi-step requests (research-heavy or audit-heavy), and tighten mid-loop error recovery.

**Risk:** **Low–medium.** Additive — existing flows continue using the single-agent loop.

**Estimated effort:** 2 days.

### What changes

**New files:**
- `backend/src/services/subAgentDispatcher.js` — given a `complexity: 'complex'` plan with `steps.length >= 4`, can fan out to a parallel sub-agent for an isolated sub-goal (e.g., "research: pull last 12 months of Davis project history and summarize"). Sub-agent has access to a restricted tool subset (read-only) and a shorter system prompt.
- Cleanup: drop legacy `user_memories` table once Phase 4 has proven itself.

**Modified files:**
- `backend/src/services/agentService.js` — error recovery: if a tool returns `{ error }` but the plan has a fallback step, the loop tries the fallback before giving up. Today the loop relies on the LLM to decide what to do next; this phase adds a deterministic retry for transient failures (HTTP 5xx, timeouts).

### Verification criteria

1. All 10 baseline prompts: unchanged.
2. **Sub-agent dispatch test:** "Audit my Davis project — pull every transaction, every daily report, every photo, and write me a one-page summary." Expected: planner emits 4+ steps, dispatcher spawns a research sub-agent, parent waits, parent integrates the sub-agent's summary into the response.
3. **Transient-failure recovery:** inject a 503 from a tool handler; agent retries once before giving up.
4. **Legacy memory cleanup:** drop `user_memories` table in a transaction; rerun all 10 prompts; no regressions.

### Stop point

`PHASE_5_REPORT.md`. Foreman 2.0 considered shipped after this phase.

---

## Cross-phase principles

- **Backwards compatibility throughout.** A Phase N-deployment must be runnable against a Phase (N–1) frontend and vice versa for at least one week.
- **Feature flags** for any user-visible behavior change (`AGENT_PLANNER_ENABLED` is the existing pattern). Phase 3 introduces `FOREMAN_TRANSPARENT_REASONING`. Phase 4 introduces `FOREMAN_TYPED_MEMORY`.
- **Cost ceiling:** total per-message cost on the 10 baseline prompts must stay within ±10% of Phase 1's measurement, end of Phase 5. Caching gains in Phase 1 should buffer phase-by-phase additions.
- **No phase ships without `PHASE_N_REPORT.md`** documenting actual vs planned, deviations, deferred items, and new risks.

---

## What I will do as soon as you approve

1. Create `PHASE_1_REPORT.md` skeleton.
2. Spin up a TaskCreate list for Phase 1 work (registry + categories + metadata population + approvalGate + agentService wire-up + frontend pending_approval card + tests + 10-prompt verification run).
3. Implement Phase 1.
4. STOP, post results, wait.

If anything in this plan looks wrong — wrong phase order, wrong scope split, missing concern — say so before I start. The cost of replanning now is minutes; the cost of replanning mid-phase is days.
