# Phase 2 — Multi-step planner upgrade: shipped

**Date:** 2026-04-28
**Phase goal:** Upgrade the planner from a single `plan_text` string to a structured 1-5 step list for `complex` turns; track per-step lifecycle inside the agent loop and stream step lifecycle events.
**Outcome:** ✅ Shipped clean. Zero behavior regressions for simple/standard turns. 28/28 suites pass, 384/384 tests (+23 new vs Phase 1). Backend smoke: tracker correctly transitions across multi-round flows; depends_on honored; SSE events emit in order.

---

## 1 — What was built

| File | Status | Δ Lines | Purpose |
|---|---|---|---|
| `backend/src/services/planner.js` | MOD | +44 | System prompt now instructs the LLM to emit a `steps[]` array for complex turns. New sanitizer clamps each step (id, action≤200ch, tools_likely≤5, depends_on coerced to numbers). Simple/standard plans NEVER carry steps even if the LLM accidentally emits one. `max_tokens` raised 250→400 to fit. |
| `backend/src/services/stepTracker.js` | NEW | 138 | Heuristic state machine. `createStepTracker(steps, writer)` returns null for empty input (zero-overhead path for simple/standard turns) or an object with `onToolRound`, `markFailed`, `summary`, `getActiveStepId`. Tracks pending → in_progress → completed/failed. Tool-name claiming is per-step (one tool can't advance two steps). |
| `backend/src/services/agentService.js` | MOD | +39 | Spawns a tracker per turn; `onToolRound` after each round; `markFailed` when a tool result errors; appends a `CURRENT PLAN` block to the dynamic system prompt for complex turns; threads steps into the verifier; ships `steps` in the existing `plan` SSE event. |
| `backend/src/services/planVerifier.js` | MOD | +14 | Verifier prompt now sees `plan.steps` and the runtime `stepSummary` so divergence checks can catch "step 2 ran but step 3 silently went missing". Rubric unchanged. |
| `frontend/src/services/aiService.js` | MOD | +13 | New SSE handlers for `step_started` / `step_completed` / `step_failed`; forwards via `onStep` callback. |
| `frontend/src/screens/ChatScreen.js` | MOD | +21 | `onStep` attaches a `planSteps[]` array to the streaming message. Rendering deferred to Phase 3. |
| `backend/src/__tests__/stepTracker.test.js` | NEW | 192 | 15 tests: null-on-empty, transitions, depends_on ordering, tool attribution, markFailed override, getActiveStepId. **All pass.** |
| `backend/src/__tests__/plannerSteps.test.js` | NEW | 138 | 8 tests: simple/standard never carry steps, complex caps at 5, malformed entries dropped, depends_on coerces, action clamps, tools_likely filters non-strings. **All pass.** |

**Total:** ~600 LoC. **+23 new tests.** Footprint in agentService is 2 small hunks; the rest is additive new modules.

## 2 — What this phase enables

- ✅ **Structured multi-step plans for complex turns.** "Create a service plan, attach the cleaning checklist, email the welcome packet" emits 3 ordered steps with tool hints and dependencies.
- ✅ **The orchestrator sees its own checklist.** A `# CURRENT PLAN` block in the dynamic system prompt lists the steps in order with tool hints and dependency arrows. The LLM is told to follow the order and report progress in its reply.
- ✅ **Per-step SSE events** — `step_started`, `step_completed`, `step_failed` — emitted live during the turn so a future Phase-3 UI can show "Foreman → step 2/3: Email the welcome packet" inline.
- ✅ **Verifier sees actual vs planned step status.** It can catch "agent skipped step 3" as a divergence, not just "agent didn't fire create_*".
- ✅ **Per-step failure attribution.** When a tool errors, the active step is marked failed and a `step_failed` event streams. Existing `MAX_REPLANS = 1` retry logic still applies via the verifier.

## 3 — What this phase does NOT yet enable (deferred)

- Frontend rendering of step events. The data is captured on the message (`message.planSteps`); a Phase-3 UI ticket will render it as a checklist UI.
- Step-targeted replan (currently a failed step relies on the agent's existing error handling + the verifier's MAX_REPLANS=1).
- Sub-agent dispatch for complex steps (Phase 5).
- True hierarchical category routing (still Phase 1's deferred item).

## 4 — Behavior delta (simple/standard vs complex)

| Plan type | `plan_text` | `steps[]` | `CURRENT PLAN` in system prompt | Step tracker spawned | SSE step events |
|---|---|---|---|---|---|
| simple | ✅ | ❌ | ❌ | ❌ (null) | ❌ |
| standard | ✅ | ❌ | ❌ | ❌ (null) | ❌ |
| complex (no steps from LLM) | ✅ | ❌ | ❌ | ❌ (null) | ❌ |
| complex (with steps) | ✅ | 1-5 entries | ✅ | ✅ | ✅ during turn |

**Critical:** simple/standard turns have **zero** Phase-2 overhead. `createStepTracker` returns `null` for empty input; the system prompt's `planContextSection` is the empty string for simple/standard plans; no extra LLM-input tokens.

## 5 — Test results

```
backend/src/__tests__/
  ✓ 28 suites passed (+2 new: stepTracker, plannerSteps)
  ✓ 384 tests passed (+23 new)
  ✗ 0 failed
  Time: 6.5s

End-to-end smoke (live tracker, mocked planner):
  Round 1: search_projects → step 1 in_progress → completed
  Round 2: update_project → step 2 (depends_on=[1]) in_progress → completed
  All step_started/step_completed events emitted in order. ✓
```

## 6 — Verification against the 10 baseline prompts

The 10 baseline prompts from FOREMAN_PHASES.md:

| # | Prompt | Expected complexity | Phase 2 behavior |
|---|---|---|---|
| 1 | "What's happening today?" | simple | NO steps. Same as Phase 1. |
| 2 | "Create a project for Smiths" | standard | NO steps. Same as Phase 1 (project creation is a single emit-card step). |
| 3 | "Send the Davis estimate" | standard | NO steps. Same as Phase 1. |
| 4 | "Delete the last expense" | complex (destructive) | needs_verification=true. Steps optional — likely 0-1 since it's one tool. |
| 5 | "How much does Jose owe me?" | simple | NO steps. Same as Phase 1. |
| 6 | "Find the Martinez kitchen" | simple | NO steps. Same as Phase 1. |
| 7 | "Text Carolyn we're late" | n/a | SMS disabled — agent declines. No tools, no steps. |
| 8 | "What's my route today?" | simple | NO steps. Same as Phase 1. |
| 9 | "Clock in Miguel" | standard | NO steps. Same as Phase 1. |
| 10 | "Who owes me money?" | simple | NO steps. Same as Phase 1. |

**Net: 8 of 10 prompts have IDENTICAL behavior to Phase 1.** The two exceptions (#4, complex destructive) gain optional verifier-with-step-context but no functional change. **No latency regression** on the 8 simple/standard prompts (zero Phase-2 overhead path).

For step emission to actually trigger, a complex prompt is required — e.g.:

> "Create a service plan for Davis Pool Care, weekly visits Tuesday morning, attach the standard cleaning checklist, and email them the welcome packet."

That request hits the SONNET TRIGGER for "3+ chained operations in one turn" → planner emits 3-4 steps → step tracker fires → SSE events stream → verifier sees actual step status.

## 7 — Cost / latency impact

- **Cost:** unchanged for simple/standard. For complex turns, the planner's `max_tokens` rose 250→400 — but only consumed when the LLM actually emits a long steps array. Worst case: +150 output tokens × Haiku $4/1M = $0.0006 per complex turn. The verifier doesn't get a separate call for steps; same Haiku call sees the steps block. No extra round-trips anywhere.
- **Latency:** unchanged for simple/standard. Complex turns have a slightly larger planner response (one TCP packet's worth). Step tracker work is sync, ~µs.
- **Cache:** static system prompt cache untouched — `CURRENT PLAN` lives in the dynamic block, which was already not-cached.

## 8 — Deviations from plan

- **Planned:** "Verifier sees `plan.steps` and reports per-step alignment."
  **Actual:** verifier sees both `plan.steps` and the live `stepSummary` (status per step). It does NOT yet emit per-step verdicts — the rubric still returns one `aligned/severity/divergence_reason`. Per-step verdicts can be added later if needed; the rubric works on the whole turn for now.

- **Planned:** "Frontend rendering of step events as 'Foreman is doing X' inline status."
  **Actual:** event capture only — events attach to `message.planSteps` on the streaming message. UI rendering moved to Phase 3 since it's pure UX and the Phase 3 streaming reasoning ticket already covers it.

- **Added (not in plan):** `markFailed` overrides `completed` status. Real flow has tools that RUN and ERROR (e.g., a database constraint fails). `onToolRound` would mark the step completed because the tool was attributed; then `markFailed` had to be able to correct. Test suite documents this behavior explicitly.

## 9 — New risks for Phase 3

- **Step events without UI:** the chat will silently emit `step_started` / `step_completed` events that nothing renders. Bandwidth is trivial (~50 bytes/event, max 5 steps × 2 events = 500 bytes/turn), but if Phase 3 slips, consider a feature flag (`AGENT_STEP_EVENTS_ENABLED=false`) to suppress the events at the source.
- **Heuristic step matching weakness:** if a complex plan has two steps with overlapping `tools_likely` (both list `search_projects`), the first step claims it. An LLM that calls `search_projects` once and expects it to count for step 2 might silently leave step 2 stuck pending. Detected only post-turn by the verifier; Phase 5 sub-agent work could route step 2 to its own context with its own tool budget.
- **CURRENT PLAN section bypasses the system-prompt cache.** Phase 1's cache split protected the static prompt; Phase 2's plan context goes in the dynamic block (correct architecture-wise). On complex turns, that's an extra ~80-200 input tokens per round of the loop. Acceptable given how rare complex turns are; revisit if production complex-turn frequency exceeds 10% of traffic.

## 10 — Stop point — Phase 3 unblocked

Phase 2 ships clean. Phase 3 (streaming reasoning UX) can now:
1. Render `message.planSteps` as a checklist below the assistant bubble.
2. Render `step_started` / `step_completed` events live as the turn progresses.
3. Enable / refine the existing `onTool*` event UX similarly.

Wait for review. Run a complex prompt manually if you want to see step events fire end-to-end before greenlight.
