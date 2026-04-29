# Foreman — Current State Audit

**Date:** 2026-04-28
**Author:** pre-refactor baseline
**Purpose:** Factual inventory of what Foreman is today, before the Foreman 2.0 phased refactor. No speculation, no recommendations — only what exists.

---

## TL;DR

Foreman is a Claude-powered tool-using agent with an explicit planner stage, a Haiku-based destructive-action verifier, prompt caching on the static system prompt, and a hybrid memory system (loose user_memories rows + rolling summary + pgvector embeddings). It has **55 tools** routed by **flat keyword/Ollama intent matching** — there is **no hierarchical routing, no tool metadata system (category / risk_level / requires_approval), no general approval-gate framework, and no MCP support**.

The bones are good. The gaps are exactly the ones the user listed.

---

## 1 — Agent loop (`backend/src/services/agentService.js`, 1607 lines)

`processAgentRequest` is the entry point. It runs in marked phases:

| Phase | Lines | What it does |
|---|---|---|
| 1 — Tool routing | ~835–878 | Calls `routeToolsAsync(userMessage, toolDefinitions, hints)` to filter 55 tools → ~8–12. Adds the `memory` tool unconditionally. |
| 1.5 — Plan | ~880–906 | If intent ∉ `SIMPLE_INTENTS`, calls `generatePlan(...)`. Emits SSE event `{ type: 'plan', plan_text, complexity, recommended_model }` and writes an `AGENT_PLAN_GENERATED` domain event. |
| 2 — Model selection | ~936–940 | `planToModelId(plan)` wins if planner returned a recommendation; else `selectModel(toolCount, history)` heuristic (≥10 tools → Sonnet). |
| 3 — Memory context | ~945–1010 | `prefetchMemorySnapshot` (auto-loaded `/memories` files), `memoryService.recallRelevant` (semantic recall + rolling summary). |
| 4 — Tool loop | ~1049+ | Iterative: model → tool calls → `verifyDestructive` gate (only for the 5 destructive tools) → `executeTool` → next round. `MAX_REPLANS = 1`. |
| 5 — Verifier | end | `verifyPlanExecution(plan, calls, response)` if `plan.needs_verification`. Replan once on `severity=major`. |

**SSE events emitted via `createJobWriter` (lines 192, 227–237):**
- `plan` — planner output (text, complexity, model)
- `text` — assistant text deltas
- `visualElement` — preview cards (project, estimate, invoice, service-plan)
- `action` — frontend actions (delete, share, navigate)
- `error` — graceful error to client

**Prompt caching (line ~1011):**
```js
const systemContent = dynamicMemorySection
  ? [
      { type: 'text', text: staticSystemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: dynamicMemorySection },
    ]
  : staticSystemPrompt;
```
Static prompt block cached with `ttl: '1h'`. Dynamic memory in a second uncached block to keep cache stable. Anthropic-only.

**Error handling:** every layer (planner, verifier, model API, tool exec, memory) is wrapped in try/catch with fallback. No fatal exits.

---

## 2 — Tool routing (`toolRouter.js`, 244 lines + `localRouter.js`, 144 lines)

**Strategy: dual-path, flat.**

`localRouter.classifyIntent(message, hints)` calls a local Ollama `qwen2.5:1.5b` (Mac-Mini-only path) with 800ms timeout + 60s in-memory cache. Returns intent or null.

`toolRouter.routeToolsAsync(...)` → if Ollama returned a usable intent, use it; else fall back to `categorizeIntent(...)` which scores 11 regex pattern groups:

```
INTENT_PATTERNS = { financial, project, worker, estimate, briefing, search,
  reports, settings, bank, document, service_plan }
TOOL_GROUPS = { financial: [...], project: [...], ... }   // flat lists per intent
```

Selection is `selectTools(intent, allTools)` → flat string-list `includes` filter on `tool.function.name`. **Compound intents** (top-2 scoring) get a deduplicated union.

**Conversation hints** (`hasDraftProject`, `hasDraftServicePlan`) override "general" intent.

**No tool metadata is consulted** — tools are referenced by name only.

---

## 3 — Tool registry (`tools/definitions.js`, 2205 lines + `tools/handlers.js`, 7261 lines)

**~55 tools** (post-SMS; counted from `name:` entries). Each definition is OpenAI function-call schema:

```js
{
  type: 'function',
  function: {
    name: 'delete_project',
    description: 'IRREVERSIBLE. ... You MUST get explicit user confirmation ... Owner-only.',
    parameters: { type: 'object', properties: { ... }, required: [...] }
  }
}
```

**No structured metadata fields.** No `risk_level`, no `category`, no `requires_approval`, no `model_tier_required`. Risk and permissions are encoded only in description text ("IRREVERSIBLE", "OWNER-ONLY", "must confirm in same turn").

**Handlers** are a single object: `TOOL_HANDLERS = { search_projects, get_project_details, ... }`. `executeTool(name, args, userId)` looks up the handler, runs it inside try/catch, returns `userSafeError` on throw. ~80ms p50 per call.

---

## 4 — Planner (`planner.js`, 179 lines)

`generatePlan({ userMessage, conversationHistory, toolNames })` calls `anthropic/claude-haiku-4.5` (cached system prompt, 250 max tokens, 0.2 temp, 2500ms timeout) and returns:

```ts
{
  plan_text: string,                // 1–2 sentences shown to user
  complexity: 'simple' | 'standard' | 'complex',
  recommended_model: 'haiku' | 'sonnet' | null,
  needs_verification: boolean,
  intent_summary: string,
  _fallback?: true, _disabled?: true, _skipped?: true,
}
```

Default to Haiku. Sonnet only on: voice self-correction, multi-entity disambiguation, irrevocable destructive intent, or 3+ chained operations.

`planToModelId(plan)` maps `'haiku'`/`'sonnet'` → `'claude-haiku-4.5'`/`'claude-sonnet-4.6'`. Wins over the heuristic `selectModel` when present.

**Skipped** when intent ∈ `['briefing', 'search', 'reports', 'settings', 'document']` AND message lacks create/delete/update/cancel/remove/new keywords.

---

## 5 — Plan verifier (`planVerifier.js`, 146 lines)

Post-execution audit. Same shape as planner: Haiku, cached prompt, 200 tokens, 0 temp.

```ts
{ aligned: bool, severity: 'none'|'minor'|'major', divergence_reason: string }
```

`severity: major` only for genuine harm: destructive tool fired without confirmation, wrong-entity action, or zero-action turn. Triggers one replan (`MAX_REPLANS = 1`).

---

## 6 — Model selection (`modelRouter.js`, 155 lines)

```js
selectModel(toolCount, history) =>
  toolCount >= 10                 → claude-sonnet-4.6   (complexity)
  recentErrors >= 2 (last 4 msgs) → claude-sonnet-4.6   (fallback)
  else                            → claude-haiku-4.5
```

`PRICING = { 'claude-haiku-4.5': $0.80/$4, 'claude-sonnet-4.6': $3/$15 per 1M tokens }`. `trackUsage()` accumulates request count + tokens + estimated cost in process-local `usageStats`.

This is **superseded** by the planner when the planner returns `recommended_model`.

---

## 7 — Approval / destructive gate (`destructiveGuard.js`, 118 lines)

Hardcoded list:
```js
DESTRUCTIVE_TOOLS = new Set([
  'delete_project', 'delete_expense', 'void_invoice',
  'delete_service_plan', 'delete_project_document'
]);
```

`verifyDestructive(toolName, args, messages)` calls Haiku with the last 4 conversation turns + a strict "BLOCK on doubt" rubric. Returns `{ verdict: 'PROCEED'|'BLOCK', reason }`. On BLOCK, the agent receives a synthesized tool result telling it to describe and ask, never to retry blindly.

**There is no general approval-gate framework** — this is a per-tool hardcoded list. New destructive tools must be added manually.

---

## 8 — Memory (`services/memory/memoryService.js`, 829 lines + `memoryTool.js`, 382 lines)

**Hybrid system:**
- `chat_messages` table + `embedding vector(1536)` column + HNSW index
- `chat_sessions.rolling_summary` updated every 20 messages via Haiku
- `chat_attachments` table for image memory (caption + embedding)
- `user_memories` table — auto-extracted facts (≤5/turn), categorized: `client_preference | worker_skill | pricing_pattern | business_rule | project_insight | correction`. Each fact embedded.
- `match_chat_memory(...)` Postgres RPC for semantic recall
- `prefetchMemorySnapshot(userId)` — preloads up to 50 `/memories` files (≤16KB) into the system prompt

**Public API:** `embedText`, `embedImage`, `captionImage`, `persistMessage`, `recallRelevant`, `formatRecallForPrompt`, `updateRollingSummary`, `extractUserFacts`.

**Memory tool surface:** the LLM uses `memory` (tool name) with commands `create | str_replace | insert | delete | rename`. **`view` is disabled** — memory is auto-prefetched into the system prompt, so the agent doesn't pay tokens to "open" files it can already see.

Scope: business-level (owner_id). Supervisors share their owner's memory.

Cost: ~$0.30/user/mo at 1000 msg/user/mo for fact extraction; ~$0.05/user/mo for rolling summary.

---

## 9 — Cost / token tracking (`aiBudget.js`, 149 lines)

Express middleware `enforceMonthlyBudget`. Per-user monthly cap from `profiles.monthly_ai_budget_cents` or `MONTHLY_AI_BUDGET_CENTS` env (default 5000¢ = $50). Over-cap → HTTP 402.

`recordUsage(userId, model, in, out)` calls Postgres RPC `increment_user_api_usage` (with raw-SQL fallback). Table `user_api_usage` keyed by `(user_id, month_start)`.

Pricing constants kept in sync with `modelRouter.PRICING`.

---

## 10 — Domain events (`eventEmitter.js`, 214 lines)

Fire-and-forget logger over a `domain_events` table. ~40 event types covering projects, financial, crew, scheduling, service plans, reports, communication, **and agent decisions** (`AGENT_TOOL_INVOKED`, `AGENT_PLAN_GENERATED`, `AGENT_PLAN_DIVERGED`, `AGENT_REPLAN_TRIGGERED`, `AGENT_DESTRUCTIVE_BLOCKED`). Summary field is embedded for semantic search over events.

Sensitive keys (`password`, `token`, `ssn`, `card_number`, etc.) auto-scrubbed before write.

Used by:
- `query_event_history` tool — agent answers "who changed X?"
- Audit log UI — `frontend/src/screens/owner/AuditLogScreen.js` and `components/AuditTrail.js`

---

## 11 — Voice preprocessing (`voicePreprocessor.js`)

Annotates voice transcripts before they hit the planner: detects self-corrections ("create for John, no Karen"), role corrections, and long-dump multi-intent sentences. Output is a small annotation block prepended to the message so the planner sees the corrected referent.

---

## 12 — Prompt sanitization (`promptSanitizer.js`, 94 lines)

Defense-in-depth against prompt injection. `sanitizeUserContext` strips control chars, fake fences, fake `<system>` tags, Anthropic delimiters. `fenceUserContext` wraps in `<<USER_PROVIDED_CONTEXT>>` markers. `sanitizeToolResult` recursively bounds tool result strings (≤2000 chars) and arrays (≤50 items) so a malicious tool can't dominate context.

---

## 13 — What does NOT exist today

A grep across `backend/src` confirms:

| Concept | Status |
|---|---|
| `risk_level` field on tools | ❌ none |
| `category` field on tools | ❌ none |
| `requires_approval` flag | ❌ none |
| `model_tier_required` field | ❌ none |
| `tool_registry.js` central registry | ❌ none — tools live in flat `definitions.js` array |
| Hierarchical routing (category → tool) | ❌ none — flat string-list per intent |
| General approval-gate framework | ❌ none — only `destructiveGuard` with 5 hardcoded names |
| MCP support / MCP references | ❌ none — zero `mcp` mentions |
| Sub-agent dispatch | ❌ none |
| Streaming reasoning between tool calls | ❌ none — only final text streams; intra-loop is silent |
| Step-list planner output | ❌ planner returns 1–2 sentence plan_text, not structured steps |
| Structured memory taxonomy (fact/preference/rule/pattern/conditional) | ❌ partial — `user_memories.category` is freeform-string-with-enum, not a typed bucket model |

---

## 14 — Total surface area

```
backend/src/services/
  agentService.js         1607
  tools/definitions.js    2205   (55 tools)
  tools/handlers.js       7261
  tools/systemPrompt.js    710
  memory/memoryService.js  829
  memoryTool.js            382
  toolRouter.js            244
  localRouter.js           144
  planner.js               179
  planVerifier.js          146
  modelRouter.js           155
  destructiveGuard.js      118
  aiBudget.js              149
  eventEmitter.js          214
  promptSanitizer.js        94
  voicePreprocessor.js    ~100
─────────────────────────────────
                       ~14,500 LoC
```

This is the surface Phase 1 must move through without breaking.
