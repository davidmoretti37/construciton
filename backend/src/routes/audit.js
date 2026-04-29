/**
 * Audit Log API Routes
 *
 * Read-only endpoints over the audit_log table. Powers the mobile
 * AuditTrail component, the owner-facing AuditLogScreen and the
 * Foreman tools that answer "who changed X?".
 *
 *   GET /audit/entity/:type/:id  — full history of one entity
 *   GET /audit/user/:userId      — actions taken by one user
 *   GET /audit/recent            — last 50 across the company
 *
 * Auth: standard Supabase JWT. Tenant scope is enforced by querying
 * the service-role client with `.eq('company_id', userId)` — this
 * matches the audit_log RLS policy semantics for owners. Supervisors
 * are scoped to their owner's company_id via the profiles join.
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { authenticateUser } = require('../middleware/authenticate');

router.use(authenticateUser);

/**
 * Resolve the tenant scope (company_id) for the requesting user.
 * Owners see their own; supervisors see the owner they report to;
 * workers see only the owner they're assigned to. Returns null if
 * the caller has no tenant scope (which should 404 the request).
 */
async function resolveCompanyScope(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, owner_id')
    .eq('id', userId)
    .single();

  if (!profile) return null;
  // Owner reads their own scope; supervisors and workers inherit
  // their owner_id. If owner_id is unset for non-owners, they have
  // no audit access.
  if (profile.role === 'owner') return profile.id;
  if (profile.owner_id) return profile.owner_id;
  return null;
}

// ============================================================
// GET /entity/:type/:id — full history of one entity
// ============================================================
router.get('/entity/:type/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, id } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const companyId = await resolveCompanyScope(userId);
    if (!companyId) return res.status(403).json({ error: 'No tenant scope' });

    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('company_id', companyId)
      .eq('entity_type', type)
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Hydrate actor names so the mobile UI doesn't have to round-trip.
    const actorIds = [...new Set((data || []).map(r => r.actor_user_id).filter(Boolean))];
    const actorMap = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', actorIds);
      (profiles || []).forEach(p => { actorMap[p.id] = p; });
    }

    const enriched = (data || []).map(row => ({
      ...row,
      actor_name: actorMap[row.actor_user_id]?.full_name || null,
      actor_role: actorMap[row.actor_user_id]?.role || null,
    }));

    res.json({ entries: enriched });
  } catch (error) {
    logger.error('[Audit] Entity history error:', error.message);
    res.status(500).json({ error: 'Failed to load entity history' });
  }
});

// ============================================================
// GET /user/:userId — actions taken by one user
// ============================================================
router.get('/user/:userId', async (req, res) => {
  try {
    const callerId = req.user.id;
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const companyId = await resolveCompanyScope(callerId);
    if (!companyId) return res.status(403).json({ error: 'No tenant scope' });

    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('company_id', companyId)
      .eq('actor_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ entries: data || [] });
  } catch (error) {
    logger.error('[Audit] User history error:', error.message);
    res.status(500).json({ error: 'Failed to load user history' });
  }
});

// ============================================================
// GET /recent — last 50 across the company (with optional filters)
// ============================================================
router.get('/recent', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const { entity_type, actor_user_id, action, start_date, end_date } = req.query;

    const companyId = await resolveCompanyScope(userId);
    if (!companyId) return res.status(403).json({ error: 'No tenant scope' });

    let query = supabase
      .from('audit_log')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (entity_type) query = query.eq('entity_type', entity_type);
    if (action) query = query.eq('action', action);
    if (actor_user_id) query = query.eq('actor_user_id', actor_user_id);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data, error } = await query;
    if (error) throw error;

    // Hydrate actor names
    const actorIds = [...new Set((data || []).map(r => r.actor_user_id).filter(Boolean))];
    const actorMap = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', actorIds);
      (profiles || []).forEach(p => { actorMap[p.id] = p; });
    }

    const enriched = (data || []).map(row => ({
      ...row,
      actor_name: actorMap[row.actor_user_id]?.full_name || null,
      actor_role: actorMap[row.actor_user_id]?.role || null,
    }));

    res.json({ entries: enriched });
  } catch (error) {
    logger.error('[Audit] Recent error:', error.message);
    res.status(500).json({ error: 'Failed to load recent activity' });
  }
});

module.exports = router;
