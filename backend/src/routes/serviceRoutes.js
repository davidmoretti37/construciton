/**
 * Service Routes API
 * CRUD for daily routes and route stops
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const { fetchGoogleMaps } = require('../utils/fetchWithRetry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { authenticateUser } = require('../middleware/authenticate');

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

// ============================================================
// LOCATIONS (for route map address picker)
// Must be before /:id to avoid Express matching "locations" as an id
// ============================================================

// GET /locations — All owner's service locations with coordinates
router.get('/locations', async (req, res) => {
  try {
    const ownerId = req.user.id;

    const { data: locations, error } = await supabase
      .from('service_locations')
      .select('id, name, address, formatted_address, latitude, longitude, contact_name, contact_phone, access_notes, service_plan_id')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    // Enrich with plan names
    const planIds = [...new Set((locations || []).map(l => l.service_plan_id).filter(Boolean))];
    let planNames = {};
    if (planIds.length > 0) {
      const { data: plans } = await supabase
        .from('service_plans')
        .select('id, name')
        .in('id', planIds);
      if (plans) plans.forEach(p => { planNames[p.id] = p.name; });
    }

    const result = (locations || []).map(l => ({
      ...l,
      service_plan_name: planNames[l.service_plan_id] || null,
    }));

    res.json(result);
  } catch (error) {
    logger.error('[ServiceRoutes] List locations error:', error.message);
    res.status(500).json({ error: 'Failed to list locations' });
  }
});

// ============================================================
// ROUTE OPTIMIZATION
// Must be before /:id to avoid Express matching "optimize" as an id
// ============================================================

// POST /optimize — Optimize stop order using Google Directions API
router.post('/optimize', async (req, res) => {
  try {
    const { stops, origin } = req.body;

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ error: 'At least 2 stops are required' });
    }

    if (stops.length > 25) {
      return res.status(400).json({ error: 'Maximum 25 stops supported' });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    // Use provided origin or first stop as origin
    const originCoord = origin
      ? `${origin.latitude},${origin.longitude}`
      : `${stops[0].latitude},${stops[0].longitude}`;

    // Last stop is destination (open-ended route, not round-trip)
    const lastStop = stops[stops.length - 1];
    const destinationCoord = `${lastStop.latitude},${lastStop.longitude}`;

    // Middle stops become waypoints to optimize
    const waypointStops = origin ? stops : stops.slice(1, -1);
    const waypointsParam = waypointStops.length > 0
      ? `&waypoints=optimize:true|${waypointStops.map(s => `${s.latitude},${s.longitude}`).join('|')}`
      : '';

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originCoord}&destination=${destinationCoord}${waypointsParam}&mode=driving&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    const response = await fetchGoogleMaps(url);
    if (!response.ok) {
      logger.error('[ServiceRoutes] Google Directions error:', response.status);
      return res.status(502).json({ error: 'Directions API error' });
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      logger.error('[ServiceRoutes] Directions API status:', data.status);
      return res.status(502).json({ error: `Directions API: ${data.status}` });
    }

    const route = data.routes[0];
    const waypointOrder = route.waypoint_order || [];
    const polyline = route.overview_polyline?.points || '';

    // Build legs info
    const legs = (route.legs || []).map(leg => ({
      distance: leg.distance,
      duration: leg.duration,
      start_address: leg.start_address,
      end_address: leg.end_address,
    }));

    const totalDistance = legs.reduce((sum, l) => sum + (l.distance?.value || 0), 0);
    const totalDuration = legs.reduce((sum, l) => sum + (l.duration?.value || 0), 0);

    // Reorder stops based on waypoint_order
    let optimizedStops;
    if (origin) {
      // All stops were waypoints except destination
      optimizedStops = waypointOrder.map((idx, order) => ({
        ...waypointStops[idx],
        order: order + 1,
      }));
      optimizedStops.push({ ...lastStop, order: optimizedStops.length + 1 });
    } else {
      // First stop was origin, middle were waypoints, last was destination
      optimizedStops = [{ ...stops[0], order: 1 }];
      waypointOrder.forEach((idx, i) => {
        optimizedStops.push({ ...waypointStops[idx], order: i + 2 });
      });
      optimizedStops.push({ ...lastStop, order: optimizedStops.length + 1 });
    }

    res.json({
      waypoint_order: waypointOrder,
      polyline,
      legs,
      total_distance: totalDistance,
      total_distance_text: `${(totalDistance / 1609.34).toFixed(1)} mi`,
      total_duration: totalDuration,
      total_duration_text: `${Math.round(totalDuration / 60)} min`,
      optimized_stops: optimizedStops,
    });

    logger.info(`[ServiceRoutes] Optimized ${stops.length} stops — ${(totalDistance / 1609.34).toFixed(1)} mi, ${Math.round(totalDuration / 60)} min`);
  } catch (error) {
    logger.error('[ServiceRoutes] Optimize error:', error.message);
    res.status(500).json({ error: 'Failed to optimize route' });
  }
});

// ============================================================
// ROUTE DETAIL & UPDATE
// ============================================================

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
