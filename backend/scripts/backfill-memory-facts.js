#!/usr/bin/env node
/**
 * P4 backfill — migrate existing rows from `user_memories` (legacy
 * single-fact-string format) into `user_memory_facts` (typed SVO triples).
 *
 * SAFE BY DEFAULT: dry-run prints proposed inserts and exits. Pass
 * --apply to actually write. Pass --user <uuid> to scope to one user.
 *
 * What it does:
 *   1. Pulls all `user_memories` rows missing a typed counterpart.
 *   2. For each, calls Haiku to parse the fact string into a {predicate,
 *      object} pair given the existing subject + category.
 *   3. Maps category -> kind via the same table the memoryService uses.
 *   4. Upserts into `user_memory_facts` (UNIQUE(user_id, kind, subject,
 *      predicate, object) prevents duplicates on re-runs).
 *
 * Cost: one Haiku call per legacy row. At ~50 input + ~50 output tokens
 * per call and Haiku at $0.80 in / $4.00 out per 1M tokens, that's
 * roughly $0.0002/row. 1000 legacy facts ≈ $0.20.
 *
 * Reversibility: never touches `user_memories`. To roll back, just:
 *   DELETE FROM user_memory_facts WHERE source = 'backfilled';
 * The legacy table is unaffected.
 *
 * Usage:
 *   node backend/scripts/backfill-memory-facts.js                # dry run
 *   node backend/scripts/backfill-memory-facts.js --apply        # commit
 *   node backend/scripts/backfill-memory-facts.js --user <uuid>  # scope
 *   node backend/scripts/backfill-memory-facts.js --apply --limit 50
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { embedText, vectorEnabled } = require('../src/services/memory/memoryService');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function flag(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const LIMIT = parseInt(flag('limit', '5000'), 10);
const USER = flag('user', null);
const MODEL = 'anthropic/claude-haiku-4.5';
const SLEEP_MS = 80; // gentle pacing — Haiku rate-limits at ~50 rps

const CATEGORY_TO_KIND = {
  client_preference: 'preference',
  worker_skill: 'fact',
  pricing_pattern: 'pattern',
  business_rule: 'rule',
  project_insight: 'fact',
  correction: 'fact',
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Ask Haiku to parse a legacy fact into a {predicate, object} pair given
 * the subject + category. Returns null on parse failure (caller skips).
 */
async function classifyFact({ subject, category, fact, fullContext }) {
  const prompt = `You are migrating a memory fact from a legacy schema to a Subject-Predicate-Object triple format.

GIVEN:
  category: ${category}
  subject: ${subject}
  fact: ${fact}
  context: ${fullContext || ''}

Return ONLY this JSON: {"predicate": "<short verb phrase>", "object": "<the value/entity>"}

Examples:
  fact: "Smith family prefers morning visits"
  → {"predicate": "prefers", "object": "morning visits"}

  fact: "Jose is certified for electrical work"
  → {"predicate": "is_certified_for", "object": "electrical work"}

  fact: "always invoice net-30"
  → {"predicate": "default_terms", "object": "net-30"}

If the fact doesn't decompose cleanly into an SVO triple, return {"predicate": null, "object": null}.`;

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.warn(`[classify] HTTP ${resp.status}, skipping fact`);
      return null;
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.predicate || !parsed.object) return null;
    return {
      predicate: String(parsed.predicate).slice(0, 120),
      object: String(parsed.object).slice(0, 500),
    };
  } catch (e) {
    console.warn(`[classify] error: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log(`P4 memory-facts backfill — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  user filter: ${USER || '(all users)'}`);
  console.log(`  limit: ${LIMIT}`);

  // Pull legacy rows. We left-join to user_memory_facts to skip rows
  // that already have a typed counterpart for the same subject — cheaper
  // than doing it row-by-row.
  let q = supabase
    .from('user_memories')
    .select('id, user_id, category, subject, fact, full_context, confidence, embedding, created_at')
    .order('confidence', { ascending: false })
    .limit(LIMIT);
  if (USER) q = q.eq('user_id', USER);
  const { data: rows, error } = await q;
  if (error) {
    console.error('Failed to fetch legacy rows:', error.message);
    process.exit(1);
  }
  console.log(`  fetched: ${rows?.length || 0} legacy rows`);

  if (!rows?.length) {
    console.log('Nothing to backfill.');
    process.exit(0);
  }

  let classified = 0;
  let skippedExisting = 0;
  let skippedUnclassifiable = 0;
  let written = 0;

  for (const row of rows) {
    if (!row.user_id || !row.subject || !row.fact || !row.category) {
      skippedUnclassifiable++;
      continue;
    }

    // Classify first, THEN check for duplicates by exact triple. The
    // earlier version skipped any row whose subject existed, which was
    // way too aggressive — meant the FIRST fact about "Smith Bathroom
    // Remodel" got written but the next 10 facts about the same subject
    // got dropped as "existing". Now we only skip true exact duplicates.
    const triple = await classifyFact({
      subject: row.subject,
      category: row.category,
      fact: row.fact,
      fullContext: row.full_context,
    });
    classified++;
    await sleep(SLEEP_MS);

    if (!triple) {
      skippedUnclassifiable++;
      if (VERBOSE) console.log(`  ⊘ skip "${row.fact}" — couldn't decompose to SVO`);
      continue;
    }

    const kind = CATEGORY_TO_KIND[row.category] || 'fact';

    // Now check by EXACT triple (kind, subject, predicate, object) —
    // matches the UNIQUE constraint on user_memory_facts. If an exact
    // duplicate exists, skip without re-upserting (saves a DB write).
    {
      const { data: existing } = await supabase
        .from('user_memory_facts')
        .select('id')
        .eq('user_id', row.user_id)
        .eq('kind', kind)
        .eq('subject', row.subject)
        .eq('predicate', triple.predicate)
        .eq('object', triple.object)
        .limit(1);
      if (existing?.length) {
        skippedExisting++;
        if (VERBOSE) console.log(`  ⊘ skip exact dup: ${row.subject} ${triple.predicate} ${triple.object}`);
        continue;
      }
    }
    const proposed = {
      user_id: row.user_id,
      kind,
      subject: row.subject,
      predicate: triple.predicate,
      object: triple.object,
      confidence: row.confidence ?? 0.7,
      source: 'backfilled',
      embedding: row.embedding || null,
    };

    if (APPLY) {
      try {
        const { error: upErr } = await supabase
          .from('user_memory_facts')
          .upsert(proposed, { onConflict: 'user_id,kind,subject,predicate,object', ignoreDuplicates: false });
        if (upErr) {
          console.warn(`  ✗ upsert failed for ${row.subject}: ${upErr.message}`);
        } else {
          written++;
          if (VERBOSE) console.log(`  ✓ ${kind} ${row.subject} ${triple.predicate} ${triple.object}`);
        }
      } catch (e) {
        console.warn(`  ✗ upsert threw for ${row.subject}: ${e.message}`);
      }
    } else {
      console.log(`  → ${kind.padEnd(22)} ${row.subject} ${triple.predicate} ${triple.object}`);
      written++;
    }
  }

  console.log('\nDone.');
  console.log(`  classified by Haiku:  ${classified}`);
  console.log(`  skipped (existing):    ${skippedExisting}`);
  console.log(`  skipped (no SVO):      ${skippedUnclassifiable}`);
  console.log(`  ${APPLY ? 'written to DB' : 'would write'}:        ${written}`);
  if (!APPLY) {
    console.log('\nRe-run with --apply to commit.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
