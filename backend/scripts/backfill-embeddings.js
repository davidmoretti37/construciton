#!/usr/bin/env node
/**
 * One-shot backfill: embed every chat_messages row that has content but no
 * embedding. Idempotent — re-running just picks up whatever's still missing.
 *
 * Cost: 1 OpenRouter embedding call per message at $0.02 / 1M input tokens
 * (text-embedding-3-small). At ~50 tokens/message average, 1000 messages
 * costs roughly $0.001 — negligible.
 *
 * Usage:
 *   node backend/scripts/backfill-embeddings.js [--limit 1000] [--user <uuid>]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { embedText } = require('../src/services/memory/memoryService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function flag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const LIMIT = parseInt(flag('limit', '5000'), 10);
const USER = flag('user', null);
const BATCH = 50;
const CONCURRENCY = 5;

async function main() {
  let q = supabase
    .from('chat_messages')
    .select('id, content, user_id')
    .is('embedding', null)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (USER) q = q.eq('user_id', USER);
  const { data: rows, error } = await q;
  if (error) { console.error(error); process.exit(1); }
  if (!rows || rows.length === 0) { console.log('Nothing to backfill.'); return; }

  console.log(`▶ Backfilling ${rows.length} messages (concurrency=${CONCURRENCY})…`);
  let done = 0, embedded = 0, skipped = 0, failed = 0;
  const t0 = Date.now();

  // Tiny worker pool — one OpenRouter call per row, up to CONCURRENCY in flight.
  const queue = [...rows];
  let active = 0;
  await new Promise(resolve => {
    function pump() {
      while (active < CONCURRENCY && queue.length > 0) {
        const row = queue.shift();
        active++;
        (async () => {
          try {
            const text = (row.content || '').trim();
            if (!text || text.length < 4) { skipped++; return; }
            const v = await embedText(text);
            if (!Array.isArray(v) || v.length !== 1536) { failed++; return; }
            const { error } = await supabase
              .from('chat_messages')
              .update({ embedding: v, embedding_model: 'openai/text-embedding-3-small' })
              .eq('id', row.id);
            if (error) { failed++; return; }
            embedded++;
          } finally {
            done++;
            active--;
            if (done % BATCH === 0) {
              const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1);
              console.log(`  ${done}/${rows.length} done — embedded=${embedded} failed=${failed} skipped=${skipped} (${rate}/s)`);
            }
            if (queue.length === 0 && active === 0) resolve();
            else pump();
          }
        })();
      }
    }
    pump();
  });

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n▶ Done in ${dur}s: embedded=${embedded} failed=${failed} skipped=${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
