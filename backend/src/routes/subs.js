/**
 * GC-side Subcontractor Routes
 *
 * Mounted at /api/subs — all routes require GC authentication
 * (authenticateUser middleware).
 *
 * - POST /api/subs            create or dedup a sub, issue first_claim token
 * - GET  /api/subs            list subs for this GC
 * - GET  /api/subs/:id        full sub record (access-checked)
 * - PATCH /api/subs/:id       edit unclaimed sub
 * - POST /api/subs/:id/request-doc   issue an upload_doc token + email
 */

const express = require('express');
const { authenticateUser } = require('../middleware/authenticate');
const subOrgService = require('../services/subOrgService');
const logger = require('../utils/logger');

const router = express.Router();

// =============================================================================
// POST /api/subs
// =============================================================================

router.post('/', authenticateUser, async (req, res) => {
  try {
    const {
      legal_name,
      primary_email,
      primary_phone,
      tax_id,
      tax_id_type = 'ein',
      country_code = 'US',
      trades = [],
    } = req.body;

    if (!legal_name || !primary_email) {
      return res.status(400).json({
        error: 'legal_name and primary_email are required',
      });
    }

    const result = await subOrgService.addSubByGc({
      gcUserId: req.user.id,
      legalName: legal_name,
      primaryEmail: primary_email,
      primaryPhone: primary_phone,
      taxId: tax_id,
      taxIdType: tax_id_type,
      countryCode: country_code,
      trades,
    });

    // TODO Phase B email integration: if action_token, send first_claim email.
    // For v1 hand-off, return the token so the GC can copy/paste OR an email
    // job is queued elsewhere.
    return res.json({
      sub_organization: result.sub_organization,
      was_existing: result.was_existing,
      action_token_id: result.action_token?.id,
      // raw token returned ONLY on creation; GC sends to sub via email
      action_token_raw: result.action_token?.raw,
      action_token_expires_at: result.action_token?.expires_at,
    });
  } catch (err) {
    logger.error('[subs] POST / error:', err);
    return res.status(500).json({ error: err.message || 'Failed to add sub' });
  }
});

// =============================================================================
// GET /api/subs
// =============================================================================

router.get('/', authenticateUser, async (req, res) => {
  try {
    const subs = await subOrgService.listSubsForGc(req.user.id);
    return res.json({ subs });
  } catch (err) {
    logger.error('[subs] GET / error:', err);
    return res.status(500).json({ error: 'Failed to list subs' });
  }
});

// =============================================================================
// GET /api/subs/:id
// =============================================================================

router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const sub = await subOrgService.getSubForGc({
      subOrgId: req.params.id,
      gcUserId: req.user.id,
    });
    if (!sub) return res.status(404).json({ error: 'Sub not found or access denied' });
    return res.json({ sub_organization: sub });
  } catch (err) {
    logger.error('[subs] GET /:id error:', err);
    return res.status(500).json({ error: 'Failed to load sub' });
  }
});

// =============================================================================
// PATCH /api/subs/:id
// =============================================================================

router.patch('/:id', authenticateUser, async (req, res) => {
  try {
    const updated = await subOrgService.updateSubByGc({
      subOrgId: req.params.id,
      gcUserId: req.user.id,
      updates: req.body || {},
    });
    return res.json({ sub_organization: updated });
  } catch (err) {
    logger.error('[subs] PATCH /:id error:', err);
    return res.status(400).json({ error: err.message || 'Failed to update sub' });
  }
});

// =============================================================================
// POST /api/subs/:id/request-doc
// =============================================================================

router.post('/:id/request-doc', authenticateUser, async (req, res) => {
  try {
    const { doc_type } = req.body;
    if (!doc_type) {
      return res.status(400).json({ error: 'doc_type required' });
    }

    // Access check
    const sub = await subOrgService.getSubForGc({
      subOrgId: req.params.id,
      gcUserId: req.user.id,
    });
    if (!sub) return res.status(404).json({ error: 'Sub not found or access denied' });

    const token = await subOrgService.issueActionToken({
      subOrganizationId: sub.id,
      scope: 'upload_doc',
      docTypeRequested: doc_type,
      createdBy: req.user.id,
    });

    return res.json({
      action_token_id: token.id,
      action_token_raw: token.raw,
      expires_at: token.expires_at,
    });
  } catch (err) {
    logger.error('[subs] request-doc error:', err);
    return res.status(500).json({ error: 'Failed to issue doc-request token' });
  }
});

module.exports = router;
