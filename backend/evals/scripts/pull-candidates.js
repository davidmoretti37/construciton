#!/usr/bin/env node
/**
 * Pull recent production conversations from chat_messages and emit a draft
 * JSONL of candidate eval cases. Each line is a {prompt, ground_truth, ...}
 * record I (or future Claude Code sessions) hand-label by editing the file
 * and moving it to dataset.jsonl.
 *
 * Usage:
 *   node backend/evals/scripts/pull-candidates.js [--limit 30] [--out path]
 *
 * The script samples broadly across sessions (not the 87-message power-user
 * session) so the dataset reflects real usage diversity.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const LIMIT = parseInt(flag('limit', '30'), 10);
const OUT = flag('out', path.join(__dirname, '..', 'dataset.draft.jsonl'));

// Loose categorisation by keyword. The labeler tightens these by hand.
function inferCategory(content) {
  const c = (content || '').toLowerCase();
  if (/^(create|new|start|add).*(project|job|estimate|invoice)/i.test(content)) {
    return 'project_creation';
  }
  if (/\?/.test(content) || /(what|how|when|why|which|where)/i.test(c)) {
    return 'question_or_query';
  }
  if (c.length < 12) return 'edge_case_short';
  if (/(assign|put|move).*(to|on)/i.test(c)) return 'assignment';
  if (/(expense|cost|budget|payment|invoice)/i.test(c)) return 'financial';
  if (/(schedule|reschedule|move|push)/i.test(c)) return 'scheduling';
  return 'general';
}

async function main() {
  // Pull user-role messages with a non-empty content, sample diverse sessions.
  // We bias toward shorter lead-in messages (turn 1 of a session) where the
  // user is asking for something concrete — those are the most useful evals.
  const { data: rows, error } = await supabase
    .from('chat_messages')
    .select('id, session_id, role, content, tool_calls, created_at')
    .eq('role', 'user')
    .not('content', 'is', null)
    .gte('created_at', new Date(Date.now() - 90 * 86400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('pull failed:', error);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.error('no chat_messages found');
    process.exit(1);
  }

  // Spread across sessions: max 2 per session so the dataset isn't dominated
  // by one power user.
  const perSession = new Map();
  const candidates = [];
  for (const r of rows) {
    const count = perSession.get(r.session_id) || 0;
    if (count >= 2) continue;
    perSession.set(r.session_id, count + 1);
    candidates.push(r);
    if (candidates.length >= LIMIT * 3) break; // oversample, narrow below
  }

  // Pull the immediate next assistant message (with its tool_calls) as
  // ground-truth — this is what the agent actually did. The labeler decides
  // whether that was correct.
  const ids = candidates.map(c => c.id);
  const sessionIds = [...new Set(candidates.map(c => c.session_id))];
  const { data: nextRows } = await supabase
    .from('chat_messages')
    .select('session_id, role, content, tool_calls, created_at')
    .in('session_id', sessionIds)
    .eq('role', 'assistant')
    .order('created_at', { ascending: true });

  const nextBySession = new Map();
  for (const r of nextRows || []) {
    if (!nextBySession.has(r.session_id)) nextBySession.set(r.session_id, []);
    nextBySession.get(r.session_id).push(r);
  }

  // Diversify by category + session, take LIMIT total.
  const byCategory = new Map();
  for (const c of candidates) {
    const cat = inferCategory(c.content);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(c);
  }

  // Round-robin through categories so we hit the full distribution.
  const categories = [...byCategory.keys()];
  const picked = [];
  while (picked.length < LIMIT && categories.some(k => byCategory.get(k).length > 0)) {
    for (const cat of categories) {
      if (picked.length >= LIMIT) break;
      const bucket = byCategory.get(cat);
      if (bucket.length === 0) continue;
      picked.push(bucket.shift());
    }
  }

  // Build draft records. The "expected" block is intentionally empty — the
  // labeler fills it in.
  const records = picked.map((c, i) => {
    const successors = nextBySession.get(c.session_id) || [];
    const next = successors.find(r => new Date(r.created_at) > new Date(c.created_at));
    const observedToolCalls = next?.tool_calls || null;
    return {
      test_id: `seed_${String(i + 1).padStart(3, '0')}`,
      category: inferCategory(c.content),
      prompt: c.content.trim(),
      // What the live agent did at the time, captured from production logs.
      // Treat as a *hint*, not ground truth — labeler decides if it was right.
      observed_response: (next?.content || '').slice(0, 500),
      observed_tool_calls: observedToolCalls,
      // === FILL IN BY HAND ===
      expected: {
        // 'must_call' | 'must_not_call' | 'must_ask' | 'free_form'
        kind: 'TODO',
        // For must_call: the tool name + required arg keys. For must_not_call:
        // a list of forbidden tools (e.g. destructive ones). For must_ask: a
        // substring that must appear in the response.
        tool_name: null,
        forbidden_tools: null,
        must_contain: null,
      },
      _meta: {
        session_id: c.session_id,
        original_message_id: c.id,
        created_at: c.created_at,
      },
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(OUT, lines);
  console.log(`Wrote ${records.length} draft cases → ${OUT}`);
  console.log('Categories:', [...byCategory.keys()].map(k => `${k}=${(byCategory.get(k)?.length || 0) + records.filter(r => r.category === k).length}`).join(', '));
  console.log('\nNext: open the file, hand-label each case (set expected.kind etc.), then move to dataset.jsonl.');
}

main().catch(err => {
  console.error('pull-candidates fatal:', err);
  process.exit(1);
});
