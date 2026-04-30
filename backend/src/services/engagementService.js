/**
 * Engagement Service
 *
 * sub_engagements is the work unit (sub × GC × project). State machine:
 *   invited → bidding → awarded → contracted → mobilized → in_progress
 *           → substantially_complete → closed_out
 *           ↘ cancelled (from any state)
 *
 * Auto-publishes the sub's active compliance docs onto the engagement at
 * creation time so the GC can see what coverage applies.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const VALID_TRANSITIONS = {
  invited: ['bidding', 'awarded', 'cancelled'],
  bidding: ['awarded', 'cancelled'],
  awarded: ['contracted', 'cancelled'],
  contracted: ['mobilized', 'cancelled'],
  mobilized: ['in_progress', 'cancelled'],
  in_progress: ['substantially_complete', 'cancelled'],
  substantially_complete: ['closed_out', 'cancelled'],
  closed_out: [],
  cancelled: [],
};

const STATUS_TIMESTAMPS = {
  invited: 'invited_at',
  awarded: 'awarded_at',
  contracted: 'contracted_at',
  mobilized: 'mobilized_at',
  substantially_complete: 'completed_at',
  closed_out: 'closed_out_at',
  cancelled: 'cancelled_at',
};

// =============================================================================
// createEngagement
// =============================================================================

async function createEngagement({
  gcUserId,
  subOrganizationId,
  projectId,
  trade,
  scopeSummary = null,
  contractAmount = null,
  paymentTerms = 'net_30',
  paymentTermsNotes = null,
  retentionPct = 0,
  initialStatus = 'invited',
}) {
  if (!gcUserId || !subOrganizationId || !projectId || !trade) {
    throw new Error('gcUserId, subOrganizationId, projectId, and trade required');
  }

  const stamp = STATUS_TIMESTAMPS[initialStatus];

  const insertRow = {
    gc_user_id: gcUserId,
    sub_organization_id: subOrganizationId,
    project_id: projectId,
    trade,
    scope_summary: scopeSummary,
    contract_amount: contractAmount,
    payment_terms: paymentTerms,
    payment_terms_notes: paymentTermsNotes,
    retention_pct: retentionPct,
    status: initialStatus,
    created_by: gcUserId,
  };
  if (stamp) insertRow[stamp] = new Date().toISOString();

  const { data: created, error } = await supabase
    .from('sub_engagements')
    .insert(insertRow)
    .select()
    .single();
  if (error) {
    logger.error('[engagementService] createEngagement error:', error);
    throw error;
  }

  // Auto-publish active compliance docs
  await autoPublishCompliance(created.id, subOrganizationId);

  return created;
}

async function autoPublishCompliance(engagementId, subOrganizationId) {
  const { data: docs, error } = await supabase
    .from('compliance_documents')
    .select('id')
    .eq('sub_organization_id', subOrganizationId)
    .eq('status', 'active');
  if (error) {
    logger.warn('[engagementService] autoPublishCompliance fetch:', error);
    return;
  }
  const links = (docs || []).map((d) => ({
    engagement_id: engagementId,
    compliance_doc_id: d.id,
    link_type: 'auto_published',
  }));
  if (links.length === 0) return;
  const { error: linkErr } = await supabase
    .from('engagement_compliance_links')
    .insert(links);
  if (linkErr) logger.warn('[engagementService] autoPublishCompliance insert:', linkErr);
}

// =============================================================================
// transitionStatus
// =============================================================================

async function transitionStatus({ engagementId, gcUserId, newStatus, allowSubInitiated = false }) {
  const { data: row, error } = await supabase
    .from('sub_engagements')
    .select('id, status, gc_user_id, sub_organization_id')
    .eq('id', engagementId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Engagement not found');
  if (row.gc_user_id !== gcUserId && !allowSubInitiated) {
    throw new Error('Only the engaging GC can change status');
  }

  const allowed = VALID_TRANSITIONS[row.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${row.status} to ${newStatus}`);
  }

  const updates = { status: newStatus };
  const stamp = STATUS_TIMESTAMPS[newStatus];
  if (stamp) updates[stamp] = new Date().toISOString();

  const { data: updated, error: upErr } = await supabase
    .from('sub_engagements')
    .update(updates)
    .eq('id', engagementId)
    .select()
    .single();
  if (upErr) throw upErr;
  return updated;
}

// =============================================================================
// getEngagementWithCompliance
// =============================================================================

async function getEngagement({ engagementId, callerUserId }) {
  const { data, error } = await supabase
    .from('sub_engagements')
    .select(`
      *,
      sub:sub_organizations (id, legal_name, primary_email, trades, auth_user_id),
      compliance_links:engagement_compliance_links (
        id, link_type, compliance_doc_id,
        compliance_doc:compliance_documents (
          id, doc_type, doc_subtype, status, expires_at, verification_status, file_name
        )
      )
    `)
    .eq('id', engagementId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Access check
  const isGc = data.gc_user_id === callerUserId;
  const isSub = data.sub?.auth_user_id === callerUserId;
  if (!isGc && !isSub) return null;

  return data;
}

// =============================================================================
// listEngagements
// =============================================================================

async function listEngagementsForGc(gcUserId, { projectId = null, status = null } = {}) {
  let q = supabase
    .from('sub_engagements')
    .select(`
      *,
      sub:sub_organizations (id, legal_name, trades, primary_email),
      project:projects (id, name, location, start_date, end_date, status)
    `)
    .eq('gc_user_id', gcUserId)
    .order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function listEngagementsForSub(subAuthUserId) {
  const { data: sub } = await supabase
    .from('sub_organizations')
    .select('id')
    .eq('auth_user_id', subAuthUserId)
    .maybeSingle();
  if (!sub) return [];
  const { data, error } = await supabase
    .from('sub_engagements')
    .select(`
      *,
      project:projects (id, name, location, start_date, end_date, status)
    `)
    .eq('sub_organization_id', sub.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Resolve GC business names so the sub knows who they're working for.
  const gcIds = [...new Set((data || []).map((e) => e.gc_user_id).filter(Boolean))];
  let gcNames = {};
  if (gcIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, business_name')
      .in('id', gcIds);
    for (const p of (profiles || [])) gcNames[p.id] = p.business_name;
  }

  return (data || []).map((e) => ({ ...e, gc_business_name: gcNames[e.gc_user_id] || null }));
}

// =============================================================================
// getEngagementForSub — full job package for the hired sub
// =============================================================================
// Returns engagement + project + GC profile + bid attachments (from the
// originally accepted bid_request) + project_documents the GC has flagged
// visible to subs + sub's deliverables tied to this engagement + tasks.
async function getEngagementForSub(engagementId, subAuthUserId) {
  // Resolve sub_organization_id from auth user
  const { data: subOrg } = await supabase
    .from('sub_organizations')
    .select('id')
    .eq('auth_user_id', subAuthUserId)
    .maybeSingle();
  if (!subOrg) return null;

  const { data: engagement } = await supabase
    .from('sub_engagements')
    .select(`
      *,
      project:projects (id, name, location, start_date, end_date, status, task_description)
    `)
    .eq('id', engagementId)
    .eq('sub_organization_id', subOrg.id)
    .maybeSingle();
  if (!engagement) return null;

  // GC business profile
  const { data: gc } = await supabase
    .from('profiles')
    .select('id, business_name, business_email, business_phone')
    .eq('id', engagement.gc_user_id)
    .maybeSingle();

  // Original bid_request (the one whose awarded_bid_id pointed to a sub_bid
  // for this sub_organization) + its attachments.
  const { data: bidRequest } = await supabase
    .from('bid_requests')
    .select(`
      id, scope_summary, due_at,
      site_address, site_city, site_state_code, site_postal_code, site_visit_notes,
      awarded_bid_id, awarded_at,
      bid:sub_bids!fk_bid_requests_awarded(id, sub_organization_id, amount, timeline_days, exclusions, notes)
    `)
    .eq('project_id', engagement.project_id)
    .eq('gc_user_id', engagement.gc_user_id)
    .eq('trade', engagement.trade)
    .not('awarded_bid_id', 'is', null)
    .order('awarded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const matchingBid = bidRequest?.bid?.sub_organization_id === subOrg.id ? bidRequest : null;

  let bidAttachments = [];
  if (matchingBid) {
    const { data } = await supabase
      .from('bid_request_attachments')
      .select('id, file_name, file_mime, file_size_bytes, attachment_type, uploaded_by_role, created_at')
      .eq('bid_request_id', matchingBid.id)
      .order('created_at', { ascending: true });
    bidAttachments = data || [];
  }

  // Project documents the GC has flagged visible_to_subs
  const { data: projectDocs } = await supabase
    .from('project_documents')
    .select('id, title, file_name, file_url, file_type, category, is_important, created_at')
    .eq('project_id', engagement.project_id)
    .eq('visible_to_subs', true)
    .order('created_at', { ascending: false });

  // Sub's own deliverables (compliance_documents) tied to this engagement
  const { data: subDeliverables } = await supabase
    .from('compliance_documents')
    .select('id, doc_type, file_name, file_mime, file_size_bytes, expires_at, status, created_at')
    .eq('sub_engagement_id', engagementId)
    .order('created_at', { ascending: false });

  // Tasks for this engagement
  const { data: tasks } = await supabase
    .from('worker_tasks')
    .select('id, title, description, start_date, end_date, status, color, created_at')
    .eq('sub_engagement_id', engagementId)
    .order('start_date', { ascending: true, nullsLast: true });

  return {
    engagement: {
      ...engagement,
      gc_business_name: gc?.business_name || null,
      gc_business_email: gc?.business_email || null,
      gc_business_phone: gc?.business_phone || null,
    },
    bid_request: matchingBid,
    bid_attachments: bidAttachments,
    project_documents: projectDocs || [],
    sub_deliverables: subDeliverables || [],
    tasks: tasks || [],
  };
}

// Allow GC to update an engagement (status transitions, dates, etc.)
async function updateEngagement(engagementId, gcUserId, updates) {
  const allowed = [
    'mobilization_date', 'completion_target_date', 'status',
    'contract_amount', 'retention_pct',
    'payment_terms', 'payment_terms_notes', 'scope_summary',
  ];
  const cleaned = {};
  for (const k of allowed) if (k in updates) cleaned[k] = updates[k];
  if (Object.keys(cleaned).length === 0) {
    return null;
  }
  cleaned.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('sub_engagements')
    .update(cleaned)
    .eq('id', engagementId)
    .eq('gc_user_id', gcUserId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  createEngagement,
  transitionStatus,
  getEngagement,
  getEngagementForSub,
  updateEngagement,
  listEngagementsForGc,
  listEngagementsForSub,
  autoPublishCompliance,
  VALID_TRANSITIONS,
};
