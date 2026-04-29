/**
 * Sub Action Routes (token-gated, no auth required)
 *
 * Mounted at /api/sub-action — public endpoints that consume a single-use
 * action token from a magic-link email and execute the scoped action.
 *
 * - POST /api/sub-action/redeem    validate token, return scope + sub identity
 * - POST /api/sub-action/upload    upload a compliance doc (token scope=upload_doc)
 * - POST /api/sub-action/upgrade   convert Sub Lite/Free → Owner (subscription_tier='solo')
 *
 * Sign-contract flow already lives in eSignService / esign routes. We extend
 * those in Phase D rather than duplicating here.
 */

const express = require('express');
const subOrgService = require('../services/subOrgService');
const complianceService = require('../services/complianceService');
const logger = require('../utils/logger');

const router = express.Router();

// =============================================================================
// POST /api/sub-action/redeem
// =============================================================================
// Body: { token: <raw> }
// Returns: { scope, sub_organization (basic), engagement_id?, doc_type_requested?,
//            subcontract_id?, bid_request_id? }

router.post('/redeem', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const row = await subOrgService.lookupActionToken(token);
    if (!row) return res.status(401).json({ error: 'Invalid or expired token' });

    // Surface only what the action page needs
    return res.json({
      token_id: row.id,
      scope: row.scope,
      doc_type_requested: row.doc_type_requested,
      engagement_id: row.engagement_id,
      subcontract_id: row.subcontract_id,
      bid_request_id: row.bid_request_id,
      sub_organization: {
        id: row.sub_organization.id,
        legal_name: row.sub_organization.legal_name,
        primary_email: row.sub_organization.primary_email,
        country_code: row.sub_organization.country_code,
        is_claimed: !!row.sub_organization.auth_user_id,
      },
    });
  } catch (err) {
    logger.error('[subAction] redeem error:', err);
    return res.status(500).json({ error: 'Failed to validate token' });
  }
});

// =============================================================================
// POST /api/sub-action/upload
// =============================================================================
// Body: { token, doc_type, file_url, file_name, expires_at, ... }
//
// The file is uploaded directly to Supabase Storage by the frontend
// (using a signed-URL issued separately) OR via a base64 payload to a
// helper endpoint (not built v1). For v1 we accept a pre-uploaded URL.

router.post('/upload', async (req, res) => {
  try {
    const {
      token,
      doc_type,
      doc_subtype,
      file_url,
      file_name,
      file_mime,
      file_size_bytes,
      issuer,
      policy_number,
      issued_at,
      effective_at,
      expires_at,
      coverage_limits,
      endorsements = [],
      named_insureds = [],
      notes,
    } = req.body || {};

    if (!token) return res.status(400).json({ error: 'token required' });
    if (!file_url) return res.status(400).json({ error: 'file_url required' });

    const row = await subOrgService.lookupActionToken(token);
    if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
    if (row.scope !== 'upload_doc' && row.scope !== 'first_claim') {
      return res.status(403).json({ error: `token scope ${row.scope} cannot upload docs` });
    }

    const finalDocType = doc_type || row.doc_type_requested;
    if (!finalDocType) {
      return res.status(400).json({ error: 'doc_type required (and not specified by token)' });
    }

    const created = await complianceService.recordDocument({
      subOrganizationId: row.sub_organization_id,
      docType: finalDocType,
      docSubtype: doc_subtype,
      fileUrl: file_url,
      fileName: file_name,
      fileMime: file_mime,
      fileSizeBytes: file_size_bytes,
      issuer,
      policyNumber: policy_number,
      issuedAt: issued_at,
      effectiveAt: effective_at,
      expiresAt: expires_at,
      coverageLimits: coverage_limits,
      endorsements,
      namedInsureds: named_insureds,
      notes,
      uploadedVia: 'sub_email',
    });

    // Consume the token (single-use)
    await subOrgService.consumeActionToken(row.id);

    return res.json({
      compliance_document: {
        id: created.id,
        doc_type: created.doc_type,
        expires_at: created.expires_at,
        status: created.status,
      },
    });
  } catch (err) {
    logger.error('[subAction] upload error:', err);
    return res.status(500).json({ error: 'Failed to upload doc' });
  }
});

// =============================================================================
// POST /api/sub-action/upgrade
// =============================================================================
// Two paths:
// 1. Sub already has an account (Sub Free → Sub Paid Owner): just flip the tier.
// 2. Sub does NOT have an account yet (magic-link only → Sub Paid Owner directly):
//    create the account then flip the tier.
//
// Body: { token, email?, password? }

router.post('/upgrade', async (req, res) => {
  try {
    const { token, email, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const row = await subOrgService.lookupActionToken(token);
    if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
    if (row.scope !== 'upgrade_invite' && row.scope !== 'first_claim' && row.scope !== 'signup_invite') {
      return res.status(403).json({ error: `token scope ${row.scope} cannot upgrade` });
    }

    let result;

    if (!row.sub_organization.auth_user_id) {
      // Path 2: needs to claim first
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required for first-time upgrade' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
      }
      result = await subOrgService.claimSubAccount({
        subOrganizationId: row.sub_organization_id,
        email: email.trim().toLowerCase(),
        password,
      });
    } else {
      // Path 1: already claimed, just upgrade
      result = { user: null, sub_organization: row.sub_organization };
    }

    // Upgrade tier
    const upgraded = await subOrgService.upgradeSubToOwner({
      subOrganizationId: row.sub_organization_id,
    });

    await subOrgService.consumeActionToken(row.id);

    return res.json({
      sub_organization: upgraded,
      user_id: result.user?.id || row.sub_organization.auth_user_id,
      next_step: 'login_and_complete_onboarding',
    });
  } catch (err) {
    logger.error('[subAction] upgrade error:', err);
    return res.status(500).json({ error: err.message || 'Failed to upgrade' });
  }
});

module.exports = router;
