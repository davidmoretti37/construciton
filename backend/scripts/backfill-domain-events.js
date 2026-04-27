#!/usr/bin/env node
/**
 * Seed domain_events from existing tables so the world model has history
 * from day one for every existing customer. Idempotent — checks for an
 * existing event keyed by (entity_type, entity_id, event_type) before
 * inserting so re-running is safe.
 *
 * Usage:
 *   node backend/scripts/backfill-domain-events.js [--user <uuid>] [--limit 5000]
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
const USER = flag('user', null);
const LIMIT = parseInt(flag('limit', '10000'), 10);

async function exists(ownerId, entityType, entityId, eventType) {
  const { data } = await supabase
    .from('domain_events')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('event_type', eventType)
    .limit(1);
  return data && data.length > 0;
}

async function emit(ownerId, args) {
  // Embed the summary if present
  let embedding = null;
  if (args.summary && args.summary.length > 4) {
    try {
      const v = await embedText(args.summary);
      if (Array.isArray(v) && v.length === 1536) embedding = v;
    } catch {}
  }
  const row = {
    owner_id: ownerId,
    actor_type: args.actor_type || 'system',
    actor_id: args.actor_id || null,
    event_type: args.event_type,
    event_category: args.event_category || null,
    entity_type: args.entity_type || null,
    entity_id: args.entity_id || null,
    payload: args.payload || {},
    summary: args.summary || null,
    embedding,
    embedding_model: embedding ? 'openai/text-embedding-3-small' : null,
    occurred_at: args.occurred_at || new Date().toISOString(),
    source: 'migration',
  };
  const { error } = await supabase.from('domain_events').insert(row);
  if (error) console.error('  ✗ insert error:', error.message);
}

async function backfillProjects(ownerFilter) {
  let q = supabase
    .from('projects')
    .select('id, user_id, name, contract_amount, status, start_date, end_date, created_at')
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  if (ownerFilter) q = q.eq('user_id', ownerFilter);
  const { data, error } = await q;
  if (error) { console.error(error); return 0; }
  let n = 0;
  for (const r of data || []) {
    if (await exists(r.user_id, 'project', r.id, 'project.created')) continue;
    await emit(r.user_id, {
      event_type: 'project.created',
      event_category: 'project',
      entity_type: 'project',
      entity_id: r.id,
      occurred_at: r.created_at,
      payload: {
        name: r.name,
        contract_amount: r.contract_amount,
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
      },
      summary: `Project created: ${r.name || 'unnamed'}${r.contract_amount ? ` ($${r.contract_amount})` : ''}${r.status ? ` [${r.status}]` : ''}`,
    });
    n++;
  }
  return n;
}

async function backfillTransactions(ownerFilter) {
  // Need owner via project; pull projects first
  let projQ = supabase.from('projects').select('id, user_id');
  if (ownerFilter) projQ = projQ.eq('user_id', ownerFilter);
  const { data: projs } = await projQ;
  const ownerByProject = new Map((projs || []).map(p => [p.id, p.user_id]));
  if (ownerByProject.size === 0) return 0;

  const { data: txs } = await supabase
    .from('project_transactions')
    .select('id, project_id, type, amount, category, description, date, created_at')
    .in('project_id', Array.from(ownerByProject.keys()))
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  let n = 0;
  for (const t of txs || []) {
    const ownerId = ownerByProject.get(t.project_id);
    if (!ownerId) continue;
    const eventType = t.type === 'income' ? 'income.recorded' : 'expense.recorded';
    if (await exists(ownerId, 'transaction', t.id, eventType)) continue;
    await emit(ownerId, {
      event_type: eventType,
      event_category: 'financial',
      entity_type: 'transaction',
      entity_id: t.id,
      occurred_at: t.created_at,
      payload: {
        project_id: t.project_id,
        amount: t.amount,
        category: t.category,
        description: t.description,
        date: t.date,
        type: t.type,
      },
      summary: `${t.type === 'income' ? 'Income' : 'Expense'} ${t.amount ? `$${t.amount}` : ''}${t.description ? ` — ${String(t.description).slice(0, 80)}` : ''}${t.category ? ` [${t.category}]` : ''}`,
    });
    n++;
  }
  return n;
}

async function backfillAssignments(ownerFilter) {
  let projQ = supabase.from('projects').select('id, user_id, name, assigned_supervisor_id');
  if (ownerFilter) projQ = projQ.eq('user_id', ownerFilter);
  const { data: projs } = await projQ;
  const projMap = new Map((projs || []).map(p => [p.id, p]));

  // worker assignments
  const { data: assigns } = await supabase
    .from('project_assignments')
    .select('id, project_id, worker_id, created_at')
    .in('project_id', Array.from(projMap.keys()))
    .limit(LIMIT);
  let n = 0;
  for (const a of assigns || []) {
    const proj = projMap.get(a.project_id);
    if (!proj) continue;
    if (await exists(proj.user_id, 'project_assignment', a.id, 'worker.assigned')) continue;
    await emit(proj.user_id, {
      event_type: 'worker.assigned',
      event_category: 'crew',
      entity_type: 'project_assignment',
      entity_id: a.id,
      occurred_at: a.created_at,
      payload: { project_id: a.project_id, worker_id: a.worker_id, project_name: proj.name },
      summary: `Worker assigned to project ${proj.name || a.project_id}`,
    });
    n++;
  }

  // supervisor assignments (one per project that has one)
  for (const proj of projMap.values()) {
    if (!proj.assigned_supervisor_id) continue;
    if (await exists(proj.user_id, 'project', proj.id, 'supervisor.assigned')) continue;
    await emit(proj.user_id, {
      event_type: 'supervisor.assigned',
      event_category: 'crew',
      entity_type: 'project',
      entity_id: proj.id,
      payload: { project_id: proj.id, supervisor_id: proj.assigned_supervisor_id, project_name: proj.name },
      summary: `Supervisor assigned to project ${proj.name || proj.id}`,
    });
    n++;
  }
  return n;
}

async function main() {
  console.log(`▶ Backfilling domain_events ${USER ? `(user=${USER})` : '(all users)'}…`);
  const t0 = Date.now();
  const a = await backfillProjects(USER);
  console.log(`  + ${a} project.created events`);
  const b = await backfillTransactions(USER);
  console.log(`  + ${b} expense/income events`);
  const c = await backfillAssignments(USER);
  console.log(`  + ${c} worker/supervisor.assigned events`);
  console.log(`▶ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Total: ${a + b + c}`);
}

main().catch(e => { console.error(e); process.exit(1); });
