/**
 * Portal Owner Admin Routes
 * Owner-facing endpoints for managing client portal settings,
 * sharing, branding, requests, materials, and weekly summaries.
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { fetchOpenRouter } = require('../utils/fetchWithRetry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Auth middleware (standard owner auth)
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
    logger.error('[PortalAdmin] Auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

router.use(authenticateUser);

// ============================================================
// CLIENT MANAGEMENT
// ============================================================

/**
 * GET /clients
 * List all clients for this owner with project counts and revenue.
 */
router.get('/clients', async (req, res) => {
  try {
    const ownerId = req.user.id;

    // Get all clients
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!clients || clients.length === 0) {
      return res.json([]);
    }

    const clientIds = clients.map(c => c.id);

    // Get project counts and portal access info in parallel
    const [projectClientsResult, servicePlansResult, invoicesResult] = await Promise.all([
      // Projects shared with each client
      supabase
        .from('project_clients')
        .select('client_id, project_id, access_token, projects(id, name, status, contract_amount, income_collected)')
        .in('client_id', clientIds),

      // Service plans per client
      supabase
        .from('service_plans')
        .select('client_id, id, name, status')
        .in('client_id', clientIds),

      // Invoice totals per client (match by name or email)
      supabase
        .from('invoices')
        .select('client_name, client_email, total, amount_paid, status')
        .eq('user_id', ownerId),
    ]);

    // Build lookup maps
    const projectMap = {};
    (projectClientsResult.data || []).forEach(pc => {
      if (!projectMap[pc.client_id]) projectMap[pc.client_id] = [];
      projectMap[pc.client_id].push({
        project: pc.projects,
        has_portal_access: !!pc.access_token,
      });
    });

    const servicePlanMap = {};
    (servicePlansResult.data || []).forEach(sp => {
      if (!servicePlanMap[sp.client_id]) servicePlanMap[sp.client_id] = [];
      servicePlanMap[sp.client_id].push(sp);
    });

    // Enrich clients
    const enriched = clients.map(client => {
      const clientProjects = projectMap[client.id] || [];
      const clientPlans = servicePlanMap[client.id] || [];

      // Calculate revenue from linked projects
      const totalRevenue = clientProjects.reduce((sum, cp) =>
        sum + (cp.project?.income_collected || 0), 0);
      const totalContract = clientProjects.reduce((sum, cp) =>
        sum + (cp.project?.contract_amount || 0), 0);

      return {
        ...client,
        project_count: clientProjects.length,
        service_plan_count: clientPlans.length,
        has_portal_access: clientProjects.some(cp => cp.has_portal_access),
        total_revenue: totalRevenue,
        total_contract: totalContract,
      };
    });

    res.json(enriched);
  } catch (error) {
    logger.error('[PortalAdmin] List clients error:', error.message);
    res.status(500).json({ error: 'Failed to load clients' });
  }
});

// ============================================================
// SHARING
// ============================================================

/**
 * POST /share
 * Share a project with a client. Creates client record if needed,
 * creates project_clients link, and sets up default portal settings.
 * Body: { projectId, clientName, clientEmail, clientPhone? }
 */
router.post('/share', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { projectId, clientName, clientEmail, clientPhone } = req.body;

    if (!projectId || !clientName || !clientEmail) {
      return res.status(400).json({ error: 'projectId, clientName, and clientEmail are required' });
    }

    // Verify project belongs to this owner
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('user_id', ownerId)
      .single();

    if (projError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Find or create client record
    let { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('email', clientEmail)
      .single();

    if (!client) {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          owner_id: ownerId,
          full_name: clientName,
          email: clientEmail,
          phone: clientPhone || null,
        })
        .select('id')
        .single();

      if (clientError) throw clientError;
      client = newClient;
    }

    // Check if already shared
    const { data: existing } = await supabase
      .from('project_clients')
      .select('id, access_token')
      .eq('project_id', projectId)
      .eq('client_id', client.id)
      .single();

    if (existing) {
      return res.json({
        message: 'Project already shared with this client',
        accessToken: existing.access_token,
        portalUrl: `${process.env.PORTAL_URL || 'https://sylkapp.ai/portal'}/login?token=${existing.access_token}`,
      });
    }

    // Create project_clients link
    const { data: projectClient, error: pcError } = await supabase
      .from('project_clients')
      .insert({
        project_id: projectId,
        client_id: client.id,
      })
      .select('id, access_token')
      .single();

    if (pcError) throw pcError;

    // Create default portal settings
    await supabase
      .from('client_portal_settings')
      .upsert({
        project_id: projectId,
        owner_id: ownerId,
      }, { onConflict: 'project_id' });

    const portalUrl = `${process.env.PORTAL_URL || 'https://sylkapp.ai/portal'}/login?token=${projectClient.access_token}`;

    logger.info(`[PortalAdmin] Project "${project.name}" shared with ${clientName}`);

    res.status(201).json({
      projectClientId: projectClient.id,
      accessToken: projectClient.access_token,
      portalUrl,
      clientId: client.id,
    });
  } catch (error) {
    logger.error('[PortalAdmin] Share error:', error.message);
    res.status(500).json({ error: 'Failed to share project' });
  }
});

/**
 * DELETE /share/:projectClientId
 * Revoke client access to a project.
 */
router.delete('/share/:projectClientId', async (req, res) => {
  try {
    const { projectClientId } = req.params;

    // Verify ownership through project
    const { data: pc, error: pcError } = await supabase
      .from('project_clients')
      .select('id, project_id, projects(user_id)')
      .eq('id', projectClientId)
      .single();

    if (pcError || !pc || pc.projects?.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Delete the link (also invalidates any sessions via cascade? No — sessions are on client_id, not project_clients)
    await supabase
      .from('project_clients')
      .delete()
      .eq('id', projectClientId);

    logger.info(`[PortalAdmin] Revoked portal access ${projectClientId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[PortalAdmin] Revoke error:', error.message);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

// ============================================================
// VISIBILITY SETTINGS
// ============================================================

/**
 * GET /settings/:projectId
 * Get portal visibility settings for a project.
 */
router.get('/settings/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data, error } = await supabase
      .from('client_portal_settings')
      .select('*')
      .eq('project_id', projectId)
      .eq('owner_id', req.user.id)
      .single();

    if (error || !data) {
      // Return defaults if no settings exist yet
      return res.json({
        project_id: projectId,
        show_phases: false,
        show_photos: false,
        show_budget: false,
        show_daily_logs: false,
        show_documents: false,
        show_messages: true,
        show_site_activity: false,
        weekly_summary_enabled: false,
        invoice_reminders: true,
      });
    }

    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Get settings error:', error.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/**
 * PATCH /settings/:projectId
 * Update portal visibility settings.
 * Body: { show_phases?, show_photos?, show_budget?, ... }
 */
router.patch('/settings/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const ownerId = req.user.id;

    // Only allow known toggle fields
    const allowedFields = [
      'show_phases', 'show_photos', 'show_budget', 'show_daily_logs',
      'show_documents', 'show_messages', 'show_site_activity',
      'weekly_summary_enabled', 'invoice_reminders',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Upsert settings
    const { data, error } = await supabase
      .from('client_portal_settings')
      .upsert({
        project_id: projectId,
        owner_id: ownerId,
        ...updates,
      }, { onConflict: 'project_id' })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[PortalAdmin] Updated portal settings for project ${projectId}`);
    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Update settings error:', error.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============================================================
// BRANDING
// ============================================================

/**
 * GET /branding
 * Get owner's portal branding.
 */
router.get('/branding', async (req, res) => {
  try {
    const { data } = await supabase
      .from('client_portal_branding')
      .select('*')
      .eq('owner_id', req.user.id)
      .single();

    if (data) return res.json(data);

    // Return defaults
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', req.user.id)
      .single();

    res.json({
      business_name: profile?.business_name || '',
      logo_url: null,
      primary_color: '#2563eb',
      accent_color: '#3b82f6',
    });
  } catch (error) {
    logger.error('[PortalAdmin] Get branding error:', error.message);
    res.status(500).json({ error: 'Failed to load branding' });
  }
});

/**
 * PATCH /branding
 * Update portal branding.
 * Body: { business_name?, logo_url?, primary_color?, accent_color? }
 */
router.patch('/branding', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { business_name, logo_url, primary_color, accent_color } = req.body;

    const updates = {};
    if (business_name !== undefined) updates.business_name = business_name;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (primary_color !== undefined) updates.primary_color = primary_color;
    if (accent_color !== undefined) updates.accent_color = accent_color;

    const { data, error } = await supabase
      .from('client_portal_branding')
      .upsert({
        owner_id: ownerId,
        ...updates,
      }, { onConflict: 'owner_id' })
      .select()
      .single();

    if (error) throw error;

    logger.info(`[PortalAdmin] Updated branding for owner ${ownerId}`);
    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Update branding error:', error.message);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// ============================================================
// CLIENT REQUESTS
// ============================================================

/**
 * GET /requests/:projectId
 * View client requests for a project.
 */
router.get('/requests/:projectId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_requests')
      .select(`
        *,
        clients (full_name, email, phone)
      `)
      .eq('project_id', req.params.projectId)
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[PortalAdmin] List requests error:', error.message);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

/**
 * PATCH /requests/:id/respond
 * Respond to a client request.
 * Body: { status?, owner_response }
 */
router.patch('/requests/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, owner_response } = req.body;

    if (!owner_response) {
      return res.status(400).json({ error: 'Response is required' });
    }

    const updates = {
      owner_response,
      responded_at: new Date().toISOString(),
    };
    if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      updates.status = status;
    }

    const { data, error } = await supabase
      .from('client_requests')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`[PortalAdmin] Responded to request ${id}`);
    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Respond to request error:', error.message);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
});

// ============================================================
// MATERIAL SELECTIONS
// ============================================================

/**
 * POST /materials
 * Create a material selection request for a client.
 * Body: { projectId, clientId, title, description?, options, dueDate? }
 */
router.post('/materials', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { projectId, clientId, title, description, options, dueDate } = req.body;

    if (!projectId || !clientId || !title || !options?.length) {
      return res.status(400).json({ error: 'projectId, clientId, title, and options are required' });
    }

    const { data, error } = await supabase
      .from('material_selections')
      .insert({
        project_id: projectId,
        owner_id: ownerId,
        client_id: clientId,
        title,
        description,
        options,
        due_date: dueDate || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Log approval event
    await supabase
      .from('approval_events')
      .insert({
        project_id: projectId,
        entity_type: 'material_selection',
        entity_id: data.id,
        action: 'sent',
        actor_type: 'owner',
        actor_id: ownerId,
      });

    logger.info(`[PortalAdmin] Material selection "${title}" created`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Create material error:', error.message);
    res.status(500).json({ error: 'Failed to create material selection' });
  }
});

/**
 * PATCH /materials/:id/confirm
 * Confirm a client's material selection.
 */
router.patch('/materials/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('material_selections')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`[PortalAdmin] Material selection ${id} confirmed`);
    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Confirm material error:', error.message);
    res.status(500).json({ error: 'Failed to confirm selection' });
  }
});

// ============================================================
// AI WEEKLY SUMMARIES
// ============================================================

/**
 * POST /summaries/generate
 * Generate an AI weekly summary from daily reports.
 * Body: { projectId, weekStart?, weekEnd? }
 */
router.post('/summaries/generate', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Calculate week range (default: last 7 days)
    const weekEnd = req.body.weekEnd || new Date().toISOString().split('T')[0];
    const weekStartDate = new Date(weekEnd);
    weekStartDate.setDate(weekStartDate.getDate() - 6);
    const weekStart = req.body.weekStart || weekStartDate.toISOString().split('T')[0];

    // Get project info
    const { data: project } = await supabase
      .from('projects')
      .select('name, status, percent_complete')
      .eq('id', projectId)
      .eq('user_id', ownerId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get daily reports for the week
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('report_date, notes, work_performed, weather, materials, delays, next_day_plan')
      .eq('project_id', projectId)
      .gte('report_date', weekStart)
      .lte('report_date', weekEnd)
      .order('report_date');

    if (!reports || reports.length === 0) {
      return res.status(400).json({ error: 'No daily reports found for this week' });
    }

    // Get phases for context
    const { data: phases } = await supabase
      .from('project_phases')
      .select('name, status, completion_percentage')
      .eq('project_id', projectId)
      .order('order_index');

    // Generate summary with AI
    const prompt = `You are writing a weekly project update for a homeowner client. Be clear, friendly, and non-technical. Use simple language. Focus on progress and what's coming next.

Project: ${project.name}
Overall Progress: ${project.percent_complete}%
Status: ${project.status}

${phases ? `Current Phases:\n${phases.map(p => `- ${p.name}: ${p.completion_percentage}% (${p.status})`).join('\n')}` : ''}

Daily Reports from ${weekStart} to ${weekEnd}:
${reports.map(r => {
  let entry = `\n${r.report_date}:`;
  if (r.work_performed) entry += `\nWork: ${JSON.stringify(r.work_performed)}`;
  if (r.notes) entry += `\nNotes: ${r.notes}`;
  if (r.weather) entry += `\nWeather: ${JSON.stringify(r.weather)}`;
  if (r.materials) entry += `\nMaterials: ${JSON.stringify(r.materials)}`;
  if (r.delays) entry += `\nDelays: ${JSON.stringify(r.delays)}`;
  return entry;
}).join('\n')}

Write a concise 3-5 paragraph weekly summary. Include:
1. What was accomplished this week
2. Current status of the project
3. What's planned for next week
4. Any delays or issues the client should know about (frame positively)

Also provide 3-5 bullet point highlights.

Respond in JSON format:
{
  "summary": "the full summary text",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"]
}`;

    const aiResponse = await fetchOpenRouter(prompt, {
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 1000,
    });

    let parsed;
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { summary: aiResponse, highlights: [] };
    }

    // Save as draft
    const { data: summary, error: saveError } = await supabase
      .from('ai_weekly_summaries')
      .upsert({
        project_id: projectId,
        owner_id: ownerId,
        week_start: weekStart,
        week_end: weekEnd,
        summary_text: parsed.summary,
        highlights: parsed.highlights,
        status: 'draft',
      }, { onConflict: 'idx_weekly_summaries_unique_week' })
      .select()
      .single();

    if (saveError) throw saveError;

    logger.info(`[PortalAdmin] Weekly summary generated for ${project.name}`);
    res.status(201).json(summary);
  } catch (error) {
    logger.error('[PortalAdmin] Generate summary error:', error.message);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * GET /summaries/:projectId
 * List all summaries for a project (including drafts).
 */
router.get('/summaries/:projectId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_weekly_summaries')
      .select('*')
      .eq('project_id', req.params.projectId)
      .eq('owner_id', req.user.id)
      .order('week_start', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[PortalAdmin] List summaries error:', error.message);
    res.status(500).json({ error: 'Failed to load summaries' });
  }
});

/**
 * PATCH /summaries/:id/approve
 * Approve and send a weekly summary to the client.
 * Body: { summary_text? } (optional edit before sending)
 */
router.patch('/summaries/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { summary_text } = req.body;

    const updates = {
      status: 'sent',
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    };

    if (summary_text) {
      updates.summary_text = summary_text;
    }

    const { data, error } = await supabase
      .from('ai_weekly_summaries')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`[PortalAdmin] Weekly summary ${id} approved and sent`);
    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Approve summary error:', error.message);
    res.status(500).json({ error: 'Failed to approve summary' });
  }
});

// ============================================================
// SATISFACTION RATINGS (owner view)
// ============================================================

/**
 * GET /ratings/:projectId
 * View satisfaction ratings for a project.
 */
router.get('/ratings/:projectId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('satisfaction_ratings')
      .select(`
        *,
        clients:client_id (full_name),
        project_phases:phase_id (name)
      `)
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[PortalAdmin] Ratings error:', error.message);
    res.status(500).json({ error: 'Failed to load ratings' });
  }
});

module.exports = router;
