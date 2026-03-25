/**
 * Service Plans API Routes
 * CRUD for service plans, locations, schedules, and checklist templates
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
    logger.error('[ServicePlans] Auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

router.use(authenticateUser);

// ============================================================
// PLANS CRUD
// ============================================================

// GET / — List plans for owner
router.get('/', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { status } = req.query;

    let query = supabase
      .from('service_plans')
      .select('*')
      .or(`owner_id.eq.${ownerId},assigned_supervisor_id.eq.${ownerId}`)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: plans, error } = await query;
    if (error) throw error;

    // Get location counts for each plan
    if (plans && plans.length > 0) {
      const planIds = plans.map(p => p.id);
      const { data: locationCounts, error: lcError } = await supabase
        .from('service_locations')
        .select('service_plan_id')
        .in('service_plan_id', planIds)
        .eq('is_active', true);

      if (!lcError && locationCounts) {
        const countMap = {};
        locationCounts.forEach(lc => {
          countMap[lc.service_plan_id] = (countMap[lc.service_plan_id] || 0) + 1;
        });
        plans.forEach(p => {
          p.location_count = countMap[p.id] || 0;
        });
      }
    }

    res.json(plans);
  } catch (error) {
    logger.error('[ServicePlans] List error:', error.message);
    res.status(500).json({ error: 'Failed to list service plans' });
  }
});

// POST / — Create plan
router.post('/', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { name, service_type, client_id, description, billing_cycle, price_per_visit, monthly_rate, notes, assigned_supervisor_id } = req.body;

    if (!name || !service_type) {
      return res.status(400).json({ error: 'name and service_type are required' });
    }

    if (billing_cycle === 'per_visit' && !price_per_visit) {
      return res.status(400).json({ error: 'price_per_visit is required when billing_cycle is per_visit' });
    }

    if ((billing_cycle === 'monthly' || billing_cycle === 'quarterly') && !monthly_rate) {
      return res.status(400).json({ error: 'monthly_rate is required when billing_cycle is monthly or quarterly' });
    }

    const { data, error } = await supabase
      .from('service_plans')
      .insert({
        owner_id: ownerId,
        name,
        service_type,
        client_id: client_id || null,
        description: description || null,
        billing_cycle: billing_cycle || 'monthly',
        price_per_visit: price_per_visit || null,
        monthly_rate: monthly_rate || null,
        notes: notes || null,
        assigned_supervisor_id: assigned_supervisor_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[ServicePlans] Created plan "${name}" for user ${ownerId.substring(0, 8)}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[ServicePlans] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create service plan' });
  }
});

// GET /:id — Plan detail with locations and schedules
router.get('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const { data: plan, error } = await supabase
      .from('service_plans')
      .select('*')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (error || !plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    // Fetch active locations
    const { data: locations, error: locError } = await supabase
      .from('service_locations')
      .select('*')
      .eq('service_plan_id', id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (locError) throw locError;

    // Fetch current schedules for each location
    const today = new Date().toISOString().split('T')[0];
    if (locations && locations.length > 0) {
      const locationIds = locations.map(l => l.id);
      const { data: schedules } = await supabase
        .from('location_schedules')
        .select('*')
        .in('service_location_id', locationIds)
        .eq('is_active', true)
        .or(`effective_until.is.null,effective_until.gte.${today}`);

      if (schedules) {
        const scheduleMap = {};
        schedules.forEach(s => {
          scheduleMap[s.service_location_id] = s;
        });
        locations.forEach(l => {
          l.schedule = scheduleMap[l.id] || null;
        });
      }
    }

    plan.locations = locations || [];
    res.json(plan);
  } catch (error) {
    logger.error('[ServicePlans] Detail error:', error.message);
    res.status(500).json({ error: 'Failed to get service plan' });
  }
});

// PATCH /:id — Update plan
router.patch('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    // Only allow updating specific fields
    const allowedFields = ['name', 'description', 'service_type', 'status', 'billing_cycle',
      'price_per_visit', 'monthly_rate', 'currency', 'notes', 'client_id', 'assigned_supervisor_id'];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('service_plans')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Service plan not found' });

    res.json(data);
  } catch (error) {
    logger.error('[ServicePlans] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update service plan' });
  }
});

// DELETE /:id — Soft delete (set status='cancelled')
router.delete('/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('service_plans')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Service plan not found' });

    logger.info(`[ServicePlans] Cancelled plan ${id} for user ${ownerId.substring(0, 8)}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[ServicePlans] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete service plan' });
  }
});

// ============================================================
// LOCATIONS
// ============================================================

// GET /:id/locations — List active locations for a plan
router.get('/:id/locations', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    // Verify plan ownership
    const { data: plan } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    const { data: locations, error } = await supabase
      .from('service_locations')
      .select('*')
      .eq('service_plan_id', id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Enrich with schedule and checklist template count
    if (locations && locations.length > 0) {
      const locationIds = locations.map(l => l.id);
      const today = new Date().toISOString().split('T')[0];

      // Schedules
      const { data: schedules } = await supabase
        .from('location_schedules')
        .select('*')
        .in('service_location_id', locationIds)
        .eq('is_active', true)
        .or(`effective_until.is.null,effective_until.gte.${today}`);

      // Checklist template counts
      const { data: templates } = await supabase
        .from('visit_checklist_templates')
        .select('service_location_id')
        .in('service_location_id', locationIds)
        .eq('is_active', true);

      const scheduleMap = {};
      if (schedules) {
        schedules.forEach(s => { scheduleMap[s.service_location_id] = s; });
      }

      const templateCountMap = {};
      if (templates) {
        templates.forEach(t => {
          templateCountMap[t.service_location_id] = (templateCountMap[t.service_location_id] || 0) + 1;
        });
      }

      locations.forEach(l => {
        l.schedule = scheduleMap[l.id] || null;
        l.checklist_template_count = templateCountMap[l.id] || 0;
      });
    }

    res.json(locations);
  } catch (error) {
    logger.error('[ServicePlans] List locations error:', error.message);
    res.status(500).json({ error: 'Failed to list locations' });
  }
});

// POST /:id/locations — Add location to plan
router.post('/:id/locations', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    // Verify plan ownership
    const { data: plan } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    const { name, address, formatted_address, latitude, longitude, place_id,
      contact_name, contact_phone, access_notes, sort_order } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'name and address are required' });
    }

    const { data, error } = await supabase
      .from('service_locations')
      .insert({
        service_plan_id: id,
        owner_id: ownerId,
        name,
        address,
        formatted_address: formatted_address || null,
        latitude: latitude || null,
        longitude: longitude || null,
        place_id: place_id || null,
        contact_name: contact_name || null,
        contact_phone: contact_phone || null,
        access_notes: access_notes || null,
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[ServicePlans] Added location "${name}" to plan ${id}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[ServicePlans] Create location error:', error.message);
    res.status(500).json({ error: 'Failed to add location' });
  }
});

// PATCH /:planId/locations/:id — Update location
router.patch('/:planId/locations/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const allowedFields = ['name', 'address', 'formatted_address', 'latitude', 'longitude',
      'place_id', 'contact_name', 'contact_phone', 'access_notes', 'sort_order'];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('service_locations')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Location not found' });

    res.json(data);
  } catch (error) {
    logger.error('[ServicePlans] Update location error:', error.message);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// DELETE /:planId/locations/:id — Soft delete location
router.delete('/:planId/locations/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('service_locations')
      .update({ is_active: false })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Location not found' });

    res.json({ success: true });
  } catch (error) {
    logger.error('[ServicePlans] Delete location error:', error.message);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ============================================================
// SCHEDULES
// ============================================================

// GET /:planId/locations/:locationId/schedule — Get current active schedule
router.get('/:planId/locations/:locationId/schedule', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { locationId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('location_schedules')
      .select('*')
      .eq('service_location_id', locationId)
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    res.json(data || null);
  } catch (error) {
    logger.error('[ServicePlans] Get schedule error:', error.message);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

// POST /:planId/locations/:locationId/schedule — Set new schedule
router.post('/:planId/locations/:locationId/schedule', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { locationId } = req.params;
    const { frequency, scheduled_days, day_of_month, preferred_time, duration_minutes, effective_from } = req.body;

    if (!frequency) {
      return res.status(400).json({ error: 'frequency is required' });
    }

    // Verify location ownership
    const { data: location } = await supabase
      .from('service_locations')
      .select('id')
      .eq('id', locationId)
      .eq('owner_id', ownerId)
      .single();

    if (!location) return res.status(404).json({ error: 'Location not found' });

    const today = new Date().toISOString().split('T')[0];

    // Deactivate existing active schedule
    await supabase
      .from('location_schedules')
      .update({ is_active: false, effective_until: today })
      .eq('service_location_id', locationId)
      .eq('owner_id', ownerId)
      .eq('is_active', true);

    // Insert new schedule
    const { data, error } = await supabase
      .from('location_schedules')
      .insert({
        service_location_id: locationId,
        owner_id: ownerId,
        frequency,
        scheduled_days: scheduled_days || [],
        day_of_month: day_of_month || null,
        preferred_time: preferred_time || null,
        duration_minutes: duration_minutes || 60,
        effective_from: effective_from || today,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[ServicePlans] Set ${frequency} schedule for location ${locationId}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[ServicePlans] Create schedule error:', error.message);
    res.status(500).json({ error: 'Failed to set schedule' });
  }
});

// ============================================================
// CHECKLIST TEMPLATES
// ============================================================

// GET /:planId/locations/:locationId/checklist-templates
router.get('/:planId/locations/:locationId/checklist-templates', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { locationId } = req.params;

    const { data, error } = await supabase
      .from('visit_checklist_templates')
      .select('*')
      .eq('service_location_id', locationId)
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    logger.error('[ServicePlans] List templates error:', error.message);
    res.status(500).json({ error: 'Failed to list checklist templates' });
  }
});

// POST /:planId/locations/:locationId/checklist-templates
router.post('/:planId/locations/:locationId/checklist-templates', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { locationId } = req.params;
    const { title, description, sort_order, requires_photo, requires_quantity, quantity_unit } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Verify location ownership
    const { data: location } = await supabase
      .from('service_locations')
      .select('id')
      .eq('id', locationId)
      .eq('owner_id', ownerId)
      .single();

    if (!location) return res.status(404).json({ error: 'Location not found' });

    const { data, error } = await supabase
      .from('visit_checklist_templates')
      .insert({
        service_location_id: locationId,
        owner_id: ownerId,
        title,
        description: description || null,
        sort_order: sort_order || 0,
        requires_photo: requires_photo || false,
        requires_quantity: requires_quantity || false,
        quantity_unit: quantity_unit || null,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[ServicePlans] Created checklist template "${title}" for location ${locationId}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[ServicePlans] Create template error:', error.message);
    res.status(500).json({ error: 'Failed to create checklist template' });
  }
});

// PATCH /:planId/locations/:locationId/checklist-templates/:id
router.patch('/:planId/locations/:locationId/checklist-templates/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const allowedFields = ['title', 'description', 'sort_order', 'requires_photo', 'requires_quantity', 'quantity_unit'];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('visit_checklist_templates')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Template not found' });

    res.json(data);
  } catch (error) {
    logger.error('[ServicePlans] Update template error:', error.message);
    res.status(500).json({ error: 'Failed to update checklist template' });
  }
});

// DELETE /:planId/locations/:locationId/checklist-templates/:id
router.delete('/:planId/locations/:locationId/checklist-templates/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('visit_checklist_templates')
      .update({ is_active: false })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Template not found' });

    res.json({ success: true });
  } catch (error) {
    logger.error('[ServicePlans] Delete template error:', error.message);
    res.status(500).json({ error: 'Failed to delete checklist template' });
  }
});

// ============================================================
// BILLING
// ============================================================

// GET /:id/billing-preview — Preview unbilled visits for a period
router.get('/:id/billing-preview', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to date query params are required' });
    }

    // Get plan with pricing
    const { data: plan } = await supabase
      .from('service_plans')
      .select('*')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    // Get completed, billable, uninvoiced visits in period
    const { data: visits, error } = await supabase
      .from('service_visits')
      .select('id, service_location_id')
      .eq('service_plan_id', id)
      .eq('owner_id', ownerId)
      .eq('status', 'completed')
      .eq('billable', true)
      .is('invoice_id', null)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to);

    if (error) throw error;

    // Group by location
    const locationVisits = {};
    (visits || []).forEach(v => {
      if (!locationVisits[v.service_location_id]) locationVisits[v.service_location_id] = [];
      locationVisits[v.service_location_id].push(v.id);
    });

    // Get location names
    const locationIds = Object.keys(locationVisits);
    let locationNames = {};
    if (locationIds.length > 0) {
      const { data: locations } = await supabase
        .from('service_locations')
        .select('id, name')
        .in('id', locationIds);
      if (locations) locations.forEach(l => { locationNames[l.id] = l.name; });
    }

    // Calculate pricing
    const rate = plan.billing_cycle === 'per_visit'
      ? parseFloat(plan.price_per_visit || 0)
      : parseFloat(plan.monthly_rate || 0);

    const totalVisits = (visits || []).length;

    const locationBreakdown = locationIds.map(locId => {
      const count = locationVisits[locId].length;
      return {
        location_id: locId,
        location_name: locationNames[locId] || 'Unknown',
        visit_count: count,
      };
    });

    // Per-visit: total = visits * rate. Monthly/quarterly: total = flat rate for the plan
    const totalAmount = plan.billing_cycle === 'per_visit'
      ? Math.round(totalVisits * rate * 100) / 100
      : Math.round(rate * 100) / 100;

    res.json({
      period: { from, to },
      billing_cycle: plan.billing_cycle,
      rate,
      locations: locationBreakdown,
      total_visits: totalVisits,
      total_amount: totalAmount,
      currency: plan.currency,
    });
  } catch (error) {
    logger.error('[ServicePlans] Billing preview error:', error.message);
    res.status(500).json({ error: 'Failed to get billing preview' });
  }
});

// POST /:id/invoice — Create invoice from completed visits
router.post('/:id/invoice', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { period_start, period_end, notes } = req.body;

    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'period_start and period_end are required' });
    }

    // Get plan with pricing
    const { data: plan } = await supabase
      .from('service_plans')
      .select('*')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();

    if (!plan) return res.status(404).json({ error: 'Service plan not found' });

    // Get client name
    let clientName = plan.name;
    if (plan.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name')
        .eq('id', plan.client_id)
        .single();
      if (client) clientName = client.name;
    }

    // Get completed, billable, uninvoiced visits
    const { data: visits, error: vErr } = await supabase
      .from('service_visits')
      .select('id, service_location_id')
      .eq('service_plan_id', id)
      .eq('owner_id', ownerId)
      .eq('status', 'completed')
      .eq('billable', true)
      .is('invoice_id', null)
      .gte('scheduled_date', period_start)
      .lte('scheduled_date', period_end);

    if (vErr) throw vErr;

    if (!visits || visits.length === 0) {
      return res.status(400).json({ error: 'No billable visits found in this period' });
    }

    // Group by location
    const locationVisits = {};
    visits.forEach(v => {
      if (!locationVisits[v.service_location_id]) locationVisits[v.service_location_id] = [];
      locationVisits[v.service_location_id].push(v.id);
    });

    // Get location names
    const locationIds = Object.keys(locationVisits);
    let locationNames = {};
    if (locationIds.length > 0) {
      const { data: locations } = await supabase
        .from('service_locations')
        .select('id, name')
        .in('id', locationIds);
      if (locations) locations.forEach(l => { locationNames[l.id] = l.name; });
    }

    // Build invoice line items
    const rate = plan.billing_cycle === 'per_visit'
      ? parseFloat(plan.price_per_visit || 0)
      : parseFloat(plan.monthly_rate || 0);

    let items;
    let subtotal;

    if (plan.billing_cycle === 'per_visit') {
      items = locationIds.map((locId, i) => {
        const count = locationVisits[locId].length;
        const lineTotal = Math.round(count * rate * 100) / 100;
        return {
          index: i,
          description: `${locationNames[locId] || 'Location'} — ${count} visit${count > 1 ? 's' : ''}`,
          quantity: count,
          unit: 'visit',
          price: rate,
          total: lineTotal,
        };
      });
      subtotal = items.reduce((sum, item) => sum + item.total, 0);
    } else {
      // Monthly/quarterly — single line item
      items = [{
        index: 0,
        description: `${plan.name} — ${plan.billing_cycle} service (${period_start} to ${period_end})`,
        quantity: 1,
        unit: plan.billing_cycle,
        price: rate,
        total: rate,
      }];
      subtotal = rate;
    }

    const total = Math.round(subtotal * 100) / 100;

    // Calculate due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Create invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        user_id: ownerId,
        client_name: clientName,
        project_name: plan.name,
        items,
        subtotal: total,
        total,
        due_date: dueDate.toISOString().split('T')[0],
        payment_terms: 'Net 30',
        notes: notes || `Service visits for ${period_start} to ${period_end}`,
        status: 'unpaid',
      })
      .select()
      .single();

    if (invErr) throw invErr;

    // Link all visits to this invoice
    const visitIds = visits.map(v => v.id);
    await supabase
      .from('service_visits')
      .update({ invoice_id: invoice.id })
      .in('id', visitIds);

    logger.info(`[ServicePlans] Created invoice ${invoice.invoice_number} for plan ${id} (${visits.length} visits)`);

    res.status(201).json({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      total: parseFloat(invoice.total),
      visits_invoiced: visits.length,
      due_date: invoice.due_date,
    });
  } catch (error) {
    logger.error('[ServicePlans] Invoice creation error:', error.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

module.exports = router;
