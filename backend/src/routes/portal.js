/**
 * Client Portal API Routes
 * Public-facing endpoints for client portal access.
 * Auth endpoints are unauthenticated; all others use portalAuth middleware.
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { authenticatePortalClient, verifyProjectAccess } = require('../middleware/portalAuth');
// Lazy-init: instantiating Stripe at module load throws when STRIPE_SECRET_KEY
// is missing (CI / local dev without prod creds). Same pattern as routes/stripe.js.
const _StripeCtor = require('stripe');
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not set — payment routes are disabled.');
  }
  _stripe = _StripeCtor(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  return _stripe;
}
// Keep `stripe.foo.bar(...)` call sites working by proxying lookups through getStripe().
const stripe = new Proxy({}, { get: (_t, prop) => getStripe()[prop] });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// AUTH ENDPOINTS (no middleware)
// ============================================================

/**
 * POST /auth/verify
 * Verifies a magic link token and creates a session.
 * Body: { token }
 */
router.post('/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Look up the access token across all project_clients
    const { data: projectClient, error: pcError } = await supabase
      .from('project_clients')
      .select(`
        id,
        project_id,
        client_id,
        token_expires_at,
        clients (
          id,
          owner_id,
          full_name,
          email,
          phone
        )
      `)
      .eq('access_token', token)
      .single();

    if (pcError || !projectClient || !projectClient.clients) {
      logger.warn('[Portal] Invalid magic link token');
      return res.status(401).json({ error: 'Invalid or expired link' });
    }

    // Check token expiration
    if (projectClient.token_expires_at && new Date(projectClient.token_expires_at) < new Date()) {
      logger.warn('[Portal] Expired magic link token');
      return res.status(401).json({ error: 'This link has expired. Please ask your contractor to send a new one.' });
    }

    const client = projectClient.clients;

    // Invalidate the magic link token after use (single-use tokens)
    await supabase
      .from('project_clients')
      .update({ token_expires_at: new Date().toISOString() })
      .eq('id', projectClient.id);

    // Check if there's already a valid session for this client
    const { data: existingSession } = await supabase
      .from('client_sessions')
      .select('session_token, expires_at')
      .eq('client_id', client.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession) {
      res.cookie('portal_session', existingSession.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/api/portal',
      });
      return res.json({
        client: {
          id: client.id,
          full_name: client.full_name,
          email: client.email,
          phone: client.phone,
        },
      });
    }

    // Create new session
    const { data: session, error: sessionError } = await supabase
      .from('client_sessions')
      .insert({
        client_id: client.id,
      })
      .select('session_token')
      .single();

    if (sessionError) throw sessionError;

    logger.info(`[Portal] Session created for client ${client.full_name}`);

    res.cookie('portal_session', session.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/api/portal',
    });
    res.json({
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
      },
    });
  } catch (error) {
    logger.error('[Portal] Auth verify error:', error.message);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

/**
 * GET /auth/check
 * Validates an existing session token.
 */
router.get('/auth/check', authenticatePortalClient, async (req, res) => {
  res.json({ client: req.client });
});

/**
 * POST /auth/logout
 * Deletes the current session.
 */
router.post('/auth/logout', authenticatePortalClient, async (req, res) => {
  try {
    await supabase
      .from('client_sessions')
      .delete()
      .eq('id', req.client.sessionId);

    // Clear the httpOnly session cookie
    res.clearCookie('portal_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api/portal',
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('[Portal] Logout error:', error.message);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// ============================================================
// All routes below require portal auth
// ============================================================
router.use(authenticatePortalClient);

// ============================================================
// DASHBOARD
// ============================================================

/**
 * GET /dashboard
 * Returns all projects, service plans, outstanding invoices, and pending estimates
 * for the authenticated client.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const clientId = req.client.id;
    const ownerId = req.client.owner_id;
    logger.info(`[Portal] Dashboard request - clientId: ${clientId}, ownerId: ${ownerId}, email: ${req.client.email}`);

    // Fetch all in parallel
    const [projectsResult, servicePlansResult, invoicesResult, estimatesResult, brandingResult] = await Promise.all([
      // Projects shared with this client
      supabase
        .from('project_clients')
        .select(`
          project_id,
          projects (
            id, name, status, percent_complete,
            contract_amount, income_collected, location,
            start_date, end_date, created_at, updated_at
          )
        `)
        .eq('client_id', clientId),

      // Service plans for this client
      supabase
        .from('service_plans')
        .select('id, name, service_type, status, billing_cycle, price_per_visit, monthly_rate')
        .eq('client_id', clientId)
        .neq('status', 'cancelled'),

      // Outstanding invoices across all owner's projects for this client
      // Use separate .eq() filters via two queries to avoid PostgREST .or() injection
      (async () => {
        const { data: byEmail } = await supabase
          .from('invoices')
          .select('id, invoice_number, project_name, total, amount_paid, amount_due, status, due_date')
          .eq('user_id', ownerId)
          .in('status', ['unpaid', 'partial', 'overdue'])
          .eq('client_email', req.client.email);
        const { data: byName } = await supabase
          .from('invoices')
          .select('id, invoice_number, project_name, total, amount_paid, amount_due, status, due_date')
          .eq('user_id', ownerId)
          .in('status', ['unpaid', 'partial', 'overdue'])
          .eq('client_name', req.client.full_name);
        const seen = new Set();
        const merged = [...(byEmail || []), ...(byName || [])].filter(i => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });
        return { data: merged, error: null };
      })(),

      // Pending estimates
      (async () => {
        const { data: byEmail } = await supabase
          .from('estimates')
          .select('id, estimate_number, project_id, project_name, total, status, created_at')
          .eq('user_id', ownerId)
          .in('status', ['sent', 'viewed'])
          .eq('client_email', req.client.email);
        const { data: byName } = await supabase
          .from('estimates')
          .select('id, estimate_number, project_id, project_name, total, status, created_at')
          .eq('user_id', ownerId)
          .in('status', ['sent', 'viewed'])
          .eq('client_name', req.client.full_name);
        const seen = new Set();
        const merged = [...(byEmail || []), ...(byName || [])].filter(e => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        return { data: merged, error: null };
      })(),

      // Owner branding
      supabase
        .from('client_portal_branding')
        .select('*')
        .eq('owner_id', ownerId)
        .single(),
    ]);

    // Extract projects from join
    logger.info(`[Portal] Dashboard raw projects: ${JSON.stringify(projectsResult.data?.length)} rows, error: ${projectsResult.error?.message || 'none'}`);
    const projects = (projectsResult.data || [])
      .map(pc => pc.projects)
      .filter(Boolean);

    // Fallback branding from profiles if no custom branding
    let branding = brandingResult.data;
    if (!branding) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_name, business_email, business_phone')
        .eq('id', ownerId)
        .single();

      branding = {
        business_name: profile?.business_name || 'Your Contractor',
        logo_url: null,
        primary_color: '#2563eb',
        accent_color: '#3b82f6',
      };
    }

    res.json({
      projects,
      servicePlans: servicePlansResult.data || [],
      outstandingInvoices: invoicesResult.data || [],
      pendingEstimates: estimatesResult.data || [],
      branding,
    });
  } catch (error) {
    logger.error('[Portal] Dashboard error:', error.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============================================================
// BRANDING
// ============================================================

/**
 * GET /branding
 * Returns the owner's portal branding.
 */
router.get('/branding', async (req, res) => {
  try {
    const { data: branding } = await supabase
      .from('client_portal_branding')
      .select('*')
      .eq('owner_id', req.client.owner_id)
      .single();

    if (branding) {
      return res.json(branding);
    }

    // Fallback to profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, business_email, business_phone')
      .eq('id', req.client.owner_id)
      .single();

    res.json({
      business_name: profile?.business_name || 'Your Contractor',
      logo_url: null,
      primary_color: '#2563eb',
      accent_color: '#3b82f6',
    });
  } catch (error) {
    logger.error('[Portal] Branding error:', error.message);
    res.status(500).json({ error: 'Failed to load branding' });
  }
});

// ============================================================
// PROJECTS
// ============================================================

/**
 * GET /projects/:projectId
 * Returns project detail filtered by visibility settings.
 */
router.get('/projects/:projectId', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project and settings in parallel
    const [projectResult, settingsResult] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single(),
      supabase
        .from('client_portal_settings')
        .select('*')
        .eq('project_id', projectId)
        .single(),
    ]);

    if (projectResult.error || !projectResult.data) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.data;
    const settings = settingsResult.data || {};

    // Always-visible fields
    const response = {
      id: project.id,
      name: project.name,
      status: project.status,
      percent_complete: project.percent_complete,
      location: project.location,
      start_date: project.start_date,
      end_date: project.end_date,
      payment_structure: project.payment_structure,
      created_at: project.created_at,
      settings, // Send settings so frontend knows what's toggled
    };

    // Conditionally include financial data
    if (settings.show_budget) {
      response.contract_amount = project.contract_amount;
      response.income_collected = project.income_collected;
      response.expenses = project.expenses;
    }

    // Conditionally include phases
    if (settings.show_phases) {
      const { data: phases } = await supabase
        .from('project_phases')
        .select('id, name, order_index, status, completion_percentage, start_date, end_date, tasks, payment_amount, invoiced')
        .eq('project_id', projectId)
        .order('order_index');

      response.phases = phases || [];
    }

    // Conditionally include photos from daily reports
    if (settings.show_photos) {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('id, report_date, photos, notes')
        .eq('project_id', projectId)
        .not('photos', 'eq', '[]')
        .order('report_date', { ascending: false })
        .limit(50);

      response.photos = (reports || []).flatMap(r =>
        (r.photos || []).map(photo => ({
          url: typeof photo === 'string' ? photo : photo.url,
          caption: typeof photo === 'string' ? null : photo.caption,
          date: r.report_date,
          reportId: r.id,
        }))
      );
    }

    // Conditionally include daily log details
    if (settings.show_daily_logs) {
      const { data: logs } = await supabase
        .from('daily_reports')
        .select('id, report_date, notes, work_performed, weather, materials, delays')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(30);

      response.dailyLogs = logs || [];
    }

    res.json(response);
  } catch (error) {
    logger.error('[Portal] Project detail error:', error.message);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

/**
 * GET /projects/:projectId/photos
 * Returns photo timeline from daily reports.
 */
router.get('/projects/:projectId/photos', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check visibility
    const { data: settings } = await supabase
      .from('client_portal_settings')
      .select('show_photos')
      .eq('project_id', projectId)
      .single();

    if (!settings?.show_photos) {
      return res.status(403).json({ error: 'Photo access is not enabled for this project' });
    }

    const { data: reports } = await supabase
      .from('daily_reports')
      .select('id, report_date, photos, photo_captions')
      .eq('project_id', projectId)
      .not('photos', 'eq', '[]')
      .order('report_date', { ascending: false });

    const photos = (reports || []).flatMap(r =>
      (r.photos || []).map((photo, i) => ({
        url: typeof photo === 'string' ? photo : photo.url,
        caption: r.photo_captions?.[i] || (typeof photo === 'string' ? null : photo.caption),
        date: r.report_date,
        reportId: r.id,
      }))
    );

    res.json(photos);
  } catch (error) {
    logger.error('[Portal] Photos error:', error.message);
    res.status(500).json({ error: 'Failed to load photos' });
  }
});

/**
 * GET /projects/:projectId/activity
 * Returns today's site activity from worker clock-ins.
 */
router.get('/projects/:projectId/activity', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: settings } = await supabase
      .from('client_portal_settings')
      .select('show_site_activity')
      .eq('project_id', projectId)
      .single();

    if (!settings?.show_site_activity) {
      return res.status(403).json({ error: 'Site activity is not enabled for this project' });
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: clockIns } = await supabase
      .from('time_tracking')
      .select(`
        id, clock_in, clock_out,
        workers (full_name, trade)
      `)
      .eq('project_id', projectId)
      .gte('clock_in', `${today}T00:00:00`)
      .lte('clock_in', `${today}T23:59:59`);

    res.json({
      date: today,
      workers_on_site: (clockIns || []).length,
      activity: (clockIns || []).map(ci => ({
        worker_name: ci.workers?.full_name,
        trade: ci.workers?.trade,
        clock_in: ci.clock_in,
        clock_out: ci.clock_out,
        is_active: !ci.clock_out,
      })),
    });
  } catch (error) {
    logger.error('[Portal] Activity error:', error.message);
    res.status(500).json({ error: 'Failed to load site activity' });
  }
});

// ============================================================
// ESTIMATES
// ============================================================

/**
 * GET /projects/:projectId/estimates
 * Returns non-draft estimates for this project.
 */
router.get('/projects/:projectId/estimates', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: estimates, error } = await supabase
      .from('estimates')
      .select('id, estimate_number, project_name, items, subtotal, tax_rate, tax_amount, total, valid_until, payment_terms, notes, status, sent_date, viewed_date, accepted_date, rejected_date, created_at')
      .eq('project_id', projectId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(estimates || []);
  } catch (error) {
    logger.error('[Portal] Estimates error:', error.message);
    res.status(500).json({ error: 'Failed to load estimates' });
  }
});

/**
 * PATCH /estimates/:estimateId/respond
 * Client approves, rejects, or requests changes on an estimate.
 * Body: { action: 'accepted' | 'rejected' | 'changes_requested', notes? }
 */
router.patch('/estimates/:estimateId/respond', async (req, res) => {
  try {
    const { estimateId } = req.params;
    const { action, notes } = req.body;
    const clientId = req.client.id;

    if (!['accepted', 'rejected', 'changes_requested'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be accepted, rejected, or changes_requested' });
    }

    // Verify client has access to this estimate's project
    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .select('id, project_id, status')
      .eq('id', estimateId)
      .single();

    if (estError || !estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    if (!estimate.project_id) {
      return res.status(403).json({ error: 'Access denied — estimate has no associated project' });
    }

    const { data: estAccess } = await supabase
      .from('project_clients')
      .select('id')
      .eq('project_id', estimate.project_id)
      .eq('client_id', clientId)
      .single();

    if (!estAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update estimate status
    const statusMap = {
      accepted: 'accepted',
      rejected: 'rejected',
      changes_requested: 'sent', // Reset to sent so owner can revise
    };
    const dateField = action === 'accepted' ? 'accepted_date'
      : action === 'rejected' ? 'rejected_date'
      : null;

    const updateData = { status: statusMap[action] };
    if (dateField) updateData[dateField] = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('id', estimateId);

    if (updateError) throw updateError;

    // Log approval event
    await supabase
      .from('approval_events')
      .insert({
        project_id: estimate.project_id,
        entity_type: 'estimate',
        entity_id: estimateId,
        action,
        actor_type: 'client',
        actor_id: clientId,
        notes,
      });

    logger.info(`[Portal] Estimate ${estimateId} ${action} by client ${clientId}`);
    res.json({ success: true, status: statusMap[action] });
  } catch (error) {
    logger.error('[Portal] Estimate respond error:', error.message);
    res.status(500).json({ error: 'Failed to respond to estimate' });
  }
});

// ============================================================
// INVOICES
// ============================================================

/**
 * GET /invoices
 * Returns ALL non-cancelled invoices for the authenticated client (across all projects).
 * Used by the invoices page to show both outstanding and paid.
 */
router.get('/invoices', async (req, res) => {
  try {
    const clientId = req.client.id;
    const ownerId = req.client.owner_id;

    const { data: byEmail } = await supabase
      .from('invoices')
      .select('id, invoice_number, project_id, project_name, total, amount_paid, amount_due, status, due_date, paid_date, created_at')
      .eq('user_id', ownerId)
      .neq('status', 'cancelled')
      .eq('client_email', req.client.email)
      .order('created_at', { ascending: false })
      .limit(100);
    const { data: byName } = await supabase
      .from('invoices')
      .select('id, invoice_number, project_id, project_name, total, amount_paid, amount_due, status, due_date, paid_date, created_at')
      .eq('user_id', ownerId)
      .neq('status', 'cancelled')
      .eq('client_name', req.client.full_name)
      .order('created_at', { ascending: false })
      .limit(100);

    const seen = new Set();
    const all = [...(byEmail || []), ...(byName || [])].filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });

    // Sort by created_at descending
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(all);
  } catch (error) {
    logger.error('[Portal] All invoices error:', error.message);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

/**
 * GET /projects/:projectId/invoices
 * Returns non-cancelled invoices for this project.
 */
router.get('/projects/:projectId/invoices', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, project_name, items, subtotal, tax_rate, tax_amount, total, amount_paid, amount_due, status, due_date, payment_terms, notes, paid_date, created_at')
      .eq('project_id', projectId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(invoices || []);
  } catch (error) {
    logger.error('[Portal] Invoices error:', error.message);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

/**
 * GET /projects/:projectId/money-summary
 * Returns budget overview + invoices in a single call for the Money tab.
 */
router.get('/projects/:projectId/money-summary', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const [projectResult, invoicesResult] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, contract_amount, income_collected')
        .eq('id', projectId)
        .single(),
      supabase
        .from('invoices')
        .select('id, invoice_number, project_name, items, subtotal, tax_rate, tax_amount, total, amount_paid, amount_due, status, due_date, payment_terms, notes, paid_date, created_at')
        .eq('project_id', projectId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
    ]);

    const project = projectResult.data;
    const invoices = invoicesResult.data || [];

    const contractAmount = parseFloat(project?.contract_amount || 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const remaining = contractAmount - totalPaid;

    res.json({
      contractAmount,
      totalPaid,
      totalInvoiced,
      remaining,
      invoices,
    });
  } catch (error) {
    logger.error('[Portal] Money summary error:', error.message);
    res.status(500).json({ error: 'Failed to load money summary' });
  }
});

/**
 * GET /projects/:projectId/milestones
 * Returns phase-based payment milestones.
 */
router.get('/projects/:projectId/milestones', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project contract amount
    const { data: project } = await supabase
      .from('projects')
      .select('contract_amount, payment_structure, income_collected')
      .eq('id', projectId)
      .single();

    // Get phases with payment info
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id, name, order_index, status, completion_percentage, payment_amount, invoiced, invoice_id')
      .eq('project_id', projectId)
      .order('order_index');

    // Get invoices linked to phases
    const phaseInvoiceIds = (phases || []).filter(p => p.invoice_id).map(p => p.invoice_id);
    let invoiceMap = {};

    if (phaseInvoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, status, amount_paid, amount_due, total')
        .in('id', phaseInvoiceIds);

      (invoices || []).forEach(inv => { invoiceMap[inv.id] = inv; });
    }

    const milestones = (phases || []).map(phase => ({
      phase_id: phase.id,
      name: phase.name,
      order: phase.order_index,
      status: phase.status,
      completion: phase.completion_percentage,
      payment_amount: phase.payment_amount,
      invoiced: phase.invoiced,
      invoice: phase.invoice_id ? invoiceMap[phase.invoice_id] || null : null,
    }));

    res.json({
      contract_amount: project?.contract_amount,
      payment_structure: project?.payment_structure,
      total_collected: project?.income_collected,
      milestones,
    });
  } catch (error) {
    logger.error('[Portal] Milestones error:', error.message);
    res.status(500).json({ error: 'Failed to load milestones' });
  }
});

/**
 * POST /invoices/:invoiceId/pay
 * Creates a Stripe checkout session for invoice payment.
 */
router.post('/invoices/:invoiceId/pay', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const clientId = req.client.id;

    // Verify access
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, project_id, invoice_number, total, amount_paid, amount_due, status, client_name')
      .eq('id', invoiceId)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!invoice.project_id) {
      return res.status(403).json({ error: 'Access denied — invoice has no associated project' });
    }

    const { data: payAccess } = await supabase
      .from('project_clients')
      .select('id')
      .eq('project_id', invoice.project_id)
      .eq('client_id', clientId)
      .single();

    if (!payAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const amountDue = invoice.amount_due || (invoice.total - (invoice.amount_paid || 0));
    if (amountDue <= 0) {
      return res.status(400).json({ error: 'No amount due' });
    }
    const amountDueCents = Math.round(amountDue * 100);

    // Create Stripe checkout session
    const portalUrl = process.env.PORTAL_URL || 'https://sylkapp.ai/portal';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: `Payment for ${invoice.client_name || 'project'}`,
          },
          unit_amount: amountDueCents,
        },
        quantity: 1,
      }],
      metadata: {
        invoice_id: invoiceId,
        client_id: clientId,
        project_id: invoice.project_id,
        type: 'portal_invoice_payment',
      },
      success_url: `${portalUrl}/projects/${invoice.project_id}?payment=success`,
      cancel_url: `${portalUrl}/projects/${invoice.project_id}?payment=cancelled`,
    }, {
      idempotencyKey: `checkout_${invoiceId}_${amountDueCents}`,
    });

    // Log view event
    await supabase
      .from('approval_events')
      .insert({
        project_id: invoice.project_id,
        entity_type: 'invoice',
        entity_id: invoiceId,
        action: 'viewed',
        actor_type: 'client',
        actor_id: clientId,
      });

    res.json({ url: session.url });
  } catch (error) {
    logger.error('[Portal] Invoice payment error:', error.message);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
});

/**
 * POST /invoices/:invoiceId/create-payment-intent
 * Creates a Stripe PaymentIntent for native in-app payment.
 * Supports: card, Apple Pay, Google Pay, ACH bank transfer.
 */
router.post('/invoices/:invoiceId/create-payment-intent', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const clientId = req.client.id;
    const clientEmail = req.client.email;

    // Verify invoice exists and client has access
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('id, project_id, user_id, invoice_number, total, amount_paid, amount_due, status, client_name, client_email')
      .eq('id', invoiceId)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!invoice.project_id) {
      return res.status(403).json({ error: 'Access denied — invoice has no associated project' });
    }

    const { data: piAccess } = await supabase
      .from('project_clients')
      .select('id')
      .eq('project_id', invoice.project_id)
      .eq('client_id', clientId)
      .single();

    if (!piAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const amountDue = invoice.amount_due || (invoice.total - (invoice.amount_paid || 0));
    if (amountDue <= 0) {
      return res.status(400).json({ error: 'No amount due' });
    }
    const amountDueCents = Math.round(amountDue * 100);

    // Create or retrieve Stripe customer
    const email = invoice.client_email || clientEmail;
    let customerId;

    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email,
        name: invoice.client_name || req.client.full_name,
        metadata: { client_id: clientId },
      });
      customerId = customer.id;
    }

    // Create ephemeral key for the customer
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-06-20' }
    );

    // Check if contractor has a Stripe Connect account (for direct payouts)
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', invoice.user_id)
      .single();

    const connectAccountId = ownerProfile?.stripe_onboarding_complete ? ownerProfile.stripe_account_id : null;

    // Create PaymentIntent — routes to contractor if connected, otherwise to platform
    const paymentIntentParams = {
      amount: amountDueCents,
      currency: 'usd',
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      metadata: {
        invoice_id: invoiceId,
        client_id: clientId,
        project_id: invoice.project_id,
        type: 'portal_invoice_payment',
      },
      description: `Invoice ${invoice.invoice_number}`,
      setup_future_usage: 'off_session',
    };

    // Route payment to contractor's connected account
    if (connectAccountId) {
      paymentIntentParams.transfer_data = { destination: connectAccountId };
      // Platform fee: 0% for now (can add application_fee_amount later)
      // paymentIntentParams.application_fee_amount = Math.round(amountDue * 0.01 * 100); // 1% example
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
      idempotencyKey: `pi_${invoiceId}_${amountDueCents}`,
    });

    // Store payment intent ID on invoice
    await supabase
      .from('invoices')
      .update({ stripe_payment_intent_id: paymentIntent.id, stripe_customer_id: customerId })
      .eq('id', invoiceId);

    res.json({
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (error) {
    logger.error('[Portal] Create payment intent error:', error.message);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// ============================================================
// MESSAGES
// ============================================================

/**
 * GET /projects/:projectId/messages
 * Returns conversation messages for this project.
 */
router.get('/projects/:projectId/messages', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if messages are enabled
    const { data: settings } = await supabase
      .from('client_portal_settings')
      .select('show_messages')
      .eq('project_id', projectId)
      .single();

    if (!settings?.show_messages) {
      return res.status(403).json({ error: 'Messages are not enabled for this project' });
    }

    // Find or create conversation for this project
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('project_id', projectId)
      .single();

    if (!conversation) {
      return res.json([]);
    }

    const { data: messages } = await supabase
      .from('messages')
      .select(`
        id, content, created_at, sender_id, client_sender_id,
        clients:client_sender_id (full_name)
      `)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    const formatted = (messages || []).map(m => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      is_client: !!m.client_sender_id,
      sender_name: m.client_sender_id ? m.clients?.full_name : 'Contractor',
    }));

    res.json(formatted);
  } catch (error) {
    logger.error('[Portal] Messages error:', error.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/**
 * POST /projects/:projectId/messages
 * Send a message as the client.
 * Body: { content }
 */
router.post('/projects/:projectId/messages', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { content } = req.body;
    const clientId = req.client.id;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Check messages enabled
    const { data: settings } = await supabase
      .from('client_portal_settings')
      .select('show_messages')
      .eq('project_id', projectId)
      .single();

    if (!settings?.show_messages) {
      return res.status(403).json({ error: 'Messages are not enabled for this project' });
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('project_id', projectId)
      .single();

    if (!conversation) {
      const { data: newConvo, error: convoError } = await supabase
        .from('conversations')
        .insert({ project_id: projectId, name: 'Client Portal' })
        .select('id')
        .single();

      if (convoError) throw convoError;
      conversation = newConvo;
    }

    // Insert message with client_sender_id
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        client_sender_id: clientId,
        content: content.trim(),
      })
      .select('id, content, created_at')
      .single();

    if (msgError) throw msgError;

    res.status(201).json({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      is_client: true,
      sender_name: req.client.full_name,
    });
  } catch (error) {
    logger.error('[Portal] Send message error:', error.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============================================================
// CLIENT REQUESTS
// ============================================================

/**
 * GET /projects/:projectId/requests
 * Returns client's submitted requests for this project.
 */
router.get('/projects/:projectId/requests', verifyProjectAccess, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_requests')
      .select('*')
      .eq('project_id', req.params.projectId)
      .eq('client_id', req.client.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[Portal] Requests list error:', error.message);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

/**
 * POST /projects/:projectId/requests
 * Submit a new request/issue.
 * Body: { type, title, description?, photos? }
 */
router.post('/projects/:projectId/requests', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { type, title, description, photos } = req.body;

    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }

    if (!['issue', 'change_request', 'question', 'warranty'].includes(type)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    const { data, error } = await supabase
      .from('client_requests')
      .insert({
        project_id: projectId,
        client_id: req.client.id,
        owner_id: req.client.owner_id,
        type,
        title,
        description,
        photos: photos || [],
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[Portal] Client request created: ${type} - ${title}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[Portal] Create request error:', error.message);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// ============================================================
// MATERIAL SELECTIONS
// ============================================================

/**
 * GET /projects/:projectId/materials
 * Returns material selections for this project.
 */
router.get('/projects/:projectId/materials', verifyProjectAccess, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('material_selections')
      .select('*')
      .eq('project_id', req.params.projectId)
      .eq('client_id', req.client.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[Portal] Materials list error:', error.message);
    res.status(500).json({ error: 'Failed to load material selections' });
  }
});

/**
 * PATCH /materials/:id/select
 * Client selects a material option.
 * Body: { selectedOptionIndex, notes? }
 */
router.patch('/materials/:id/select', async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedOptionIndex, notes } = req.body;
    const clientId = req.client.id;

    if (selectedOptionIndex === undefined || selectedOptionIndex === null) {
      return res.status(400).json({ error: 'selectedOptionIndex is required' });
    }

    // Verify ownership
    const { data: selection, error: selError } = await supabase
      .from('material_selections')
      .select('id, project_id, client_id, options, status')
      .eq('id', id)
      .single();

    if (selError || !selection) {
      return res.status(404).json({ error: 'Material selection not found' });
    }

    if (selection.client_id !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (selectedOptionIndex < 0 || selectedOptionIndex >= (selection.options?.length || 0)) {
      return res.status(400).json({ error: 'Invalid option index' });
    }

    const { data, error } = await supabase
      .from('material_selections')
      .update({
        selected_option_index: selectedOptionIndex,
        client_notes: notes || null,
        status: 'selected',
        selected_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log approval event
    await supabase
      .from('approval_events')
      .insert({
        project_id: selection.project_id,
        entity_type: 'material_selection',
        entity_id: id,
        action: 'approved',
        actor_type: 'client',
        actor_id: clientId,
        metadata: { selected_option_index: selectedOptionIndex },
      });

    logger.info(`[Portal] Material ${id} selected by client ${clientId}`);
    res.json(data);
  } catch (error) {
    logger.error('[Portal] Material select error:', error.message);
    res.status(500).json({ error: 'Failed to select material' });
  }
});

// ============================================================
// SATISFACTION RATINGS
// ============================================================

/**
 * POST /projects/:projectId/rate
 * Submit a satisfaction rating (phase or final).
 * Body: { rating, comment?, phaseId?, isProjectFinal? }
 */
router.post('/projects/:projectId/rate', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rating, comment, phaseId, isProjectFinal } = req.body;
    const clientId = req.client.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const { data, error } = await supabase
      .from('satisfaction_ratings')
      .upsert({
        project_id: projectId,
        client_id: clientId,
        phase_id: phaseId || null,
        rating,
        comment,
        is_project_final: isProjectFinal || false,
      }, {
        onConflict: 'idx_satisfaction_unique',
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[Portal] Rating ${rating}/5 for project ${projectId}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[Portal] Rating error:', error.message);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

/**
 * POST /projects/:projectId/google-review-clicked
 * Tracks when a client clicks the Google review link.
 */
router.post('/projects/:projectId/google-review-clicked', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const clientId = req.client.id;

    await supabase
      .from('satisfaction_ratings')
      .update({ google_review_clicked: true })
      .eq('project_id', projectId)
      .eq('client_id', clientId)
      .eq('is_project_final', true);

    res.json({ success: true });
  } catch (error) {
    logger.error('[Portal] Google review click error:', error.message);
    res.status(500).json({ error: 'Failed to track review click' });
  }
});

// ============================================================
// WEEKLY SUMMARIES
// ============================================================

/**
 * GET /projects/:projectId/summaries
 * Returns sent weekly summaries for this project.
 */
router.get('/projects/:projectId/summaries', verifyProjectAccess, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_weekly_summaries')
      .select('id, week_start, week_end, summary_text, highlights, sent_at')
      .eq('project_id', req.params.projectId)
      .eq('status', 'sent')
      .order('week_start', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[Portal] Summaries error:', error.message);
    res.status(500).json({ error: 'Failed to load summaries' });
  }
});

// ============================================================
// SERVICE PLANS
// ============================================================

/**
 * GET /services
 * Returns service plans for this client.
 */
router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_plans')
      .select('id, name, service_type, status, billing_cycle, price_per_visit, monthly_rate, created_at')
      .eq('client_id', req.client.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[Portal] Service plans error:', error.message);
    res.status(500).json({ error: 'Failed to load service plans' });
  }
});

/**
 * GET /services/:id
 * Returns service plan detail with locations and recent visits.
 */
router.get('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.client.id;

    const { data: plan, error: planError } = await supabase
      .from('service_plans')
      .select('*')
      .eq('id', id)
      .eq('client_id', clientId)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Service plan not found' });
    }

    // Get locations and recent visits
    const [locationsResult, visitsResult] = await Promise.all([
      supabase
        .from('service_locations')
        .select('id, name, address, contact_name, contact_phone, is_active')
        .eq('service_plan_id', id)
        .order('sort_order'),
      supabase
        .from('service_visits')
        .select('id, scheduled_date, status, completed_at, worker_notes, photos, service_location_id')
        .eq('service_plan_id', id)
        .order('scheduled_date', { ascending: false })
        .limit(20),
    ]);

    res.json({
      ...plan,
      locations: locationsResult.data || [],
      recentVisits: visitsResult.data || [],
    });
  } catch (error) {
    logger.error('[Portal] Service plan detail error:', error.message);
    res.status(500).json({ error: 'Failed to load service plan' });
  }
});

// ============================================================
// APPROVAL EVENTS (audit trail)
// ============================================================

/**
 * GET /projects/:projectId/approvals
 * Returns approval event timeline for this project.
 */
router.get('/projects/:projectId/approvals', verifyProjectAccess, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('approval_events')
      .select('*')
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[Portal] Approvals error:', error.message);
    res.status(500).json({ error: 'Failed to load approval history' });
  }
});

// ============================================================
// DOCUMENTS
// ============================================================

/**
 * GET /projects/:projectId/documents
 * Returns all client-visible documents for this project.
 */
router.get('/projects/:projectId/documents', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data, error } = await supabase
      .from('project_documents')
      .select('id, title, description, category, file_name, file_size, mime_type, storage_path, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Generate signed download URLs for each document
    const docs = await Promise.all((data || []).map(async (doc) => {
      let download_url = null;
      if (doc.storage_path) {
        const { data: signedData } = await supabase.storage
          .from('project-documents')
          .createSignedUrl(doc.storage_path, 3600); // 1 hour expiry
        download_url = signedData?.signedUrl || null;
      }
      return { ...doc, download_url };
    }));

    res.json(docs);
  } catch (error) {
    logger.error('[Portal] Documents error:', error.message);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// ============================================================
// CHANGE ORDERS
// ============================================================

/**
 * GET /projects/:projectId/change-orders
 * Returns all change orders for this project.
 */
router.get('/projects/:projectId/change-orders', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data, error } = await supabase
      .from('change_orders')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Mark as viewed by client
    const unviewed = (data || []).filter(co => !co.client_viewed_at && co.status === 'pending_client');
    if (unviewed.length > 0) {
      await Promise.all(unviewed.map(co =>
        supabase.from('change_orders').update({ client_viewed_at: new Date().toISOString() }).eq('id', co.id)
      ));
    }

    res.json(data || []);
  } catch (error) {
    logger.error('[Portal] Change orders error:', error.message);
    res.status(500).json({ error: 'Failed to load change orders' });
  }
});

/**
 * POST /change-orders/:coId/respond
 * Client approves or rejects a change order.
 * Body: { action: 'approve' | 'reject', name?: string, reason?: string }
 */
router.post('/change-orders/:coId/respond', async (req, res) => {
  try {
    const { coId } = req.params;
    const { action, name, reason } = req.body;
    const clientId = req.client.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    // Fetch the CO
    const { data: co, error: coError } = await supabase
      .from('change_orders')
      .select('id, project_id, status, total_amount')
      .eq('id', coId)
      .single();

    if (coError || !co) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    // Verify client has access to this project
    const { data: access } = await supabase
      .from('project_clients')
      .select('id')
      .eq('project_id', co.project_id)
      .eq('client_id', clientId)
      .single();

    if (!access) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Must be in pending_client state
    if (co.status !== 'pending_client') {
      return res.status(400).json({ error: `Cannot respond — status is ${co.status}` });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const now = new Date().toISOString();

    // Update the change order
    const updateData = {
      status: newStatus,
      client_responded_at: now,
    };

    if (action === 'approve') {
      updateData.approved_by_name = name || req.client.full_name;
      updateData.approved_at = now;
    } else {
      updateData.client_response_reason = reason || '';
    }

    const { error: updateError } = await supabase
      .from('change_orders')
      .update(updateData)
      .eq('id', coId);

    if (updateError) throw updateError;

    // Write to approval_events audit trail
    await supabase.from('approval_events').insert({
      project_id: co.project_id,
      entity_type: 'change_order',
      entity_id: coId,
      action: newStatus,
      actor_type: 'client',
      actor_id: clientId,
      notes: action === 'approve' ? `Approved by ${name || req.client.full_name}` : `Rejected: ${reason || 'No reason given'}`,
    });

    res.json({ success: true, status: newStatus });
  } catch (error) {
    logger.error('[Portal] Change order respond error:', error.message);
    res.status(500).json({ error: 'Failed to respond to change order' });
  }
});

/**
 * GET /projects/:projectId/calendar
 * Returns all calendar events for the client's project:
 * - Worker schedules (who's working when)
 * - Project phases (with dates)
 * - Service visits (if service plan)
 */
router.get('/projects/:projectId/calendar', verifyProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { start, end } = req.query; // YYYY-MM-DD

    // Default to current month if not specified
    const now = new Date();
    const startDate = start || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endDate = end || `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

    // Fetch worker tasks for this project (main calendar data — same as owner sees)
    const { data: tasks } = await supabase
      .from('worker_tasks')
      .select(`
        id, project_id, title, description, start_date, end_date, status, color,
        projects:project_id (id, name, working_days, non_working_dates)
      `)
      .eq('project_id', projectId)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .order('created_at', { ascending: true });

    // Fetch worker schedules for this project
    const { data: schedules } = await supabase
      .from('worker_schedules')
      .select(`
        id, start_date, end_date, start_time, end_time, notes,
        workers ( full_name, trade ),
        project_phases ( name )
      `)
      .eq('project_id', projectId)
      .lte('start_date', endDate)
      .or(`end_date.gte.${startDate},end_date.is.null`);

    // Fetch phases with dates
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id, name, order_index, status, completion_percentage, start_date, end_date')
      .eq('project_id', projectId)
      .order('order_index');

    // Check if there are service visits linked to this project
    let visits = [];
    try {
      const { data: visitData } = await supabase
        .from('service_visits')
        .select('id, scheduled_date, start_time, end_time, status, notes, visit_type')
        .eq('project_id', projectId)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date');
      visits = visitData || [];
    } catch {
      // service_visits may not have project_id column — skip
    }

    // Format tasks as calendar tasks (same format AppleCalendarMonth expects)
    const calendarTasks = (tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      start_date: t.start_date,
      end_date: t.end_date,
      color: t.color || '#F59E0B',
      status: t.status,
      project_id: t.project_id,
      working_days: t.projects?.working_days || [1, 2, 3, 4, 5],
      non_working_dates: t.projects?.non_working_dates || [],
    }));

    // Format schedules as events
    const events = (schedules || []).map(s => ({
      id: s.id,
      type: 'schedule',
      title: s.workers?.full_name ? `${s.workers.full_name}${s.workers.trade ? ` (${s.workers.trade})` : ''}` : 'Crew on site',
      start_date: s.start_date,
      end_date: s.end_date || s.start_date,
      start_time: s.start_time,
      end_time: s.end_time,
      phase: s.project_phases?.name,
      notes: s.notes,
    }));

    // Add visits as events
    for (const v of visits) {
      events.push({
        id: v.id,
        type: 'visit',
        title: v.visit_type || 'Service Visit',
        start_date: v.scheduled_date,
        end_date: v.scheduled_date,
        start_time: v.start_time,
        end_time: v.end_time,
        status: v.status,
        notes: v.notes,
      });
    }

    res.json({ tasks: calendarTasks, events, phases: phases || [] });
  } catch (error) {
    logger.error('[Portal] Calendar error:', error.message);
    res.status(500).json({ error: 'Failed to load calendar' });
  }
});

module.exports = router;
