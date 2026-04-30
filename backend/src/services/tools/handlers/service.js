/**
 * Tool handlers — service plans, visits, routes, locations, daily checklist setup.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError, crypto,
  validateUpload, requireSupervisorPermission, safeStorageKey,
  toDate, today, getTodayBounds,
  resolveOwnerId, resolveServicePlanId, resolveWorkerId,
} = require('./_shared');

async function update_service_pricing(userId, { service_name, item_name, price, unit }) {
  // Find service category by name
  const { data: categories } = await supabase
    .from('service_categories')
    .select('id, name')
    .ilike('name', `%${service_name}%`)
    .limit(5);

  if (!categories || categories.length === 0) {
    return { error: `No service category found matching "${service_name}"` };
  }

  const category = categories[0];

  // Find or create user_services entry
  let { data: userService } = await supabase
    .from('user_services')
    .select('id, pricing')
    .eq('user_id', userId)
    .eq('category_id', category.id)
    .single();

  if (!userService) {
    // Create user_services entry
    const { data: created, error: createErr } = await supabase
      .from('user_services')
      .insert({
        user_id: userId,
        category_id: category.id,
        pricing: {},
      })
      .select('id, pricing')
      .single();

    if (createErr) return userSafeError(createErr, "Couldn't create that service entry.");
    userService = created;
  }

  // Update pricing JSONB
  const pricing = userService.pricing || {};
  pricing[item_name] = { price: parseFloat(price), unit: unit || pricing[item_name]?.unit || 'unit' };

  const { error: updateErr } = await supabase
    .from('user_services')
    .update({ pricing })
    .eq('id', userService.id);

  if (updateErr) return userSafeError(updateErr, "Couldn't update pricing.");

  return {
    success: true,
    service: category.name,
    item: item_name,
    price: parseFloat(price),
    unit: pricing[item_name].unit,
  };
}

async function get_service_plans(userId, { status } = {}) {
  const ownerId = await resolveOwnerId(userId);

  let query = supabase
    .from('service_plans')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data: plans, error } = await query;
  if (error) return { error: error.message };
  if (!plans || plans.length === 0) return [];

  // Get location counts
  const planIds = plans.map(p => p.id);
  const { data: locations } = await supabase
    .from('service_locations')
    .select('service_plan_id')
    .in('service_plan_id', planIds)
    .eq('is_active', true);

  const locCounts = {};
  (locations || []).forEach(l => {
    locCounts[l.service_plan_id] = (locCounts[l.service_plan_id] || 0) + 1;
  });

  // Get visit stats for current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = nextMonth.toISOString().split('T')[0];

  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', monthStart)
    .lt('scheduled_date', monthEnd)
    .neq('status', 'cancelled');

  const visitStats = {};
  (visits || []).forEach(v => {
    if (!visitStats[v.service_plan_id]) visitStats[v.service_plan_id] = { total: 0, completed: 0 };
    visitStats[v.service_plan_id].total++;
    if (v.status === 'completed') visitStats[v.service_plan_id].completed++;
  });

  return plans.map(p => ({
    id: p.id,
    name: p.name,
    service_type: p.service_type,
    status: p.status,
    billing_cycle: p.billing_cycle,
    price_per_visit: p.price_per_visit ? parseFloat(p.price_per_visit) : null,
    monthly_rate: p.monthly_rate ? parseFloat(p.monthly_rate) : null,
    location_count: locCounts[p.id] || 0,
    visits_this_month: visitStats[p.id]?.total || 0,
    completed_this_month: visitStats[p.id]?.completed || 0,
  }));
}

async function get_daily_route(userId, { date, worker_id } = {}) {
  const ownerId = await resolveOwnerId(userId);
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Check if user is a worker
  const { data: workerRecord } = await supabase
    .from('workers')
    .select('id, owner_id')
    .eq('user_id', userId)
    .single();

  const isWorker = !!workerRecord;

  if (isWorker) {
    // Worker: their visits for the day
    const { data: visits } = await supabase
      .from('service_visits')
      .select('*')
      .eq('assigned_worker_id', workerRecord.id)
      .eq('scheduled_date', targetDate)
      .neq('status', 'cancelled')
      .order('scheduled_time', { ascending: true, nullsFirst: false });

    if (!visits || visits.length === 0) return { date: targetDate, visits: [], message: 'No visits scheduled for this date.' };

    const locationIds = [...new Set(visits.map(v => v.service_location_id))];
    const { data: locations } = await supabase
      .from('service_locations')
      .select('id, name, address, access_notes')
      .in('id', locationIds);
    const locMap = {};
    (locations || []).forEach(l => { locMap[l.id] = l; });

    return {
      date: targetDate,
      visits: visits.map(v => ({
        id: v.id,
        status: v.status,
        scheduled_time: v.scheduled_time,
        location_name: locMap[v.service_location_id]?.name,
        location_address: locMap[v.service_location_id]?.address,
        access_notes: locMap[v.service_location_id]?.access_notes,
      })),
    };
  }

  // Owner: all routes + unrouted visits
  const { data: routes } = await supabase
    .from('service_routes')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('route_date', targetDate);

  // Worker names
  const workerIds = [...new Set((routes || []).map(r => r.assigned_worker_id).filter(Boolean))];
  let workerNames = {};
  if (workerIds.length > 0) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, full_name, name')
      .in('id', workerIds);
    if (workers) workers.forEach(w => { workerNames[w.id] = w.full_name || w.name; });
  }

  const routeResults = [];
  for (const route of (routes || [])) {
    const { data: stops } = await supabase
      .from('route_stops')
      .select('*, service_visits(id, status, scheduled_time, service_location_id)')
      .eq('route_id', route.id)
      .order('stop_order', { ascending: true });

    const locationIds = [...new Set((stops || []).map(s => s.service_visits?.service_location_id).filter(Boolean))];
    let locMap = {};
    if (locationIds.length > 0) {
      const { data: locs } = await supabase.from('service_locations').select('id, name, address').in('id', locationIds);
      (locs || []).forEach(l => { locMap[l.id] = l; });
    }

    routeResults.push({
      route_name: route.name,
      worker_name: workerNames[route.assigned_worker_id] || 'Unassigned',
      status: route.status,
      stops: (stops || []).map(s => ({
        stop_order: s.stop_order,
        visit_id: s.service_visits?.id,
        status: s.service_visits?.status,
        location_name: locMap[s.service_visits?.service_location_id]?.name,
        location_address: locMap[s.service_visits?.service_location_id]?.address,
      })),
    });
  }

  // Unrouted visits
  const { data: unrouted } = await supabase
    .from('service_visits')
    .select('id, status, scheduled_time, service_location_id')
    .eq('owner_id', ownerId)
    .eq('scheduled_date', targetDate)
    .is('route_id', null)
    .neq('status', 'cancelled');

  let unroutedEnriched = [];
  if (unrouted && unrouted.length > 0) {
    const locIds = [...new Set(unrouted.map(v => v.service_location_id))];
    const { data: locs } = await supabase.from('service_locations').select('id, name, address').in('id', locIds);
    const lm = {};
    (locs || []).forEach(l => { lm[l.id] = l; });
    unroutedEnriched = unrouted.map(v => ({
      id: v.id, status: v.status, scheduled_time: v.scheduled_time,
      location_name: lm[v.service_location_id]?.name,
      location_address: lm[v.service_location_id]?.address,
    }));
  }

  return { date: targetDate, routes: routeResults, unrouted: unroutedEnriched };
}

async function complete_visit(userId, { visit_id, notes } = {}) {
  if (!visit_id) return { error: 'visit_id is required' };

  const ownerId = await resolveOwnerId(userId);

  // Fetch visit with ownership check
  const { data: visit } = await supabase
    .from('service_visits')
    .select('*, service_locations(name)')
    .eq('id', visit_id)
    .eq('owner_id', ownerId)
    .single();

  if (!visit) return { error: 'Visit not found' };

  const now = new Date();
  let durationMinutes = null;
  if (visit.started_at) {
    durationMinutes = Math.round((now.getTime() - new Date(visit.started_at).getTime()) / 60000);
  }

  const updates = {
    status: 'completed',
    completed_at: now.toISOString(),
    duration_minutes: durationMinutes,
  };
  if (notes) updates.worker_notes = notes;

  const { error } = await supabase
    .from('service_visits')
    .update(updates)
    .eq('id', visit_id);

  if (error) return { error: error.message };

  return {
    success: true,
    visit_id,
    location_name: visit.service_locations?.name || 'Unknown',
    completed_at: now.toISOString(),
    duration_minutes: durationMinutes,
  };
}

async function get_billing_summary(userId, { plan_id, month } = {}) {
  const ownerId = await resolveOwnerId(userId);

  // Calculate month range
  const now = new Date();
  const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = targetMonth.split('-').map(Number);
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`;
  const nextMonth = new Date(year, mon, 1);
  const monthEnd = nextMonth.toISOString().split('T')[0];

  // Get plans
  let plansQuery = supabase
    .from('service_plans')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'active');

  if (plan_id) {
    // Try to resolve by name
    if (plan_id.length !== 36) {
      const { data: matched } = await supabase
        .from('service_plans')
        .select('id')
        .eq('owner_id', ownerId)
        .ilike('name', `%${plan_id}%`)
        .limit(1)
        .single();
      if (matched) plan_id = matched.id;
    }
    plansQuery = plansQuery.eq('id', plan_id);
  }

  const { data: plans } = await plansQuery;
  if (!plans || plans.length === 0) return { error: 'No active service plans found' };

  const planIds = plans.map(p => p.id);

  // Get completed, billable, uninvoiced visits in month
  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status, billable, invoice_id')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', monthStart)
    .lt('scheduled_date', monthEnd)
    .neq('status', 'cancelled');

  const summary = plans.map(plan => {
    const planVisits = (visits || []).filter(v => v.service_plan_id === plan.id);
    const completed = planVisits.filter(v => v.status === 'completed');
    const unbilled = completed.filter(v => v.billable && !v.invoice_id);

    const rate = plan.billing_cycle === 'per_visit'
      ? parseFloat(plan.price_per_visit || 0)
      : parseFloat(plan.monthly_rate || 0);

    const estimatedRevenue = plan.billing_cycle === 'per_visit'
      ? unbilled.length * rate
      : rate;

    return {
      plan_name: plan.name,
      service_type: plan.service_type,
      billing_cycle: plan.billing_cycle,
      total_visits: planVisits.length,
      completed: completed.length,
      unbilled: unbilled.length,
      estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
      currency: plan.currency,
    };
  });

  const totalRevenue = summary.reduce((sum, s) => sum + s.estimated_revenue, 0);

  return {
    month: targetMonth,
    plans: summary,
    total_unbilled_revenue: Math.round(totalRevenue * 100) / 100,
  };
}

async function create_service_visit(userId, { plan_id, location_id, date, worker_id, notes } = {}) {
  if (!plan_id || !location_id || !date) {
    return { error: 'plan_id, location_id, and date are required' };
  }

  const ownerId = await resolveOwnerId(userId);

  // Resolve plan by name if needed
  if (plan_id.length !== 36) {
    const { data: matched } = await supabase
      .from('service_plans')
      .select('id')
      .eq('owner_id', ownerId)
      .ilike('name', `%${plan_id}%`)
      .limit(1)
      .single();
    if (!matched) return { error: `No service plan matching "${plan_id}" found` };
    plan_id = matched.id;
  }

  // Resolve location by name if needed
  if (location_id.length !== 36) {
    const { data: matched } = await supabase
      .from('service_locations')
      .select('id')
      .eq('service_plan_id', plan_id)
      .eq('is_active', true)
      .ilike('name', `%${location_id}%`)
      .limit(1)
      .single();
    if (!matched) return { error: `No location matching "${location_id}" found in this plan` };
    location_id = matched.id;
  }

  // Resolve worker by name if needed
  let assignedWorkerId = null;
  if (worker_id) {
    if (worker_id.length !== 36) {
      const { data: matched } = await supabase
        .from('workers')
        .select('id')
        .eq('owner_id', ownerId)
        .ilike('full_name', `%${worker_id}%`)
        .limit(1)
        .single();
      if (matched) assignedWorkerId = matched.id;
    } else {
      assignedWorkerId = worker_id;
    }
  }

  // Create visit
  const { data: visit, error } = await supabase
    .from('service_visits')
    .insert({
      service_plan_id: plan_id,
      service_location_id: location_id,
      owner_id: ownerId,
      scheduled_date: date,
      assigned_worker_id: assignedWorkerId,
      owner_notes: notes || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Copy checklist templates
  const { data: templates } = await supabase
    .from('visit_checklist_templates')
    .select('*')
    .eq('service_location_id', location_id)
    .eq('is_active', true);

  if (templates && templates.length > 0) {
    await supabase.from('visit_checklist_items').insert(
      templates.map(t => ({
        service_visit_id: visit.id,
        template_id: t.id,
        owner_id: ownerId,
        title: t.title,
        sort_order: t.sort_order,
        quantity_unit: t.quantity_unit,
      }))
    );
  }

  // Get location name for confirmation
  const { data: loc } = await supabase
    .from('service_locations')
    .select('name')
    .eq('id', location_id)
    .single();

  return {
    success: true,
    visit_id: visit.id,
    location_name: loc?.name || 'Unknown',
    scheduled_date: date,
    checklist_items: templates?.length || 0,
  };
}

// ──────────────── Service plan CRUD additions ────────────────

async function update_service_plan(userId, args = {}) {
  let { plan_id, name, status, billing_cycle, price_per_visit, monthly_rate, service_type, notes } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (billing_cycle !== undefined) updates.billing_cycle = billing_cycle;
  if (price_per_visit !== undefined) updates.price_per_visit = price_per_visit;
  if (monthly_rate !== undefined) updates.monthly_rate = monthly_rate;
  if (service_type !== undefined) updates.service_type = service_type;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) return { error: 'No fields to update' };

  const { data, error } = await supabase
    .from('service_plans')
    .update(updates)
    .eq('id', plan_id)
    .eq('owner_id', ownerId)
    .select('id, name, status, billing_cycle, price_per_visit, monthly_rate, service_type')
    .single();

  if (error) return { error: error.message };
  if (!data) return { error: 'Service plan not found' };

  logger.info(`✅ Updated service plan ${plan_id}`);
  return { success: true, plan: data };
}

async function add_service_location(userId, args = {}) {
  let { plan_id, name, address, access_notes } = args;
  if (!plan_id || !name || !address) return { error: 'plan_id, name, and address are required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  const { data, error } = await supabase
    .from('service_locations')
    .insert({
      service_plan_id: plan_id,
      owner_id: ownerId,
      name,
      address,
      access_notes: access_notes || null,
      is_active: true,
    })
    .select('id, name, address')
    .single();

  if (error) return { error: error.message };
  return { success: true, location: data };
}

async function assign_worker_to_plan(userId, args = {}) {
  let { plan_id, worker_id } = args;
  if (!plan_id || !worker_id) return { error: 'plan_id and worker_id are required' };

  const ownerId = await resolveOwnerId(userId);

  const planResolved = await resolveServicePlanId(userId, plan_id);
  if (planResolved.error) return { error: planResolved.error };
  if (planResolved.suggestions) return planResolved;
  plan_id = planResolved.id;

  const workerResolved = await resolveWorkerId(userId, worker_id);
  if (workerResolved.error) return { error: workerResolved.error };
  if (workerResolved.suggestions) return workerResolved;
  worker_id = workerResolved.id;

  // Assign worker to all upcoming (non-cancelled, non-completed) visits in this plan
  const today = new Date().toISOString().split('T')[0];
  const { data: visits, error } = await supabase
    .from('service_visits')
    .update({ assigned_worker_id: worker_id })
    .eq('service_plan_id', plan_id)
    .eq('owner_id', ownerId)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'in_progress'])
    .select('id');

  if (error) return { error: error.message };

  return {
    success: true,
    plan_id,
    worker_id,
    visits_assigned: visits?.length || 0,
  };
}

async function calculate_service_plan_revenue(userId, args = {}) {
  let { plan_id, start_date, end_date } = args;
  const ownerId = await resolveOwnerId(userId);

  // Default to current month if no range
  const now = new Date();
  if (!start_date) {
    start_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (!end_date) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    end_date = next.toISOString().split('T')[0];
  }

  // Fetch plans (one or all)
  let plansQuery = supabase
    .from('service_plans')
    .select('id, name, service_type, billing_cycle, price_per_visit, monthly_rate, status')
    .eq('owner_id', ownerId);

  if (plan_id) {
    const resolved = await resolveServicePlanId(userId, plan_id);
    if (resolved.error) return { error: resolved.error };
    if (resolved.suggestions) return resolved;
    plansQuery = plansQuery.eq('id', resolved.id);
  } else {
    plansQuery = plansQuery.eq('status', 'active');
  }

  const { data: plans, error: planErr } = await plansQuery;
  if (planErr) return { error: planErr.message };
  if (!plans || plans.length === 0) return { error: 'No service plans found' };

  const planIds = plans.map(p => p.id);

  // Visits in range
  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status, billable, invoice_id')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', start_date)
    .lt('scheduled_date', end_date)
    .neq('status', 'cancelled');

  // Months covered for monthly billing
  const startD = new Date(start_date);
  const endD = new Date(end_date);
  const monthsCovered = Math.max(
    1,
    (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth())
  );

  const breakdown = plans.map(plan => {
    const planVisits = (visits || []).filter(v => v.service_plan_id === plan.id);
    const completed = planVisits.filter(v => v.status === 'completed');
    const billableCompleted = completed.filter(v => v.billable !== false);
    const invoiced = billableCompleted.filter(v => v.invoice_id);
    const unbilled = billableCompleted.filter(v => !v.invoice_id);

    const rate = plan.billing_cycle === 'per_visit'
      ? parseFloat(plan.price_per_visit || 0)
      : parseFloat(plan.monthly_rate || 0);

    let projectedRevenue, realizedRevenue, unbilledRevenue;
    if (plan.billing_cycle === 'per_visit') {
      projectedRevenue = planVisits.length * rate;
      realizedRevenue = invoiced.length * rate;
      unbilledRevenue = unbilled.length * rate;
    } else {
      projectedRevenue = rate * monthsCovered;
      realizedRevenue = invoiced.length > 0 ? rate * monthsCovered : 0;
      unbilledRevenue = unbilled.length > 0 ? rate * monthsCovered : 0;
    }

    return {
      plan_id: plan.id,
      plan_name: plan.name,
      service_type: plan.service_type,
      billing_cycle: plan.billing_cycle,
      rate,
      visit_count: planVisits.length,
      completed: completed.length,
      invoiced: invoiced.length,
      unbilled: unbilled.length,
      projected_revenue: Math.round(projectedRevenue * 100) / 100,
      realized_revenue: Math.round(realizedRevenue * 100) / 100,
      unbilled_revenue: Math.round(unbilledRevenue * 100) / 100,
    };
  });

  const totals = breakdown.reduce((acc, b) => ({
    projected: acc.projected + b.projected_revenue,
    realized: acc.realized + b.realized_revenue,
    unbilled: acc.unbilled + b.unbilled_revenue,
  }), { projected: 0, realized: 0, unbilled: 0 });

  return {
    period: { start_date, end_date },
    plans: breakdown,
    totals: {
      projected_revenue: Math.round(totals.projected * 100) / 100,
      realized_revenue: Math.round(totals.realized * 100) / 100,
      unbilled_revenue: Math.round(totals.unbilled * 100) / 100,
    },
  };
}

async function get_service_plan_details(userId, args = {}) {
  let { plan_id } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  // Plan
  const { data: plan, error } = await supabase
    .from('service_plans')
    .select('*')
    .eq('id', plan_id)
    .eq('owner_id', ownerId)
    .single();

  if (error || !plan) return { error: 'Service plan not found' };

  // Locations + checklists
  const { data: locations } = await supabase
    .from('service_locations')
    .select('id, name, address, access_notes, is_active')
    .eq('service_plan_id', plan_id)
    .order('created_at', { ascending: true });

  // Recent visits (last 30 days + upcoming 30 days)
  const today = new Date();
  const past = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0];
  const future = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

  const { data: visits } = await supabase
    .from('service_visits')
    .select('id, scheduled_date, status, billable, invoice_id, assigned_worker_id, service_location_id')
    .eq('service_plan_id', plan_id)
    .gte('scheduled_date', past)
    .lte('scheduled_date', future)
    .order('scheduled_date', { ascending: true });

  // Worker names for assigned visits
  const workerIds = [...new Set((visits || []).map(v => v.assigned_worker_id).filter(Boolean))];
  let workerMap = {};
  if (workerIds.length > 0) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, full_name, name')
      .in('id', workerIds);
    (workers || []).forEach(w => { workerMap[w.id] = w.full_name || w.name; });
  }

  // Financials from project_transactions
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, category, amount')
    .eq('service_plan_id', plan_id);

  const financials = { income: 0, expenses: 0, byCategory: {} };
  (transactions || []).forEach(t => {
    const amount = parseFloat(t.amount) || 0;
    if (t.type === 'income') financials.income += amount;
    else if (t.type === 'expense') {
      financials.expenses += amount;
      financials.byCategory[t.category] = (financials.byCategory[t.category] || 0) + amount;
    }
  });
  financials.profit = financials.income - financials.expenses;

  return {
    id: plan.id,
    name: plan.name,
    service_type: plan.service_type,
    status: plan.status,
    billing_cycle: plan.billing_cycle,
    price_per_visit: plan.price_per_visit ? parseFloat(plan.price_per_visit) : null,
    monthly_rate: plan.monthly_rate ? parseFloat(plan.monthly_rate) : null,
    notes: plan.notes,
    created_at: plan.created_at,
    locations: locations || [],
    location_count: (locations || []).length,
    visits: (visits || []).map(v => ({
      ...v,
      worker_name: v.assigned_worker_id ? workerMap[v.assigned_worker_id] : null,
    })),
    visit_count: (visits || []).length,
    financials,
  };
}

async function get_service_plan_summary(userId, args = {}) {
  let { plan_id } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  const { data: plan } = await supabase
    .from('service_plans')
    .select('id, name, service_type, status, billing_cycle, price_per_visit, monthly_rate')
    .eq('id', plan_id)
    .eq('owner_id', ownerId)
    .single();

  if (!plan) return { error: 'Service plan not found' };

  // Parallel: location count, current month visits, lifetime revenue
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];

  const [locCount, monthVisits, allTxns] = await Promise.all([
    supabase.from('service_locations').select('id', { count: 'exact', head: true }).eq('service_plan_id', plan_id).eq('is_active', true),
    supabase.from('service_visits').select('status').eq('service_plan_id', plan_id).gte('scheduled_date', monthStart).lt('scheduled_date', nextMonth).neq('status', 'cancelled'),
    supabase.from('project_transactions').select('type, amount').eq('service_plan_id', plan_id),
  ]);

  const visitTotals = (monthVisits.data || []).reduce((acc, v) => {
    acc.total++;
    if (v.status === 'completed') acc.completed++;
    return acc;
  }, { total: 0, completed: 0 });

  const lifetimeFin = (allTxns.data || []).reduce((acc, t) => {
    const a = parseFloat(t.amount) || 0;
    if (t.type === 'income') acc.income += a;
    else if (t.type === 'expense') acc.expenses += a;
    return acc;
  }, { income: 0, expenses: 0 });

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      service_type: plan.service_type,
      status: plan.status,
      billing_cycle: plan.billing_cycle,
      rate: plan.billing_cycle === 'per_visit' ? plan.price_per_visit : plan.monthly_rate,
    },
    active_locations: locCount.count || 0,
    visits_this_month: visitTotals,
    lifetime_revenue: Math.round(lifetimeFin.income * 100) / 100,
    lifetime_expenses: Math.round(lifetimeFin.expenses * 100) / 100,
    lifetime_profit: Math.round((lifetimeFin.income - lifetimeFin.expenses) * 100) / 100,
  };
}

async function delete_service_plan(userId, args = {}) {
  let { plan_id } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  // Owners only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (profile?.role === 'supervisor') {
    return { error: 'Supervisors cannot delete service plans. Please ask the owner.' };
  }

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: plan } = await supabase
    .from('service_plans')
    .select('name')
    .eq('id', resolved.id)
    .eq('owner_id', ownerId)
    .single();

  if (!plan) return { error: 'Service plan not found or access denied' };

  // Detach time_tracking rows first — the FK in Postgres is NO ACTION (blocks delete).
  // We preserve the clock-in/clock-out history but unlink it from the deleted plan.
  // (A migration fixing the FK to ON DELETE SET NULL is also shipped — this is a belt-and-braces.)
  const { error: detachErr } = await supabase
    .from('time_tracking')
    .update({ service_plan_id: null })
    .eq('service_plan_id', resolved.id);
  if (detachErr) {
    logger.warn(`delete_service_plan: time_tracking detach warning: ${detachErr.message}`);
  }

  const { error } = await supabase
    .from('service_plans')
    .delete()
    .eq('id', resolved.id)
    .eq('owner_id', ownerId);

  if (error) return userSafeError(error, "Couldn't delete it. Try again.");
  return { success: true, deletedPlan: plan.name };
}

async function get_service_plan_documents(userId, args = {}) {
  let { plan_id, category } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  let query = supabase
    .from('project_documents')
    .select('id, file_name, file_type, category, notes, visible_to_workers, created_at')
    .eq('service_plan_id', resolved.id)
    .order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    logger.error('get_service_plan_documents error:', error);
    return { error: 'Failed to fetch documents' };
  }

  return {
    documents: (data || []).map(d => ({
      id: d.id,
      fileName: d.file_name,
      fileType: d.file_type,
      category: d.category,
      notes: d.notes,
      visibleToWorkers: d.visible_to_workers,
      createdAt: d.created_at,
    })),
    count: (data || []).length,
  };
}

async function upload_service_plan_document(userId, args = {}) {
  const { plan_id, category = 'general', visible_to_workers = false } = args;
  const attachments = args._attachments;

  if (!attachments || attachments.length === 0) {
    return { error: 'No files attached. Please attach files to your message and try again.' };
  }
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  const uploaded = [];
  const failed = [];

  for (const att of attachments) {
    try {
      const fileName = att.name || `Document_${Date.now()}`;
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';

      const mimeType = att.mimeType || 'application/octet-stream';
      const v = validateUpload({ ...att, mimeType });
      if (v) {
        failed.push({ fileName, error: v.error });
        continue;
      }
      let fileType = 'document';
      if (mimeType.startsWith('image/')) fileType = 'image';
      else if (mimeType === 'application/pdf' || fileExt === 'pdf') fileType = 'pdf';

      const filePath = safeStorageKey(`${userId}/service-plans/${resolved.id}`, fileName);
      const binaryString = Buffer.from(att.base64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, binaryString, { contentType: mimeType, upsert: false });

      if (uploadError) {
        logger.error('service-plan doc upload error:', uploadError);
        failed.push({ fileName, error: 'upload failed' });
        continue;
      }

      const { data: doc, error: dbError } = await supabase
        .from('project_documents')
        .insert({
          service_plan_id: resolved.id,
          file_name: args.file_name || fileName,
          file_url: filePath,
          file_type: fileType,
          category,
          uploaded_by: userId,
          visible_to_workers,
        })
        .select('id, file_name, file_type, category')
        .single();

      if (dbError) {
        failed.push({ fileName, error: dbError.message });
        continue;
      }

      uploaded.push(doc);
    } catch (err) {
      failed.push({ fileName: att.name, error: err.message });
    }
  }

  return {
    uploaded: uploaded.map(d => ({ id: d.id, fileName: d.file_name, fileType: d.file_type, category: d.category })),
    uploadedCount: uploaded.length,
    failedCount: failed.length,
    failed: failed.length > 0 ? failed : undefined,
  };
}

async function update_service_location(userId, args = {}) {
  let { location_id, name, address, access_notes, is_active } = args;
  if (!location_id) return { error: 'location_id is required' };

  const ownerId = await resolveOwnerId(userId);

  // Ownership check: fetch location then verify its plan belongs to owner
  const { data: location } = await supabase
    .from('service_locations')
    .select('id, service_plan_id')
    .eq('id', location_id)
    .single();

  if (!location) return { error: 'Service location not found' };

  const { data: plan } = await supabase
    .from('service_plans')
    .select('id')
    .eq('id', location.service_plan_id)
    .eq('owner_id', ownerId)
    .single();

  if (!plan) return { error: 'Service location not found or access denied' };

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (access_notes !== undefined) updates.access_notes = access_notes;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) return { error: 'No fields to update' };

  const { data, error } = await supabase
    .from('service_locations')
    .update(updates)
    .eq('id', location_id)
    .select('id, name, address, access_notes, is_active')
    .single();

  if (error) return { error: error.message };
  return { success: true, location: data };
}

async function setup_daily_checklist(userId, { project_id, service_plan_id, checklist_items, labor_roles } = {}) {
  if (!checklist_items || !Array.isArray(checklist_items) || checklist_items.length === 0) {
    return { error: 'checklist_items array is required' };
  }
  if (!project_id && !service_plan_id) {
    return { error: 'Either project_id or service_plan_id is required' };
  }

  const ownerId = await resolveOwnerId(userId);

  // Resolve project by name if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }

  // Resolve service plan by name if needed
  if (service_plan_id) {
    const resolved = await resolveServicePlanId(userId, service_plan_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    service_plan_id = resolved.id;
  }

  const parentFields = project_id
    ? { project_id, service_plan_id: null }
    : { project_id: null, service_plan_id };

  // Insert checklist templates
  const checklistInserts = checklist_items.map((item, i) => ({
    ...parentFields,
    owner_id: ownerId,
    title: item.title,
    item_type: item.item_type || 'checkbox',
    quantity_unit: item.quantity_unit || null,
    requires_photo: item.requires_photo || false,
    sort_order: i,
  }));

  const { data: checklistData, error: checklistError } = await supabase
    .from('daily_checklist_templates')
    .insert(checklistInserts)
    .select();

  if (checklistError) return { error: checklistError.message };

  // Insert labor roles if provided
  let laborData = [];
  if (labor_roles && Array.isArray(labor_roles) && labor_roles.length > 0) {
    const laborInserts = labor_roles.map((role, i) => ({
      ...parentFields,
      owner_id: ownerId,
      role_name: role.role_name,
      default_quantity: role.default_quantity || 1,
      sort_order: i,
    }));

    const { data: lData, error: laborError } = await supabase
      .from('labor_role_templates')
      .insert(laborInserts)
      .select();

    if (laborError) return { error: laborError.message };
    laborData = lData || [];
  }

  return {
    success: true,
    checklist_items: checklistData.map(t => ({
      id: t.id,
      title: t.title,
      item_type: t.item_type,
      quantity_unit: t.quantity_unit,
      requires_photo: t.requires_photo,
    })),
    labor_roles: laborData.map(r => ({
      id: r.id,
      role_name: r.role_name,
      default_quantity: r.default_quantity,
    })),
  };
}


module.exports = {
  update_service_pricing,
  get_service_plans,
  get_daily_route,
  complete_visit,
  get_billing_summary,
  create_service_visit,
  update_service_plan,
  add_service_location,
  update_service_location,
  assign_worker_to_plan,
  calculate_service_plan_revenue,
  get_service_plan_details,
  get_service_plan_summary,
  delete_service_plan,
  get_service_plan_documents,
  upload_service_plan_document,
  setup_daily_checklist,
};
