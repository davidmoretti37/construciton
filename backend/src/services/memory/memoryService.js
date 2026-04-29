/**
 * memoryService — persistent multimodal AI-chat memory
 *
 * Cross-conversation semantic recall, image/document persistence, and user-level
 * long-term facts. Designed to gracefully degrade when optional infrastructure
 * (pgvector extension, OPENAI_API_KEY for embeddings) is missing — the app keeps
 * working with recency-based recall and skips vector ops.
 *
 * Public surface:
 *   embedText(text)                   -> Float32Array | null
 *   embedImage({ base64, mimeType })  -> Float32Array | null   (uses caption then embedText)
 *   persistMessage({...})              -> { messageId, attachmentIds[] }
 *   recallRelevant({...})              -> { items[], summary, userMemories }
 *   updateRollingSummary({...})        -> { summary } | null
 *   extractUserFacts({...})            -> { count }
 *
 * Capability flags:
 *   hasEmbeddings  — OPENAI_API_KEY present AND vector extension enabled
 *   hasLLM         — OPENROUTER_API_KEY present (used for summary + fact extraction)
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMBED_MODEL_OPENROUTER = 'openai/text-embedding-3-small';
const EMBED_MODEL_OPENAI = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const ATTACHMENT_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;  // 24h
const RECALLED_IMAGE_INJECT_CAP = 5;          // max images re-injected per turn (~7.5k vision tokens)

// Lazy bucket bootstrap — idempotent. Creates the private chat-attachments
// bucket the first time the service is touched per process. Errors are swallowed
// because the bucket may already exist or the service role may lack create
// permission (in which case the admin is expected to have set it up manually).
let _bucketChecked = false;
async function ensureBucket() {
  if (_bucketChecked) return;
  _bucketChecked = true;
  try {
    const { data: list } = await supabase.storage.listBuckets();
    if ((list || []).some((b) => b.name === ATTACHMENT_BUCKET)) return;
    await supabase.storage.createBucket(ATTACHMENT_BUCKET, {
      public: false,
      fileSizeLimit: 25 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif',
                         'image/heic', 'image/heif', 'application/pdf'],
    });
    logger.info(`📦 created Storage bucket: ${ATTACHMENT_BUCKET}`);
  } catch (e) {
    logger.warn(`ensureBucket(${ATTACHMENT_BUCKET}) failed (continuing):`, e.message);
  }
}
const SUMMARY_MODEL = 'anthropic/claude-haiku-4.5';
const FACT_MODEL = 'anthropic/claude-haiku-4.5';
const VISION_MODEL = 'anthropic/claude-haiku-4.5';
const SUMMARY_EVERY_N_MESSAGES = 20;

let _vectorChecked = false;
let _vectorEnabled = false;

async function vectorEnabled() {
  if (_vectorChecked) return _vectorEnabled;
  _vectorChecked = true;
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('embedding')
      .limit(1);
    _vectorEnabled = !error;
  } catch (e) {
    _vectorEnabled = false;
  }
  if (!_vectorEnabled) {
    logger.warn('🧠 memoryService: pgvector not enabled — falling back to recency-based recall.');
  }
  return _vectorEnabled;
}

const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

// ============================================================
// Embeddings
// ============================================================

/**
 * Embed text to a 1536-d vector via OpenRouter first (reuses the existing
 * OPENROUTER_API_KEY — no new credential to manage), with a fallback to
 * direct OpenAI when OPENAI_API_KEY is set. Returns null on any failure
 * so callers can gracefully degrade to recency-based recall.
 */
// Hard timeout for embedding calls. Without this, a slow OpenRouter
// response blocked any caller — most painfully the chat-message save
// endpoint, which surfaced as "Network request failed" on the frontend.
const EMBED_TIMEOUT_MS = parseInt(process.env.EMBED_TIMEOUT_MS, 10) || 4000;

function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function embedText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim().slice(0, 8000);
  if (!cleaned) return null;

  // Primary: OpenRouter's OpenAI-compatible /embeddings endpoint.
  if (hasOpenRouter) {
    try {
      const res = await fetchWithTimeout('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://construction-manager.app',
          'X-Title': 'Construction Manager - Memory',
        },
        body: JSON.stringify({ model: EMBED_MODEL_OPENROUTER, input: cleaned }),
      }, EMBED_TIMEOUT_MS);
      if (res.ok) {
        const json = await res.json();
        const v = json.data?.[0]?.embedding;
        if (Array.isArray(v) && v.length === EMBED_DIM) return v;
      } else if (res.status !== 404 && res.status !== 405) {
        // 404/405 means the endpoint isn't available — don't spam logs.
        logger.warn(`embedText OpenRouter failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        logger.debug(`embedText OpenRouter timed out after ${EMBED_TIMEOUT_MS}ms`);
      } else {
        logger.warn('embedText OpenRouter error:', e.message);
      }
    }
  }

  // Fallback: direct OpenAI.
  if (hasOpenAI) {
    try {
      const res = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL_OPENAI, input: cleaned }),
      }, EMBED_TIMEOUT_MS);
      if (!res.ok) {
        logger.warn(`embedText OpenAI failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const json = await res.json();
      return json.data?.[0]?.embedding || null;
    } catch (e) {
      if (e.name === 'AbortError') {
        logger.debug(`embedText OpenAI timed out after ${EMBED_TIMEOUT_MS}ms`);
        return null;
      }
      logger.warn('embedText OpenAI error:', e.message);
      return null;
    }
  }
  return null;
}

async function captionImage({ base64, mimeType }) {
  if (!hasOpenRouter || !base64) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Memory',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 220,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in 1-2 sentences for future search recall. Include any visible text, names, dates, dollar amounts, brands, item types, or document type. Be specific and factual.' },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}` } },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    logger.warn('captionImage error:', e.message);
    return null;
  }
}

async function embedImage({ base64, mimeType, fallbackText }) {
  const caption = await captionImage({ base64, mimeType });
  const text = caption || fallbackText;
  const embedding = await embedText(text);
  return { caption, embedding };
}

// ============================================================
// Persist messages + attachments
// ============================================================

/**
 * Persist a single chat message + its attachments.
 *
 * @param {object} args
 * @param {string} args.sessionId
 * @param {string} args.userId
 * @param {'user'|'assistant'|'system'} args.role
 * @param {string} args.content                          plain text content
 * @param {Array}  [args.toolCalls]                      structured tool_use blocks
 * @param {Array}  [args.toolResults]                    structured tool_result blocks
 * @param {Array}  [args.attachments]                    [{ kind, base64?, storagePath?, bucket?, mimeType?, byteSize? }]
 * @param {Array}  [args.visualElements]
 * @param {Array}  [args.actions]
 * @returns {Promise<{messageId: string, attachmentIds: string[]}>}
 */
async function persistMessage({
  sessionId, userId, role, content,
  toolCalls = [], toolResults = [], attachments = [],
  visualElements = [], actions = [],
}) {
  if (!sessionId || !userId || !role) {
    throw new Error('persistMessage: sessionId, userId, role required');
  }
  const safeContent = typeof content === 'string' ? content : JSON.stringify(content || '');
  const tokenCount = Math.ceil(safeContent.length / 4);

  const insertRow = {
    session_id: sessionId,
    user_id: userId,
    role,
    content: safeContent,
    tool_calls: toolCalls,
    tool_results: toolResults,
    token_count: tokenCount,
    visual_elements: visualElements,
    actions,
  };

  // Insert FIRST without waiting for embedding. The embedding is a
  // best-effort enrichment that calls OpenRouter — if that's slow or
  // hangs, we previously blocked the entire save endpoint, which surfaced
  // as "Network request failed" on the frontend. Persist now, embed
  // async after.
  const { data: inserted, error } = await supabase
    .from('chat_messages')
    .insert(insertRow)
    .select('id')
    .single();
  if (error) {
    logger.error('persistMessage insert failed:', error.message);
    return { messageId: null, attachmentIds: [] };
  }
  const messageId = inserted.id;

  // Async embedding update — fire-and-forget. Backfill script + the
  // recall path tolerate missing embeddings (recency-based fallback).
  (async () => {
    try {
      const vec = await vectorEnabled();
      if (!vec) return;
      const embedding = await embedText(safeContent);
      if (!embedding) return;
      await supabase
        .from('chat_messages')
        .update({
          embedding,
          embedding_model: hasOpenRouter ? EMBED_MODEL_OPENROUTER : EMBED_MODEL_OPENAI,
        })
        .eq('id', messageId);
    } catch (e) {
      logger.debug('persistMessage async embed failed:', e.message);
    }
  })();

  // Bump session message_count + last_message_at — best-effort. Wrapped
  // so a failure here NEVER causes the function to return null messageId
  // when the chat_messages row was already saved successfully. Without
  // this, an exec_sql RPC error would surface as a 500 to the frontend
  // even though the message landed. The session bump is housekeeping —
  // not load-bearing.
  try {
    await supabase
      .from('chat_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', sessionId);
  } catch (e) {
    logger.debug('persistMessage session update failed (non-fatal):', e.message);
  }
  try {
    await supabase.rpc('exec_sql', {
      sql: `UPDATE chat_sessions SET message_count = COALESCE(message_count, 0) + 1 WHERE id = '${sessionId}'`,
    });
  } catch (e) {
    // exec_sql RPC may not exist in all envs — don't bother logging.
  }

  // Persist attachments
  const attachmentIds = [];
  for (const att of attachments) {
    if (!att || !att.kind) continue;
    const row = {
      message_id: messageId,
      session_id: sessionId,
      user_id: userId,
      kind: att.kind,
      bucket: att.bucket || null,
      storage_path: att.storagePath || null,
      mime_type: att.mimeType || null,
      byte_size: att.byteSize || null,
      caption: att.caption || null,
      ocr_text: att.ocrText || null,
      metadata: att.metadata || {},
    };
    // Persist the actual bytes to Storage for ANY attachment kind that ships
    // base64 (image, document, pdf, etc.) — without this, recall only ever
    // sees the caption text and the agent can't act on the file later.
    if (att.base64) {
      try {
        await ensureBucket();
        // Pick a sensible extension from MIME, falling back to kind-based default.
        const mimeExt = att.mimeType?.split('/')?.[1]?.split('+')[0];
        const fallbackExt = att.kind === 'image' ? 'jpg' : (att.mimeType === 'application/pdf' ? 'pdf' : 'bin');
        const ext = mimeExt || fallbackExt;
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const storagePath = `${userId}/${sessionId}/${filename}`;
        const bytes = Buffer.from(att.base64, 'base64');
        const contentType = att.mimeType
          || (att.kind === 'image' ? 'image/jpeg' : 'application/octet-stream');
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(storagePath, bytes, { contentType, upsert: false });
        if (!upErr) {
          row.bucket = ATTACHMENT_BUCKET;
          row.storage_path = storagePath;
          row.byte_size = bytes.byteLength;
        } else {
          logger.warn('chat-attachments upload failed:', upErr.message);
        }
      } catch (e) {
        logger.warn('chat-attachments upload exception:', e.message);
      }
    }

    // Caption + embedding strategy depends on file type.
    if (att.kind === 'image' && att.base64) {
      // Vision model captions the image, then we embed the caption text.
      const { caption, embedding } = await embedImage({
        base64: att.base64,
        mimeType: att.mimeType,
        fallbackText: att.caption || `image: ${att.mimeType || 'unknown'}`,
      });
      if (caption) row.caption = caption;
      if (vec && embedding) row.embedding = embedding;
    } else if (vec && (att.caption || att.ocrText)) {
      // Documents: embed any caption/OCR text we already have so semantic recall works.
      const embedding = await embedText(att.caption || att.ocrText);
      if (embedding) row.embedding = embedding;
    }
    const { data: a, error: aErr } = await supabase
      .from('chat_attachments')
      .insert(row)
      .select('id')
      .single();
    if (aErr) {
      logger.warn('persistMessage attachment insert failed:', aErr.message);
      continue;
    }
    attachmentIds.push(a.id);
  }

  return { messageId, attachmentIds };
}

// ============================================================
// Recall
// ============================================================

/**
 * Build the recalled context for a turn.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.sessionId
 * @param {string} args.query              the user's latest message
 * @param {number} [args.k=6]              top-K semantic matches to return
 * @param {number} [args.recentN=12]       last-N raw turns to include (verbatim, separate field)
 * @returns {Promise<{ summary, recent, semantic, userMemories }>}
 */
async function recallRelevant({ userId, sessionId, query, k = 6, recentN = 12 }) {
  const out = { summary: null, recent: [], semantic: [], userMemories: [] };

  // Rolling summary for this session
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('rolling_summary, summary_through_message_id, message_count')
    .eq('id', sessionId)
    .maybeSingle();
  out.summary = session?.rolling_summary || null;

  // Recent N raw messages (most-recent last for natural ordering)
  const { data: recent } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at, tool_calls, tool_results')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(recentN);
  out.recent = (recent || []).slice().reverse();

  // RECENT SESSION ATTACHMENTS (recency-based, not semantic).
  // The semantic vector match below only finds attachments when the user's
  // current text matches the caption embedding — but follow-ups like
  // "add it to documents" don't textually mention the file. Without this,
  // images sent earlier in the same conversation drop out of the model's
  // context entirely and the agent ends up asking the user to re-upload.
  // Fetch the last 5 attachments from this session and add them to the
  // semantic candidate pool so buildRecalledImageMessage picks them up.
  try {
    const { data: recentAtts } = await supabase
      .from('chat_attachments')
      .select('id, kind, bucket, storage_path, mime_type, caption, message_id, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentAtts && recentAtts.length > 0) {
      const signed = await Promise.all(recentAtts.map(async (a) => {
        let signed_url = null;
        if (a.bucket && a.storage_path) {
          try {
            const { data: s } = await supabase.storage
              .from(a.bucket)
              .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
            signed_url = s?.signedUrl || null;
          } catch { /* signed_url stays null — caption-only fallback */ }
        }
        return {
          kind: 'attachment',
          id: a.id,
          content: a.caption || `${a.kind}: ${a.mime_type || 'file'}`,
          metadata: { bucket: a.bucket, storage_path: a.storage_path, mime_type: a.mime_type, source: 'recent_session' },
          signed_url,
        };
      }));
      // Prepend recent attachments so they take priority in the cap.
      out.semantic.push(...signed);
    }
  } catch (e) {
    logger.warn('recent attachment recall failed:', e.message);
  }

  // Semantic recall via vector RPC
  const vec = await vectorEnabled();
  if (vec && (hasOpenRouter || hasOpenAI) && query) {
    const qEmb = await embedText(query);
    if (qEmb) {
      const { data: matches, error } = await supabase
        .rpc('match_chat_memory', { p_user_id: userId, p_query: qEmb, p_k: k });
      if (!error && Array.isArray(matches)) {
        // Don't surface items already in the recent window
        const recentIds = new Set(out.recent.map(r => r.id));
        out.semantic = matches.filter(m => !recentIds.has(m.id));
        out.userMemories = matches.filter(m => m.kind === 'user_memory');

        // Eagerly sign URLs for any image attachments we recalled so callers
        // can re-inject the actual pixels into the model's context. Falls back
        // silently if the bucket/path is missing.
        const attachmentMatches = out.semantic.filter(s => s.kind === 'attachment');
        await Promise.all(attachmentMatches.map(async (a) => {
          const bucket = a.metadata?.bucket;
          const path = a.metadata?.storage_path;
          if (!bucket || !path) return;
          try {
            const { data: signed } = await supabase.storage
              .from(bucket)
              .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
            if (signed?.signedUrl) a.signed_url = signed.signedUrl;
          } catch (e) { /* ignore — caption-only fallback */ }
        }));
      }
    }
  }

  // Fallback: pull top user_memories by recency + confidence when no vector available
  if (!out.userMemories.length) {
    const { data: ums } = await supabase
      .from('user_memories')
      .select('id, category, subject, fact, full_context, confidence, last_used_at')
      .eq('user_id', userId)
      .order('confidence', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(8);
    out.userMemories = (ums || []).map(m => ({
      kind: 'user_memory',
      id: m.id,
      content: m.full_context || m.fact,
      metadata: { category: m.category, subject: m.subject, confidence: m.confidence },
    }));
  }

  // P4: ALSO pull typed facts from user_memory_facts. Same recency +
  // confidence ordering, deduped against the legacy facts by subject
  // signature so we don't surface the same fact twice.
  try {
    const { data: tfs } = await supabase
      .from('user_memory_facts')
      .select('id, kind, subject, predicate, object, confidence, last_reinforced_at, superseded_by')
      .eq('user_id', userId)
      .is('superseded_by', null)
      .order('confidence', { ascending: false })
      .order('last_reinforced_at', { ascending: false })
      .limit(8);
    if (Array.isArray(tfs) && tfs.length) {
      // Build a dedupe set from legacy items: same subject + similar
      // text. Cheap heuristic — exact subject + first 40 chars of object.
      const seen = new Set();
      for (const m of out.userMemories) {
        const subj = m.metadata?.subject || '';
        const obj = (m.content || '').slice(0, 40).toLowerCase();
        seen.add(`${subj}::${obj}`);
      }
      const typed = [];
      for (const t of tfs) {
        const sentence = `${t.subject} ${t.predicate} ${t.object}`.trim();
        const key = `${t.subject}::${(t.object || '').slice(0, 40).toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        typed.push({
          kind: 'user_memory',
          id: t.id,
          content: sentence,
          metadata: {
            kind: t.kind, // typed kind preserved here
            subject: t.subject,
            predicate: t.predicate,
            object: t.object,
            confidence: t.confidence,
            source: 'typed',
          },
        });
      }
      // Cap merged total at 12 so the prompt insertion stays bounded.
      out.userMemories = [...out.userMemories, ...typed].slice(0, 12);
    }
  } catch (e) {
    // Never let typed-recall failures break the chat path. Legacy facts
    // already populated above; we just lose the typed augmentation for
    // this turn.
    logger.warn('[memoryService] typed fact recall failed:', e?.message);
  }

  // P11: domain-data RAG. Pull the top-K most-semantically-relevant
  // current entities (projects, clients) for the query. Complements
  // P8 (events = what happened) with current state (what IS).
  out.relevantEntities = [];
  if (vec && (hasOpenRouter || hasOpenAI) && query) {
    try {
      const { data: profileForRag } = await supabase
        .from('profiles')
        .select('id, owner_id')
        .eq('id', userId)
        .maybeSingle();
      const ownerForRag = profileForRag?.owner_id || profileForRag?.id || userId;
      const qEmb = await embedText(query);
      if (qEmb) {
        const { data: hits, error: ragErr } = await supabase
          .rpc('match_domain_search', { p_owner_id: ownerForRag, p_query: qEmb, p_k: 5 });
        if (!ragErr && Array.isArray(hits) && hits.length) {
          out.relevantEntities = hits.slice(0, 4).map(h => ({
            id: h.id,
            source_table: h.source_table,
            source_id: h.source_id,
            summary: h.summary,
            metadata: h.metadata,
            similarity: h.similarity,
          }));
        }
      }
    } catch (e) {
      logger.warn('[memoryService] domain-search recall failed:', e?.message);
    }
  }

  // P8: episodic event surfacing. Pull the top-K most-semantically-
  // relevant domain_events for this owner, embedded query against the
  // existing summary embeddings (HNSW indexed). This gives Foreman
  // associative memory across weeks — "How is Davis doing?" pulls
  // "March 14: Davis client commented on timeline" without an
  // explicit query_event_history tool call.
  //
  // The query is a single indexed vector lookup — sub-millisecond at
  // current scale. Capped at 3 surfaced events to keep the prompt
  // bounded and to leave headroom for chat memory + typed facts.
  out.episodicEvents = [];
  if (vec && (hasOpenRouter || hasOpenAI) && query) {
    try {
      // Resolve to owner_id — supervisors see their owner's events.
      // Service-role client bypasses RLS, so we filter explicitly.
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, owner_id')
        .eq('id', userId)
        .maybeSingle();
      const ownerId = profile?.owner_id || profile?.id || userId;

      // Reuse the query embedding from the chat semantic recall above
      // when present (saves a redundant embedding call), otherwise
      // generate. Most callers pass `query` so this hits the same
      // vector twice; keep cheap.
      const qEmb = await embedText(query);
      if (qEmb) {
        // No bespoke RPC for domain_events yet — do a parameterized
        // raw query via the JS client. Cosine distance on the existing
        // HNSW index. Threshold 0.3 distance ≈ 70% similarity floor
        // to avoid surfacing noise.
        const { data: events, error } = await supabase
          .rpc('match_domain_events', { p_owner_id: ownerId, p_query: qEmb, p_k: 5 });
        if (!error && Array.isArray(events) && events.length) {
          out.episodicEvents = events.slice(0, 3).map(e => ({
            id: e.id,
            event_type: e.event_type,
            summary: e.summary,
            occurred_at: e.occurred_at,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
            similarity: e.similarity,
          }));
        } else if (error && !/match_domain_events/i.test(error.message || '')) {
          // RPC doesn't exist yet (first-run before the migration is
          // applied). Soft-fall to a recency-based pull instead so we
          // still get something useful. Logged once per process; not
          // every turn.
          logger.warn('[memoryService] match_domain_events RPC missing — falling back to recent events');
          const { data: recent } = await supabase
            .from('domain_events')
            .select('id, event_type, summary, occurred_at, entity_type, entity_id')
            .eq('owner_id', ownerId)
            .not('summary', 'is', null)
            .order('occurred_at', { ascending: false })
            .limit(3);
          out.episodicEvents = (recent || []).map(e => ({
            id: e.id,
            event_type: e.event_type,
            summary: e.summary,
            occurred_at: e.occurred_at,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
          }));
        }
      }
    } catch (e) {
      // Never let episodic recall break the chat path. Empty array is
      // a fine fallback — agent just doesn't get the historical hints.
      logger.warn('[memoryService] episodic event recall failed:', e?.message);
    }
  }

  return out;
}

/**
 * Format a recall result into a compact text block to inject into the system prompt.
 */
function formatRecallForPrompt(recall) {
  if (!recall) return '';
  const parts = [];

  if (recall.userMemories?.length) {
    parts.push('## Long-term facts about this user');
    for (const m of recall.userMemories.slice(0, 12)) {
      // P4: typed facts (from user_memory_facts) carry `kind` instead
      // of `category`; legacy facts carry `category`. Render whichever
      // is present so transition is invisible to the agent.
      const tag = m.metadata?.kind
        ? `[${m.metadata.kind}] `
        : (m.metadata?.category ? `[${m.metadata.category}] ` : '');
      parts.push(`- ${tag}${m.content || m.metadata?.subject || ''}`);
    }
  }

  // P8: episodic events. Recent relevant happenings the agent should
  // know about even though the user didn't explicitly ask.
  if (recall.episodicEvents?.length) {
    parts.push('\n## Recent relevant events');
    for (const ev of recall.episodicEvents.slice(0, 3)) {
      const date = ev.occurred_at ? `[${String(ev.occurred_at).slice(0, 10)}] ` : '';
      const type = (ev.event_type || '').replace(/_/g, ' ').toLowerCase();
      parts.push(`- ${date}${type ? `(${type}) ` : ''}${(ev.summary || '').slice(0, 240)}`);
    }
  }

  // P11: relevant entities. Current state of projects / clients that
  // semantically match the user's question. Complements events
  // (history) with state (current condition).
  if (recall.relevantEntities?.length) {
    parts.push('\n## Relevant entities (current state)');
    for (const e of recall.relevantEntities.slice(0, 4)) {
      const tag = e.source_table ? `[${e.source_table}] ` : '';
      parts.push(`- ${tag}${(e.summary || '').slice(0, 280)}`);
    }
  }

  if (recall.summary) {
    parts.push('\n## Conversation summary so far');
    parts.push(recall.summary);
  }

  const semanticNonMemory = (recall.semantic || []).filter(s => s.kind !== 'user_memory');
  if (semanticNonMemory.length) {
    parts.push('\n## Possibly relevant past exchanges');
    for (const s of semanticNonMemory.slice(0, 6)) {
      const tag = s.kind === 'attachment' ? '[image/doc]' : '[past msg]';
      parts.push(`- ${tag} ${(s.content || '').slice(0, 220)}`);
    }
  }

  return parts.length ? '\n' + parts.join('\n') + '\n' : '';
}

// ============================================================
// Rolling summary
// ============================================================

async function updateRollingSummary({ sessionId, userId, force = false }) {
  if (!hasOpenRouter || !sessionId) return null;
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('rolling_summary, summary_through_message_id, message_count')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return null;
  const msgCount = session.message_count || 0;
  if (!force && msgCount < SUMMARY_EVERY_N_MESSAGES) return null;
  // Only re-summarize once we've seen ≥N new messages since the last cut
  const { data: countAtCut } = session.summary_through_message_id ? await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .lte('created_at', new Date().toISOString()) : { data: null };

  // Pull oldest unsummarized + the previous summary
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(40);
  if (!msgs || msgs.length < 6) return null;

  const transcript = msgs.map(m => `[${m.role}] ${(m.content || '').slice(0, 600)}`).join('\n');
  const prompt = `You are summarizing a conversation between a contractor (the user) and an AI assistant. Produce a concise rolling summary (under 250 words) that preserves: decisions made, projects/clients/dollar amounts mentioned, pending todos, and user preferences. Write in third person ("user did X", "assistant did Y"). Output ONLY the summary, no preamble.\n\nPrevious summary:\n${session.rolling_summary || '(none)'}\n\nNew transcript:\n${transcript}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Summary',
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        max_tokens: 350,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const summary = json.choices?.[0]?.message?.content?.trim();
    if (!summary) return null;
    const lastId = msgs[msgs.length - 1].id;
    await supabase
      .from('chat_sessions')
      .update({
        rolling_summary: summary,
        summary_through_message_id: lastId,
        summary_updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    return { summary };
  } catch (e) {
    logger.warn('updateRollingSummary error:', e.message);
    return null;
  }
}

// ============================================================
// Fact extraction
// ============================================================

const VALID_CATEGORIES = new Set([
  'client_preference','worker_skill','pricing_pattern',
  'business_rule','project_insight','correction',
]);

/**
 * P4: map the legacy `category` enum to the new `kind` taxonomy. Done
 * here instead of at the LLM so the prompt stays compact and the
 * mapping is auditable / reversible.
 */
const CATEGORY_TO_KIND = {
  client_preference: 'preference',
  worker_skill: 'fact',
  pricing_pattern: 'pattern',
  business_rule: 'rule',
  project_insight: 'fact',
  correction: 'fact',
};

async function extractUserFacts({ userId, sessionId, recentMessages }) {
  if (!hasOpenRouter || !userId || !recentMessages?.length) return { count: 0 };
  const transcript = recentMessages
    .filter(m => m.content)
    .map(m => `[${m.role}] ${(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 800)}`)
    .join('\n');

  // P4: prompt now also asks for SVO triple (predicate + object) so we
  // can write to the new typed `user_memory_facts` table. The existing
  // `fact` + `category` fields stay so the legacy `user_memories`
  // dual-write path keeps working — this is intentional during the P4
  // transition. Cost: zero — same call, just a richer schema.
  const prompt = `Extract durable, user-specific facts from the transcript below. Output a JSON array. Each fact MUST have:
{ "category": one of [client_preference, worker_skill, pricing_pattern, business_rule, project_insight, correction],
  "subject": short tag (person/project/concept this is about),
  "predicate": short verb-phrase relating subject to object (e.g. "prefers", "is_certified_for", "charges", "supersedes"),
  "object": the value/entity the predicate points at (e.g. "morning visits", "electrical work", "$200/hour", "Lana"),
  "fact": the concise fact as a single sentence (subject + predicate + object readable),
  "full_context": one full sentence usable as a prompt insertion,
  "confidence": float 0..1 }

Only extract facts that are likely useful in FUTURE conversations (preferences, decisions, recurring patterns). Skip ephemeral chitchat. Maximum 5 facts. Output JUST the JSON array, no markdown.

Transcript:
${transcript}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Memory',
      },
      body: JSON.stringify({
        model: FACT_MODEL,
        max_tokens: 500,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return { count: 0 };
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content?.trim() || '';
    // Strip optional markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    let facts;
    try { facts = JSON.parse(cleaned); } catch { return { count: 0 }; }
    if (!Array.isArray(facts)) return { count: 0 };

    let inserted = 0;
    for (const f of facts.slice(0, 5)) {
      if (!f.category || !VALID_CATEGORIES.has(f.category)) continue;
      if (!f.subject || !f.fact) continue;
      const subject = String(f.subject).slice(0, 200);
      const factStr = String(f.fact).slice(0, 1000);
      const fullContext = String(f.full_context || f.fact).slice(0, 2000);
      const confidence = Math.min(1, Math.max(0, Number(f.confidence) || 0.7));

      // Embed once; reuse for both writes.
      let embedding = null;
      const vec = await vectorEnabled();
      if (vec) {
        embedding = await embedText(fullContext);
      }

      // 1) Legacy write to user_memories (unchanged behavior).
      const legacyRow = {
        user_id: userId,
        category: f.category,
        subject,
        fact: factStr,
        full_context: fullContext,
        confidence,
        source: 'inferred',
      };
      if (embedding) legacyRow.embedding = embedding;
      const { error: legacyErr } = await supabase
        .from('user_memories')
        .upsert(legacyRow, { onConflict: 'user_id,category,subject,fact', ignoreDuplicates: false });
      if (!legacyErr) inserted++;

      // 2) P4: typed write to user_memory_facts (new table). Best-effort
      // — failures here don't roll back the legacy write since the
      // legacy table is still the source of truth during transition.
      const kind = CATEGORY_TO_KIND[f.category] || 'fact';
      const predicate = (typeof f.predicate === 'string' && f.predicate.trim())
        ? f.predicate.trim().slice(0, 120)
        : null;
      const object = (typeof f.object === 'string' && f.object.trim())
        ? f.object.trim().slice(0, 500)
        : null;
      // Only write to the new table if the LLM gave us a usable SVO
      // triple. Skipping is safer than writing a degraded row that's
      // hard to reconcile later.
      if (predicate && object) {
        const typedRow = {
          user_id: userId,
          kind,
          subject,
          predicate,
          object,
          confidence,
          source: 'extracted',
        };
        if (embedding) typedRow.embedding = embedding;
        try {
          await supabase
            .from('user_memory_facts')
            .upsert(typedRow, { onConflict: 'user_id,kind,subject,predicate,object', ignoreDuplicates: false });
        } catch (e) {
          // P4 transition: never let a typed-write failure break the
          // legacy path. Log and continue.
          logger.warn('[memoryService] typed fact upsert failed:', e?.message);
        }
      }
    }
    return { count: inserted };
  } catch (e) {
    logger.warn('extractUserFacts error:', e.message);
    return { count: 0 };
  }
}

/**
 * Fetch the most recent N attachments from this chat session and return them
 * in the SAME shape that the chat request injects into `_attachments` for
 * upload tools (base64, name, mimeType, byteSize). Lets handlers act on
 * previously-attached files without making the user re-upload.
 *
 * Caller already knows sessionId + userId; we just translate storage rows
 * back into in-memory uploadable blobs.
 */
async function fetchSessionAttachmentsForUpload(sessionId, userId, limit = 5) {
  if (!sessionId) return [];
  try {
    const { data: rows } = await supabase
      .from('chat_attachments')
      .select('id, kind, bucket, storage_path, mime_type, caption, byte_size, metadata, created_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!rows || rows.length === 0) return [];

    const out = [];
    for (const r of rows) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from(r.bucket || ATTACHMENT_BUCKET)
          .download(r.storage_path);
        if (dlErr || !blob) continue;
        const arrayBuf = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const ext = (r.mime_type?.split('/')?.[1]?.split('+')[0]) || (r.mime_type === 'application/pdf' ? 'pdf' : 'bin');
        const name = (r.caption ? r.caption.slice(0, 40).replace(/[^\w\s.-]/g, '_').trim() : `attachment-${r.id.slice(0, 8)}`) + '.' + ext;
        out.push({
          base64,
          name,
          mimeType: r.mime_type || 'application/octet-stream',
          byteSize: r.byte_size || arrayBuf.byteLength,
        });
      } catch (e) {
        logger.warn('fetchSessionAttachmentsForUpload row failed:', e.message);
      }
    }
    return out;
  } catch (e) {
    logger.warn('fetchSessionAttachmentsForUpload failed:', e.message);
    return [];
  }
}

module.exports = {
  vectorEnabled,
  hasOpenAI,
  hasOpenRouter,
  embedText,
  embedImage,
  captionImage,
  persistMessage,
  recallRelevant,
  formatRecallForPrompt,
  buildRecalledImageMessage,
  fetchSessionAttachmentsForUpload,
  updateRollingSummary,
  extractUserFacts,
  ensureBucket,
  SUMMARY_EVERY_N_MESSAGES,
  RECALLED_IMAGE_INJECT_CAP,
  ATTACHMENT_BUCKET,
};

/**
 * Build a synthetic Claude-format user message that re-injects the top-N
 * recalled image attachments (with signed URLs) so the model can actually
 * SEE them again, not just read their captions. Returns null if there are
 * no image recalls with signed URLs.
 *
 * Cap is enforced via RECALLED_IMAGE_INJECT_CAP to avoid context blowout
 * (~1500 vision tokens per Claude image). Captions are interleaved as text
 * blocks so the model has both pixels and a textual hook for grounding.
 */
function buildRecalledImageMessage(recall) {
  if (!recall?.semantic?.length) return null;
  // Dedupe by id — same attachment can show up in both recency and semantic pools.
  const seen = new Set();
  const recalled = [];
  for (const s of recall.semantic) {
    if (s.kind !== 'attachment' || !s.signed_url) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    recalled.push(s);
    if (recalled.length >= RECALLED_IMAGE_INJECT_CAP) break;
  }
  if (recalled.length === 0) return null;

  // Split: images go in as vision blocks (Claude sees pixels). Documents/PDFs
  // go in as text references with the signed URL — the agent can pass that
  // URL to upload tools (upload_project_document etc.) to attach the file
  // without asking the user to re-upload.
  const isImageMime = (mt = '') => /^image\//i.test(mt);
  const images = recalled.filter(r => r.kind === 'attachment' && (r.metadata?.mime_type ? isImageMime(r.metadata.mime_type) : true) && (!r.metadata?.mime_type || isImageMime(r.metadata.mime_type)));
  const docs   = recalled.filter(r => r.metadata?.mime_type && !isImageMime(r.metadata.mime_type));

  const blocks = [
    { type: 'text', text: `The following ${recalled.length === 1 ? 'file is' : `${recalled.length} files are`} from earlier in this conversation. They ARE STILL AVAILABLE — DO NOT ask the user to re-upload. To attach a file to a project / daily report / document store, pass its signed URL (shown below) to the appropriate upload tool.` },
  ];

  for (const img of images) {
    blocks.push({ type: 'image_url', image_url: { url: img.signed_url } });
    if (img.content) blocks.push({ type: 'text', text: `(Caption: ${img.content})` });
  }

  if (docs.length > 0) {
    const docLines = docs.map((d, i) => {
      const mt   = d.metadata?.mime_type || 'unknown';
      const cap  = (d.content || '').slice(0, 240);
      return `Document ${i + 1} (${mt})${cap ? ` — ${cap}` : ''}\n  signed_url: ${d.signed_url}`;
    });
    blocks.push({
      type: 'text',
      text: `Available documents (use the signed_url to upload/attach):\n${docLines.join('\n')}`,
    });
  }

  return { role: 'user', content: blocks };
}
