#!/usr/bin/env node
/**
 * P9 — patterns cron.
 *
 * Computes business-level patterns from each user's data and stores
 * them as `kind='pattern'` rows in `user_memory_facts`. Run nightly
 * (or on demand). Foreman recalls these the same way it recalls any
 * typed fact, so it can say things like "your bathrooms average 38%
 * margin" without recomputing on the fly.
 *
 * What patterns we compute (per owner):
 *   - avg_project_margin              — across closed/active projects
 *   - typical_project_duration_days   — date_end - date_start, mean
 *   - avg_invoice_payment_days        — created_at → paid_at
 *   - busiest_clock_in_day_of_week    — from time_tracking
 *   - top_expense_category            — from transactions, by total
 *   - active_workers_count            — current crew size
 *   - recurring_revenue_share         — service-plan revenue / total revenue
 *
 * Each one becomes a typed fact with:
 *   kind:      'pattern'
 *   subject:   'business'
 *   predicate: e.g. 'avg_project_margin' / 'busiest_day' / 'top_expense_category'
 *   object:    the value (e.g. '38%', 'Tuesday', 'Materials')
 *   confidence: derived from sample size
 *   source:    'pattern_computed'
 *   embedding: text-embedding-3-small over a natural-language sentence
 *
 * Usage:
 *   node backend/scripts/compute-patterns.js               # all owners
 *   node backend/scripts/compute-patterns.js --user <uuid> # one owner
 *   node backend/scripts/compute-patterns.js --dry         # print, don't write
 *
 * Cron: schedule via Supabase pg_cron OR Railway cron OR a daily GitHub
 * Action that calls this script. Cost is minimal — pure SQL aggregations
 * + ~7 embeddings per owner = ~$0.001/owner/run.
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
const DRY = process.argv.includes('--dry');
const ONE_USER = flag('user', null);

// ─────────────────────────────────────────────────────────────────
// Pattern computation — pure SQL aggregations.
// ─────────────────────────────────────────────────────────────────

/** Return the list of owner_ids to process. */
async function listOwners() {
  if (ONE_USER) return [ONE_USER];
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'owner')
    .is('owner_id', null); // owners only — supervisors share their owner's facts
  return (data || []).map(p => p.id);
}

/** All pattern computers — return null when there's not enough data. */
async function computeAvgProjectMargin(ownerId) {
  const { data } = await supabase
    .from('projects')
    .select('id, contract_amount, total_spent')
    .eq('user_id', ownerId)
    .gt('contract_amount', 0);
  if (!data?.length) return null;
  const margins = data
    .filter(p => Number.isFinite(Number(p.contract_amount)) && Number.isFinite(Number(p.total_spent)))
    .map(p => 1 - (Number(p.total_spent) / Number(p.contract_amount)))
    .filter(m => Number.isFinite(m) && m > -2 && m < 2); // sanity bounds
  if (margins.length < 2) return null;
  const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
  return {
    predicate: 'avg_project_margin',
    object: `${(mean * 100).toFixed(0)}%`,
    sentence: `This business's average project margin is ${(mean * 100).toFixed(0)}% across ${margins.length} projects.`,
    confidence: Math.min(0.95, 0.5 + margins.length * 0.05),
  };
}

async function computeTypicalProjectDuration(ownerId) {
  const { data } = await supabase
    .from('projects')
    .select('start_date, end_date')
    .eq('user_id', ownerId)
    .not('start_date', 'is', null)
    .not('end_date', 'is', null);
  if (!data?.length) return null;
  const days = data
    .map(p => (new Date(p.end_date) - new Date(p.start_date)) / (1000 * 60 * 60 * 24))
    .filter(d => Number.isFinite(d) && d > 0 && d < 365 * 3);
  if (days.length < 2) return null;
  const mean = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  return {
    predicate: 'typical_project_duration_days',
    object: `${mean} days`,
    sentence: `Typical project duration is ${mean} days based on ${days.length} projects.`,
    confidence: Math.min(0.9, 0.5 + days.length * 0.05),
  };
}

async function computeAvgInvoicePaymentDays(ownerId) {
  const { data } = await supabase
    .from('invoices')
    .select('created_at, paid_at, status')
    .eq('user_id', ownerId)
    .eq('status', 'paid')
    .not('paid_at', 'is', null);
  if (!data?.length) return null;
  const days = data
    .map(i => (new Date(i.paid_at) - new Date(i.created_at)) / (1000 * 60 * 60 * 24))
    .filter(d => Number.isFinite(d) && d >= 0 && d < 365);
  if (days.length < 2) return null;
  const mean = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  return {
    predicate: 'avg_invoice_payment_days',
    object: `${mean} days`,
    sentence: `Clients pay invoices in ${mean} days on average across ${days.length} paid invoices.`,
    confidence: Math.min(0.95, 0.5 + days.length * 0.04),
  };
}

async function computeBusiestClockInDay(ownerId) {
  const { data } = await supabase
    .from('time_tracking')
    .select('clock_in, worker_id, workers!inner(owner_id)')
    .eq('workers.owner_id', ownerId);
  if (!data?.length || data.length < 10) return null;
  const counts = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
  for (const row of data) {
    if (!row.clock_in) continue;
    const d = new Date(row.clock_in);
    if (Number.isFinite(d.getTime())) counts[d.getDay()] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const max = Math.max(...counts);
  const idx = counts.indexOf(max);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ratio = max / (total / 7);
  return {
    predicate: 'busiest_clock_in_day',
    object: `${days[idx]} (${ratio.toFixed(1)}x average)`,
    sentence: `${days[idx]} is the busiest clock-in day at ${ratio.toFixed(1)}x the daily average.`,
    confidence: Math.min(0.9, 0.5 + Math.log10(total) * 0.1),
  };
}

async function computeTopExpenseCategory(ownerId) {
  const { data } = await supabase
    .from('transactions')
    .select('category, amount, type')
    .eq('user_id', ownerId)
    .eq('type', 'expense');
  if (!data?.length) return null;
  const totals = {};
  for (const t of data) {
    const cat = t.category || 'misc';
    totals[cat] = (totals[cat] || 0) + Number(t.amount || 0);
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  const [topCat, topAmt] = sorted[0];
  const total = sorted.reduce((a, [, v]) => a + v, 0);
  if (total === 0) return null;
  const pct = ((topAmt / total) * 100).toFixed(0);
  return {
    predicate: 'top_expense_category',
    object: `${topCat} (${pct}% of expenses)`,
    sentence: `Top expense category is ${topCat} at ${pct}% of total spend across ${data.length} transactions.`,
    confidence: 0.85,
  };
}

async function computeActiveWorkers(ownerId) {
  const { count } = await supabase
    .from('workers')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('is_active', true);
  if (count == null) return null;
  return {
    predicate: 'active_worker_count',
    object: `${count} workers`,
    sentence: `Active crew size: ${count} workers.`,
    confidence: 1.0,
  };
}

const COMPUTERS = [
  computeAvgProjectMargin,
  computeTypicalProjectDuration,
  computeAvgInvoicePaymentDays,
  computeBusiestClockInDay,
  computeTopExpenseCategory,
  computeActiveWorkers,
];

async function processOwner(ownerId) {
  console.log(`[patterns] processing owner ${ownerId.slice(0, 8)}…`);
  const vec = await vectorEnabled();

  let written = 0;
  let computed = 0;
  for (const fn of COMPUTERS) {
    let pattern;
    try {
      pattern = await fn(ownerId);
    } catch (e) {
      console.warn(`  computer ${fn.name} threw: ${e.message}`);
      continue;
    }
    if (!pattern) continue;
    computed++;

    const row = {
      user_id: ownerId,
      kind: 'pattern',
      subject: 'business',
      predicate: pattern.predicate,
      object: pattern.object,
      confidence: pattern.confidence,
      source: 'pattern_computed',
    };
    if (vec) {
      const e = await embedText(pattern.sentence);
      if (e) row.embedding = e;
    }

    if (DRY) {
      console.log(`  → ${row.predicate.padEnd(30)} ${row.object}`);
      continue;
    }
    try {
      const { error } = await supabase
        .from('user_memory_facts')
        .upsert(row, { onConflict: 'user_id,kind,subject,predicate,object', ignoreDuplicates: false });
      if (error) {
        console.warn(`  ✗ upsert ${row.predicate}: ${error.message}`);
      } else {
        written++;
      }
    } catch (e) {
      console.warn(`  ✗ upsert ${row.predicate} threw: ${e.message}`);
    }
  }

  console.log(`  computed: ${computed}, written: ${written}`);
  return { computed, written };
}

async function main() {
  console.log(`P9 patterns cron — ${DRY ? 'DRY RUN' : 'APPLY'}`);
  const owners = await listOwners();
  console.log(`  owners: ${owners.length}`);

  let totalComputed = 0;
  let totalWritten = 0;
  for (const ownerId of owners) {
    const { computed, written } = await processOwner(ownerId);
    totalComputed += computed;
    totalWritten += written;
  }

  console.log('\nDone.');
  console.log(`  patterns computed: ${totalComputed}`);
  console.log(`  ${DRY ? 'would write' : 'written'}:        ${totalWritten}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
