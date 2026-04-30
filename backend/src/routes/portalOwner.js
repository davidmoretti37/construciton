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

const { authenticateUser } = require('../middleware/authenticate');

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
      .order('created_at', { ascending: false })
      .limit(500);

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
      // Refresh token expiration on re-share so owner can resend the link
      await supabase
        .from('project_clients')
        .update({ token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', existing.id);

      // Ensure portal settings exist on re-share too — if owner revoked and
      // re-shared, they may have been deleted. ignoreDuplicates so we don't
      // overwrite any toggles the owner already set.
      await supabase
        .from('client_portal_settings')
        .upsert({
          project_id: projectId,
          owner_id: ownerId,
          show_phases: true,
          show_photos: true,
          show_budget: true,
          show_daily_logs: true,
          show_documents: true,
          show_messages: true,
          show_site_activity: true,
          weekly_summary_enabled: true,
          invoice_reminders: true,
        }, { onConflict: 'project_id', ignoreDuplicates: true });

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

    // Create default portal settings — default to SHOWING things so the
    // client lands on a populated portal. Owner can toggle off later.
    await supabase
      .from('client_portal_settings')
      .upsert({
        project_id: projectId,
        owner_id: ownerId,
        show_phases: true,
        show_photos: true,
        show_budget: true,
        show_daily_logs: true,
        show_documents: true,
        show_messages: true,
        show_site_activity: true,
        weekly_summary_enabled: true,
        invoice_reminders: true,
      }, { onConflict: 'project_id', ignoreDuplicates: true });

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
      .select('id, client_id, project_id, projects(user_id)')
      .eq('id', projectClientId)
      .single();

    if (pcError || !pc || pc.projects?.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if this client has any OTHER project_clients links (besides this one)
    const { data: otherLinks } = await supabase
      .from('project_clients')
      .select('id')
      .eq('client_id', pc.client_id)
      .neq('id', projectClientId)
      .limit(1);

    // Delete the project_clients link
    await supabase
      .from('project_clients')
      .delete()
      .eq('id', projectClientId);

    // If no other project links remain, kill all sessions for this client
    if (!otherLinks || otherLinks.length === 0) {
      await supabase
        .from('client_sessions')
        .delete()
        .eq('client_id', pc.client_id);
      logger.info(`[PortalAdmin] Revoked all sessions for client ${pc.client_id}`);
    }

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
      // Return defaults if no settings exist yet (default to ALL ON so the
      // client portal is useful out of the box).
      return res.json({
        project_id: projectId,
        show_phases: true,
        show_photos: true,
        show_budget: true,
        show_daily_logs: true,
        show_documents: true,
        show_messages: true,
        show_site_activity: true,
        weekly_summary_enabled: true,
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
    const { projectId } = req.params;

    // Verify the project belongs to the authenticated user
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { data, error } = await supabase
      .from('satisfaction_ratings')
      .select(`
        *,
        clients:client_id (full_name),
        project_phases:phase_id (name)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[PortalAdmin] Ratings error:', error.message);
    res.status(500).json({ error: 'Failed to load ratings' });
  }
});

// ============================================================
// SEND INVOICE TO CLIENT (email + portal notification)
// ============================================================

/**
 * POST /invoices/:invoiceId/send
 * Sends invoice to client via email and creates portal notification.
 */
router.post('/invoices/:invoiceId/send', authenticateUser, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.user.id;

    // Get invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', userId)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!invoice.client_email) {
      return res.status(400).json({ error: 'No client email on invoice' });
    }

    // Get business name from profile or branding
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, business_name')
      .eq('id', userId)
      .single();

    const { data: branding } = await supabase
      .from('client_portal_branding')
      .select('business_name')
      .eq('owner_id', userId)
      .single();

    const businessName = branding?.business_name || profile?.business_name || profile?.full_name || '';

    // Send email
    const { sendInvoiceEmail } = require('../services/emailService');
    const emailResult = await sendInvoiceEmail({
      invoice,
      businessName,
      pdfUrl: invoice.pdf_url,
    });

    // Create notification for client (if they have a portal account)
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('id, user_id')
        .eq('email', invoice.client_email)
        .eq('owner_id', userId)
        .single();

      if (client?.user_id) {
        await supabase.from('notifications').insert({
          user_id: client.user_id,
          title: 'New Invoice',
          body: `Invoice ${invoice.invoice_number} for $${parseFloat(invoice.total).toLocaleString()} is ready for payment.`,
          // 'invoice' is not in notifications.type CHECK — use 'financial_update'
          type: 'financial_update',
          icon: 'receipt-outline',
          color: '#1E40AF',
          project_id: invoice.project_id || null,
          // Standardized: action_type + action_data (was 'data' before, frontend doesn't recognize)
          action_type: 'navigate',
          action_data: { invoiceId, projectId: invoice.project_id, screen: 'ClientProjectDetail' },
        });
      }
    } catch {
      // Client notification is best-effort
    }

    // Update invoice status if draft
    if (invoice.status === 'draft') {
      await supabase.from('invoices').update({ status: 'unpaid' }).eq('id', invoiceId);
    }

    res.json({
      sent: emailResult.sent,
      email: invoice.client_email,
      emailId: emailResult.emailId,
      error: emailResult.error,
    });
  } catch (error) {
    logger.error('[PortalAdmin] Send invoice error:', error.message);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

/**
 * POST /service-plans/generate-recurring
 * Auto-generates invoices for service plans with auto_invoice enabled.
 */
router.post('/service-plans/generate-recurring', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Find service plans with auto_invoice enabled
    const { data: plans } = await supabase
      .from('service_plans')
      .select('id, name, client_id, billing_cycle, price_per_visit, monthly_rate, auto_invoice, last_invoiced_date, invoice_day_of_month')
      .eq('owner_id', userId)
      .eq('auto_invoice', true)
      .eq('status', 'active');

    if (!plans?.length) {
      return res.json({ generated: 0, message: 'No auto-invoice plans found' });
    }

    const today = new Date();
    const results = [];

    for (const plan of plans) {
      const dayOfMonth = plan.invoice_day_of_month || 1;
      const lastInvoiced = plan.last_invoiced_date ? new Date(plan.last_invoiced_date) : null;

      // Check if billing is due (past the day of month and not already invoiced this month)
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const lastInvoicedMonth = lastInvoiced ? `${lastInvoiced.getFullYear()}-${String(lastInvoiced.getMonth() + 1).padStart(2, '0')}` : null;

      if (today.getDate() >= dayOfMonth && currentMonth !== lastInvoicedMonth) {
        // Generate invoice via existing service plan invoice endpoint
        try {
          const fromDate = lastInvoiced
            ? new Date(lastInvoiced.getTime() + 86400000).toISOString().split('T')[0]
            : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
          const toDate = today.toISOString().split('T')[0];

          // Call the existing service plan invoice creation
          const { data: invoiceResult, error: invError } = await supabase.functions.invoke('create-service-invoice', {
            body: { planId: plan.id, fromDate, toDate },
          });

          // If the edge function doesn't exist, create invoice directly
          if (invError) {
            // Find billable visits
            const { data: visits } = await supabase
              .from('service_visits')
              .select('id, location_id, scheduled_date')
              .eq('service_plan_id', plan.id)
              .eq('status', 'completed')
              .is('invoice_id', null)
              .gte('scheduled_date', fromDate)
              .lte('scheduled_date', toDate);

            if (visits?.length > 0) {
              const rate = plan.billing_cycle === 'per_visit' ? (plan.price_per_visit || 0) : (plan.monthly_rate || 0);
              const total = plan.billing_cycle === 'per_visit' ? rate * visits.length : rate;

              // Get client info
              const { data: client } = await supabase
                .from('clients')
                .select('full_name, email')
                .eq('id', plan.client_id)
                .single();

              const { data: newInvoice } = await supabase
                .from('invoices')
                .insert({
                  user_id: userId,
                  client_name: client?.full_name || plan.name,
                  client_email: client?.email,
                  project_name: plan.name,
                  items: JSON.stringify([{
                    description: `${plan.name} — ${visits.length} visits (${fromDate} to ${toDate})`,
                    quantity: plan.billing_cycle === 'per_visit' ? visits.length : 1,
                    rate,
                    amount: total,
                  }]),
                  subtotal: total,
                  tax_rate: 0,
                  tax_amount: 0,
                  total,
                  due_date: new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0],
                  status: 'unpaid',
                  amount_paid: 0,
                })
                .select()
                .single();

              if (newInvoice) {
                // Link visits to invoice
                await supabase
                  .from('service_visits')
                  .update({ invoice_id: newInvoice.id })
                  .in('id', visits.map(v => v.id));

                // Update last_invoiced_date
                await supabase
                  .from('service_plans')
                  .update({ last_invoiced_date: toDate })
                  .eq('id', plan.id);

                // Send email
                const { sendInvoiceEmail } = require('../services/emailService');
                if (client?.email) {
                  await sendInvoiceEmail({ invoice: newInvoice, businessName: '', pdfUrl: null });
                }

                results.push({ planId: plan.id, planName: plan.name, invoiceId: newInvoice.id, total, visits: visits.length });
              }
            }
          }
        } catch (err) {
          logger.error(`[Recurring] Error for plan ${plan.id}:`, err.message);
          results.push({ planId: plan.id, planName: plan.name, error: err.message });
        }
      }
    }

    res.json({ generated: results.filter(r => !r.error).length, results });
  } catch (error) {
    logger.error('[PortalAdmin] Recurring invoice error:', error.message);
    res.status(500).json({ error: 'Failed to generate recurring invoices' });
  }
});

// ============================================================
// CHANGE ORDERS (owner-facing)
// ============================================================
//
// Owner CRUD + send + recall + void. All routes scoped to req.user.id via the
// owner_id column on change_orders + the projects.user_id check on writes.
// Approve/reject for clients lives in portal.js (uses Postgres RPCs that
// fire the projects.extras + end_date cascade atomically).

/**
 * GET /change-orders?project_id=...
 * List COs for a project (or all the owner's COs if no filter).
 */
router.get('/change-orders', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { project_id, status } = req.query;

    let query = supabase
      .from('change_orders')
      .select('*, change_order_line_items(*)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (project_id) query = query.eq('project_id', project_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[PortalAdmin] List COs error:', error.message);
    res.status(500).json({ error: 'Failed to load change orders' });
  }
});

/**
 * GET /change-orders/:id
 */
router.get('/change-orders/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { data, error } = await supabase
      .from('change_orders')
      .select('*, change_order_line_items(*), change_order_attachments(*)')
      .eq('id', req.params.id)
      .eq('owner_id', ownerId)
      .single();
    if (error) return res.status(404).json({ error: 'Change order not found' });
    res.json(data);
  } catch (error) {
    logger.error('[PortalAdmin] Get CO error:', error.message);
    res.status(500).json({ error: 'Failed to load change order' });
  }
});

/**
 * POST /change-orders
 * Create a draft CO. Body: { project_id, title, description, line_items[], schedule_impact_days, tax_rate, signature_required }
 * Always created with status='draft' — separate /send endpoint dispatches.
 */
router.post('/change-orders', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const {
      project_id,
      title,
      description,
      line_items = [],
      schedule_impact_days = 0,
      tax_rate = 0,
      signature_required = false,
      billing_strategy = 'invoice_now',
    } = req.body;

    if (!project_id || !title) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }

    // Verify ownership of the project
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', project_id)
      .eq('user_id', ownerId)
      .single();
    if (!project) return res.status(403).json({ error: 'Project not found or access denied' });

    // Compute totals from line items (DB will also store generated `amount` column)
    const subtotal = line_items.reduce((sum, li) =>
      sum + (Number(li.quantity || 0) * Number(li.unit_price || 0)), 0);
    const totalAmount = subtotal * (1 + Number(tax_rate || 0));

    const { data: co, error: coError } = await supabase
      .from('change_orders')
      .insert({
        project_id,
        owner_id: ownerId,
        title,
        description: description || null,
        subtotal,
        tax_rate,
        total_amount: totalAmount,
        schedule_impact_days,
        signature_required,
        billing_strategy,
        status: 'draft',
      })
      .select()
      .single();

    if (coError) {
      logger.error('[PortalAdmin] CO insert failed:', coError.message);
      return res.status(500).json({ error: coError.message });
    }

    // Insert line items
    if (line_items.length > 0) {
      const rows = line_items.map((li, idx) => ({
        change_order_id: co.id,
        position: idx + 1,
        description: li.description || '',
        quantity: Number(li.quantity || 1),
        unit: li.unit || null,
        unit_price: Number(li.unit_price || 0),
        category: li.category || null,
      }));
      const { error: liError } = await supabase
        .from('change_order_line_items')
        .insert(rows);
      if (liError) logger.warn('[PortalAdmin] CO line items insert failed:', liError.message);
    }

    // Domain event (best-effort)
    try {
      const { emit, EVENT_TYPES } = require('../services/eventEmitter');
      emit({
        ownerId, eventType: EVENT_TYPES.CHANGE_ORDER_DRAFTED,
        actorId: ownerId, actorType: 'owner', source: 'manual',
        entityType: 'change_order', entityId: co.id,
        payload: { co_number: co.co_number, project_id, total_amount: totalAmount },
        summary: `Drafted change order CO-${String(co.co_number).padStart(3, '0')} on project ${project_id}`,
      });
    } catch {}

    // Re-fetch with line items
    const { data: full } = await supabase
      .from('change_orders')
      .select('*, change_order_line_items(*)')
      .eq('id', co.id)
      .single();

    res.status(201).json(full || co);
  } catch (error) {
    logger.error('[PortalAdmin] Create CO error:', error.message);
    res.status(500).json({ error: 'Failed to create change order' });
  }
});

/**
 * PATCH /change-orders/:id
 * Edit a draft CO (only allowed when status='draft').
 */
router.patch('/change-orders/:id', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { title, description, line_items, schedule_impact_days, tax_rate, signature_required, billing_strategy } = req.body;

    // Verify CO is draft + owned
    const { data: existing } = await supabase
      .from('change_orders')
      .select('id, status, owner_id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();
    if (!existing) return res.status(404).json({ error: 'Change order not found' });
    if (existing.status !== 'draft') {
      return res.status(400).json({ error: `Cannot edit CO in status ${existing.status}. Recall first.` });
    }

    const update = { updated_at: new Date().toISOString() };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (schedule_impact_days !== undefined) update.schedule_impact_days = schedule_impact_days;
    if (tax_rate !== undefined) update.tax_rate = tax_rate;
    if (signature_required !== undefined) update.signature_required = signature_required;
    if (billing_strategy !== undefined) update.billing_strategy = billing_strategy;

    // Recompute totals if line items provided
    if (Array.isArray(line_items)) {
      const subtotal = line_items.reduce((sum, li) =>
        sum + (Number(li.quantity || 0) * Number(li.unit_price || 0)), 0);
      const effectiveTaxRate = tax_rate !== undefined ? Number(tax_rate) : Number(req.body.tax_rate ?? 0);
      update.subtotal = subtotal;
      update.total_amount = subtotal * (1 + (Number.isFinite(effectiveTaxRate) ? effectiveTaxRate : 0));
    }

    const { error: updErr } = await supabase
      .from('change_orders')
      .update(update)
      .eq('id', id);
    if (updErr) return res.status(500).json({ error: updErr.message });

    // Replace line items if provided
    if (Array.isArray(line_items)) {
      await supabase.from('change_order_line_items').delete().eq('change_order_id', id);
      if (line_items.length > 0) {
        const rows = line_items.map((li, idx) => ({
          change_order_id: id,
          position: idx + 1,
          description: li.description || '',
          quantity: Number(li.quantity || 1),
          unit: li.unit || null,
          unit_price: Number(li.unit_price || 0),
          category: li.category || null,
        }));
        await supabase.from('change_order_line_items').insert(rows);
      }
    }

    const { data: full } = await supabase
      .from('change_orders')
      .select('*, change_order_line_items(*)')
      .eq('id', id)
      .single();
    res.json(full);
  } catch (error) {
    logger.error('[PortalAdmin] Update CO error:', error.message);
    res.status(500).json({ error: 'Failed to update change order' });
  }
});

/**
 * POST /change-orders/:id/send
 * Flip status draft → pending_client, fire email, optionally request signature.
 */
router.post('/change-orders/:id/send', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;

    // Fetch CO + line items + project
    const { data: co } = await supabase
      .from('change_orders')
      .select('*, change_order_line_items(*)')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();
    if (!co) return res.status(404).json({ error: 'Change order not found' });
    if (co.status !== 'draft') {
      return res.status(400).json({ error: `Cannot send CO in status ${co.status}` });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, name, user_id, client_email, client_name, contract_amount, end_date')
      .eq('id', co.project_id)
      .single();
    if (!project) return res.status(400).json({ error: 'Project missing for change order' });

    // Resolve client email — explicit client record wins, then project fallback.
    // Use maybeSingle (not single) so projects with multiple shared clients
    // don't crash the route with PGRST116. We just take the first one.
    let clientEmail = project.client_email || null;
    const { data: pcRows } = await supabase
      .from('project_clients')
      .select('clients(email, full_name)')
      .eq('project_id', co.project_id)
      .limit(1);
    const pc = Array.isArray(pcRows) && pcRows.length > 0 ? pcRows[0] : null;
    if (pc?.clients?.email) clientEmail = pc.clients.email;

    if (!clientEmail) {
      return res.status(400).json({ error: 'No client email on project. Add one before sending.' });
    }

    // Flip status FIRST so the email link lands on a sendable record
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('change_orders')
      .update({ status: 'pending_client', sent_at: now })
      .eq('id', id)
      .eq('status', 'draft');
    if (updErr) return res.status(500).json({ error: updErr.message });

    // Get business name (mirror invoice send path)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, business_name')
      .eq('id', ownerId)
      .single();
    const { data: branding } = await supabase
      .from('client_portal_branding')
      .select('business_name')
      .eq('owner_id', ownerId)
      .single();
    const businessName = branding?.business_name || profile?.business_name || profile?.full_name || '';

    // Send email
    const { sendChangeOrderEmail } = require('../services/emailService');
    const emailResult = await sendChangeOrderEmail({
      changeOrder: co,
      lineItems: co.change_order_line_items || [],
      project,
      businessName,
      clientEmail,
    });

    // Optional: kick off e-signature request
    let signature = null;
    if (co.signature_required) {
      try {
        const eSign = require('../services/eSignService');
        signature = await eSign.createSignatureRequest({
          ownerId,
          documentType: 'change_order',
          documentId: id,
          signerName: pc?.clients?.full_name || project.client_name || 'Client',
          signerEmail: clientEmail,
        });
      } catch (sigErr) {
        logger.error('[PortalAdmin] CO signature request failed:', sigErr.message);
        // non-fatal — owner can resend; CO is still in pending_client state
      }
    }

    // Audit + domain event
    await supabase.from('approval_events').insert({
      project_id: co.project_id,
      entity_type: 'change_order',
      entity_id: id,
      action: 'sent',
      actor_type: 'owner',
      actor_id: ownerId,
      notes: emailResult.sent ? `Emailed to ${clientEmail}` : `Send failed: ${emailResult.error || 'unknown'}`,
    });
    try {
      const { emit, EVENT_TYPES } = require('../services/eventEmitter');
      emit({
        ownerId, eventType: EVENT_TYPES.CHANGE_ORDER_SENT,
        actorId: ownerId, actorType: 'owner', source: 'manual',
        entityType: 'change_order', entityId: id,
        payload: { co_number: co.co_number, total_amount: co.total_amount, signature_required: !!co.signature_required },
        summary: `Sent change order CO-${String(co.co_number).padStart(3, '0')} to ${clientEmail}`,
      });
    } catch {}

    // Notify client in-app if they have a portal account
    try {
      if (pc?.clients) {
        const { data: client } = await supabase
          .from('clients').select('id, user_id').eq('email', clientEmail).eq('owner_id', ownerId).single();
        if (client?.user_id) {
          await supabase.from('notifications').insert({
            user_id: client.user_id,
            title: 'New Change Order',
            body: `CO-${String(co.co_number).padStart(3, '0')} for $${parseFloat(co.total_amount).toLocaleString()} ready for review.`,
            type: 'change_order',
            data: { changeOrderId: id, projectId: co.project_id },
          });
        }
      }
    } catch {}

    res.json({
      sent: emailResult.sent,
      email: clientEmail,
      signature_request: signature ? { signing_url: signature.signingUrl, expires_at: signature.expiresAt } : null,
      error: emailResult.error,
    });
  } catch (error) {
    logger.error('[PortalAdmin] Send CO error:', error.message);
    res.status(500).json({ error: 'Failed to send change order' });
  }
});

/**
 * POST /change-orders/:id/recall
 * Pull a sent CO back to draft (allowed from pending_client | viewed).
 */
router.post('/change-orders/:id/recall', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { data: co } = await supabase
      .from('change_orders')
      .select('id, status, project_id, co_number')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();
    if (!co) return res.status(404).json({ error: 'Change order not found' });
    if (!['pending_client', 'viewed'].includes(co.status)) {
      return res.status(400).json({ error: `Cannot recall CO in status ${co.status}` });
    }

    const { error } = await supabase
      .from('change_orders')
      .update({ status: 'draft', sent_at: null, client_viewed_at: null })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    res.json({ status: 'draft' });
  } catch (error) {
    logger.error('[PortalAdmin] Recall CO error:', error.message);
    res.status(500).json({ error: 'Failed to recall change order' });
  }
});

/**
 * POST /change-orders/:id/void
 * Mark a CO as voided (terminal). Allowed from any non-approved status.
 */
router.post('/change-orders/:id/void', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body || {};
    const { data: co } = await supabase
      .from('change_orders')
      .select('id, status, project_id, co_number')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .single();
    if (!co) return res.status(404).json({ error: 'Change order not found' });
    if (co.status === 'approved') {
      return res.status(400).json({ error: 'Cannot void an approved CO. Create a reversing CO instead.' });
    }

    const { error } = await supabase
      .from('change_orders')
      .update({ status: 'void', client_response_reason: reason || null })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('approval_events').insert({
      project_id: co.project_id,
      entity_type: 'change_order',
      entity_id: id,
      action: 'rejected',  // closest enum value — no 'voided' in CHECK
      actor_type: 'owner',
      actor_id: ownerId,
      notes: `Voided: ${reason || 'No reason'}`,
    });
    try {
      const { emit, EVENT_TYPES } = require('../services/eventEmitter');
      emit({
        ownerId, eventType: EVENT_TYPES.CHANGE_ORDER_VOIDED,
        actorId: ownerId, actorType: 'owner', source: 'manual',
        entityType: 'change_order', entityId: id,
        payload: { co_number: co.co_number, reason: reason || null },
        summary: `Voided change order CO-${String(co.co_number).padStart(3, '0')}`,
      });
    } catch {}

    res.json({ status: 'void' });
  } catch (error) {
    logger.error('[PortalAdmin] Void CO error:', error.message);
    res.status(500).json({ error: 'Failed to void change order' });
  }
});

// ============================================================
// CLAIM CLIENT INVITE (auto-link new signup to owner)
// ============================================================
//
// When a client signs up with an email that matches a pending `clients` row
// (where user_id IS NULL), this route uses the service role to:
//   1. Set clients.user_id to the new auth user
//   2. Set profiles.role = 'client'
//   3. Set profiles.owner_id = clients.owner_id
//
// The frontend AuthContext can't do this directly because RLS on `clients`
// blocks the new user from updating a row owned by the contractor.
//
// Idempotent: safe to call repeatedly.
router.post('/claim-client-link', async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    if (!userEmail) return res.status(400).json({ error: 'No email on user' });

    // Find any pending client row for this email (case-insensitive)
    const { data: pendingClients } = await supabase
      .from('clients')
      .select('id, owner_id, full_name, email')
      .ilike('email', userEmail)
      .is('user_id', null)
      .limit(1);

    // If none pending, but there's an already-linked client for this user,
    // still return success + the owner_id so the client gets routed correctly.
    if (!pendingClients || pendingClients.length === 0) {
      const { data: existing } = await supabase
        .from('clients')
        .select('id, owner_id')
        .eq('user_id', userId)
        .limit(1);
      if (existing && existing.length > 0) {
        return res.json({ linked: false, alreadyLinked: true, ownerId: existing[0].owner_id });
      }
      return res.json({ linked: false, alreadyLinked: false });
    }

    const client = pendingClients[0];

    // 1) Link clients.user_id
    const { error: linkErr } = await supabase
      .from('clients')
      .update({ user_id: userId })
      .eq('id', client.id);
    if (linkErr) {
      logger.error('[PortalAdmin] Failed to link clients.user_id:', linkErr.message);
      return res.status(500).json({ error: 'Failed to link client (step 1)' });
    }

    // 2) Set profile role + owner_id
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ role: 'client', owner_id: client.owner_id })
      .eq('id', userId);
    if (profileErr) {
      // Rollback clients.user_id since the link is incomplete
      await supabase.from('clients').update({ user_id: null }).eq('id', client.id);
      logger.error('[PortalAdmin] Failed to set profile role/owner:', profileErr.message);
      return res.status(500).json({ error: 'Failed to link client (step 2)' });
    }

    res.json({
      linked: true,
      ownerId: client.owner_id,
      clientId: client.id,
      clientName: client.full_name,
    });
  } catch (error) {
    logger.error('[PortalAdmin] Claim client link error:', error.message);
    res.status(500).json({ error: 'Failed to link client account' });
  }
});

// ============================================================
// SEND ESTIMATE TO CLIENT (portal share)
// ============================================================
//
// Mirrors POST /invoices/:invoiceId/send — emails the estimate to the client,
// flips status draft → sent, creates a portal notification for clients with
// a portal account, and writes an audit row. This is the route the
// "Send to Client Portal" share-menu button hits.
router.post('/estimates/:estimateId/send', authenticateUser, async (req, res) => {
  try {
    const { estimateId } = req.params;
    const userId = req.user.id;

    const { data: estimate, error: estErr } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', estimateId)
      .eq('user_id', userId)
      .single();
    if (estErr || !estimate) return res.status(404).json({ error: 'Estimate not found' });

    // Portal is the primary destination — flip status FIRST so the estimate
    // is immediately visible in the client portal even if email/notification
    // delivery has issues. Email is a best-effort secondary channel.
    if (estimate.status === 'draft') {
      await supabase
        .from('estimates')
        .update({ status: 'sent', sent_date: new Date().toISOString() })
        .eq('id', estimateId);
    }

    // ─── In-portal notification (works even when no email exists) ───
    // Try to find the client linked to this estimate's project. We prefer
    // the project_clients link (any client shared on the project), and
    // fall back to matching by client_email on the estimate.
    let notifiedClient = null;
    try {
      let candidates = [];
      if (estimate.project_id) {
        const { data: pc } = await supabase
          .from('project_clients')
          .select('clients(id, user_id, email, full_name)')
          .eq('project_id', estimate.project_id);
        candidates = (pc || []).map(p => p.clients).filter(Boolean);
      }
      if (candidates.length === 0 && estimate.client_email) {
        const { data: byEmail } = await supabase
          .from('clients')
          .select('id, user_id, email, full_name')
          .eq('owner_id', userId)
          .ilike('email', estimate.client_email);
        candidates = byEmail || [];
      }
      // Notify every linked client account
      for (const c of candidates) {
        if (!c?.user_id) continue;
        await supabase.from('notifications').insert({
          user_id: c.user_id,
          title: 'New Estimate',
          body: `Estimate ${estimate.estimate_number || ''} for $${parseFloat(estimate.total || 0).toLocaleString()} is ready to review.`,
          type: 'financial_update',
          project_id: estimate.project_id || null,
          action_type: 'navigate',
          action_data: { estimateId, projectId: estimate.project_id, screen: 'ClientProjectDetail' },
        });
        notifiedClient = c;
      }
    } catch (notifErr) {
      logger.warn('[PortalAdmin] Estimate portal notification failed:', notifErr.message);
    }

    // ─── Optional: email delivery (only when address present + key set) ───
    let emailResult = { sent: false, reason: 'no_email' };
    if (estimate.client_email && process.env.RESEND_API_KEY) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, business_name')
          .eq('id', userId)
          .single();
        const { data: branding } = await supabase
          .from('client_portal_branding')
          .select('business_name')
          .eq('owner_id', userId)
          .single();
        const businessName = branding?.business_name || profile?.business_name || profile?.full_name || '';
        const { sendEstimateEmail } = require('../services/emailService');
        emailResult = await sendEstimateEmail({
          estimate,
          businessName,
          pdfUrl: estimate.pdf_url,
        });
      } catch (emailErr) {
        logger.warn('[PortalAdmin] Estimate email send failed:', emailErr.message);
        emailResult = { sent: false, error: emailErr.message };
      }
    }

    // Audit
    if (estimate.project_id) {
      const auditNote = notifiedClient
        ? `Shared to portal for ${notifiedClient.full_name || notifiedClient.email || 'client'}${emailResult.sent ? ` + emailed ${estimate.client_email}` : ''}`
        : (emailResult.sent ? `Emailed ${estimate.client_email}` : 'Marked as sent (no portal recipient or email)');
      await supabase.from('approval_events').insert({
        project_id: estimate.project_id,
        entity_type: 'estimate',
        entity_id: estimateId,
        action: 'sent',
        actor_type: 'owner',
        actor_id: userId,
        notes: auditNote,
      });
    }

    res.json({
      sent: true,
      portal_notified: !!notifiedClient,
      portal_recipient: notifiedClient?.full_name || notifiedClient?.email || null,
      email_sent: !!emailResult.sent,
      email_recipient: emailResult.sent ? estimate.client_email : null,
    });
  } catch (error) {
    logger.error('[PortalAdmin] Send estimate error:', error.message);
    res.status(500).json({ error: 'Failed to send estimate' });
  }
});

// ============================================================
// SEND CONTRACT TO CLIENT (portal share)
// ============================================================
router.post('/contracts/:contractId/send', authenticateUser, async (req, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;

    const { data: contract, error: cErr } = await supabase
      .from('contract_documents')
      .select('id, user_id, project_id, file_name, file_url, client_email')
      .eq('id', contractId)
      .eq('user_id', userId)
      .single();
    if (cErr || !contract) return res.status(404).json({ error: 'Contract not found' });

    // Notify clients in the portal
    let notifiedClient = null;
    try {
      let candidates = [];
      if (contract.project_id) {
        const { data: pc } = await supabase
          .from('project_clients')
          .select('clients(id, user_id, email, full_name)')
          .eq('project_id', contract.project_id);
        candidates = (pc || []).map(p => p.clients).filter(Boolean);
      }
      if (candidates.length === 0 && contract.client_email) {
        const { data: byEmail } = await supabase
          .from('clients')
          .select('id, user_id, email, full_name')
          .eq('owner_id', userId)
          .ilike('email', contract.client_email);
        candidates = byEmail || [];
      }
      for (const c of candidates) {
        if (!c?.user_id) continue;
        await supabase.from('notifications').insert({
          user_id: c.user_id,
          title: 'New Contract',
          body: `${contract.file_name || 'A contract'} is ready to review in your portal.`,
          type: 'financial_update',
          project_id: contract.project_id || null,
          action_type: 'navigate',
          action_data: { contractId, projectId: contract.project_id, screen: 'ClientDocuments' },
        });
        notifiedClient = c;
      }
    } catch (notifErr) {
      logger.warn('[PortalAdmin] Contract portal notification failed:', notifErr.message);
    }

    // Optional email delivery (resolved from contract or project)
    let emailResult = { sent: false, reason: 'no_email' };
    let clientEmail = contract.client_email;
    if (!clientEmail && contract.project_id) {
      const { data: proj } = await supabase
        .from('projects')
        .select('client_email')
        .eq('id', contract.project_id)
        .single();
      clientEmail = proj?.client_email;
    }
    if (clientEmail && process.env.RESEND_API_KEY) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, business_name')
          .eq('id', userId)
          .single();
        const businessName = profile?.business_name || profile?.full_name || 'Your contractor';
        const { sendSignatureRequestEmail } = require('../services/emailService');
        const PORTAL_URL = process.env.PORTAL_URL || 'https://sylkapp.ai/portal';
        emailResult = await sendSignatureRequestEmail({
          documentType: 'contract',
          documentTitle: contract.file_name || 'Contract',
          signerName: '',
          signerEmail: clientEmail,
          businessName,
          signingUrl: PORTAL_URL,
          expiresAt: null,
        });
      } catch (emailErr) {
        logger.warn('[PortalAdmin] Contract email failed:', emailErr.message);
        emailResult = { sent: false, error: emailErr.message };
      }
    }

    // Audit
    if (contract.project_id) {
      const note = notifiedClient
        ? `Contract shared to portal for ${notifiedClient.full_name || notifiedClient.email}${emailResult.sent ? ` + emailed ${clientEmail}` : ''}`
        : (emailResult.sent ? `Contract emailed to ${clientEmail}` : 'Contract marked sent (no portal recipient or email)');
      await supabase.from('approval_events').insert({
        project_id: contract.project_id,
        entity_type: 'estimate', // approval_events doesn't allow 'contract'
        entity_id: contractId,
        action: 'sent',
        actor_type: 'owner',
        actor_id: userId,
        notes: note,
      });
    }

    res.json({
      sent: true,
      portal_notified: !!notifiedClient,
      portal_recipient: notifiedClient?.full_name || notifiedClient?.email || null,
      email_sent: !!emailResult.sent,
      email_recipient: emailResult.sent ? clientEmail : null,
    });
  } catch (error) {
    logger.error('[PortalAdmin] Send contract error:', error.message);
    res.status(500).json({ error: 'Failed to send contract' });
  }
});

// ============================================================
// UNIFIED PROJECT BILLING (BillingCard data source)
// ============================================================

/**
 * GET /projects/:projectId/billing
 * Returns the unified billing rollup — every billable event for the project
 * (estimates, draws, change orders, invoices) normalized into action/upcoming/
 * history zones for the BillingCard UI.
 */
router.get('/projects/:projectId/billing', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { projectId } = req.params;

    // Reuse the agent tool handler — same logic, single source of truth
    const { TOOL_HANDLERS } = require('../services/tools/handlers');
    const result = await TOOL_HANDLERS.get_project_billing(ownerId, { project_id: projectId });
    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    logger.error('[PortalAdmin] Project billing error:', error.message);
    res.status(500).json({ error: 'Failed to load project billing' });
  }
});

/**
 * POST /invoices/:invoiceId/nudge
 * Sends a polite reminder email to the client about an unpaid invoice.
 * Used by the one-tap [Nudge client] button on overdue notifications + BillingCard.
 */
router.post('/invoices/:invoiceId/nudge', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { invoiceId } = req.params;

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', ownerId)
      .single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.client_email) return res.status(400).json({ error: 'No client email on invoice' });
    if (parseFloat(invoice.amount_due || 0) <= 0) {
      return res.status(400).json({ error: 'Invoice has no outstanding balance' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, business_name')
      .eq('id', ownerId)
      .single();
    const businessName = profile?.business_name || profile?.full_name || 'Your contractor';

    // Reuse invoice email template (same content, different subject prefix)
    const { sendInvoiceEmail } = require('../services/emailService');
    const result = await sendInvoiceEmail({
      invoice: { ...invoice, _isReminder: true },
      businessName,
      pdfUrl: invoice.pdf_url,
    });

    // Audit
    await supabase.from('approval_events').insert({
      project_id: invoice.project_id,
      entity_type: 'invoice',
      entity_id: invoiceId,
      action: 'sent',
      actor_type: 'owner',
      actor_id: ownerId,
      notes: `Nudge sent to ${invoice.client_email}`,
    });

    // Mark any matching invoice_overdue notification as read so it dismisses
    await supabase.from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', ownerId)
      .eq('type', 'invoice_overdue')
      .eq('action_data->>invoice_id', invoiceId);

    res.json({ sent: result.sent, email: invoice.client_email, error: result.error });
  } catch (error) {
    logger.error('[PortalAdmin] Invoice nudge error:', error.message);
    res.status(500).json({ error: 'Failed to send invoice reminder' });
  }
});

module.exports = router;
