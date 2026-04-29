#!/usr/bin/env node
/**
 * P11 — domain-data RAG indexer.
 *
 * Walks each owner's entities (projects, clients) and writes a compact
 * summary + embedding into `domain_search_index`. The recall pipeline
 * then surfaces relevant entities on every turn alongside chat memory,
 * typed facts, and episodic events.
 *
 * Why this matters: Foreman currently fetches entity state ON DEMAND
 * via tools (search_projects, get_client_health, etc.). With this
 * index, top relevant entities surface in the prompt context every
 * turn — Foreman knows about the Davis project before you mention it,
 * remembers Smith's payment history before you ask.
 *
 * What gets indexed (per owner):
 *   - projects   — name, status, contract, % complete, dates, key flags
 *   - clients    — name, project count, total revenue, last activity
 *
 * Idempotent — UNIQUE(source_table, source_id) means re-runs upsert
 * (refresh embeddings on changed summaries). Run nightly OR on demand.
 *
 * Cost: text-embedding-3-small at $0.02/M tokens. ~50 tokens per
 * summary × 100 entities per active owner = $0.0001 per owner per run.
 * Tens of cents to backfill the entire database.
 *
 * Usage:
 *   node backend/scripts/index-domain-search.js               # all owners
 *   node backend/scripts/index-domain-search.js --user <uuid>
 *   node backend/scripts/index-domain-search.js --dry         # print, don't write
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

async function listOwners() {
  if (ONE_USER) return [ONE_USER];
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'owner')
    .is('owner_id', null);
  return (data || []).map(p => p.id);
}

// ─────────────────────────────────────────────────────────────────
// Entity summarizers — produce a one-line natural-language summary
// suitable for embedding. Keep concise; embedding quality drops as
// summaries get longer and noisier.
// ─────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  if (!Number.isFinite(Number(n))) return '';
  const v = Number(n);
  if (v === 0) return '$0';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function summarizeProject(p) {
  const parts = [];
  parts.push(`Project "${p.name || 'unnamed'}"`);
  if (p.client_name) parts.push(`for ${p.client_name}`);
  if (p.status) parts.push(`(${p.status})`);
  if (p.contract_amount) parts.push(`contract ${fmtMoney(p.contract_amount)}`);
  if (p.spent != null) parts.push(`spent ${fmtMoney(p.spent)}`);
  const pct = p.percent_complete != null ? p.percent_complete : p.actual_progress;
  if (pct != null && Number(pct) > 0) parts.push(`${Math.round(Number(pct))}% complete`);
  if (p.start_date) parts.push(`started ${String(p.start_date).slice(0, 10)}`);
  if (p.end_date) parts.push(`ends ${String(p.end_date).slice(0, 10)}`);
  if (p.location) parts.push(`at ${p.location}`);
  return parts.join(', ') + '.';
}

async function indexProjects(ownerId, vec) {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, status, contract_amount, spent, percent_complete, actual_progress, start_date, end_date, location, client_name')
    .eq('user_id', ownerId);
  if (error) {
    console.warn(`  projects fetch error for ${ownerId.slice(0, 8)}…: ${error.message}`);
    return { indexed: 0 };
  }
  if (!projects?.length) return { indexed: 0 };

  let indexed = 0;
  for (const p of projects) {
    const summary = summarizeProject(p);
    const row = {
      owner_id: ownerId,
      source_table: 'projects',
      source_id: p.id,
      summary,
      metadata: { status: p.status, contract: p.contract_amount, name: p.name },
      updated_at: new Date().toISOString(),
    };
    if (vec) {
      const e = await embedText(summary);
      if (e) row.embedding = e;
    }
    if (DRY) {
      console.log(`  → project ${p.id.slice(0, 8)}: ${summary}`);
      indexed++;
      continue;
    }
    const { error } = await supabase
      .from('domain_search_index')
      .upsert(row, { onConflict: 'source_table,source_id', ignoreDuplicates: false });
    if (!error) indexed++;
  }
  return { indexed };
}

function summarizeClient(c, stats) {
  const parts = [];
  parts.push(`Client "${c.full_name || 'unnamed'}"`);
  if (c.email) parts.push(`(${c.email})`);
  if (stats?.project_count) parts.push(`${stats.project_count} project${stats.project_count === 1 ? '' : 's'}`);
  if (stats?.total_revenue) parts.push(`total revenue ${fmtMoney(stats.total_revenue)}`);
  if (stats?.last_invoice_at) parts.push(`last invoice ${String(stats.last_invoice_at).slice(0, 10)}`);
  if (stats?.unpaid_amount) parts.push(`unpaid ${fmtMoney(stats.unpaid_amount)}`);
  return parts.join(', ') + '.';
}

async function indexClients(ownerId, vec) {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email, phone')
    .eq('owner_id', ownerId);
  if (!clients?.length) return { indexed: 0 };

  let indexed = 0;
  for (const c of clients) {
    // Pull lightweight client stats — don't go heavy here, this script
    // runs nightly across many owners. One LIMIT-bounded query each.
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount, status, created_at')
      .eq('user_id', ownerId)
      .ilike('client_name', c.full_name || '_NEVER_')
      .limit(50);
    const stats = {
      project_count: null, // we'd need a join; skipped for speed
      total_revenue: invoices?.filter(i => i.status === 'paid').reduce((a, b) => a + Number(b.amount || 0), 0) || 0,
      unpaid_amount: invoices?.filter(i => i.status !== 'paid').reduce((a, b) => a + Number(b.amount || 0), 0) || 0,
      last_invoice_at: invoices?.[0]?.created_at || null,
    };
    const summary = summarizeClient(c, stats);
    const row = {
      owner_id: ownerId,
      source_table: 'clients',
      source_id: c.id,
      summary,
      metadata: { name: c.full_name, email: c.email },
      updated_at: new Date().toISOString(),
    };
    if (vec) {
      const e = await embedText(summary);
      if (e) row.embedding = e;
    }
    if (DRY) {
      console.log(`  → client ${c.id.slice(0, 8)}: ${summary}`);
      indexed++;
      continue;
    }
    const { error } = await supabase
      .from('domain_search_index')
      .upsert(row, { onConflict: 'source_table,source_id', ignoreDuplicates: false });
    if (!error) indexed++;
  }
  return { indexed };
}

async function main() {
  console.log(`P11 domain-search indexer — ${DRY ? 'DRY RUN' : 'APPLY'}`);
  const owners = await listOwners();
  console.log(`  owners: ${owners.length}`);
  const vec = await vectorEnabled();
  console.log(`  vector embedding: ${vec ? 'enabled' : 'disabled (no embeddings written)'}`);

  let totalProjects = 0;
  let totalClients = 0;
  for (const ownerId of owners) {
    const { indexed: pi } = await indexProjects(ownerId, vec);
    const { indexed: ci } = await indexClients(ownerId, vec);
    if (pi || ci) console.log(`  ${ownerId.slice(0, 8)}…: ${pi} projects, ${ci} clients indexed`);
    totalProjects += pi;
    totalClients += ci;
  }

  console.log('\nDone.');
  console.log(`  projects ${DRY ? 'would be' : ''} indexed: ${totalProjects}`);
  console.log(`  clients  ${DRY ? 'would be' : ''} indexed: ${totalClients}`);
  console.log(`  total: ${totalProjects + totalClients}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
