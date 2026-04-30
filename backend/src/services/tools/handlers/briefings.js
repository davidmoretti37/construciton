/**
 * Tool handlers — briefings, settings, health summaries.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  toDate, today, getTodayBounds,
  resolveOwnerId,
} = require('./_shared');

async function get_business_settings(userId, args = {}) {
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Get services with pricing
  const { data: services } = await supabase
    .from('user_services')
    .select('*')
    .eq('user_id', userId);

  // Get phase template from profile
  const phasesTemplate = profile?.phases_template || ['Demo', 'Rough', 'Finish'];

  return {
    businessName: profile?.business_name || '',
    businessPhone: profile?.business_phone || profile?.phone || '',
    businessEmail: profile?.business_email || profile?.email || '',
    businessAddress: profile?.business_address || '',
    role: profile?.role || 'owner',
    language: profile?.language || 'en',
    contingencyPercentage: profile?.contingency_percentage || 10,
    profitMargin: profile?.profit_margin || 20,
    phasesTemplate,
    services: (services || []).map(s => ({
      id: s.id,
      category: s.service_category,
      pricing: s.pricing || {}
    })),
    invoiceTemplate: profile?.invoice_template || null,
    aboutYou: profile?.about_you || '',
    responseStyle: profile?.response_style || ''
  };
}

// ==================== INTELLIGENT TOOLS ====================

/**
 * Universal search across projects, estimates, invoices, and workers.
 * Runs all queries concurrently for performance.
 */
/**
 * Query the owner's event history. Combines semantic recall (cosine
 * search over event summaries) with structured filters (entity, category,
 * timerange). Returns past events ranked by relevance — this is how the
 * agent reads its own world model.
 */
async function get_client_health(userId, args = {}) {
  const { client_name, limit = 25 } = args || {};
  let q = supabase
    .from('client_health_v')
    .select('client_name, invoice_count, total_billed, total_paid, total_outstanding, overdue_count, oldest_overdue_days, avg_days_late_to_pay')
    .order('total_outstanding', { ascending: false, nullsFirst: false })
    .limit(Math.min(limit, 100));
  if (client_name) q = q.ilike('client_name', `%${client_name}%`);
  const { data, error } = await q;
  if (error) return userSafeError(error, "Couldn't load client health.");
  return { clients: data || [] };
}

async function get_business_briefing(userId, args = {}) {
  const { data, error } = await supabase.rpc('compute_business_briefing');
  if (error) return userSafeError(error, "Couldn't generate the briefing.");
  return data || { items: [], item_count: 0 };
}

async function get_daily_briefing(userId, args = {}) {
  const todayStr = today();
  const todayStart = `${todayStr}T00:00:00`;
  const todayEnd = `${todayStr}T23:59:59`;

  // Get user's project IDs for daily reports query
  const { data: userProjects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (userProjects || []).map(p => p.id);

  const [scheduleRes, overdueRes, projectsRes, workersRes, clockInsRes, dailyReportsRes] = await Promise.all([
    // Today's schedule events
    supabase
      .from('schedule_events')
      .select('id, title, event_type, start_datetime, end_datetime, location')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .gte('start_datetime', todayStart)
      .lte('start_datetime', todayEnd)
      .order('start_datetime', { ascending: true }),

    // Overdue invoices
    supabase
      .from('invoices')
      .select('id, invoice_number, client_name, total, amount_paid, due_date')
      .eq('user_id', userId)
      .eq('status', 'overdue'),

    // All active projects (check for behind/over-budget)
    supabase
      .from('projects')
      .select('id, name, status, budget, contract_amount, expenses, end_date')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .in('status', ['active', 'on-track', 'behind', 'over-budget']),

    // All active workers
    supabase
      .from('workers')
      .select('id, full_name, trade, status')
      .eq('owner_id', userId)
      .eq('status', 'active'),

    // Currently clocked-in workers
    supabase
      .from('time_tracking')
      .select('worker_id, clock_in, project_id, projects(name), workers(full_name)')
      .eq('clock_out', null)
      .gte('clock_in', todayStart),

    // Today's daily reports
    projectIds.length > 0
      ? supabase
          .from('daily_reports')
          .select('id, report_date, project_id, worker_id, owner_id, reporter_type, photos, projects(name), workers(full_name)')
          .or(`project_id.in.(${projectIds.join(',')}),owner_id.eq.${userId}`)
          .eq('report_date', todayStr)
      : Promise.resolve({ data: [] })
  ]);

  // Build alerts
  const alerts = [];

  // Overdue invoices
  const overdueInvoices = overdueRes.data || [];
  if (overdueInvoices.length > 0) {
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.amount_paid || 0)), 0);
    alerts.push({
      type: 'overdue_invoices',
      severity: 'high',
      message: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''} totaling $${totalOverdue.toLocaleString()}`,
      items: overdueInvoices,
    });
  }

  // Projects behind schedule or over budget
  const atRiskProjects = (projectsRes.data || []).filter(p =>
    p.status === 'behind' || p.status === 'over-budget'
  );
  if (atRiskProjects.length > 0) {
    alerts.push({
      type: 'at_risk_projects',
      severity: 'medium',
      message: `${atRiskProjects.length} project${atRiskProjects.length > 1 ? 's' : ''} need attention`,
      items: atRiskProjects.map(p => ({ id: p.id, name: p.name, status: p.status })),
    });
  }

  // Subcontractor compliance alerts (expiring/expired docs)
  let complianceAlerts = { expired: [], expiring_soon: [] };
  try {
    const { complianceService } = getSubServices();
    const docs = await complianceService.listExpiringForGc({ gcUserId: userId, withinDays: 30 });
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    for (const d of docs) {
      const expiry = new Date(d.expires_at);
      const days = Math.floor((expiry - todayDate) / (1000 * 3600 * 24));
      const item = {
        sub_organization_id: d.sub_organization_id,
        sub_name: d.sub?.legal_name,
        doc_type: d.doc_type,
        expires_at: d.expires_at,
        days_until_expiry: days,
      };
      if (days < 0) complianceAlerts.expired.push(item);
      else complianceAlerts.expiring_soon.push(item);
    }
    if (complianceAlerts.expired.length > 0) {
      alerts.push({
        type: 'compliance_expired',
        severity: 'high',
        message: `${complianceAlerts.expired.length} subcontractor document(s) expired`,
        items: complianceAlerts.expired,
      });
    }
    if (complianceAlerts.expiring_soon.length > 0) {
      alerts.push({
        type: 'compliance_expiring',
        severity: 'medium',
        message: `${complianceAlerts.expiring_soon.length} subcontractor document(s) expiring soon`,
        items: complianceAlerts.expiring_soon,
      });
    }
  } catch (e) {
    logger.warn('[get_daily_briefing] compliance lookup failed:', e?.message);
  }

  // Filter clocked-in to only this user's workers
  const workerIds = new Set((workersRes.data || []).map(w => w.id));
  const clockedIn = (clockInsRes.data || []).filter(ci => workerIds.has(ci.worker_id));

  const dailyReports = dailyReportsRes.data || [];

  logger.info(`get_daily_briefing: Found ${projectIds.length} projects, ${dailyReports.length} daily reports for ${todayStr}`);
  if (dailyReports.length > 0) {
    logger.info(`Daily reports details:`, dailyReports.map(r => ({
      id: r.id,
      project: r.projects?.name,
      reporter_type: r.reporter_type,
      report_date: r.report_date
    })));
  }

  // ============== BILLING ROLLUP ==============
  // The unified billing surface — readyDraws (existing) + three new categories
  // for stale events. The contractor's morning briefing answers:
  //   "what's ready to bill, what's overdue, what's stuck waiting on someone?"

  let readyDraws = { count: 0, total_net: 0, draws: [] };
  try {
    const ready = await get_ready_draws(userId);
    if (ready?.success) readyDraws = ready;
  } catch (e) {
    logger.warn('get_daily_briefing: ready draws lookup failed', e);
  }

  // Stale ready draws — ready more than 3 days, owner hasn't sent
  let staleReadyDraws = { count: 0, items: [] };
  try {
    const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: stale } = await supabase
      .from('draw_schedule_items')
      .select(`
        id, description, fixed_amount, percent_of_contract, updated_at,
        project:projects(id, name, contract_amount),
        schedule:draw_schedules(retainage_percent)
      `)
      .eq('user_id', userId)
      .eq('status', 'ready')
      .lt('updated_at', cutoff);
    staleReadyDraws.items = (stale || []).map(it => {
      const contract = parseFloat(it.project?.contract_amount || 0);
      const retPct = parseFloat(it.schedule?.retainage_percent || 0);
      const gross = it.percent_of_contract != null
        ? contract * parseFloat(it.percent_of_contract) / 100
        : parseFloat(it.fixed_amount || 0);
      const net = gross - (gross * retPct / 100);
      const days = Math.floor((Date.now() - new Date(it.updated_at).getTime()) / 86400000);
      return {
        draw_item_id: it.id,
        project_id: it.project?.id,
        project_name: it.project?.name,
        description: it.description,
        net: Number(net.toFixed(2)),
        days_ready: days,
      };
    });
    staleReadyDraws.count = staleReadyDraws.items.length;
  } catch (e) {
    logger.warn('get_daily_briefing: stale draws lookup failed', e);
  }

  // Overdue invoices — past due_date with unpaid balance (rich shape for BillingCard).
  // Compute on the fly so we don't depend on a flip job to set status='overdue'.
  // (Note: the simpler `overdueInvoices` array above feeds the existing alerts roll-up;
  // this richer shape is for the new billing surfaces.)
  let overdueInvoicesRich = { count: 0, total_due: 0, items: [] };
  try {
    const todayDateOnly = todayStr.split('T')[0];
    const { data: overdue } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, total, amount_paid, amount_due, due_date, project_id, projects(name)')
      .eq('user_id', userId)
      .in('status', ['unpaid', 'partial', 'overdue'])
      .lt('due_date', todayDateOnly);
    overdueInvoicesRich.items = (overdue || [])
      .filter(inv => parseFloat(inv.amount_due || 0) > 0)
      .map(inv => ({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        client_name: inv.client_name,
        project_name: inv.projects?.name,
        project_id: inv.project_id,
        amount_due: parseFloat(inv.amount_due || 0),
        days_overdue: Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)),
      }));
    overdueInvoicesRich.count = overdueInvoicesRich.items.length;
    overdueInvoicesRich.total_due = overdueInvoicesRich.items.reduce((s, i) => s + i.amount_due, 0);
  } catch (e) {
    logger.warn('get_daily_briefing: overdue invoices lookup failed', e);
  }

  // Pending-client COs — sent more than 3 days ago, no client response yet
  let pendingClientCOs = { count: 0, items: [] };
  try {
    const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: pending } = await supabase
      .from('change_orders')
      .select('id, co_number, title, total_amount, sent_at, project_id, projects(name)')
      .eq('owner_id', userId)
      .in('status', ['pending_client', 'viewed'])
      .lt('sent_at', cutoff);
    pendingClientCOs.items = (pending || []).map(co => ({
      change_order_id: co.id,
      co_number: co.co_number,
      title: co.title,
      project_id: co.project_id,
      project_name: co.projects?.name,
      total_amount: parseFloat(co.total_amount || 0),
      days_pending: Math.floor((Date.now() - new Date(co.sent_at).getTime()) / 86400000),
    }));
    pendingClientCOs.count = pendingClientCOs.items.length;
  } catch (e) {
    logger.warn('get_daily_briefing: pending COs lookup failed', e);
  }

  return {
    date: todayStr,
    schedule: scheduleRes.data || [],
    scheduleCount: (scheduleRes.data || []).length,
    alerts,
    complianceAlerts,
    teamStatus: {
      totalWorkers: (workersRes.data || []).length,
      clockedIn: clockedIn.length,
      clockedInWorkers: clockedIn.map(ci => ({
        name: ci.workers?.full_name,
        project: ci.projects?.name,
        since: ci.clock_in,
      })),
    },
    activeProjects: (projectsRes.data || []).length,
    dailyReports: dailyReports.map(r => ({
      id: r.id,
      project: r.projects?.name,
      worker: r.workers?.full_name || (r.reporter_type === 'owner' ? 'Owner' : (r.reporter_type === 'supervisor' ? 'Supervisor' : 'Unknown')),
      reporterType: r.reporter_type,
      photoCount: r.photos?.length || 0,
    })),
    dailyReportsCount: dailyReports.length,
    readyDraws: {
      count: readyDraws.count,
      totalNet: readyDraws.total_net,
      items: readyDraws.draws,
    },
    staleReadyDraws,
    overdueInvoicesRich,
    pendingClientCOs,
  };
}

/**
 * High-level project summary — status, financials, progress, recent activity.
 */

module.exports = {
  get_business_settings,
  get_client_health,
  get_business_briefing,
  get_daily_briefing,
};
