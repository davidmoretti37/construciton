/**
 * Service Visits API Routes
 * CRUD, generation, and actions for service visits
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Auth middleware
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (error) {
    logger.error('[ServiceVisits] Auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

router.use(authenticateUser);

// ============================================================
// HELPERS
// ============================================================

/**
 * Compute dates matching a schedule within a date range
 */
function getMatchingDates(schedule, fromDate, toDate) {
  const dates = [];
  const current = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  while (current <= end) {
    const dayName = dayNames[current.getDay()];

    if (schedule.frequency === 'monthly') {
      if (current.getDate() === schedule.day_of_month) {
        dates.push(formatDate(current));
      }
    } else if (schedule.frequency === 'biweekly') {
      const anchor = new Date(schedule.effective_from + 'T00:00:00');
      const diffMs = current.getTime() - anchor.getTime();
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      const weekNum = Math.floor(diffDays / 7);
      if (weekNum >= 0 && weekNum % 2 === 0 && (schedule.scheduled_days || []).includes(dayName)) {
        dates.push(formatDate(current));
      }
    } else {
      // weekly or custom
      if ((schedule.scheduled_days || []).includes(dayName)) {
        dates.push(formatDate(current));
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Copy checklist templates into visit_checklist_items for a visit
 */
async function copyChecklistTemplates(visitId, locationId, ownerId) {
  const { data: templates } = await supabase
    .from('visit_checklist_templates')
    .select('*')
    .eq('service_location_id', locationId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (!templates || templates.length === 0) return 0;

  const items = templates.map(t => ({
    service_visit_id: visitId,
    template_id: t.id,
    owner_id: ownerId,
    title: t.title,
    sort_order: t.sort_order,
    quantity_unit: t.quantity_unit,
  }));

  const { error } = await supabase
    .from('visit_checklist_items')
    .insert(items);

  if (error) {
    logger.error('[ServiceVisits] Failed to copy checklist templates:', error.message);
    return 0;
  }

  return items.length;
}

// ============================================================
// DAILY VIEW
// ============================================================

// GET /daily — Daily route/visit view for owner or worker
router.get('/daily', async (req, res) => {
  try {
    const userId = req.user.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Check if user is a worker
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('id, owner_id')
      .eq('user_id', userId)
      .single();

    const isWorker = !!workerRecord;
    const ownerId = isWorker ? workerRecord.owner_id : userId;

    if (isWorker) {
      // Worker view: their assigned visits for the day
      const { data: visits } = await supabase
        .from('service_visits')
        .select('*')
        .eq('assigned_worker_id', workerRecord.id)
        .eq('scheduled_date', date)
        .neq('status', 'cancelled')
        .order('scheduled_time', { ascending: true, nullsFirst: false });

      if (!visits || visits.length === 0) {
        return res.json({ date, visits: [] });
      }

      // Enrich with location + checklist stats
      const locationIds = [...new Set(visits.map(v => v.service_location_id))];
      const { data: locations } = await supabase
        .from('service_locations')
        .select('id, name, address, latitude, longitude, access_notes')
        .in('id', locationIds);
      const locMap = {};
      (locations || []).forEach(l => { locMap[l.id] = l; });

      const visitIds = visits.map(v => v.id);
      const { data: checklistItems } = await supabase
        .from('visit_checklist_items')
        .select('service_visit_id, completed')
        .in('service_visit_id', visitIds);

      const clStats = {};
      (checklistItems || []).forEach(ci => {
        if (!clStats[ci.service_visit_id]) clStats[ci.service_visit_id] = { total: 0, completed: 0 };
        clStats[ci.service_visit_id].total++;
        if (ci.completed) clStats[ci.service_visit_id].completed++;
      });

      // Get route stop orders
      const { data: routeStops } = await supabase
        .from('route_stops')
        .select('service_visit_id, stop_order')
        .in('service_visit_id', visitIds);
      const stopOrderMap = {};
      (routeStops || []).forEach(rs => { stopOrderMap[rs.service_visit_id] = rs.stop_order; });

      const enrichedVisits = visits.map(v => ({
        ...v,
        location: locMap[v.service_location_id] || null,
        checklist_total: (clStats[v.id] || { total: 0 }).total,
        checklist_completed: (clStats[v.id] || { completed: 0 }).completed,
        stop_order: stopOrderMap[v.id] ?? null,
      }));

      // Sort by stop_order (if in route) then scheduled_time
      enrichedVisits.sort((a, b) => {
        if (a.stop_order !== null && b.stop_order !== null) return a.stop_order - b.stop_order;
        if (a.stop_order !== null) return -1;
        if (b.stop_order !== null) return 1;
        return 0;
      });

      return res.json({ date, visits: enrichedVisits });
    }

    // Owner view: all routes + unrouted visits
    const { data: routes } = await supabase
      .from('service_routes')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('route_date', date)
      .order('created_at', { ascending: true });

    // Get worker names for routes
    const workerIds = [...new Set((routes || []).map(r => r.assigned_worker_id).filter(Boolean))];
    let workerNames = {};
    if (workerIds.length > 0) {
      const { data: workers } = await supabase
        .from('workers')
        .select('id, full_name, name')
        .in('id', workerIds);
      if (workers) workers.forEach(w => { workerNames[w.id] = w.full_name || w.name; });
    }

    // Build route details with stops
    const routeResults = [];
    for (const route of (routes || [])) {
      const { data: stops } = await supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', route.id)
        .order('stop_order', { ascending: true });

      const visitIds = (stops || []).map(s => s.service_visit_id);
      let visitMap = {};
      let locMap = {};
      let clStats = {};

      if (visitIds.length > 0) {
        const { data: visits } = await supabase
          .from('service_visits')
          .select('id, status, scheduled_time, started_at, completed_at, service_location_id')
          .in('id', visitIds);
        (visits || []).forEach(v => { visitMap[v.id] = v; });

        const locationIds = [...new Set((visits || []).map(v => v.service_location_id))];
        if (locationIds.length > 0) {
          const { data: locations } = await supabase
            .from('service_locations')
            .select('id, name, address, latitude, longitude, access_notes')
            .in('id', locationIds);
          (locations || []).forEach(l => { locMap[l.id] = l; });
        }

        const { data: checklistItems } = await supabase
          .from('visit_checklist_items')
          .select('service_visit_id, completed')
          .in('service_visit_id', visitIds);
        (checklistItems || []).forEach(ci => {
          if (!clStats[ci.service_visit_id]) clStats[ci.service_visit_id] = { total: 0, completed: 0 };
          clStats[ci.service_visit_id].total++;
          if (ci.completed) clStats[ci.service_visit_id].completed++;
        });
      }

      routeResults.push({
        route: {
          id: route.id,
          name: route.name,
          assigned_worker_id: route.assigned_worker_id,
          worker_name: workerNames[route.assigned_worker_id] || null,
          status: route.status,
        },
        stops: (stops || []).map(s => {
          const visit = visitMap[s.service_visit_id] || {};
          const location = locMap[visit.service_location_id] || {};
          const stats = clStats[s.service_visit_id] || { total: 0, completed: 0 };
          return {
            stop_order: s.stop_order,
            visit: {
              id: s.service_visit_id,
              status: visit.status,
              scheduled_time: visit.scheduled_time,
              location: {
                name: location.name,
                address: location.address,
                latitude: location.latitude,
                longitude: location.longitude,
                access_notes: location.access_notes,
              },
              checklist_total: stats.total,
              checklist_completed: stats.completed,
            },
          };
        }),
      });
    }

    // Get unrouted visits for the date
    const { data: unrouted } = await supabase
      .from('service_visits')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('scheduled_date', date)
      .is('route_id', null)
      .neq('status', 'cancelled')
      .order('scheduled_time', { ascending: true, nullsFirst: false });

    // Enrich unrouted with location names
    if (unrouted && unrouted.length > 0) {
      const locIds = [...new Set(unrouted.map(v => v.service_location_id))];
      const { data: locs } = await supabase
        .from('service_locations')
        .select('id, name, address')
        .in('id', locIds);
      const lm = {};
      (locs || []).forEach(l => { lm[l.id] = l; });
      unrouted.forEach(v => {
        v.location_name = lm[v.service_location_id]?.name;
        v.location_address = lm[v.service_location_id]?.address;
      });
    }

    res.json({ date, routes: routeResults, unrouted: unrouted || [] });
  } catch (error) {
    logger.error('[ServiceVisits] Daily view error:', error.message);
    res.status(500).json({ error: 'Failed to get daily view' });
  }
});

// ============================================================
// VISIT CRUD
// ============================================================

// GET / — List visits with filters
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, worker_id, plan_id, status, unbilled } = req.query;

    // Check if user is a worker
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('id, owner_id')
      .eq('user_id', userId)
      .single();

    let query = supabase
      .from('service_visits')
      .select('*')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: false });

    if (workerRecord) {
      query = query.eq('assigned_worker_id', workerRecord.id);
    } else {
      query = query.eq('owner_id', userId);
    }

    if (date) query = query.eq('scheduled_date', date);
    if (worker_id) query = query.eq('assigned_worker_id', worker_id);
    if (plan_id) query = query.eq('service_plan_id', plan_id);
    if (status) query = query.eq('status', status);
    if (unbilled === 'true') {
      query = query.is('invoice_id', null).eq('billable', true).eq('status', 'completed');
    }

    const { data: visits, error } = await query;
    if (error) throw error;

    if (!visits || visits.length === 0) return res.json([]);

    // Enrich with related names via separate queries
    const locationIds = [...new Set(visits.map(v => v.service_location_id))];
    const planIds = [...new Set(visits.map(v => v.service_plan_id))];
    const workerIds = [...new Set(visits.map(v => v.assigned_worker_id).filter(Boolean))];
    const routeIds = [...new Set(visits.map(v => v.route_id).filter(Boolean))];

    const [locRes, planRes, workerRes, routeRes] = await Promise.all([
      locationIds.length > 0
        ? supabase.from('service_locations').select('id, name, address').in('id', locationIds)
        : { data: [] },
      planIds.length > 0
        ? supabase.from('service_plans').select('id, name').in('id', planIds)
        : { data: [] },
      workerIds.length > 0
        ? supabase.from('workers').select('id, full_name, name').in('id', workerIds)
        : { data: [] },
      routeIds.length > 0
        ? supabase.from('service_routes').select('id, name').in('id', routeIds)
        : { data: [] },
    ]);

    const locMap = {};
    (locRes.data || []).forEach(l => { locMap[l.id] = l; });
    const planMap = {};
    (planRes.data || []).forEach(p => { planMap[p.id] = p; });
    const workerMap = {};
    (workerRes.data || []).forEach(w => { workerMap[w.id] = w; });
    const routeMap = {};
    (routeRes.data || []).forEach(r => { routeMap[r.id] = r; });

    const enriched = visits.map(v => ({
      ...v,
      location_name: locMap[v.service_location_id]?.name,
      location_address: locMap[v.service_location_id]?.address,
      plan_name: planMap[v.service_plan_id]?.name,
      worker_name: workerMap[v.assigned_worker_id]?.full_name || workerMap[v.assigned_worker_id]?.name || null,
      route_name: routeMap[v.route_id]?.name || null,
    }));

    res.json(enriched);
  } catch (error) {
    logger.error('[ServiceVisits] List error:', error.message);
    res.status(500).json({ error: 'Failed to list visits' });
  }
});

// POST / — Create single visit
router.post('/', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { service_plan_id, service_location_id, scheduled_date, scheduled_time,
      assigned_worker_id, billable } = req.body;

    if (!service_plan_id || !service_location_id || !scheduled_date) {
      return res.status(400).json({ error: 'service_plan_id, service_location_id, and scheduled_date are required' });
    }

    // Verify plan ownership
    const { data: plan } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', service_plan_id)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    const { data: visit, error } = await supabase
      .from('service_visits')
      .insert({
        service_plan_id,
        service_location_id,
        owner_id: ownerId,
        scheduled_date,
        scheduled_time: scheduled_time || null,
        assigned_worker_id: assigned_worker_id || null,
        billable: billable !== false,
      })
      .select()
      .single();

    if (error) throw error;

    // Copy checklist templates
    const checklistCount = await copyChecklistTemplates(visit.id, service_location_id, ownerId);

    logger.info(`[ServiceVisits] Created visit for ${scheduled_date} with ${checklistCount} checklist items`);
    res.status(201).json({ ...visit, checklist_items_created: checklistCount });
  } catch (error) {
    logger.error('[ServiceVisits] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create visit' });
  }
});

// PATCH /:id — Update visit
router.patch('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const allowedFields = ['status', 'worker_notes', 'owner_notes', 'assigned_worker_id',
      'scheduled_date', 'scheduled_time', 'route_id', 'billable'];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('service_visits')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Visit not found' });

    res.json(data);

    // Trigger rolling regeneration if status changed to completed
    if (updates.status === 'completed' && data.service_plan_id) {
      const { checkAndRegenerateVisits } = require('../services/visitGenerator');
      checkAndRegenerateVisits(data.service_plan_id).catch(e =>
        logger.error('[ServiceVisits] Background regeneration error:', e.message)
      );
    }
  } catch (error) {
    logger.error('[ServiceVisits] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update visit' });
  }
});

// DELETE /:id — Cancel visit
router.delete('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('service_visits')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Visit not found' });

    res.json({ success: true });
  } catch (error) {
    logger.error('[ServiceVisits] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to cancel visit' });
  }
});

// ============================================================
// VISIT GENERATION
// ============================================================

// POST /generate — Bulk generate visits from schedules
router.post('/generate', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { plan_id, from_date, to_date } = req.body;

    if (!plan_id || !from_date || !to_date) {
      return res.status(400).json({ error: 'plan_id, from_date, and to_date are required' });
    }

    // Enforce max 60-day window
    const fromMs = new Date(from_date).getTime();
    const toMs = new Date(to_date).getTime();
    if ((toMs - fromMs) > 60 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Date range cannot exceed 60 days' });
    }

    // Verify plan ownership
    const { data: plan } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', plan_id)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    // Get active locations
    const { data: locations } = await supabase
      .from('service_locations')
      .select('id')
      .eq('service_plan_id', plan_id)
      .eq('is_active', true);

    if (!locations || locations.length === 0) {
      return res.json({ created: 0, skipped: 0, message: 'No active locations' });
    }

    const locationIds = locations.map(l => l.id);
    const today = new Date().toISOString().split('T')[0];

    // Get active schedules for all locations
    const { data: schedules } = await supabase
      .from('location_schedules')
      .select('*')
      .in('service_location_id', locationIds)
      .eq('is_active', true)
      .or(`effective_until.is.null,effective_until.gte.${today}`);

    if (!schedules || schedules.length === 0) {
      return res.json({ created: 0, skipped: 0, message: 'No active schedules' });
    }

    // Get existing visits to avoid duplicates
    const { data: existingVisits } = await supabase
      .from('service_visits')
      .select('service_location_id, scheduled_date')
      .eq('service_plan_id', plan_id)
      .gte('scheduled_date', from_date)
      .lte('scheduled_date', to_date)
      .neq('status', 'cancelled');

    const existingSet = new Set();
    if (existingVisits) {
      existingVisits.forEach(v => {
        existingSet.add(`${v.service_location_id}|${v.scheduled_date}`);
      });
    }

    // Generate visits
    let created = 0;
    let skipped = 0;
    const visitsToInsert = [];

    for (const schedule of schedules) {
      const dates = getMatchingDates(schedule, from_date, to_date);

      for (const date of dates) {
        const key = `${schedule.service_location_id}|${date}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }

        visitsToInsert.push({
          service_plan_id: plan_id,
          service_location_id: schedule.service_location_id,
          owner_id: ownerId,
          scheduled_date: date,
          scheduled_time: schedule.preferred_time || null,
          generated_from_schedule_id: schedule.id,
        });

        existingSet.add(key); // Prevent duplicates within same generation
      }
    }

    if (visitsToInsert.length === 0) {
      return res.json({ created: 0, skipped });
    }

    // Batch insert visits
    const { data: createdVisits, error: insertError } = await supabase
      .from('service_visits')
      .insert(visitsToInsert)
      .select('id, service_location_id');

    if (insertError) throw insertError;

    created = createdVisits.length;

    // Bulk copy checklist templates for all created visits
    const templatesByLocation = {};
    for (const locationId of locationIds) {
      const { data: templates } = await supabase
        .from('visit_checklist_templates')
        .select('*')
        .eq('service_location_id', locationId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (templates && templates.length > 0) {
        templatesByLocation[locationId] = templates;
      }
    }

    const checklistItems = [];
    for (const visit of createdVisits) {
      const templates = templatesByLocation[visit.service_location_id];
      if (templates) {
        templates.forEach(t => {
          checklistItems.push({
            service_visit_id: visit.id,
            template_id: t.id,
            owner_id: ownerId,
            title: t.title,
            sort_order: t.sort_order,
            quantity_unit: t.quantity_unit,
          });
        });
      }
    }

    if (checklistItems.length > 0) {
      // Insert in batches of 500 to avoid payload limits
      for (let i = 0; i < checklistItems.length; i += 500) {
        const batch = checklistItems.slice(i, i + 500);
        await supabase.from('visit_checklist_items').insert(batch);
      }
    }

    logger.info(`[ServiceVisits] Generated ${created} visits (${skipped} skipped) for plan ${plan_id}`);
    res.status(201).json({ created, skipped, checklist_items: checklistItems.length });
  } catch (error) {
    logger.error('[ServiceVisits] Generate error:', error.message);
    res.status(500).json({ error: 'Failed to generate visits' });
  }
});

// ============================================================
// VISIT ACTIONS
// ============================================================

// POST /:id/start — Start a visit
router.post('/:id/start', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Determine if user is owner or worker
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('id, owner_id')
      .eq('user_id', userId)
      .single();

    // Build ownership filter
    let query = supabase
      .from('service_visits')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (workerRecord) {
      query = query.eq('assigned_worker_id', workerRecord.id);
    } else {
      query = query.eq('owner_id', userId);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Visit not found or not assigned to you' });

    logger.info(`[ServiceVisits] Started visit ${id}`);
    res.json(data);
  } catch (error) {
    logger.error('[ServiceVisits] Start error:', error.message);
    res.status(500).json({ error: 'Failed to start visit' });
  }
});

// POST /:id/complete — Complete a visit
router.post('/:id/complete', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Determine if user is owner or worker
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('id, owner_id')
      .eq('user_id', userId)
      .single();

    // Fetch visit with ownership check
    let fetchQuery = supabase
      .from('service_visits')
      .select('*')
      .eq('id', id);

    if (workerRecord) {
      fetchQuery = fetchQuery.eq('assigned_worker_id', workerRecord.id);
    } else {
      fetchQuery = fetchQuery.eq('owner_id', userId);
    }

    const { data: visit } = await fetchQuery.single();
    if (!visit) return res.status(404).json({ error: 'Visit not found or not assigned to you' });

    const now = new Date();
    let durationMinutes = null;
    if (visit.started_at) {
      durationMinutes = Math.round((now.getTime() - new Date(visit.started_at).getTime()) / 60000);
    }

    const { data, error } = await supabase
      .from('service_visits')
      .update({
        status: 'completed',
        completed_at: now.toISOString(),
        duration_minutes: durationMinutes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`[ServiceVisits] Completed visit ${id} (${durationMinutes || '?'} min)`);
    res.json(data);

    // Trigger rolling visit regeneration in the background (non-blocking)
    if (data.service_plan_id) {
      const { checkAndRegenerateVisits } = require('../services/visitGenerator');
      checkAndRegenerateVisits(data.service_plan_id).catch(e =>
        logger.error('[ServiceVisits] Background regeneration error:', e.message)
      );
    }
  } catch (error) {
    logger.error('[ServiceVisits] Complete error:', error.message);
    res.status(500).json({ error: 'Failed to complete visit' });
  }
});

// POST /:id/photos — Add photo to visit
router.post('/:id/photos', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { url, caption } = req.body;

    if (!url) return res.status(400).json({ error: 'url is required' });

    // Determine if user is owner or worker
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('id')
      .eq('user_id', userId)
      .single();

    // Get current photos with ownership check
    let fetchQuery = supabase
      .from('service_visits')
      .select('photos')
      .eq('id', id);

    if (workerRecord) {
      fetchQuery = fetchQuery.eq('assigned_worker_id', workerRecord.id);
    } else {
      fetchQuery = fetchQuery.eq('owner_id', userId);
    }

    const { data: visit } = await fetchQuery.single();
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const photos = [...(visit.photos || []), { url, caption: caption || null, added_at: new Date().toISOString() }];

    const { data, error } = await supabase
      .from('service_visits')
      .update({ photos })
      .eq('id', id)
      .select('photos')
      .single();

    if (error) throw error;

    res.json(data.photos);
  } catch (error) {
    logger.error('[ServiceVisits] Photo error:', error.message);
    res.status(500).json({ error: 'Failed to add photo' });
  }
});

// GET /:id/checklist — Get checklist items for a visit
router.get('/:id/checklist', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify visit access (owner or assigned worker)
    const { data: workerRecord } = await supabase
      .from('workers')
      .select('id')
      .eq('user_id', userId)
      .single();

    let visitQuery = supabase
      .from('service_visits')
      .select('id')
      .eq('id', id);

    if (workerRecord) {
      visitQuery = visitQuery.eq('assigned_worker_id', workerRecord.id);
    } else {
      visitQuery = visitQuery.eq('owner_id', userId);
    }

    const { data: visit } = await visitQuery.single();
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const { data, error } = await supabase
      .from('visit_checklist_items')
      .select('*')
      .eq('service_visit_id', id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    logger.error('[ServiceVisits] Checklist error:', error.message);
    res.status(500).json({ error: 'Failed to get checklist' });
  }
});

// PATCH /:id/checklist/:itemId — Update checklist item
router.patch('/:id/checklist/:itemId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { completed, quantity, photo_url, notes } = req.body;

    const updates = {};
    if (completed !== undefined) updates.completed = completed;
    if (quantity !== undefined) updates.quantity = quantity;
    if (photo_url !== undefined) updates.photo_url = photo_url;
    if (notes !== undefined) updates.notes = notes;

    // If marking complete, set completed_at and completed_by
    if (completed === true) {
      updates.completed_at = new Date().toISOString();

      // Look up worker record for this user
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (worker) {
        updates.completed_by = worker.id;
      }
    } else if (completed === false) {
      updates.completed_at = null;
      updates.completed_by = null;
    }

    const { data, error } = await supabase
      .from('visit_checklist_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Checklist item not found' });

    res.json(data);
  } catch (error) {
    logger.error('[ServiceVisits] Update checklist error:', error.message);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// ============================================================
// VISIT GENERATION
// ============================================================

// POST /generate/:planId — Generate visits for a service plan
router.post('/generate/:planId', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { planId } = req.params;
    const { weeksAhead = 8 } = req.body;

    // Verify plan ownership
    const { data: plan } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', planId)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    const { generateVisitsForPlan } = require('../services/visitGenerator');
    const result = await generateVisitsForPlan(planId, { weeksAhead });

    res.json(result);
  } catch (error) {
    logger.error('[ServiceVisits] Generate error:', error.message);
    res.status(500).json({ error: 'Failed to generate visits' });
  }
});

// POST /regenerate-all — Regenerate visits for all active plans (admin/owner)
router.post('/regenerate-all', async (req, res) => {
  try {
    const { regenerateAllPlans } = require('../services/visitGenerator');
    const result = await regenerateAllPlans();
    res.json(result);
  } catch (error) {
    logger.error('[ServiceVisits] Regenerate all error:', error.message);
    res.status(500).json({ error: 'Failed to regenerate visits' });
  }
});

module.exports = router;
