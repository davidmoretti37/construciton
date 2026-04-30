/**
 * Bid Request Routes
 *
 * Mounted at /api/bid-requests — auth-required.
 * Sub-side routes mounted at /api/sub-portal/bids in subPortal.js
 *
 * - POST   /api/bid-requests                    GC creates bid request
 * - GET    /api/bid-requests                    list bid requests for GC
 * - GET    /api/bid-requests/:id                bid request details + bids
 * - POST   /api/bid-requests/:id/invite         invite sub_orgs to bid
 * - POST   /api/bid-requests/:id/accept-bid     accept a specific bid → engagement
 * - POST   /api/bid-requests/:id/decline-bid    decline a specific bid
 */

const express = require('express');
const { authenticateUser } = require('../middleware/authenticate');
const biddingService = require('../services/biddingService');
const anthropicClient = require('../services/anthropicClient');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// POST /api/bid-requests/generate-scope
// =============================================================================
// Body: { project_id, trade, instructions? }
// Uses the project's name/address/description to draft a scope of work
// for the given trade. The GC reviews and edits before sending.

router.post('/generate-scope', authenticateUser, async (req, res) => {
  try {
    const { project_id, trade, instructions } = req.body || {};
    if (!project_id || !trade) {
      return res.status(400).json({ error: 'project_id and trade required' });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, project_name, project_type, project_description, address, city, state_code')
      .eq('id', project_id)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    if (!anthropicClient.isAvailable()) {
      // Graceful fallback when no API key is set — return a templated scope
      const fallback = templateScope({ trade, project, instructions });
      return res.json({ scope_summary: fallback, source: 'template' });
    }

    const systemPrompt = [
      'You are a senior general contractor writing a clear, focused scope of work for a subcontractor.',
      'Output is sent directly to the sub — no preamble, no headers, no markdown.',
      'Write 4-8 short bullet points (use "- " prefix), each a concrete deliverable or boundary.',
      'Cover: what is included, materials/standards, what is excluded, conditions for completion.',
      'Stay grounded in the project context provided. Do not invent specifics that were not given.',
      'Keep it tight — a sub should be able to read it and price it in under 60 seconds.',
    ].join('\n');

    const userPrompt = [
      `Project: ${project.project_name || 'Unnamed project'}`,
      project.project_type ? `Type: ${project.project_type}` : null,
      project.address || project.city ? `Location: ${[project.address, project.city, project.state_code].filter(Boolean).join(', ')}` : null,
      project.project_description ? `Description: ${project.project_description}` : null,
      ``,
      `Trade: ${trade}`,
      instructions ? `\nGC's specific notes: ${instructions}` : ``,
      ``,
      `Write the scope of work for the ${trade} subcontractor on this project.`,
    ].filter(Boolean).join('\n');

    let scope;
    try {
      const result = await anthropicClient.callMessages({
        model: 'claude-haiku-4.5',
        systemPrompt,
        userPrompt,
        max_tokens: 600,
        temperature: 0.4,
        timeout_ms: 20000,
      });
      scope = (result.text || '').trim();
    } catch (e) {
      logger.warn('[bidRequests] AI scope-gen failed, falling back:', e.message);
      scope = templateScope({ trade, project, instructions });
      return res.json({ scope_summary: scope, source: 'template' });
    }

    if (!scope) scope = templateScope({ trade, project, instructions });
    return res.json({ scope_summary: scope, source: 'ai' });
  } catch (err) {
    logger.error('[bidRequests] generate-scope error:', err);
    return res.status(500).json({ error: 'Failed to generate scope' });
  }
});

function templateScope({ trade, project, instructions }) {
  const lines = [
    `- Furnish all labor, materials, tools, and supervision required for ${trade} work on ${project.project_name || 'this project'}.`,
    project.project_type ? `- Project is a ${project.project_type}; conform to applicable codes and project plans.` : null,
    `- Coordinate scheduling with the GC; submit RFIs in writing for any conflicts or unclear conditions.`,
    `- Pull all required permits and arrange inspections for the ${trade} scope.`,
    `- Excludes work outside the ${trade} trade unless explicitly listed in the bid.`,
    `- Provide clean handoff: remove debris, leave area broom-clean, and notify GC for sign-off.`,
    instructions ? `- GC notes: ${instructions}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

// =============================================================================
// POST /api/bid-requests
// =============================================================================

router.post('/', authenticateUser, async (req, res) => {
  try {
    const {
      project_id, trade, scope_summary, plans_url, due_at,
      payment_terms, payment_terms_notes, required_doc_types,
      site_address, site_city, site_state_code, site_postal_code, site_visit_notes,
    } = req.body || {};

    // Project ownership check
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', project_id)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const created = await biddingService.createBidRequest({
      gcUserId: req.user.id,
      projectId: project_id,
      trade,
      scopeSummary: scope_summary,
      plansUrl: plans_url,
      dueAt: due_at,
      paymentTerms: payment_terms || 'net_30',
      paymentTermsNotes: payment_terms_notes,
      requiredDocTypes: required_doc_types || [],
      siteAddress: site_address || null,
      siteCity: site_city || null,
      siteStateCode: site_state_code || null,
      sitePostalCode: site_postal_code || null,
      siteVisitNotes: site_visit_notes || null,
    });
    return res.json({ bid_request: created });
  } catch (err) {
    logger.error('[bidRequests] POST error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create bid request' });
  }
});

// =============================================================================
// Attachments helpers
// =============================================================================
const BID_BUCKET = 'documents'; // reuse existing bucket; namespaced by bid-request

async function loadBidRequestForCaller(reqId, userId) {
  const { data: br } = await supabase
    .from('bid_requests')
    .select('id, gc_user_id')
    .eq('id', reqId)
    .maybeSingle();
  if (!br) return { error: 'Not found', code: 404 };
  if (br.gc_user_id === userId) return { br, role: 'gc' };

  // Sub access — must be invited and the sub_org's auth_user_id must match
  const { data: invites } = await supabase
    .from('bid_request_invitations')
    .select('sub_organization_id, sub_organization:sub_organizations(auth_user_id)')
    .eq('bid_request_id', reqId);
  const invited = (invites || []).some((r) => r.sub_organization?.auth_user_id === userId);
  if (invited) return { br, role: 'sub' };
  return { error: 'Access denied', code: 403 };
}

// =============================================================================
// POST /api/bid-requests/:id/attachments
// =============================================================================
// Body: { file_base64, file_name, file_mime, attachment_type? }
router.post('/:id/attachments', authenticateUser, async (req, res) => {
  try {
    const { file_base64, file_name, file_mime, attachment_type = 'plan', file_size_bytes } = req.body || {};
    if (!file_base64 || !file_name) {
      return res.status(400).json({ error: 'file_base64 and file_name required' });
    }

    const access = await loadBidRequestForCaller(req.params.id, req.user.id);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (access.role !== 'gc') return res.status(403).json({ error: 'Only the GC can add attachments' });

    const buffer = Buffer.from(file_base64, 'base64');
    const ext = file_name.split('.').pop()?.toLowerCase() || 'bin';
    const stamp = Date.now();
    const path = `bid-requests/${req.params.id}/${stamp}.${ext}`;

    const { error: upErr } = await supabase
      .storage
      .from(BID_BUCKET)
      .upload(path, buffer, { contentType: file_mime || 'application/octet-stream', upsert: false });
    if (upErr) {
      logger.error('[bidRequests] storage upload:', upErr);
      return res.status(500).json({ error: 'Storage upload failed' });
    }

    const { data: row, error: insErr } = await supabase
      .from('bid_request_attachments')
      .insert({
        bid_request_id: req.params.id,
        file_url: path,
        file_name,
        file_mime: file_mime || null,
        file_size_bytes: file_size_bytes || buffer.length,
        attachment_type,
        uploaded_by: req.user.id,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    return res.json({ attachment: row });
  } catch (err) {
    logger.error('[bidRequests] attachments POST:', err);
    return res.status(500).json({ error: 'Failed to attach' });
  }
});

// =============================================================================
// GET /api/bid-requests/:id/attachments
// =============================================================================
router.get('/:id/attachments', authenticateUser, async (req, res) => {
  try {
    const access = await loadBidRequestForCaller(req.params.id, req.user.id);
    if (access.error) return res.status(access.code).json({ error: access.error });

    const { data, error } = await supabase
      .from('bid_request_attachments')
      .select('*')
      .eq('bid_request_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return res.json({ attachments: data || [] });
  } catch (err) {
    logger.error('[bidRequests] attachments GET:', err);
    return res.status(500).json({ error: 'Failed to load attachments' });
  }
});

// =============================================================================
// GET /api/bid-requests/:id/attachments/:aid/url
// =============================================================================
router.get('/:id/attachments/:aid/url', authenticateUser, async (req, res) => {
  try {
    const access = await loadBidRequestForCaller(req.params.id, req.user.id);
    if (access.error) return res.status(access.code).json({ error: access.error });

    const { data: row } = await supabase
      .from('bid_request_attachments')
      .select('file_url')
      .eq('id', req.params.aid)
      .eq('bid_request_id', req.params.id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Attachment not found' });

    const { data: signed, error: sErr } = await supabase
      .storage
      .from(BID_BUCKET)
      .createSignedUrl(row.file_url, 300);
    if (sErr) throw sErr;
    return res.json({ url: signed.signedUrl, expires_in: 300 });
  } catch (err) {
    logger.error('[bidRequests] attachment url:', err);
    return res.status(500).json({ error: 'Failed to issue URL' });
  }
});

// =============================================================================
// DELETE /api/bid-requests/:id/attachments/:aid
// =============================================================================
router.delete('/:id/attachments/:aid', authenticateUser, async (req, res) => {
  try {
    const access = await loadBidRequestForCaller(req.params.id, req.user.id);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (access.role !== 'gc') return res.status(403).json({ error: 'Only the GC can remove attachments' });

    const { data: row } = await supabase
      .from('bid_request_attachments')
      .select('file_url')
      .eq('id', req.params.aid)
      .eq('bid_request_id', req.params.id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Attachment not found' });

    await supabase.storage.from(BID_BUCKET).remove([row.file_url]).catch(() => {});
    const { error } = await supabase
      .from('bid_request_attachments')
      .delete()
      .eq('id', req.params.aid);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[bidRequests] attachment delete:', err);
    return res.status(500).json({ error: 'Failed to delete' });
  }
});

// =============================================================================
// GET /api/bid-requests
// =============================================================================

router.get('/', authenticateUser, async (req, res) => {
  try {
    const list = await biddingService.listBidRequestsForGc(req.user.id, {
      projectId: req.query.project_id || null,
      status: req.query.status || null,
    });
    return res.json({ bid_requests: list });
  } catch (err) {
    logger.error('[bidRequests] GET error:', err);
    return res.status(500).json({ error: 'Failed to list' });
  }
});

// =============================================================================
// GET /api/bid-requests/:id
// =============================================================================

router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { data: br } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!br) return res.status(404).json({ error: 'Not found' });
    if (br.gc_user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const bids = await biddingService.listBidsForRequest({
      bidRequestId: req.params.id,
      gcUserId: req.user.id,
    });
    return res.json({ bid_request: br, bids });
  } catch (err) {
    logger.error('[bidRequests] GET /:id error:', err);
    return res.status(500).json({ error: 'Failed to load' });
  }
});

// =============================================================================
// POST /api/bid-requests/:id/invite
// =============================================================================

router.post('/:id/invite', authenticateUser, async (req, res) => {
  try {
    const { sub_organization_ids } = req.body || {};
    const result = await biddingService.inviteSubs({
      bidRequestId: req.params.id,
      gcUserId: req.user.id,
      subOrgIds: sub_organization_ids || [],
    });
    return res.json(result);
  } catch (err) {
    logger.error('[bidRequests] invite error:', err);
    return res.status(400).json({ error: err.message || 'Failed to invite' });
  }
});

// =============================================================================
// POST /api/bid-requests/:id/accept-bid
// =============================================================================

router.post('/:id/accept-bid', authenticateUser, async (req, res) => {
  try {
    const { bid_id } = req.body || {};
    if (!bid_id) return res.status(400).json({ error: 'bid_id required' });
    const result = await biddingService.acceptBid({
      bidId: bid_id,
      gcUserId: req.user.id,
    });
    return res.json(result);
  } catch (err) {
    logger.error('[bidRequests] accept error:', err);
    return res.status(400).json({ error: err.message || 'Failed to accept' });
  }
});

router.post('/:id/decline-bid', authenticateUser, async (req, res) => {
  try {
    const { bid_id } = req.body || {};
    await biddingService.declineBid({
      bidId: bid_id,
      gcUserId: req.user.id,
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[bidRequests] decline error:', err);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
