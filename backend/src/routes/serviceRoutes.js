/**
 * Service Routes API
 * CRUD for daily routes and route stops
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

router.use(authenticateUser);

// ============================================================
// ROUTE CRUD
// ============================================================

// GET / — List routes
router.get('/', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { date, worker_id } = req.query;

    let query = supabase
      .from('service_routes')
      .select('*')
      .eq('owner_id', ownerId)
      .order('route_date', { ascending: false });

    if (date) query = query.eq('route_date', date);
    if (worker_id) query = query.eq('assigned_worker_id', worker_id);

    const { data: routes, error } = await query;
    if (error) throw error;

    if (routes && routes.length > 0) {
      const routeIds = routes.map(r => r.id);

      // Get stop counts
      const { data: stops } = await supabase
        .from('route_stops')
        .select('route_id, service_visit_id')
        .in('route_id', routeIds);

      // Get visit statuses for completion percentage
      const visitIds = (stops || []).map(s => s.service_visit_id);
      let visitStatuses = {};
      if (visitIds.length > 0) {
        const { data: visits } = await supabase
          .from('service_visits')
          .select('id, status')
          .in('id', visitIds);
        if (visits) {
          visits.forEach(v => { visitStatuses[v.id] = v.status; });
        }
      }

      // Get worker names
      const workerIds = [...new Set(routes.map(r => r.assigned_worker_id).filter(Boolean))];
      let workerNames = {};
      if (workerIds.length > 0) {
        const { data: workers } = await supabase
          .from('workers')
          .select('id, full_name, name')
          .in('id', workerIds);
        if (workers) {
          workers.forEach(w => { workerNames[w.id] = w.full_name || w.name; });
        }
      }

      const stopsByRoute = {};
      (stops || []).forEach(s => {
        if (!stopsByRoute[s.route_id]) stopsByRoute[s.route_id] = [];
        stopsByRoute[s.route_id].push(s);
      });

      routes.forEach(r => {
        const routeStops = stopsByRoute[r.id] || [];
        r.stop_count = routeStops.length;
        const completed = routeStops.filter(s => visitStatuses[s.service_visit_id] === 'completed').length;
        r.completion_pct = routeStops.length > 0 ? Math.round((completed / routeStops.length) * 100) : 0;
        r.worker_name = workerNames[r.assigned_worker_id] || null;
      });
    }

    res.json(routes || []);
  } catch (error) {
    logger.error('[ServiceRoutes] List error:', error.message);
    res.status(500).json({ error: 'Failed to list routes' });
  }
});

// POST / — Create route
router.post('/', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { name, route_date, assigned_worker_id, notes } = req.body;

    if (!name || !route_date) {
      return res.status(400).json({ error: 'name and route_date are required' });
    }

    const { data, error } = await supabase
      .from('service_routes')
      .insert({
        owner_id: ownerId,
        name,
        route_date,
        assigned_worker_id: assigned_worker_id || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[ServiceRoutes] Created route "${name}" for ${route_date}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[ServiceRoutes] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create route' });
  }
});

// GET /:id — Route detail with full stops
router.get('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const { data: route, error } = await supabase
      .from('service_routes')
      .select('*')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (error || !route) return res.status(404).json({ error: 'Route not found' });

    // Get worker name
    if (route.assigned_worker_id) {
      const { data: worker } = await supabase
        .from('workers')
        .select('full_name, name')
        .eq('id', route.assigned_worker_id)
        .single();
      route.worker_name = worker?.full_name || worker?.name || null;
    }

    // Get stops with visit + location details
    const { data: stops } = await supabase
      .from('route_stops')
      .select('*')
      .eq('route_id', id)
      .order('stop_order', { ascending: true });

    if (stops && stops.length > 0) {
      const visitIds = stops.map(s => s.service_visit_id);

      const { data: visits } = await supabase
        .from('service_visits')
        .select('id, status, scheduled_time, started_at, completed_at, service_location_id')
        .in('id', visitIds);

      const locationIds = [...new Set((visits || []).map(v => v.service_location_id))];
      let locations = {};
      if (locationIds.length > 0) {
        const { data: locs } = await supabase
          .from('service_locations')
          .select('id, name, address, latitude, longitude, access_notes')
          .in('id', locationIds);
        if (locs) locs.forEach(l => { locations[l.id] = l; });
      }

      // Checklist stats
      const { data: checklistItems } = await supabase
        .from('visit_checklist_items')
        .select('service_visit_id, completed')
        .in('service_visit_id', visitIds);

      const checklistStats = {};
      (checklistItems || []).forEach(ci => {
        if (!checklistStats[ci.service_visit_id]) {
          checklistStats[ci.service_visit_id] = { total: 0, completed: 0 };
        }
        checklistStats[ci.service_visit_id].total++;
        if (ci.completed) checklistStats[ci.service_visit_id].completed++;
      });

      const visitMap = {};
      (visits || []).forEach(v => { visitMap[v.id] = v; });

      route.stops = stops.map(s => {
        const visit = visitMap[s.service_visit_id] || {};
        const location = locations[visit.service_location_id] || {};
        const stats = checklistStats[s.service_visit_id] || { total: 0, completed: 0 };
        return {
          id: s.id,
          stop_order: s.stop_order,
          estimated_arrival: s.estimated_arrival,
          actual_arrival: s.actual_arrival,
          visit: {
            id: s.service_visit_id,
            status: visit.status,
            scheduled_time: visit.scheduled_time,
            started_at: visit.started_at,
            completed_at: visit.completed_at,
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
      });
    } else {
      route.stops = [];
    }

    res.json(route);
  } catch (error) {
    logger.error('[ServiceRoutes] Detail error:', error.message);
    res.status(500).json({ error: 'Failed to get route' });
  }
});

// PATCH /:id — Update route
router.patch('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const allowedFields = ['name', 'assigned_worker_id', 'status', 'notes'];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('service_routes')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Route not found' });

    res.json(data);
  } catch (error) {
    logger.error('[ServiceRoutes] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update route' });
  }
});

// DELETE /:id — Delete route, unlink visits
router.delete('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    // Verify ownership
    const { data: route } = await supabase
      .from('service_routes')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!route) return res.status(404).json({ error: 'Route not found' });

    // Unlink visits
    await supabase
      .from('service_visits')
      .update({ route_id: null })
      .eq('route_id', id);

    // Delete route (cascades to route_stops)
    const { error } = await supabase
      .from('service_routes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logger.info(`[ServiceRoutes] Deleted route ${id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[ServiceRoutes] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

// ============================================================
// ROUTE STOPS
// ============================================================

// POST /:id/stops — Add stop to route
router.post('/:id/stops', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { visit_id, stop_order } = req.body;

    if (!visit_id || stop_order === undefined) {
      return res.status(400).json({ error: 'visit_id and stop_order are required' });
    }

    // Verify route ownership
    const { data: route } = await supabase
      .from('service_routes')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!route) return res.status(404).json({ error: 'Route not found' });

    // Insert stop
    const { data: stop, error } = await supabase
      .from('route_stops')
      .insert({
        route_id: id,
        service_visit_id: visit_id,
        stop_order,
      })
      .select()
      .single();

    if (error) throw error;

    // Link visit to route
    await supabase
      .from('service_visits')
      .update({ route_id: id })
      .eq('id', visit_id);

    // Return updated stops list
    const { data: stops } = await supabase
      .from('route_stops')
      .select('*')
      .eq('route_id', id)
      .order('stop_order', { ascending: true });

    res.status(201).json(stops || []);
  } catch (error) {
    logger.error('[ServiceRoutes] Add stop error:', error.message);
    res.status(500).json({ error: 'Failed to add stop' });
  }
});

// PATCH /:id/stops — Bulk reorder stops
router.patch('/:id/stops', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { stops } = req.body;

    if (!stops || !Array.isArray(stops)) {
      return res.status(400).json({ error: 'stops array is required' });
    }

    // Verify route ownership
    const { data: route } = await supabase
      .from('service_routes')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!route) return res.status(404).json({ error: 'Route not found' });

    // Update each stop's order
    for (const s of stops) {
      await supabase
        .from('route_stops')
        .update({ stop_order: s.stop_order })
        .eq('id', s.id)
        .eq('route_id', id);
    }

    // Return updated stops
    const { data: updatedStops } = await supabase
      .from('route_stops')
      .select('*')
      .eq('route_id', id)
      .order('stop_order', { ascending: true });

    res.json(updatedStops || []);
  } catch (error) {
    logger.error('[ServiceRoutes] Reorder error:', error.message);
    res.status(500).json({ error: 'Failed to reorder stops' });
  }
});

// DELETE /:id/stops/:stopId — Remove stop
router.delete('/:id/stops/:stopId', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id, stopId } = req.params;

    // Verify route ownership
    const { data: route } = await supabase
      .from('service_routes')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!route) return res.status(404).json({ error: 'Route not found' });

    // Get the stop to find the visit
    const { data: stop } = await supabase
      .from('route_stops')
      .select('service_visit_id')
      .eq('id', stopId)
      .eq('route_id', id)
      .single();

    if (!stop) return res.status(404).json({ error: 'Stop not found' });

    // Delete the stop
    await supabase
      .from('route_stops')
      .delete()
      .eq('id', stopId);

    // Unlink visit from route
    await supabase
      .from('service_visits')
      .update({ route_id: null })
      .eq('id', stop.service_visit_id);

    res.json({ success: true });
  } catch (error) {
    logger.error('[ServiceRoutes] Remove stop error:', error.message);
    res.status(500).json({ error: 'Failed to remove stop' });
  }
});

module.exports = router;
