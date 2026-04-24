-- =====================================================
-- Persistent Multimodal AI Chat Memory
-- Created: 2026-04-25
-- Purpose: Cross-conversation semantic recall + multimodal attachment memory
--
-- Adds:
--   1. embedding (when vector ext present) / tool_calls / tool_results / token_count on chat_messages
--   2. rolling_summary on chat_sessions
--   3. chat_attachments table for image/document persistence
--   4. source_message_id / expires_at on user_memories
--   5. match_chat_memory() RPC for semantic recall (when vector ext present)
--
-- pgvector NOTE: enabling the extension requires Supabase admin (Dashboard, Database,
-- Extensions, vector). This migration is structured so the non-vector pieces apply
-- regardless. Vector columns + HNSW indexes are added conditionally via DO blocks.
-- Apply this migration once normally then re-run after enabling vector for semantic layer.
-- =====================================================

-- ============================================================
-- 1. chat_messages — structured tool data + token tracking
-- ============================================================

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tool_calls       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tool_results     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS token_count      INT,
  ADD COLUMN IF NOT EXISTS embedding_model  TEXT;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS chat_messages_embedding_hnsw ON chat_messages USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
  ELSE
    RAISE NOTICE 'pgvector not enabled — chat_messages.embedding column skipped. Enable in Supabase Dashboard then re-run.';
  END IF;
END $outer$;

-- ============================================================
-- 2. chat_sessions — rolling summary
-- ============================================================

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS rolling_summary             TEXT,
  ADD COLUMN IF NOT EXISTS summary_through_message_id  UUID,
  ADD COLUMN IF NOT EXISTS summary_updated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS message_count               INT DEFAULT 0;

-- ============================================================
-- 3. chat_attachments — image + document persistence
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('image','document')),
  bucket       TEXT,
  storage_path TEXT,
  mime_type    TEXT,
  byte_size    BIGINT,
  caption      TEXT,
  ocr_text     TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_user
  ON chat_attachments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message
  ON chat_attachments(message_id);

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS chat_attachments_embedding_hnsw ON chat_attachments USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
  END IF;
END $outer$;

ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own attachments select" ON chat_attachments;
DROP POLICY IF EXISTS "own attachments insert" ON chat_attachments;
DROP POLICY IF EXISTS "own attachments update" ON chat_attachments;
DROP POLICY IF EXISTS "own attachments delete" ON chat_attachments;

CREATE POLICY "own attachments select" ON chat_attachments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own attachments insert" ON chat_attachments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own attachments update" ON chat_attachments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own attachments delete" ON chat_attachments
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. user_memories — provenance + decay (vector when ext present)
-- ============================================================

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS source_message_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS user_memories_embedding_hnsw ON user_memories USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
  END IF;
END $outer$;

-- ============================================================
-- 5. Semantic-recall RPC (only when vector extension is present)
-- ============================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.match_chat_memory(
        p_user_id UUID,
        p_query   vector(1536),
        p_k       INT DEFAULT 6
      ) RETURNS TABLE(
        kind        TEXT,
        id          UUID,
        content     TEXT,
        score       FLOAT,
        created_at  TIMESTAMPTZ,
        metadata    JSONB
      )
      LANGUAGE sql STABLE
      AS $body$
        (
          SELECT
            'message'::TEXT       AS kind,
            m.id                  AS id,
            LEFT(COALESCE(m.content, ''), 800) AS content,
            1 - (m.embedding <=> p_query) AS score,
            m.created_at          AS created_at,
            jsonb_build_object('role', m.role, 'session_id', m.session_id) AS metadata
          FROM chat_messages m
          WHERE m.user_id = p_user_id AND m.embedding IS NOT NULL
          ORDER BY m.embedding <=> p_query
          LIMIT p_k
        )
        UNION ALL
        (
          SELECT
            'attachment'::TEXT    AS kind,
            a.id                  AS id,
            LEFT(COALESCE(a.caption, a.ocr_text, ''), 800) AS content,
            1 - (a.embedding <=> p_query) AS score,
            a.created_at          AS created_at,
            jsonb_build_object(
              'kind', a.kind, 'mime_type', a.mime_type,
              'storage_path', a.storage_path, 'bucket', a.bucket,
              'message_id', a.message_id
            ) AS metadata
          FROM chat_attachments a
          WHERE a.user_id = p_user_id AND a.embedding IS NOT NULL
          ORDER BY a.embedding <=> p_query
          LIMIT p_k
        )
        UNION ALL
        (
          SELECT
            'user_memory'::TEXT   AS kind,
            um.id                 AS id,
            COALESCE(um.full_context, um.fact) AS content,
            1 - (um.embedding <=> p_query) AS score,
            um.created_at         AS created_at,
            jsonb_build_object(
              'category', um.category, 'subject', um.subject,
              'confidence', um.confidence
            ) AS metadata
          FROM user_memories um
          WHERE um.user_id = p_user_id AND um.embedding IS NOT NULL
          ORDER BY um.embedding <=> p_query
          LIMIT p_k
        )
        ORDER BY score DESC
        LIMIT p_k;
      $body$;
    $func$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.match_chat_memory(UUID, vector, INT) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.match_chat_memory(UUID, vector, INT) TO authenticated, service_role';
  END IF;
END $outer$;

-- ============================================================
-- 6. Refresh planner stats
-- ============================================================

ANALYZE chat_messages;
ANALYZE chat_sessions;
ANALYZE chat_attachments;
ANALYZE user_memories;
