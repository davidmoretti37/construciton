/**
 * Tool handlers — search, audit history, summary reports.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  resolveOwnerId, buildWordSearch,
} = require('./_shared');

async function query_event_history(userId, args = {}) {
  const { query, entity_type, entity_id, event_category, since_days, limit = 8 } = args || {};
  const cap = Math.max(1, Math.min(25, parseInt(limit, 10) || 8));

  const ownerId = await resolveOwnerId(userId);
  if (!ownerId) return userSafeError(null, "Couldn't resolve your account. Try again.");

  let q = supabase
    .from('domain_events')
    .select('id, event_type, event_category, entity_type, entity_id, summary, payload, reason, occurred_at, actor_type, source')
    .eq('owner_id', ownerId)
    .order('occurred_at', { ascending: false });

  if (entity_type) q = q.eq('entity_type', entity_type);
  if (entity_id && /^[0-9a-f-]{36}$/i.test(entity_id)) q = q.eq('entity_id', entity_id);
  if (event_category) q = q.eq('event_category', event_category);
  if (Number.isFinite(parseInt(since_days, 10))) {
    const cutoff = new Date(Date.now() - parseInt(since_days, 10) * 86400000).toISOString();
    q = q.gte('occurred_at', cutoff);
  }

  // Semantic ranking: embed the query, then score each row by cosine
  // similarity to its embedding column. Done in-process because Supabase's
  // .order('embedding <=> $1') needs a custom RPC; we keep it simple by
  // pulling a wider set + ranking client-side. Reasonable for owners
  // with <50k events.
  let queryEmbedding = null;
  try {
    const { embedText } = require('../../memory/memoryService');
    queryEmbedding = await embedText(query);
  } catch {}

  const { data: rows, error } = await q.limit(Math.max(cap * 4, 30));
  if (error) return userSafeError(error, "Couldn't query the event history.");
  if (!rows || rows.length === 0) {
    return { events: [], note: 'No matching events in your history yet.' };
  }

  let ranked = rows;
  if (queryEmbedding) {
    // Pull embeddings for the rows we got and score cosine similarity.
    // This second select is needed because the first didn't include the
    // vector column (keeps the response small).
    const { data: vecRows } = await supabase
      .from('domain_events')
      .select('id, embedding')
      .in('id', rows.map(r => r.id))
      .not('embedding', 'is', null);
    // Supabase returns pgvector columns as serialized JSON strings (e.g.
    // "[0.123,-0.456,…]") not arrays. Parse defensively.
    const parseVec = (v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return null; }
      }
      return null;
    };
    const vecMap = new Map((vecRows || []).map(r => [r.id, parseVec(r.embedding)]));
    const scored = rows.map(r => {
      const v = vecMap.get(r.id);
      let score = 0;
      if (Array.isArray(v) && v.length === queryEmbedding.length) {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < v.length; i++) {
          dot += v[i] * queryEmbedding[i];
          na += v[i] * v[i];
          nb += queryEmbedding[i] * queryEmbedding[i];
        }
        score = na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      }
      return { row: r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    ranked = scored.slice(0, cap).map(s => ({ ...s.row, similarity: Number(s.score.toFixed(3)) }));
  } else {
    ranked = rows.slice(0, cap);
  }

  return {
    events: ranked.map(r => ({
      occurred_at: r.occurred_at,
      event_type: r.event_type,
      category: r.event_category,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      summary: r.summary,
      reason: r.reason,
      similarity: r.similarity,
    })),
    count: ranked.length,
    note: queryEmbedding ? null : 'Semantic ranking unavailable; results are recency-ordered.',
  };
}

async function global_search(userId, args = {}) {
  const { query, limit = 5 } = args;

  if (!query || query.trim().length === 0) {
    return { projects: [], estimates: [], invoices: [], workers: [] };
  }

  const words = query.trim().split(/\s+/).filter(w => w.length > 1);
  const projectFilter = words.flatMap(w => [`name.ilike.%${w}%`, `location.ilike.%${w}%`]).join(',');
  const estimateFilter = words.flatMap(w => [`client_name.ilike.%${w}%`, `project_name.ilike.%${w}%`, `estimate_number.ilike.%${w}%`]).join(',');
  const invoiceFilter = words.flatMap(w => [`client_name.ilike.%${w}%`, `project_name.ilike.%${w}%`, `invoice_number.ilike.%${w}%`]).join(',');
  const workerFilter = words.flatMap(w => [`full_name.ilike.%${w}%`, `trade.ilike.%${w}%`, `email.ilike.%${w}%`]).join(',');

  const [projectsRes, estimatesRes, invoicesRes, workersRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, budget, contract_amount, start_date, end_date, location')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .or(projectFilter)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('estimates')
      .select('id, estimate_number, client_name, project_name, total, status, created_at')
      .eq('user_id', userId)
      .or(estimateFilter)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('invoices')
      .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date')
      .eq('user_id', userId)
      .or(invoiceFilter)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('workers')
      .select('id, full_name, trade, payment_type, hourly_rate, daily_rate, status')
      .eq('owner_id', userId)
      .or(workerFilter)
      .limit(limit),
  ]);

  return {
    projects: projectsRes.data || [],
    estimates: estimatesRes.data || [],
    invoices: invoicesRes.data || [],
    workers: workersRes.data || [],
    totalResults:
      (projectsRes.data?.length || 0) +
      (estimatesRes.data?.length || 0) +
      (invoicesRes.data?.length || 0) +
      (workersRes.data?.length || 0),
  };
}

/**
 * Morning briefing — today's schedule, overdue invoices, at-risk projects, worker status.
 */
// Phase-3 metrics layer: thin wrappers over the worker_metrics_v /
// project_health_v / client_health_v views and compute_business_briefing()
// RPC. Views use security_invoker so RLS on the underlying tables already
// scopes per-caller — no extra owner_id filter needed on top.
function computeDiff(beforeJson, afterJson) {
  if (!beforeJson && !afterJson) return [];
  if (!beforeJson) return Object.entries(afterJson || {}).map(([k, v]) => ({ field: k, before: null, after: v }));
  if (!afterJson) return Object.entries(beforeJson || {}).map(([k, v]) => ({ field: k, before: v, after: null }));

  const keys = new Set([...Object.keys(beforeJson), ...Object.keys(afterJson)]);
  const changes = [];
  for (const k of keys) {
    // Skip noise fields that change on every write.
    if (k === 'updated_at' || k === 'created_at' || k === 'last_seen_at') continue;
    const a = beforeJson[k];
    const b = afterJson[k];
    // Cheap deep-equality via JSON for primitives + nested objects.
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: k, before: a ?? null, after: b ?? null });
    }
  }
  return changes;
}

async function get_entity_history(userId, args = {}) {
  const { entity_type, entity_id, limit = 50 } = args;
  if (!entity_type || !entity_id) {
    return { error: 'entity_type and entity_id required' };
  }

  const ownerId = await resolveOwnerId(userId);
  const cap = Math.min(parseInt(limit, 10) || 50, 200);

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('company_id', ownerId)
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    logger.error('get_entity_history error:', error);
    return { error: error.message };
  }

  // Hydrate actor names so Claude can say "Joe edited" not "user UUID edited".
  const actorIds = [...new Set((data || []).map(r => r.actor_user_id).filter(Boolean))];
  const actorMap = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', actorIds);
    (profiles || []).forEach(p => { actorMap[p.id] = p; });
  }

  return (data || []).map(row => ({
    id: row.id,
    actor_user_id: row.actor_user_id,
    actor_name: actorMap[row.actor_user_id]?.full_name || null,
    actor_role: actorMap[row.actor_user_id]?.role || row.actor_type,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    changes: computeDiff(row.before_json, row.after_json),
    source: row.source,
    created_at: row.created_at,
  }));
}

async function who_changed(userId, args = {}) {
  const { entity_type, entity_id, limit = 5 } = args;
  if (!entity_type || !entity_id) {
    return { error: 'entity_type and entity_id required' };
  }

  const ownerId = await resolveOwnerId(userId);
  const cap = Math.min(parseInt(limit, 10) || 5, 50);

  const { data, error } = await supabase
    .from('audit_log')
    .select('actor_user_id, actor_type, action, created_at')
    .eq('company_id', ownerId)
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    logger.error('who_changed error:', error);
    return { error: error.message };
  }

  const actorIds = [...new Set((data || []).map(r => r.actor_user_id).filter(Boolean))];
  const actorMap = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', actorIds);
    (profiles || []).forEach(p => { actorMap[p.id] = p; });
  }

  return (data || []).map(row => ({
    actor_name: actorMap[row.actor_user_id]?.full_name || 'Unknown',
    actor_role: actorMap[row.actor_user_id]?.role || row.actor_type,
    action: row.action,
    at: row.created_at,
  }));
}

async function recent_activity(userId, args = {}) {
  const { actor_user_id, entity_type, action, start_date, end_date, limit = 50 } = args;
  const ownerId = await resolveOwnerId(userId);
  const cap = Math.min(parseInt(limit, 10) || 50, 200);

  let q = supabase
    .from('audit_log')
    .select('*')
    .eq('company_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (actor_user_id) q = q.eq('actor_user_id', actor_user_id);
  if (entity_type) q = q.eq('entity_type', entity_type);
  if (action) q = q.eq('action', action);
  if (start_date) q = q.gte('created_at', start_date);
  if (end_date) q = q.lte('created_at', end_date);

  const { data, error } = await q;
  if (error) {
    logger.error('recent_activity error:', error);
    return { error: error.message };
  }

  const actorIds = [...new Set((data || []).map(r => r.actor_user_id).filter(Boolean))];
  const actorMap = {};
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', actorIds);
    (profiles || []).forEach(p => { actorMap[p.id] = p; });
  }

  return (data || []).map(row => ({
    id: row.id,
    actor_name: actorMap[row.actor_user_id]?.full_name || 'System',
    actor_role: actorMap[row.actor_user_id]?.role || row.actor_type,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    changes: computeDiff(row.before_json, row.after_json).slice(0, 5),
    source: row.source,
    created_at: row.created_at,
  }));
}

async function generate_summary_report(userId, args) {
  const { project_id, start_date, end_date } = args;

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (!project) return { error: 'Project not found' };

  // Fetch daily reports in range
  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, report_date, notes, photos, completed_tasks, task_progress, worker_id, phase_id, workers(full_name), project_phases(name)')
    .eq('project_id', project_id)
    .gte('report_date', start_date)
    .lte('report_date', end_date)
    .order('report_date', { ascending: true });

  if (error) {
    logger.error('generate_summary_report error:', error);
    return { error: error.message };
  }

  const reportList = reports || [];

  // Aggregate data
  const allPhotos = [];
  const notesByDate = {};
  const workByPhase = {};
  let totalCompletedTasks = 0;

  for (const r of reportList) {
    // Photos
    if (r.photos && Array.isArray(r.photos)) {
      for (const photo of r.photos) {
        allPhotos.push({
          url: typeof photo === 'string' ? photo : photo.url,
          date: r.report_date,
          worker: r.workers?.full_name,
          phase: r.project_phases?.name,
        });
      }
    }

    // Notes by date
    if (r.notes) {
      if (!notesByDate[r.report_date]) notesByDate[r.report_date] = [];
      notesByDate[r.report_date].push({
        worker: r.workers?.full_name || 'Unknown',
        notes: r.notes,
      });
    }

    // Work by phase
    const phaseName = r.project_phases?.name || 'General';
    if (!workByPhase[phaseName]) workByPhase[phaseName] = { reports: 0, photos: 0 };
    workByPhase[phaseName].reports++;
    workByPhase[phaseName].photos += (r.photos?.length || 0);

    // Completed tasks
    if (r.completed_tasks) totalCompletedTasks += r.completed_tasks.length;
  }

  return {
    project: { id: project.id, name: project.name },
    period: { startDate: start_date, endDate: end_date },
    summary: {
      totalReports: reportList.length,
      totalPhotos: allPhotos.length,
      totalCompletedTasks,
      daysWithActivity: Object.keys(notesByDate).length,
    },
    notesByDate,
    workByPhase,
    photos: allPhotos,
  };
}

/**
 * Share a document (estimate or invoice) with a client.
 * Returns the client's contact info so the AI can suggest the send action.
 */

module.exports = {
  query_event_history,
  global_search,
  computeDiff,
  get_entity_history,
  who_changed,
  recent_activity,
  generate_summary_report,
};
