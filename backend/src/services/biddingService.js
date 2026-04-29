/**
 * Bidding Service
 *
 * GC creates a bid_request for a project + trade, invites sub_organizations,
 * subs respond with sub_bids, GC accepts → sub_engagement is created via
 * engagementService.
 */

const { createClient } = require('@supabase/supabase-js');
const subOrgService = require('./subOrgService');
const engagementService = require('./engagementService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// createBidRequest
// =============================================================================

async function createBidRequest({
  gcUserId,
  projectId,
  trade,
  scopeSummary,
  plansUrl = null,
  dueAt = null,
  paymentTerms = 'net_30',
  paymentTermsNotes = null,
  requiredDocTypes = [],
}) {
  if (!gcUserId || !projectId || !trade || !scopeSummary) {
    throw new Error('gcUserId, projectId, trade, and scopeSummary required');
  }
  const { data, error } = await supabase
    .from('bid_requests')
    .insert({
      gc_user_id: gcUserId,
      project_id: projectId,
      trade,
      scope_summary: scopeSummary,
      plans_url: plansUrl,
      due_at: dueAt,
      payment_terms: paymentTerms,
      payment_terms_notes: paymentTermsNotes,
      required_doc_types: requiredDocTypes,
      status: 'open',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// =============================================================================
// inviteSubsToBid
// =============================================================================

async function inviteSubs({ bidRequestId, gcUserId, subOrgIds }) {
  if (!Array.isArray(subOrgIds) || subOrgIds.length === 0) {
    throw new Error('subOrgIds must be a non-empty array');
  }

  // Verify GC owns the bid_request
  const { data: br, error: brErr } = await supabase
    .from('bid_requests')
    .select('id, gc_user_id, status')
    .eq('id', bidRequestId)
    .maybeSingle();
  if (brErr) throw brErr;
  if (!br) throw new Error('Bid request not found');
  if (br.gc_user_id !== gcUserId) throw new Error('Access denied');
  if (br.status !== 'open') throw new Error(`Cannot invite to a ${br.status} bid request`);

  const inserts = subOrgIds.map((id) => ({
    bid_request_id: bidRequestId,
    sub_organization_id: id,
    invited_by: gcUserId,
  }));

  const { error } = await supabase
    .from('bid_request_invitations')
    .insert(inserts, { onConflict: 'bid_request_id,sub_organization_id', ignoreDuplicates: true });
  if (error && !String(error.message || '').includes('duplicate')) throw error;

  // Issue submit_bid tokens for each invited sub
  const tokens = [];
  for (const id of subOrgIds) {
    try {
      const t = await subOrgService.issueActionToken({
        subOrganizationId: id,
        scope: 'submit_bid',
        bidRequestId,
        createdBy: gcUserId,
      });
      tokens.push({ sub_organization_id: id, action_token_raw: t.raw, action_token_id: t.id });
    } catch (e) {
      logger.warn('[biddingService] failed to issue submit_bid token:', e.message);
    }
  }
  return { invited: subOrgIds.length, tokens };
}

// =============================================================================
// submitBid (sub side)
// =============================================================================

async function submitBid({
  bidRequestId,
  subOrganizationId,
  amount,
  timelineDays = null,
  exclusions = null,
  alternates = null,
  notes = null,
}) {
  if (!bidRequestId || !subOrganizationId || amount == null) {
    throw new Error('bidRequestId, subOrganizationId, and amount required');
  }

  // Verify the sub is invited
  const { data: invite, error: invErr } = await supabase
    .from('bid_request_invitations')
    .select('id')
    .eq('bid_request_id', bidRequestId)
    .eq('sub_organization_id', subOrganizationId)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!invite) throw new Error('Sub not invited to this bid');

  // Upsert (in case sub edits before submit)
  const { data, error } = await supabase
    .from('sub_bids')
    .upsert({
      bid_request_id: bidRequestId,
      sub_organization_id: subOrganizationId,
      amount,
      timeline_days: timelineDays,
      exclusions,
      alternates,
      notes,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'bid_request_id,sub_organization_id' })
    .select()
    .single();
  if (error) throw error;

  // Notify the GC
  try {
    const { data: br } = await supabase
      .from('bid_requests')
      .select('gc_user_id, trade')
      .eq('id', bidRequestId)
      .single();
    const { data: subOrg } = await supabase
      .from('sub_organizations')
      .select('legal_name')
      .eq('id', subOrganizationId)
      .single();
    if (br && subOrg) {
      await notificationService.notify({
        userId: br.gc_user_id,
        type: 'sub_bid_submitted',
        title: `New bid: ${subOrg.legal_name}`,
        body: `$${Number(amount).toLocaleString()} for ${br.trade}`,
        actionData: { bid_request_id: bidRequestId, bid_id: data.id },
      });
    }
  } catch (e) { logger.warn('[biddingService] notify on submitBid:', e.message); }

  return data;
}

// =============================================================================
// acceptBid (creates engagement, marks others declined)
// =============================================================================

async function acceptBid({ bidId, gcUserId }) {
  // Load bid + request
  const { data: bid, error: bidErr } = await supabase
    .from('sub_bids')
    .select('*, bid_request:bid_requests(id, gc_user_id, project_id, trade, payment_terms, payment_terms_notes, status)')
    .eq('id', bidId)
    .maybeSingle();
  if (bidErr) throw bidErr;
  if (!bid) throw new Error('Bid not found');
  if (bid.bid_request.gc_user_id !== gcUserId) throw new Error('Access denied');
  if (bid.bid_request.status !== 'open') throw new Error('Bid request is not open');

  const { error: bidUpErr } = await supabase
    .from('sub_bids')
    .update({ status: 'accepted', decided_at: new Date().toISOString() })
    .eq('id', bidId);
  if (bidUpErr) throw bidUpErr;

  await supabase
    .from('sub_bids')
    .update({ status: 'declined', decided_at: new Date().toISOString() })
    .eq('bid_request_id', bid.bid_request_id)
    .neq('id', bidId)
    .eq('status', 'submitted');

  await supabase
    .from('bid_requests')
    .update({
      status: 'awarded',
      awarded_bid_id: bidId,
      awarded_at: new Date().toISOString(),
    })
    .eq('id', bid.bid_request_id);

  const engagement = await engagementService.createEngagement({
    gcUserId,
    subOrganizationId: bid.sub_organization_id,
    projectId: bid.bid_request.project_id,
    trade: bid.bid_request.trade,
    scopeSummary: bid.notes || null,
    contractAmount: Number(bid.amount),
    paymentTerms: bid.bid_request.payment_terms,
    paymentTermsNotes: bid.bid_request.payment_terms_notes,
    initialStatus: 'awarded',
  });

  // Notify accepted sub + declined subs
  try {
    const { data: subs } = await supabase
      .from('sub_organizations')
      .select('id, auth_user_id, legal_name')
      .eq('id', bid.sub_organization_id);
    const acceptedSub = subs?.[0];
    if (acceptedSub?.auth_user_id) {
      await notificationService.notify({
        userId: acceptedSub.auth_user_id,
        type: 'sub_bid_accepted',
        title: 'Your bid was accepted!',
        body: `$${Number(bid.amount).toLocaleString()} • ${bid.bid_request.trade}`,
        actionData: { engagement_id: engagement.id },
      });
    }
  } catch (e) { logger.warn('[biddingService] notify on acceptBid:', e.message); }

  return { engagement, bid };
}

async function declineBid({ bidId, gcUserId }) {
  const { data: bid, error } = await supabase
    .from('sub_bids')
    .select('*, bid_request:bid_requests(id, gc_user_id)')
    .eq('id', bidId)
    .maybeSingle();
  if (error) throw error;
  if (!bid) throw new Error('Bid not found');
  if (bid.bid_request.gc_user_id !== gcUserId) throw new Error('Access denied');

  await supabase
    .from('sub_bids')
    .update({ status: 'declined', decided_at: new Date().toISOString() })
    .eq('id', bidId);
  return { ok: true };
}

// =============================================================================
// Listings
// =============================================================================

async function listBidRequestsForGc(gcUserId, { projectId = null, status = null } = {}) {
  let q = supabase
    .from('bid_requests')
    .select('*')
    .eq('gc_user_id', gcUserId)
    .order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function listBidsForRequest({ bidRequestId, gcUserId }) {
  const { data: br } = await supabase
    .from('bid_requests')
    .select('id, gc_user_id')
    .eq('id', bidRequestId)
    .maybeSingle();
  if (!br) throw new Error('Bid request not found');
  if (br.gc_user_id !== gcUserId) throw new Error('Access denied');

  const { data, error } = await supabase
    .from('sub_bids')
    .select('*, sub:sub_organizations (id, legal_name, primary_email, trades)')
    .eq('bid_request_id', bidRequestId)
    .order('amount', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listOpenBidsForSub(subAuthUserId) {
  const { data: sub } = await supabase
    .from('sub_organizations')
    .select('id')
    .eq('auth_user_id', subAuthUserId)
    .maybeSingle();
  if (!sub) return [];
  const { data, error } = await supabase
    .from('bid_request_invitations')
    .select(`
      bid_request:bid_requests (
        id, gc_user_id, project_id, trade, scope_summary, plans_url,
        due_at, payment_terms, status, created_at
      )
    `)
    .eq('sub_organization_id', sub.id);
  if (error) throw error;
  return (data || []).map((r) => r.bid_request).filter(Boolean);
}

module.exports = {
  createBidRequest,
  inviteSubs,
  submitBid,
  acceptBid,
  declineBid,
  listBidRequestsForGc,
  listBidsForRequest,
  listOpenBidsForSub,
};
