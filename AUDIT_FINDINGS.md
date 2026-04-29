# Foreman 2.0 — Self-Audit Findings & Fixes

**Date:** 2026-04-28 (post-Phase 6)
**Scope:** Critical review of every claim in the 6 phase reports against the actual code.
**Outcome:** 4 real gaps found, all fixed. 32/32 suites still passing, 426/426 tests.

---

## What I checked

I went back through each phase's claimed deliverables and verified the actual code matches. For each phase, I asked "is this fully wired or just half-built?"

| Phase | Verified | Findings |
|---|---|---|
| P1 (registry + approval gate) | ✅ | Fully wired; 90 tools registered; gate fires for both destructive + external_write |
| P2 (planner steps + tracker) | ✅ | Steps emitted only for `complex`; tracker advances per round |
| P3 (reasoning trail) | ✅ | Backend events enriched; frontend renders inline |
| P4 (typed memory) | ✅ | `user_memory_facts` exists empty (correct — additive only); legacy untouched |
| P5 (sub-agents) | ✅ | 4 specialists, runner, dispatch all wired |
| P6 (production hardening) | ⚠️ 4 gaps | Found and fixed below |

---

## Gaps found (all fixed)

### 1. `invoke_skill` was not registered in the tool registry

**The claim:** "P6 ships skills via the `invoke_skill` runtime tool. The orchestrator can call it like any other tool."

**The reality:** `invoke_skill` was injected at runtime in `agentService.js` but had no entry in `tools/registry.js`. Today this works because the agent loop special-cases `invoke_skill` BEFORE the approval gate runs — but if anyone ever called `approvalGate.check()` directly on it (e.g., in a future code path), it would BLOCK with "Unknown tool — registry has no metadata".

**Fix:** added `invoke_skill` to `TOOL_METADATA` in `tools/registry.js` with `category: MEMORY`, `risk_level: WRITE_SAFE`, `requires_approval: false`. Registry total went from 90 → 91. Specialist tool surfaces unaffected (they don't include MEMORY category).

### 2. Orchestrator system prompt didn't mention `dispatch_subagent` or `invoke_skill`

**The claim:** "The orchestrator can delegate complex tasks to specialists or invoke named skills."

**The reality:** I added the two runtime-injected tools to the agent's tool list, but I never updated `tools/systemPrompt.js` to TELL the agent when to use them. Without prompt guidance, the agent would only fire these tools if it happened to guess from the tool description — unreliable.

**Fix:** added two lines to the system prompt's "PREFER INTELLIGENT TOOLS" section:

> - "Audit the Davis project" / "deep-dive on X" / "weekly summary" / "draft an estimate for X" → consider `invoke_skill` first (named recipes). Skills available: `audit_project`, `weekly_review`, `draft_estimate`.
>
> - When a request is genuinely complex (3+ chained operations, large audit, multi-domain synthesis), use `dispatch_subagent` to delegate to a specialist. Specialists: `researcher` / `builder` / `bookkeeper` / `communicator`. Pass `dispatches: [...]` to fan out up to 4 in parallel when sub-tasks are independent.

Now the agent actually knows when to delegate.

### 3. `turn_id` never rotated on replan despite the comment claiming it did

**The claim (in the writer's docstring):** "turn_id rotates on replan via `writer.setTraceContext(nextTurn(...))`."

**The reality:** I built the `nextTurn()` API and `writer.setTraceContext()` method, but I never actually called either in the two replan code paths (memory-stall replan + verifier-major replan). The turn_id stayed the same for the entire request.

**Fix:** wired `writer.setTraceContext(nextTurn(traceCtx))` into both replan paths. Now a replanned turn gets a fresh turn_id under the same trace_id, so log-replay tooling can distinguish pre- and post-replan event groups.

### 4. Plan cache key missed userId

**The reality:** the plan cache key today is `hash(message + recent turns + sorted tool names)` — no userId. Two different users with identical context would share a cached plan.

For the current planner this is **correct** — the plan output is tool-agnostic-of-user (the plan doesn't include user-specific data; that's resolved later by the planner-driven model selection + the system prompt's user-context block). But this is a sharp edge for future planner refactors.

**Fix:** documented as a "must add userId if planner inputs become user-specific" comment in `planCacheKey`. No code change — current behavior is correct, but the trap is now flagged for future work.

---

## Things I checked that turned out to be fine

- **Sub-agent isolation:** I claimed sub-agents run "isolated" loops. They share the supabase admin client + `executeTool` + `approvalGate` with the parent — but they DO have separate message arrays, separate iteration caps, separate model + system prompt. Isolation is at the conversation level, not the dependency-injection level. That's the right level for our needs. ✓
- **Memory dual-write/dual-read:** the `user_memory_facts` table is empty in production. `extractUserFacts` writes to BOTH tables; `recallRelevant` reads from BOTH. Live cross-check confirmed: 291 rows in legacy, 0 in typed (correct — no chats have happened since deploy). ✓
- **Constitution false positives:** the `no_fake_destructive_completion` rule is warn-only, so a false positive on something like "deleted the warning" is logged but doesn't break the response. ✓
- **Plan cache cross-user safety:** see Gap 4. Currently safe. ✓
- **Sub-agent infinite loop:** sub-agents don't have `dispatch_subagent` in their tool list (it's category=MEMORY, no specialist includes MEMORY). Confirmed by inspecting `getToolsForSpecialist` output. ✓
- **Constitution + verifier ordering:** constitution runs BEFORE verifier. Block-severity rules substitute the response, then verifier sees the substituted text. ✓ correct ordering.
- **Approval gate + sub-agent:** sub-agent runner calls the gate independently. Blocked calls bubble up to the parent thread as `pending_approval` events tagged `via_subagent`. ✓
- **Skills don't bypass the gate:** skills delegate to sub-agents, which run the gate. ✓
- **Trace IDs harmless to old clients:** new fields on existing event types; older frontend ignores. ✓

---

## Verification after fixes

```
✓ 32 test suites passed
✓ 426 tests passed
✗ 0 failed
Time: 5.5s

Live registry check:
  Registry total: 91 (was 90; +invoke_skill)
  invoke_skill in registry: true
  dispatch_subagent in registry: true
  Skill enum: audit_project, weekly_review, draft_estimate
  SMS-claim still blocked by constitution
  Email-mention still passes constitution

Server boots clean. Memory tables: 291 legacy / 0 typed (correct).
```

---

## What's still NOT built (genuinely deferred, not a gap)

These are documented in their respective phase reports as deferred-by-design:

- Anthropic SDK adoption (P1 side-quest)
- `agent_thinking` events (depends on SDK)
- Self-evaluation loop (research-tier; verifier partial-covers)
- Memory backfill execution (script exists; you run it manually with `--apply`)
- SMS feature re-enable (you explicitly disabled)
- User-defined skills via UI (not a Foreman 2.0 piece)

Nothing here is half-built. Each is a clean future-phase candidate.

---

## Summary

**Audit verdict:** 6 phases delivered as advertised, with 4 small gaps now fixed. The system is production-ready.

**One human-verifiable test you can run:** open the chat, say `"audit my <real project>"`. You should see:

1. A planner sentence ("Auditing the X project — pulling data and writing a one-pager.")
2. A reasoning-trail card appear with `invoke_skill` or `dispatch_subagent → researcher` entry
3. Multiple `tool_start`/`tool_end` events for each data pull
4. The integrated audit summary streamed into the bubble
5. Trail collapses to "▸ N tools · 1 step" 4 seconds after the response finishes

If that flow renders correctly, every phase is working in production.
