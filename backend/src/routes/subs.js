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
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Doc-type display labels — used in notification titles and the
// sub-portal pending-requests listing.
const DOC_TYPE_LABELS = {
  w9: 'IRS Form W-9',
  coi_gl: 'General Liability COI',
  coi_wc: 'Workers Comp COI',
  coi_auto: 'Commercial Auto COI',
  coi_umbrella: 'Umbrella COI',
  ai_endorsement: 'Additional Insured Endorsement',
  waiver_subrogation: 'Waiver of Subrogation',
  license_state: 'State Contractor License',
  license_business: 'Business License',
  drug_policy: 'Drug Testing Policy',
  msa: 'Master Subcontract Agreement',
};

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
    const { doc_type, message = null } = req.body;
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

    const { data: gcProfile } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', req.user.id)
      .maybeSingle();

    const docLabel = DOC_TYPE_LABELS[doc_type] || doc_type.toUpperCase();
    const senderName = gcProfile?.business_name || 'Your contractor';

    // No email — push the request straight to the sub's app via a
    // notification row that the sub portal will surface as a pending
    // action. Sub taps → upload page (token is in action_data).
    let delivered = false;
    if (sub.auth_user_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: sub.auth_user_id,
          title: `${senderName} requested ${docLabel}`,
          body: message || 'Tap to upload — snap a photo or pick a PDF.',
          type: 'sub_doc_requested',
          icon: 'document-attach-outline',
          color: '#3B82F6',
          action_data: {
            screen: 'SubUpload',
            sub_organization_id: sub.id,
            doc_type,
            action_token: token.raw,
            action_token_id: token.id,
          },
        });
        delivered = true;
      } catch (e) { logger.warn('[subs] notification insert:', e.message); }
    }

    return res.json({
      sent_to_sub_id: sub.id,
      doc_type,
      doc_label: docLabel,
      delivered_in_app: delivered,
      sub_has_account: !!sub.auth_user_id,
      action_token_id: token.id,
      expires_at: token.expires_at,
    });
  } catch (err) {
    logger.error('[subs] request-doc error:', err);
    return res.status(500).json({ error: 'Failed to send doc request' });
  }
});

// =============================================================================
// GET /api/subs/:id/bid-history
// =============================================================================
// Returns bid_requests where THIS sub was invited (by THIS GC), with each
// request's bid from the sub (if any) and a count of all bids on that
// request — so the GC can see the full thread.

router.get('/:id/bid-history', authenticateUser, async (req, res) => {
  try {
    // Access check (GC must be linked to this sub via creator or engagement)
    const sub = await subOrgService.getSubForGc({
      subOrgId: req.params.id,
      gcUserId: req.user.id,
    });
    if (!sub) return res.status(404).json({ error: 'Sub not found or access denied' });

    // Find all invitations for this sub, joined to the bid_request
    const { data: invites } = await supabase
      .from('bid_request_invitations')
      .select(`
        bid_request:bid_requests (
          id, gc_user_id, project_id, trade, scope_summary,
          status, created_at, due_at, originated_by_role,
          site_address, site_city, site_state_code,
          project:projects (id, name, location)
        )
      `)
      .eq('sub_organization_id', sub.id);

    const requests = (invites || [])
      .map((r) => r.bid_request)
      .filter((r) => r && r.gc_user_id === req.user.id);

    // For each request, fetch this sub's bid (if any) + total bid count
    const enriched = await Promise.all(requests.map(async (br) => {
      const [{ data: myBid }, { count: bidCount }] = await Promise.all([
        supabase
          .from('sub_bids')
          .select('id, amount, timeline_days, status, submitted_at, exclusions, notes')
          .eq('bid_request_id', br.id)
          .eq('sub_organization_id', sub.id)
          .maybeSingle(),
        supabase
          .from('sub_bids')
          .select('id', { count: 'exact', head: true })
          .eq('bid_request_id', br.id),
      ]);
      const { data: attachments } = await supabase
        .from('bid_request_attachments')
        .select('id, file_name, file_mime, file_size_bytes, attachment_type, uploaded_by_role, created_at')
        .eq('bid_request_id', br.id)
        .order('created_at', { ascending: true });
      return {
        ...br,
        my_bid: myBid || null,
        total_bids: bidCount || 0,
        attachments: attachments || [],
        attachment_count: (attachments || []).length,
      };
    }));

    enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json({ bid_requests: enriched });
  } catch (err) {
    logger.error('[subs] bid-history error:', err);
    return res.status(500).json({ error: 'Failed to load bid history' });
  }
});

module.exports = router;
