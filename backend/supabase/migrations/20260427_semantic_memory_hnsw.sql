-- Semantic memory HNSW indexes.
-- pgvector is already enabled (chat_messages.embedding is vector(1536),
-- user_memories.embedding is vector(1536)) and the match_chat_memory
-- RPC already exists. What was missing was the index — without it,
-- cosine search degrades to a sequential scan.
--
-- HNSW gives sub-linear search at the cost of ~2× build time vs IVFFlat.
-- For our scale (514 messages today, growing) HNSW is the right choice
-- because it doesn't need re-clustering as data grows.

CREATE INDEX IF NOT EXISTS idx_chat_messages_embedding_hnsw
  ON public.chat_messages USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_user_memories_embedding_hnsw
  ON public.user_memories USING hnsw (embedding vector_cosine_ops);

-- Fast filtered scans on per-user retrieval before vector compare.
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_with_embedding
  ON public.chat_messages (user_id, created_at DESC)
  WHERE embedding IS NOT NULL;

NOTIFY pgrst, 'reload schema';
