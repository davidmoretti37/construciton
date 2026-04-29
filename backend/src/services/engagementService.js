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
      sub:sub_organizations (id, legal_name, trades, primary_email)
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
    .select('*')
    .eq('sub_organization_id', sub.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = {
  createEngagement,
  transitionStatus,
  getEngagement,
  listEngagementsForGc,
  listEngagementsForSub,
  autoPublishCompliance,
  VALID_TRANSITIONS,
};
