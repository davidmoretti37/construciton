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
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// POST /api/bid-requests
// =============================================================================

router.post('/', authenticateUser, async (req, res) => {
  try {
    const {
      project_id, trade, scope_summary, plans_url, due_at,
      payment_terms, payment_terms_notes, required_doc_types,
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
    });
    return res.json({ bid_request: created });
  } catch (err) {
    logger.error('[bidRequests] POST error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create bid request' });
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
