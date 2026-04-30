/**
 * Tool handlers — subcontractor / engagement / compliance / bidding.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission,
} = require('./_shared');

function getSubServices() {
  return {
    subOrgService:      require('../../subOrgService'),
    complianceService:  require('../../complianceService'),
    engagementService:  require('../../engagementService'),
    biddingService:     require('../../biddingService'),
    invoiceService:     require('../../invoiceService'),
  };
}

async function list_subs(userId, args = {}) {
  try {
    const { subOrgService } = getSubServices();
    const subs = await subOrgService.listSubsForGc(userId);
    return { subs: subs.slice(0, args.limit || 25) };
  } catch (e) {
    return { error: e.message };
  }
}

async function get_sub(userId, { sub_organization_id }) {
  try {
    const { subOrgService } = getSubServices();
    const sub = await subOrgService.getSubForGc({ subOrgId: sub_organization_id, gcUserId: userId });
    if (!sub) return { error: 'Sub not found or access denied' };
    return { sub_organization: sub };
  } catch (e) {
    return { error: e.message };
  }
}

async function get_sub_compliance(userId, { sub_organization_id }) {
  try {
    const { subOrgService, complianceService } = getSubServices();
    const sub = await subOrgService.getSubForGc({ subOrgId: sub_organization_id, gcUserId: userId });
    if (!sub) return { error: 'Sub not found or access denied' };
    // List active compliance docs for this sub
    const supabase2 = require('@supabase/supabase-js').createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: docs } = await supabase2
      .from('compliance_documents')
      .select('id, doc_type, doc_subtype, expires_at, verification_status, status')
      .eq('sub_organization_id', sub_organization_id)
      .eq('status', 'active');
    return { sub_organization: sub, documents: docs || [] };
  } catch (e) {
    return { error: e.message };
  }
}

async function list_engagements(userId, { project_id, status } = {}) {
  try {
    const { engagementService } = getSubServices();
    const list = await engagementService.listEngagementsForGc(userId, { projectId: project_id, status });
    return { engagements: list };
  } catch (e) {
    return { error: e.message };
  }
}

async function get_engagement(userId, { engagement_id }) {
  try {
    const { engagementService, complianceService } = getSubServices();
    const engagement = await engagementService.getEngagement({ engagementId: engagement_id, callerUserId: userId });
    if (!engagement) return { error: 'Not found or access denied' };
    const compliance = await complianceService.computeForEngagement(engagement.id);
    return { engagement, compliance };
  } catch (e) {
    return { error: e.message };
  }
}

async function list_expiring_compliance(userId, { within_days = 30 } = {}) {
  try {
    const { complianceService } = getSubServices();
    const docs = await complianceService.listExpiringForGc({ gcUserId: userId, withinDays: within_days });
    return { documents: docs };
  } catch (e) {
    return { error: e.message };
  }
}

async function list_open_bids(userId) {
  try {
    const { biddingService } = getSubServices();
    const list = await biddingService.listBidRequestsForGc(userId, { status: 'open' });
    return { bid_requests: list };
  } catch (e) {
    return { error: e.message };
  }
}

async function list_recent_invoices(userId, { limit = 25 } = {}) {
  try {
    // GC sees invoices on engagements they own
    const supabase2 = require('@supabase/supabase-js').createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: engagements } = await supabase2
      .from('sub_engagements').select('id').eq('gc_user_id', userId);
    const ids = (engagements || []).map((e) => e.id);
    if (ids.length === 0) return { invoices: [] };
    const { data } = await supabase2
      .from('sub_invoices')
      .select('id, engagement_id, total_amount, status, due_at, created_at')
      .in('engagement_id', ids)
      .order('created_at', { ascending: false })
      .limit(limit);
    return { invoices: data || [] };
  } catch (e) {
    return { error: e.message };
  }
}

async function add_sub_to_project(userId, { sub_organization_id, project_id, trade, scope_summary, contract_amount, payment_terms = 'net_30' }) {
  try {
    const { engagementService } = getSubServices();
    const supabase2 = require('@supabase/supabase-js').createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: project } = await supabase2.from('projects').select('id, user_id').eq('id', project_id).maybeSingle();
    if (!project || project.user_id !== userId) return { error: 'Project not found or access denied' };

    const engagement = await engagementService.createEngagement({
      gcUserId: userId,
      subOrganizationId: sub_organization_id,
      projectId: project_id,
      trade,
      scopeSummary: scope_summary,
      contractAmount: contract_amount,
      paymentTerms: payment_terms,
      initialStatus: 'invited',
    });
    return { engagement };
  } catch (e) {
    return { error: e.message };
  }
}

async function record_compliance_doc(userId, args) {
  try {
    const { complianceService } = getSubServices();
    const doc = await complianceService.recordDocument({
      subOrganizationId: args.sub_organization_id,
      docType: args.doc_type,
      docSubtype: args.doc_subtype,
      fileUrl: args.file_url || 'manual_entry',
      issuer: args.issuer,
      policyNumber: args.policy_number,
      expiresAt: args.expires_at,
      coverageLimits: args.coverage_limits,
      endorsements: args.endorsements || [],
      uploadedBy: userId,
      uploadedVia: 'gc_upload',
      notes: args.notes,
    });
    return { compliance_document: doc };
  } catch (e) {
    return { error: e.message };
  }
}

async function record_payment(userId, args) {
  try {
    const { invoiceService } = getSubServices();
    const payment = await invoiceService.recordPayment({
      engagementId: args.engagement_id,
      gcUserId: userId,
      amount: args.amount,
      paidAt: args.paid_at,
      method: args.method,
      reference: args.reference,
      subInvoiceId: args.sub_invoice_id,
      notes: args.notes,
    });
    return { payment };
  } catch (e) {
    return { error: e.message };
  }
}

async function request_compliance_doc_from_sub(userId, { sub_organization_id, doc_type }) {
  try {
    const { subOrgService } = getSubServices();
    const sub = await subOrgService.getSubForGc({ subOrgId: sub_organization_id, gcUserId: userId });
    if (!sub) return { error: 'Sub not found or access denied' };
    const token = await subOrgService.issueActionToken({
      subOrganizationId: sub.id,
      scope: 'upload_doc',
      docTypeRequested: doc_type,
      createdBy: userId,
    });
    return { sent_to: sub.primary_email, doc_type, action_token_expires_at: token.expires_at };
  } catch (e) {
    return { error: e.message };
  }
}

async function request_msa_signature(userId, { engagement_id, title = 'Master Subcontract Agreement' }) {
  try {
    const { engagementService, subOrgService } = getSubServices();
    const supabase2 = require('@supabase/supabase-js').createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const engagement = await engagementService.getEngagement({ engagementId: engagement_id, callerUserId: userId });
    if (!engagement || engagement.gc_user_id !== userId) return { error: 'Access denied' };

    const { data: created } = await supabase2.from('subcontracts').insert({
      contract_type: 'msa',
      sub_organization_id: engagement.sub_organization_id,
      gc_user_id: userId,
      engagement_id: engagement.id,
      title,
      body_md: `## ${title}\n\nThis Master Subcontract Agreement governs work performed by the Subcontractor for the GC across multiple Work Orders.`,
      status: 'draft',
      created_by: userId,
    }).select().single();

    const token = await subOrgService.issueActionToken({
      subOrganizationId: engagement.sub_organization_id,
      scope: 'sign_contract',
      subcontractId: created.id,
      engagementId: engagement.id,
      createdBy: userId,
    });
    return { subcontract_id: created.id, sent_to: engagement.sub.primary_email, action_token_expires_at: token.expires_at };
  } catch (e) {
    return { error: e.message };
  }
}

async function send_bid_invitation(userId, { project_id, trade, scope_summary, sub_organization_ids, due_at, payment_terms = 'net_30' }) {
  try {
    const { biddingService } = getSubServices();
    const supabase2 = require('@supabase/supabase-js').createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: project } = await supabase2.from('projects').select('id, user_id').eq('id', project_id).maybeSingle();
    if (!project || project.user_id !== userId) return { error: 'Project not found or access denied' };

    const br = await biddingService.createBidRequest({
      gcUserId: userId,
      projectId: project_id,
      trade,
      scopeSummary: scope_summary,
      dueAt: due_at,
      paymentTerms: payment_terms,
    });
    const result = await biddingService.inviteSubs({
      bidRequestId: br.id,
      gcUserId: userId,
      subOrgIds: sub_organization_ids || [],
    });
    return { bid_request_id: br.id, invited: result.invited };
  } catch (e) {
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// Polish: bid review + compliance verification
// ─────────────────────────────────────────────────────────────────

/**
 * One bid request with every submitted bid lined up for comparison.
 * Each bid carries amount, timeline, exclusions, alternates, status.
 * Used after send_bid_invitation when the user wants to review responses.
 */
async function get_bid_request(userId, { bid_request_id }) {
  if (!bid_request_id) return { error: 'bid_request_id is required' };
  try {
    const { biddingService } = getSubServices();
    const { data: br, error } = await supabase
      .from('bid_requests')
      .select('id, gc_user_id, project_id, trade, scope_summary, due_at, payment_terms, status, awarded_bid_id, created_at')
      .eq('id', bid_request_id)
      .maybeSingle();
    if (error) return userSafeError(error, "Couldn't load bid request.");
    if (!br) return { error: 'Bid request not found' };
    if (br.gc_user_id !== userId) return { error: 'Access denied' };

    const bids = await biddingService.listBidsForRequest({
      bidRequestId: bid_request_id,
      gcUserId: userId,
    });

    // Normalize for the agent: sort lowest-bid first when status=submitted.
    const submitted = (bids || []).filter((b) => b.status === 'submitted')
      .sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    const others = (bids || []).filter((b) => b.status !== 'submitted');

    return {
      success: true,
      bid_request: {
        id: br.id,
        project_id: br.project_id,
        trade: br.trade,
        scope_summary: br.scope_summary,
        due_at: br.due_at,
        payment_terms: br.payment_terms,
        status: br.status,
        awarded_bid_id: br.awarded_bid_id,
        created_at: br.created_at,
      },
      bid_count: bids?.length || 0,
      bids: [...submitted, ...others].map((b) => ({
        id: b.id,
        sub_organization_id: b.sub_organization_id,
        sub_name: b.sub_name || null,
        amount: b.amount != null ? parseFloat(b.amount) : null,
        timeline_days: b.timeline_days,
        exclusions: b.exclusions || null,
        alternates: b.alternates || null,
        notes: b.notes || null,
        status: b.status,
        submitted_at: b.submitted_at,
        decided_at: b.decided_at,
      })),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Accept one submitted bid → awards it, marks others declined,
 * creates a sub_engagement linking the chosen sub to the project.
 * EXTERNAL_WRITE because it notifies the awarded sub by email.
 */
async function accept_bid(userId, { bid_id }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;
  if (!bid_id) return { error: 'bid_id is required' };
  try {
    const { biddingService } = getSubServices();
    const result = await biddingService.acceptBid({ bidId: bid_id, gcUserId: userId });
    return { success: true, ...result };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Decline a single bid (the others stay alive). Useful when the user
 * wants to thin the list before picking a winner.
 */
async function decline_bid(userId, { bid_id }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;
  if (!bid_id) return { error: 'bid_id is required' };
  try {
    const { biddingService } = getSubServices();
    await biddingService.declineBid({ bidId: bid_id, gcUserId: userId });
    return { success: true, bid_id };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Mark a recorded compliance document as verified (or rejected with a
 * reason). Used after manual review of a COI / W-9 / license. The
 * verified_by audit trail captures who clicked.
 */
async function verify_compliance_doc(userId, { document_id, verification_status, rejection_reason, verification_method = 'manual_review' }) {
  const gate = await requireSupervisorPermission(userId, 'can_manage_workers');
  if (gate) return gate;
  if (!document_id) return { error: 'document_id is required' };
  if (!['verified', 'rejected'].includes(verification_status)) {
    return { error: "verification_status must be 'verified' or 'rejected'" };
  }
  if (verification_status === 'rejected' && !rejection_reason) {
    return { error: 'rejection_reason is required when rejecting' };
  }

  // Confirm the doc belongs to a sub the user GC'd at some point.
  // (compliance_documents is keyed by sub_organization_id, not user_id —
  // we authorize via sub_engagements.gc_user_id.)
  const { data: doc } = await supabase
    .from('compliance_documents')
    .select('id, sub_organization_id, doc_type, expires_at, status')
    .eq('id', document_id)
    .maybeSingle();
  if (!doc) return { error: 'Document not found' };

  const { data: ownerLink } = await supabase
    .from('sub_engagements')
    .select('id')
    .eq('sub_organization_id', doc.sub_organization_id)
    .eq('gc_user_id', userId)
    .limit(1)
    .maybeSingle();
  if (!ownerLink) return { error: 'Access denied — this sub has no engagement under your account.' };

  const updates = {
    verification_status,
    verified_at: new Date().toISOString(),
    verified_by: userId,
    verification_method,
    rejection_reason: verification_status === 'rejected' ? rejection_reason : null,
  };

  const { data: updated, error } = await supabase
    .from('compliance_documents')
    .update(updates)
    .eq('id', document_id)
    .select('id, doc_type, verification_status, expires_at, rejection_reason')
    .single();
  if (error) return userSafeError(error, "Couldn't update verification.");

  return {
    success: true,
    document: {
      id: updated.id,
      doc_type: updated.doc_type,
      verification_status: updated.verification_status,
      expires_at: updated.expires_at,
      rejection_reason: updated.rejection_reason,
    },
  };
}

module.exports = {
  list_subs, get_sub, get_sub_compliance,
  list_engagements, get_engagement,
  list_expiring_compliance, list_open_bids, list_recent_invoices,
  add_sub_to_project, record_compliance_doc, record_payment,
  request_compliance_doc_from_sub, request_msa_signature,
  send_bid_invitation,
  // Polish
  get_bid_request, accept_bid, decline_bid, verify_compliance_doc,
};
