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
const RECALLED_IMAGE_INJECT_CAP = 2;          // max images re-injected per turn

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
async function embedText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim().slice(0, 8000);
  if (!cleaned) return null;

  // Primary: OpenRouter's OpenAI-compatible /embeddings endpoint.
  if (hasOpenRouter) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://construction-manager.app',
          'X-Title': 'Construction Manager - Memory',
        },
        body: JSON.stringify({ model: EMBED_MODEL_OPENROUTER, input: cleaned }),
      });
      if (res.ok) {
        const json = await res.json();
        const v = json.data?.[0]?.embedding;
        if (Array.isArray(v) && v.length === EMBED_DIM) return v;
      } else if (res.status !== 404 && res.status !== 405) {
        // 404/405 means the endpoint isn't available — don't spam logs.
        logger.warn(`embedText OpenRouter failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
    } catch (e) {
      logger.warn('embedText OpenRouter error:', e.message);
    }
  }

  // Fallback: direct OpenAI.
  if (hasOpenAI) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBED_MODEL_OPENAI, input: cleaned }),
      });
      if (!res.ok) {
        logger.warn(`embedText OpenAI failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const json = await res.json();
      return json.data?.[0]?.embedding || null;
    } catch (e) {
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

  // Embed the message content (best-effort)
  const vec = await vectorEnabled();
  if (vec) {
    const embedding = await embedText(safeContent);
    if (embedding) {
      insertRow.embedding = embedding;
      insertRow.embedding_model = hasOpenRouter ? EMBED_MODEL_OPENROUTER : EMBED_MODEL_OPENAI;
    }
  }

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

  // Bump session message_count + last_message_at (best-effort)
  await supabase
    .from('chat_sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', sessionId);
  await supabase.rpc('exec_sql', {
    sql: `UPDATE chat_sessions SET message_count = COALESCE(message_count, 0) + 1 WHERE id = '${sessionId}'`,
  }).catch(() => {});

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
    // Compute caption + embedding for images (best-effort)
    if (att.kind === 'image' && att.base64) {
      // Persist the actual bytes to Storage so we can re-inject the image into
      // future turns via a signed URL. Without this, recall only ever sees the
      // caption text and the model can't actually look at the photo again.
      try {
        await ensureBucket();
        const ext = (att.mimeType?.split('/')?.[1] || 'jpg').split('+')[0];
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const storagePath = `${userId}/${sessionId}/${filename}`;
        const bytes = Buffer.from(att.base64, 'base64');
        const { error: upErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(storagePath, bytes, {
            contentType: att.mimeType || 'image/jpeg',
            upsert: false,
          });
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

      const { caption, embedding } = await embedImage({
        base64: att.base64,
        mimeType: att.mimeType,
        fallbackText: att.caption || `image: ${att.mimeType || 'unknown'}`,
      });
      if (caption) row.caption = caption;
      if (vec && embedding) row.embedding = embedding;
    } else if (vec && (att.caption || att.ocrText)) {
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
    for (const m of recall.userMemories.slice(0, 8)) {
      const cat = m.metadata?.category ? `[${m.metadata.category}] ` : '';
      parts.push(`- ${cat}${m.content || m.metadata?.subject || ''}`);
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

async function extractUserFacts({ userId, sessionId, recentMessages }) {
  if (!hasOpenRouter || !userId || !recentMessages?.length) return { count: 0 };
  const transcript = recentMessages
    .filter(m => m.content)
    .map(m => `[${m.role}] ${(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 800)}`)
    .join('\n');

  const prompt = `Extract durable, user-specific facts from the transcript below. Output a JSON array. Each fact MUST have:
{ "category": one of [client_preference, worker_skill, pricing_pattern, business_rule, project_insight, correction],
  "subject": short tag (person/project/concept this is about),
  "fact": the concise fact (1 sentence),
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
      const row = {
        user_id: userId,
        category: f.category,
        subject: String(f.subject).slice(0, 200),
        fact: String(f.fact).slice(0, 1000),
        full_context: String(f.full_context || f.fact).slice(0, 2000),
        confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.7)),
        source: 'inferred',
      };
      const vec = await vectorEnabled();
      if (vec) {
        const e = await embedText(row.full_context);
        if (e) row.embedding = e;
      }
      const { error } = await supabase
        .from('user_memories')
        .upsert(row, { onConflict: 'user_id,category,subject,fact', ignoreDuplicates: false });
      if (!error) inserted++;
    }
    return { count: inserted };
  } catch (e) {
    logger.warn('extractUserFacts error:', e.message);
    return { count: 0 };
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
  const images = recall.semantic
    .filter((s) => s.kind === 'attachment' && s.signed_url)
    .slice(0, RECALLED_IMAGE_INJECT_CAP);
  if (images.length === 0) return null;

  const blocks = [
    { type: 'text', text: `Below ${images.length === 1 ? 'is an image' : `are ${images.length} images`} from earlier in this user's conversation history. Use them as visual context if relevant to their current question.` },
  ];
  for (const img of images) {
    blocks.push({ type: 'image_url', image_url: { url: img.signed_url } });
    if (img.content) {
      blocks.push({ type: 'text', text: `(Caption: ${img.content})` });
    }
  }
  return { role: 'user', content: blocks };
}
