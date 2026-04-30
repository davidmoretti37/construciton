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

// =============================================================================
// create_sub_task — assign a task to a sub on an engagement
// =============================================================================
async function create_sub_task(userId, { engagement_id, title, description, start_date, end_date }) {
  try {
    if (!engagement_id || !title) {
      return userSafeError('engagement_id and title are required');
    }
    // Verify GC owns the engagement
    const { data: eng } = await supabase
      .from('sub_engagements')
      .select('id, gc_user_id, sub_organization_id, project_id, sub:sub_organizations(auth_user_id, legal_name)')
      .eq('id', engagement_id)
      .maybeSingle();
    if (!eng) return userSafeError('Engagement not found');
    if (eng.gc_user_id !== userId) return userSafeError('You do not own this engagement');

    const today = new Date().toISOString().slice(0, 10);
    const startDate = start_date || today;
    const endDate = end_date || startDate;

    const { data: task, error } = await supabase
      .from('worker_tasks')
      .insert({
        owner_id: userId,
        project_id: eng.project_id,
        sub_organization_id: eng.sub_organization_id,
        sub_engagement_id: engagement_id,
        title,
        description: description || null,
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
      })
      .select()
      .single();
    if (error) {
      logger.error('[create_sub_task] insert error:', error);
      return userSafeError('Could not create task');
    }

    // Notify sub if they have an account
    if (eng.sub?.auth_user_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: eng.sub.auth_user_id,
          title: `New task: ${title}`,
          body: description ? description.slice(0, 120) : `Due ${endDate}`,
          type: 'sub_task_assigned',
          icon: 'checkmark-done-outline',
          color: '#8B5CF6',
          action_data: { engagement_id, task_id: task.id },
        });
      } catch (e) { logger.warn('[create_sub_task] notification:', e.message); }
    }

    return {
      task: {
        id: task.id,
        title: task.title,
        start_date: task.start_date,
        end_date: task.end_date,
        status: task.status,
      },
      sub_legal_name: eng.sub?.legal_name || null,
    };
  } catch (e) {
    logger.error('[create_sub_task] error:', e);
    return userSafeError('Could not create task');
  }
}

// =============================================================================
// add_project_document — attach an uploaded file with role-aware visibility
// =============================================================================
async function add_project_document(userId, args) {
  try {
    const {
      project, project_id: rawProjectId,
      title, file_url, file_name, category = 'other',
      visible_to_subs = false,
      visible_to_workers = false,
      visible_to_clients = false,
      is_important = false,
    } = args || {};

    if (!title || !file_url) {
      return userSafeError('title and file_url are required');
    }

    // Resolve project (by id or by name)
    let projectId = rawProjectId || project;
    // If looks like a name, resolve
    if (projectId && !projectId.includes('-')) {
      const { data: rows } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('name', `%${projectId}%`)
        .limit(2);
      if (!rows || rows.length === 0) return userSafeError(`Project "${projectId}" not found`);
      if (rows.length > 1) return userSafeError(`Multiple projects matched "${projectId}". Please be specific.`);
      projectId = rows[0].id;
    } else if (projectId) {
      const { data: row } = await supabase
        .from('projects')
        .select('id, user_id')
        .eq('id', projectId)
        .maybeSingle();
      if (!row || row.user_id !== userId) return userSafeError('Project not found or not yours');
    } else {
      return userSafeError('project name or project_id required');
    }

    const { data: doc, error } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        uploaded_by: userId,
        // No `title` column on this table — store title in file_name as the
        // human-facing label and the original filename in notes if different.
        file_name: title,
        file_url,
        file_type: category === 'photo' ? 'image' : (category === 'plan' || category === 'contract' || category === 'spec' ? 'pdf' : 'document'),
        category,
        notes: file_name && file_name !== title ? `Original filename: ${file_name}` : null,
        visible_to_subs,
        visible_to_workers,
        visible_to_clients,
        is_important,
      })
      .select()
      .single();
    if (error) {
      logger.error('[add_project_document] insert error:', error);
      return userSafeError('Could not save document');
    }

    // If visible to subs, notify any active engagements on the project.
    if (visible_to_subs) {
      try {
        const { data: engagements } = await supabase
          .from('sub_engagements')
          .select('id, sub_organization_id, sub:sub_organizations(auth_user_id, legal_name)')
          .eq('project_id', projectId)
          .eq('gc_user_id', userId)
          .neq('status', 'cancelled');
        for (const eng of (engagements || [])) {
          if (!eng.sub?.auth_user_id) continue;
          await supabase.from('notifications').insert({
            user_id: eng.sub.auth_user_id,
            title: is_important ? `Important: ${title}` : `New project document: ${title}`,
            body: 'Your contractor added a document — tap to view.',
            type: 'project_doc_added',
            icon: 'document-text-outline',
            color: '#8B5CF6',
            action_data: { engagement_id: eng.id, document_id: doc.id },
          });
        }
      } catch (e) { logger.warn('[add_project_document] notify:', e.message); }
    }

    return {
      document: {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        visible_to_subs: doc.visible_to_subs,
        visible_to_workers: doc.visible_to_workers,
        visible_to_clients: doc.visible_to_clients,
        is_important: doc.is_important,
      },
    };
  } catch (e) {
    logger.error('[add_project_document] error:', e);
    return userSafeError('Could not save document');
  }
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
  // v1.5
  create_sub_task, add_project_document,
};
