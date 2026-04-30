/**
 * Sub Free Portal Routes
 *
 * Mounted at /api/sub-portal — requires authenticateUser (standard Supabase auth)
 * with profiles.role='sub'. Existing owner accounts that have a paired
 * sub_organizations row also have access (so a hybrid Mike-the-plumber can
 * view his sub side from his owner login).
 *
 * - POST /api/sub-portal/auth/signup    create a new Sub Free account
 *                                        (token-gated; piggybacks on
 *                                         sub-action redemption)
 * - GET  /api/sub-portal/me             sub's own profile + linked sub_organization
 * - PATCH /api/sub-portal/me            update profile
 */

const express = require('express');
const { authenticateUser } = require('../middleware/authenticate');
const subOrgService = require('../services/subOrgService');
const biddingService = require('../services/biddingService');
const engagementService = require('../services/engagementService');
const invoiceService = require('../services/invoiceService');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// GET /api/sub-portal/check-invite?email=foo@bar.com   (public)
// =============================================================================
// Used by the signup screen to detect that an email was invited as a sub
// (so the app can route them to the sub portal after signup).

router.get('/check-invite', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email query param required' });
    const unclaimed = await subOrgService.findUnclaimedByEmail(email);
    return res.json({
      invited: !!unclaimed,
      sub_organization_id: unclaimed?.id || null,
      legal_name: unclaimed?.legal_name || null,
    });
  } catch (err) {
    logger.error('[subPortal] check-invite error:', err);
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

// =============================================================================
// POST /api/sub-portal/auth/signup
// =============================================================================
// Body: { token (signup_invite or first_claim), email, password }

router.post('/auth/signup', async (req, res) => {
  try {
    const { token, email, password } = req.body || {};
    if (!token || !email || !password) {
      return res.status(400).json({ error: 'token, email, and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const row = await subOrgService.lookupActionToken(token);
    if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
    if (row.scope !== 'signup_invite' && row.scope !== 'first_claim') {
      return res.status(403).json({ error: 'token scope does not allow signup' });
    }
    if (row.sub_organization.auth_user_id) {
      return res.status(409).json({ error: 'this sub_organization already has an account' });
    }

    const result = await subOrgService.claimSubAccount({
      subOrganizationId: row.sub_organization_id,
      email: email.trim().toLowerCase(),
      password,
    });

    await subOrgService.consumeActionToken(row.id);

    return res.json({
      user_id: result.user.id,
      sub_organization: result.sub_organization,
      next_step: 'login',
    });
  } catch (err) {
    logger.error('[subPortal] signup error:', err);
    return res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

// =============================================================================
// Helper: load sub_organization for the authenticated user
// =============================================================================

async function loadSubOrgForUser(userId) {
  const { data, error } = await supabase
    .from('sub_organizations')
    .select('*')
    .eq('auth_user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Auto-link by email: if no sub_organizations row is linked to this user
 * but there's an UNCLAIMED row whose primary_email matches the user's
 * auth.users.email, link them. Idempotent — safe to call on every /me
 * request (no-op when already linked).
 *
 * This is what makes the "sign up with the email I was invited at" UX
 * work without magic links.
 */
async function autoLinkSubOrgByEmail(authUser) {
  if (!authUser?.id || !authUser?.email) return null;
  // Already linked?
  const existing = await loadSubOrgForUser(authUser.id);
  if (existing) return existing;

  const unclaimed = await subOrgService.findUnclaimedByEmail(authUser.email);
  if (!unclaimed) return null;

  // Make sure the user has a profiles row with role='sub' (sign-up may
  // have used the default 'owner' role; we promote to 'sub' here so the
  // app can route them to the sub portal).
  await supabase
    .from('profiles')
    .upsert({ id: authUser.id, role: 'sub', subscription_tier: 'free', business_email: authUser.email }, { onConflict: 'id' });

  return subOrgService.linkSubToAuthUser({
    subOrganizationId: unclaimed.id,
    authUserId: authUser.id,
  });
}

// =============================================================================
// POST /api/sub-portal/accept-invite
// =============================================================================
// Called from the sub onboarding "Accept invitation" screen. Looks up the
// unclaimed sub_organization by the user's auth email, links it, and sets
// profiles.role='sub' / subscription_tier='free'. Idempotent — if already
// linked, returns the existing row.

router.post('/accept-invite', authenticateUser, async (req, res) => {
  try {
    const existing = await loadSubOrgForUser(req.user.id);
    if (existing) {
      return res.json({ sub_organization: existing, already_linked: true });
    }

    const linked = await autoLinkSubOrgByEmail(req.user);
    if (!linked) {
      return res.status(404).json({
        error: 'No invitation found for this email. Ask your contractor to invite you and try again.',
      });
    }
    return res.json({ sub_organization: linked, already_linked: false });
  } catch (err) {
    logger.error('[subPortal] accept-invite error:', err);
    return res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// =============================================================================
// GET /api/sub-portal/me
// =============================================================================

router.get('/me', authenticateUser, async (req, res) => {
  try {
    let sub = await loadSubOrgForUser(req.user.id);
    if (!sub) {
      // Auto-link if there's an unclaimed sub_organization with this email
      sub = await autoLinkSubOrgByEmail(req.user);
    }
    if (!sub) return res.status(404).json({ error: 'No sub_organization linked to your account' });

    // Also load profile to show subscription_tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, subscription_tier, business_email, business_phone')
      .eq('id', req.user.id)
      .maybeSingle();

    return res.json({
      sub_organization: sub,
      profile,
    });
  } catch (err) {
    logger.error('[subPortal] GET /me error:', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// =============================================================================
// PATCH /api/sub-portal/me
// =============================================================================

router.patch('/me', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.status(404).json({ error: 'No sub_organization linked to your account' });

    const allowed = [
      'legal_name', 'dba', 'primary_email', 'primary_phone', 'website',
      'address_line1', 'address_line2', 'city', 'state_code', 'postal_code',
      'trades', 'service_states', 'tax_id', 'tax_id_type', 'country_code',
      'entity_type', 'year_founded', 'crew_size',
    ];
    const cleaned = {};
    for (const k of allowed) {
      if (k in req.body) cleaned[k] = req.body[k];
    }

    const { data, error } = await supabase
      .from('sub_organizations')
      .update(cleaned)
      .eq('id', sub.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ sub_organization: data });
  } catch (err) {
    logger.error('[subPortal] PATCH /me error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// =============================================================================
// GET /api/sub-portal/bids — open invitations + my submissions
// =============================================================================

router.get('/bids', authenticateUser, async (req, res) => {
  try {
    const open = await biddingService.listOpenBidsForSub(req.user.id);
    const sub = await loadSubOrgForUser(req.user.id);
    let mine = [];
    if (sub) {
      const { data } = await supabase
        .from('sub_bids')
        .select('*, bid_request:bid_requests!sub_bids_bid_request_id_fkey(id, project_id, trade, scope_summary, status)')
        .eq('sub_organization_id', sub.id)
        .order('submitted_at', { ascending: false });
      mine = data || [];
    }
    return res.json({ open_invitations: open, my_bids: mine });
  } catch (err) {
    logger.error('[subPortal] GET /bids error:', err);
    return res.status(500).json({ error: 'Failed to load bids' });
  }
});

// =============================================================================
// GET /api/sub-portal/contractors — GCs the sub is linked to
// =============================================================================
// Returns the GC who created the sub_organization + any GC the sub has an
// engagement with. The sub picks one of these when creating a proposal.

router.get('/contractors', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.json({ contractors: [] });

    const gcIds = new Set();
    if (sub.created_by_gc_user_id) gcIds.add(sub.created_by_gc_user_id);

    const { data: engs } = await supabase
      .from('sub_engagements')
      .select('gc_user_id')
      .eq('sub_organization_id', sub.id);
    for (const e of (engs || [])) if (e.gc_user_id) gcIds.add(e.gc_user_id);

    if (gcIds.size === 0) return res.json({ contractors: [] });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, business_name, business_email, business_phone')
      .in('id', [...gcIds]);

    return res.json({ contractors: profiles || [] });
  } catch (err) {
    logger.error('[subPortal] contractors error:', err);
    return res.status(500).json({ error: 'Failed to list contractors' });
  }
});

// =============================================================================
// POST /api/sub-portal/proposals — sub-initiated unsolicited proposal
// =============================================================================
// Body: { gc_user_id, trade, scope_summary, amount, timeline_days?,
//         exclusions?, notes?, project_id? }
//
// Creates a bid_request (originated_by_role='sub'), invites the sub,
// and submits their bid in one transaction-like flow. After insert the
// flow looks identical to a GC-originated bid — GC sees it on their
// SubcontractorDetail Bids tab and can accept or decline.

router.post('/proposals', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.status(403).json({ error: 'No sub_organization linked' });

    const {
      gc_user_id, trade, scope_summary, amount,
      timeline_days, exclusions, notes, project_id,
    } = req.body || {};

    if (!gc_user_id || !trade || !scope_summary || amount == null) {
      return res.status(400).json({
        error: 'gc_user_id, trade, scope_summary, and amount required',
      });
    }

    // Verify the sub is linked to this GC (creator OR engagement)
    let allowed = false;
    if (sub.created_by_gc_user_id === gc_user_id) allowed = true;
    if (!allowed) {
      const { data: eng } = await supabase
        .from('sub_engagements')
        .select('id')
        .eq('sub_organization_id', sub.id)
        .eq('gc_user_id', gc_user_id)
        .limit(1);
      if (eng && eng.length > 0) allowed = true;
    }
    if (!allowed) {
      return res.status(403).json({ error: 'You are not linked to this contractor' });
    }

    // 1. Create bid_request (originated_by_role='sub')
    const bidRequest = await biddingService.createBidRequest({
      gcUserId: gc_user_id,
      projectId: project_id || null,
      trade,
      scopeSummary: scope_summary,
      originatedByRole: 'sub',
    });

    // 2. Self-invite (so subsequent attachment + bid logic works)
    await supabase
      .from('bid_request_invitations')
      .insert({
        bid_request_id: bidRequest.id,
        sub_organization_id: sub.id,
        invited_by: req.user.id,
      });

    // 3. Submit the sub's bid
    const bid = await biddingService.submitBid({
      bidRequestId: bidRequest.id,
      subOrganizationId: sub.id,
      amount: Number(amount),
      timelineDays: timeline_days || null,
      exclusions: exclusions || null,
      notes: notes || null,
    });

    return res.json({ bid_request: bidRequest, bid });
  } catch (err) {
    logger.error('[subPortal] proposals error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send proposal' });
  }
});

// =============================================================================
// GET /api/sub-portal/bids/:id — full bid package for the invited sub
// =============================================================================
// Returns the bid_request + project basics + attachments. The sub must
// be invited (via bid_request_invitations) for this to succeed.

router.get('/bids/:id', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.status(404).json({ error: 'No sub_organization linked' });

    // Confirm the sub was invited to this bid
    const { data: invite } = await supabase
      .from('bid_request_invitations')
      .select('id')
      .eq('bid_request_id', req.params.id)
      .eq('sub_organization_id', sub.id)
      .maybeSingle();
    if (!invite) return res.status(403).json({ error: 'Not invited to this bid' });

    const { data: br } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!br) return res.status(404).json({ error: 'Bid request not found' });

    // Project basics — sub doesn't need full project (financials etc.)
    const { data: projectRow } = await supabase
      .from('projects')
      .select('id, name, location, task_description, client_name')
      .eq('id', br.project_id)
      .maybeSingle();
    const project = projectRow ? {
      id: projectRow.id,
      project_name: projectRow.name,
      project_type: null,
      project_description: projectRow.task_description,
      address: projectRow.location,
      city: null,
      state_code: null,
      postal_code: null,
    } : null;

    const { data: attachments } = await supabase
      .from('bid_request_attachments')
      .select('id, file_name, file_mime, file_size_bytes, attachment_type, uploaded_by_role, created_at')
      .eq('bid_request_id', req.params.id)
      .order('created_at', { ascending: true });

    // GC sender name for display
    const { data: gcProfile } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', br.gc_user_id)
      .maybeSingle();

    // Existing bid by this sub (for editing)
    const { data: existingBid } = await supabase
      .from('sub_bids')
      .select('*')
      .eq('bid_request_id', req.params.id)
      .eq('sub_organization_id', sub.id)
      .maybeSingle();

    return res.json({
      bid_request: br,
      project,
      attachments: attachments || [],
      sender_name: gcProfile?.business_name || null,
      my_bid: existingBid || null,
    });
  } catch (err) {
    logger.error('[subPortal] GET /bids/:id error:', err);
    return res.status(500).json({ error: 'Failed to load bid' });
  }
});

// =============================================================================
// GET /api/sub-portal/bids/:id/attachments/:aid/url
// =============================================================================
// Signed URL for an attachment — sub must be invited.

router.get('/bids/:id/attachments/:aid/url', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.status(404).json({ error: 'No sub_organization linked' });

    const { data: invite } = await supabase
      .from('bid_request_invitations')
      .select('id')
      .eq('bid_request_id', req.params.id)
      .eq('sub_organization_id', sub.id)
      .maybeSingle();
    if (!invite) return res.status(403).json({ error: 'Not invited to this bid' });

    const { data: row } = await supabase
      .from('bid_request_attachments')
      .select('file_url')
      .eq('id', req.params.aid)
      .eq('bid_request_id', req.params.id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Attachment not found' });

    const { data: signed, error: sErr } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(row.file_url, 300);
    if (sErr) throw sErr;
    return res.json({ url: signed.signedUrl, expires_in: 300 });
  } catch (err) {
    logger.error('[subPortal] attachment url:', err);
    return res.status(500).json({ error: 'Failed to issue URL' });
  }
});

// =============================================================================
// POST /api/sub-portal/bids/:id/decline — sub declines an invitation
// =============================================================================

router.post('/bids/:id/decline', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.status(404).json({ error: 'No sub_organization linked' });

    const { data: invite } = await supabase
      .from('bid_request_invitations')
      .select('id')
      .eq('bid_request_id', req.params.id)
      .eq('sub_organization_id', sub.id)
      .maybeSingle();
    if (!invite) return res.status(403).json({ error: 'Not invited to this bid' });

    // Mark a withdrawn sub_bid row (or upsert one)
    const { data: existing } = await supabase
      .from('sub_bids')
      .select('id')
      .eq('bid_request_id', req.params.id)
      .eq('sub_organization_id', sub.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('sub_bids').update({ status: 'withdrawn' }).eq('id', existing.id);
    } else {
      await supabase.from('sub_bids').insert({
        bid_request_id: req.params.id,
        sub_organization_id: sub.id,
        amount: 0,
        status: 'withdrawn',
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[subPortal] decline error:', err);
    return res.status(500).json({ error: 'Failed to decline' });
  }
});

// =============================================================================
// POST /api/sub-portal/bids — submit a bid for an invited request
// =============================================================================

router.post('/bids', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.status(403).json({ error: 'No sub_organization linked' });

    const { bid_request_id, amount, timeline_days, exclusions, alternates, notes } = req.body || {};
    const bid = await biddingService.submitBid({
      bidRequestId: bid_request_id,
      subOrganizationId: sub.id,
      amount,
      timelineDays: timeline_days,
      exclusions,
      alternates,
      notes,
    });
    return res.json({ bid });
  } catch (err) {
    logger.error('[subPortal] POST /bids error:', err);
    return res.status(400).json({ error: err.message || 'Failed to submit bid' });
  }
});

// =============================================================================
// GET /api/sub-portal/pending-requests — inbound action items
// =============================================================================
// Returns un-redeemed action tokens scoped to upload_doc / sign_contract /
// submit_bid for the authenticated sub. This is the sub portal's inbox
// feed — what the GC has asked the sub to do.

router.get('/pending-requests', authenticateUser, async (req, res) => {
  try {
    const sub = await loadSubOrgForUser(req.user.id);
    if (!sub) return res.json({ pending: [] });

    const { data, error } = await supabase
      .from('sub_action_tokens')
      .select(`
        id, scope, doc_type_requested, engagement_id, subcontract_id,
        bid_request_id, expires_at, created_at, created_by
      `)
      .eq('sub_organization_id', sub.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .in('scope', ['upload_doc', 'sign_contract', 'submit_bid'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Resolve sender business names so the UI can show "Davis requested..."
    const senderIds = [...new Set((data || []).map((r) => r.created_by).filter(Boolean))];
    let senderNames = {};
    if (senderIds.length) {
      const { data: senders } = await supabase
        .from('profiles')
        .select('id, business_name')
        .in('id', senderIds);
      for (const s of (senders || [])) senderNames[s.id] = s.business_name;
    }

    const pending = (data || []).map((row) => ({
      id: row.id,
      scope: row.scope,
      doc_type_requested: row.doc_type_requested,
      engagement_id: row.engagement_id,
      subcontract_id: row.subcontract_id,
      bid_request_id: row.bid_request_id,
      expires_at: row.expires_at,
      created_at: row.created_at,
      sender_name: senderNames[row.created_by] || null,
    }));

    return res.json({ pending });
  } catch (err) {
    logger.error('[subPortal] GET /pending-requests error:', err);
    return res.status(500).json({ error: 'Failed to load pending requests' });
  }
});

// =============================================================================
// GET /api/sub-portal/engagements — sub's engagements across all GCs
// =============================================================================

router.get('/engagements', authenticateUser, async (req, res) => {
  try {
    const list = await engagementService.listEngagementsForSub(req.user.id);
    return res.json({ engagements: list });
  } catch (err) {
    logger.error('[subPortal] GET /engagements error:', err);
    return res.status(500).json({ error: 'Failed to load engagements' });
  }
});

// =============================================================================
// Invoices
// =============================================================================

router.get('/invoices', authenticateUser, async (req, res) => {
  try {
    const list = await invoiceService.listInvoicesForSub(req.user.id);
    return res.json({ invoices: list });
  } catch (err) {
    logger.error('[subPortal] GET /invoices error:', err);
    return res.status(500).json({ error: 'Failed to load invoices' });
  }
});

router.post('/invoices', authenticateUser, async (req, res) => {
  try {
    const inv = await invoiceService.createInvoice({
      engagementId: req.body.engagement_id,
      subAuthUserId: req.user.id,
      invoiceNumber: req.body.invoice_number,
      totalAmount: req.body.total_amount,
      retentionAmount: req.body.retention_amount,
      periodStart: req.body.period_start,
      periodEnd: req.body.period_end,
      dueAt: req.body.due_at,
      notes: req.body.notes,
      lines: req.body.lines || [],
    });
    return res.json({ invoice: inv });
  } catch (err) {
    logger.error('[subPortal] POST /invoices error:', err);
    return res.status(400).json({ error: err.message });
  }
});

router.post('/invoices/:id/send', authenticateUser, async (req, res) => {
  try {
    const inv = await invoiceService.sendInvoice({
      invoiceId: req.params.id,
      subAuthUserId: req.user.id,
    });
    return res.json({ invoice: inv });
  } catch (err) {
    logger.error('[subPortal] POST /invoices/:id/send error:', err);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
