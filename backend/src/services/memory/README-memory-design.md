# Persistent Multimodal AI-Chat Memory — design notes

_Research artifact for the memory-system overhaul shipped on 2026-04-25. Kept here so future engineers know why we chose what we chose._

## Problem we were solving

Before this overhaul the chat assistant was amnesiac:

- Conversations were stateless between turns — every request re-sent the full raw history from the client.
- Images were passed as inline base64 on the turn they were sent and then **replaced on the client with the literal string `"[User attached N image(s)]"`**, so a follow-up turn could not see them at all.
- `user_memories` existed but used **regex-only** extraction on the client (`MemoryService.js`). Facts never got vectors, never got dedup via similarity, and were never recalled semantically.
- The server-side `requestMemory.js` was an **in-process Map** with a 30-minute TTL — lost on every restart.
- Every request paid full input-token cost on the (large, mostly-static) system prompt — no prompt caching.

## Options we evaluated (Sage research, 2026-04)

| Option | Summary | Cost @ 100-1000 msg/user/mo | Multimodal | Fit for Node+Supabase | Lock-in |
|---|---|---|---|---|---|
| **OpenAI Assistants** (threads + vector stores + File Search) | Managed | $0.10/GB/day + tokens — ~$2-8/user | Yes | Poor — duplicate data plane vs Claude | High, deprecating toward Responses API |
| **Anthropic Files + Memory tool + cache_control** | Claude-native; server-side memory tool in beta | ~$0.50-3/user; cache hits cut input ~10x | Native (files API + vision) | Excellent — already using Claude | Medium |
| **Mem0** (open-source fact layer) | LLM-extracted facts over any vector DB | Self-host free + infra | Weak | Good — Node SDK, can point at Supabase | Low |
| **Letta / MemGPT** | Agent self-edits hierarchical memory blocks | Heavy tokens; $20-100/mo infra | Limited | Medium — separate Python service | Medium |
| **Zep Cloud** | Temporal knowledge graph | ~$0.50-5/user | Weak for photos | Medium — REST bolt-on | Medium-high |
| **LangGraph BaseStore + Postgres** | Framework store, semantic + KV | Just Supabase costs | BYO | Good, but pulls LangChain runtime | Low |
| **Roll-your-own pgvector + rolling summary** | Supabase-native embeddings + Storage refs | Pennies/user | Full control | Native | **None** |

## What we picked and why

**Roll-your-own pgvector + Anthropic prompt caching via OpenRouter** — option 7.

We already run Supabase (pgvector + Storage), and we already proxy Claude through OpenRouter. Adding any managed memory vendor would have doubled our data plane for marginal value. The Sage matrix showed this path has the lowest cost, zero lock-in, and full control over what gets remembered.

Two concrete state-of-the-art patterns were critical:

1. **Embeddings via OpenRouter's OpenAI-compatible `/embeddings` endpoint** using `openai/text-embedding-3-small` (1536-d). This reuses the **same `OPENROUTER_API_KEY`** we already use for chat completions — no new credential. Dimension 1536 is the sweet spot: 3072 doubles storage + HNSW RAM for ~1.5pp recall gain that isn't worth it at our scale.

2. **Anthropic prompt caching** via `cache_control: { type: 'ephemeral' }` on the system-prompt content block. OpenRouter forwards this to Anthropic. First turn pays full input + ~25% to write the cache; every subsequent turn reads at ~10% of input price. On our ~5k-token system prompt that's a **6-10× cost reduction** on input tokens.

## Schema (see `migrations/20260425_chat_memory.sql`)

Additive, nullable, RLS-enforced. pgvector pieces guarded behind `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')` DO blocks so the migration applies either way.

- `chat_messages` += `embedding vector(1536)`, `tool_calls JSONB`, `tool_results JSONB`, `token_count`, `embedding_model`, HNSW on `embedding`.
- `chat_sessions` += `rolling_summary`, `summary_through_message_id`, `summary_updated_at`, `message_count`.
- `chat_attachments` new: `message_id`, `session_id`, `user_id`, `kind`, `bucket`, `storage_path`, `mime_type`, `caption`, `ocr_text`, `embedding`, HNSW, RLS on `user_id = auth.uid()`.
- `user_memories` += `embedding vector(1536)`, `source_message_id`, `expires_at`, HNSW.
- `match_chat_memory(p_user_id, p_query, p_k)` RPC unifies recall across all three tables with RLS via `SECURITY INVOKER`.

## Hot path — per turn (`agentService.js`)

1. Embed user message via OpenRouter.
2. Call `match_chat_memory(userId, qEmb, 6)` → top-K across messages + attachments + user_memories.
3. Pull `rolling_summary` from `chat_sessions`.
4. Build Claude request:
   - `system` → structured content block with `cache_control: 'ephemeral'` — cached.
   - Inject rolling summary + top-K semantic recall + user memories **into** the system block (stable prefix) so the cache survives as long as possible.
   - Volatile user message goes last as usual.
5. Stream response. Log `cache_read_input_tokens` + `cache_creation_input_tokens` from OpenRouter's usage block.

## Write-back pipeline (fire-and-forget after each turn)

1. `persistMessage` for both user + assistant turns → rows in `chat_messages` with embeddings + `tool_calls` / `tool_results` JSONB. Images go into `chat_attachments` with a vision-captioned caption + embedding.
2. `updateRollingSummary` — when `message_count ≥ 20` since last cut, re-summarize via a cheap Haiku call on the oldest unsummarized window (~40 messages). Advance `summary_through_message_id`.
3. `extractUserFacts` — one Haiku call extracts ≤5 durable facts per turn. Upsert into `user_memories` (UNIQUE on `user_id,category,subject,fact` dedupes). Each fact gets an embedding so it's semantically discoverable later.

All three run in `Promise.allSettled` so a slow embedding call never blocks the next user message.

## Cost model at 1000 msg/user/mo

- Embeddings (OpenRouter, `text-embedding-3-small`): 1000 × ~200 tokens avg × $0.02/1M = **~$0.004/user/mo**.
- Image captioning (Haiku via OpenRouter): ~100 uploads × $0.0005 = **~$0.05/user/mo**.
- Summary recomputes: ~50/mo × ~$0.001 = **~$0.05/user/mo**.
- Fact extraction: 1000 × ~$0.0003 = **~$0.30/user/mo**.
- Vector storage: 1000 × 1536 × 4B = **~6 MB/user**.
- Prompt caching: ~70% input-token reduction on the stable prefix → saves ~$1.50/user/mo vs uncached.

**Net: well under $1/user/mo, lower than before thanks to caching.**

## Failure modes + graceful degradation

- **pgvector disabled** — migration DO-blocks skip vector columns + RPC. `memoryService.vectorEnabled()` probes `chat_messages.embedding` on first call; if absent, it recalls by recency + confidence instead.
- **Embedding API down** — `embedText()` returns null. Messages still persist (without embeddings); they get indexed next time `backfill` runs.
- **OpenRouter `/embeddings` returns 404/405** — silent fallback to direct OpenAI if `OPENAI_API_KEY` is set; otherwise null (recency-only recall).
- **sessionId missing** on the agent request — `persistMessage` is a no-op; nothing breaks, but nothing is remembered either. Ensure the client always sends `sessionId` from `ChatScreen`.

## What this does NOT do (intentionally)

- No image upload to Supabase Storage yet — chat images still arrive as base64. Captions and embeddings are stored, but not a URL the model can re-view. Next iteration: upload on send, keep a signed URL on the `chat_attachments` row, re-inject the image back into Claude's context when recall surfaces it.
- No cross-user memory (by design).
- No export/delete-my-data endpoint (will add when GDPR becomes a concern).

## Requirements for full activation

1. **Enable pgvector** in the Supabase dashboard (Database → Extensions → vector). Re-run `node backend/scripts/_apply_chat_memory.js` — the DO blocks then add the columns + RPC.
2. Nothing else. `OPENROUTER_API_KEY` already handles embeddings, captioning, summaries, and fact extraction.
