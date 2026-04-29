/**
 * Compliance Service
 *
 * Computes (never stores) the compliance status for a sub_engagement based
 * on:
 *   - the GC's compliance_policies (which doc types are required)
 *   - the sub's compliance_documents (with expiry, endorsements, coverage)
 *   - the project's state (for state-aware policies)
 *
 * Also handles document upload metadata recording with supersedes-chain
 * semantics (no overwrite — replacing a doc creates a new row that
 * supersedes the prior).
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const WARNING_DEFAULT_DAYS = 30;

// =============================================================================
// computeForEngagement
// =============================================================================

/**
 * Returns:
 *   {
 *     passes: boolean,
 *     blockers: [{ doc_type, reason, detail, expires_at? }],
 *     warnings: [{ doc_type, reason, detail, expires_at? }],
 *     computed_at: ISO string
 *   }
 *
 * reason ∈ 'missing' | 'expired' | 'expiring_soon' | 'no_endorsement' | 'coverage_low'
 */
async function computeForEngagement(engagementId) {
  if (!engagementId) throw new Error('engagementId required');

  // 1. Load engagement (project state is deferred to v2 — state-statutory
  //    waiver/notice work isn't shipping in v1, so we don't need to
  //    surface project location here).
  const { data: engagement, error: engErr } = await supabase
    .from('sub_engagements')
    .select('id, sub_organization_id, gc_user_id, project_id, status')
    .eq('id', engagementId)
    .maybeSingle();

  if (engErr) throw engErr;
  if (!engagement) throw new Error('Engagement not found');

  const projectState = null;

  // 2. Load policies for this GC
  const { data: policies, error: polErr } = await supabase
    .from('compliance_policies')
    .select('*')
    .eq('gc_user_id', engagement.gc_user_id);
  if (polErr) throw polErr;

  // 3. Load active docs for this sub
  const { data: docs, error: docErr } = await supabase
    .from('compliance_documents')
    .select('*')
    .eq('sub_organization_id', engagement.sub_organization_id)
    .eq('status', 'active');
  if (docErr) throw docErr;

  const blockers = [];
  const warnings = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const policy of policies) {
    if (policy.enforcement === 'off') continue;

    // applies_when filter
    if (policy.applies_when === 'state_match' && !projectState) continue;
    // (other applies_when handling — prevailing_wage, public_only — deferred)

    const candidates = docs.filter((d) => d.doc_type === policy.doc_type);
    const best = pickBest(candidates);

    if (!best) {
      pushIssue(blockers, warnings, policy, {
        doc_type: policy.doc_type,
        reason: 'missing',
        detail: 'No document on file',
      });
      continue;
    }

    if (best.expires_at) {
      const expiresAt = new Date(best.expires_at);
      const daysToExpiry = Math.floor((expiresAt - today) / (1000 * 3600 * 24));

      if (daysToExpiry < 0) {
        pushIssue(blockers, warnings, policy, {
          doc_type: policy.doc_type,
          reason: 'expired',
          detail: `Expired ${Math.abs(daysToExpiry)} day(s) ago`,
          expires_at: best.expires_at,
        });
        continue;
      }

      const leadDays = policy.warning_lead_days ?? WARNING_DEFAULT_DAYS;
      if (daysToExpiry <= leadDays) {
        warnings.push({
          doc_type: policy.doc_type,
          reason: 'expiring_soon',
          detail: `Expires in ${daysToExpiry} day(s)`,
          expires_at: best.expires_at,
        });
      }
    }

    // Endorsement check
    if (policy.required_endorsements && policy.required_endorsements.length > 0) {
      const have = new Set(best.endorsements || []);
      const missing = policy.required_endorsements.filter((e) => !have.has(e));
      if (missing.length > 0) {
        pushIssue(blockers, warnings, policy, {
          doc_type: policy.doc_type,
          reason: 'no_endorsement',
          detail: `Missing endorsement(s): ${missing.join(', ')}`,
        });
      }
    }

    // Coverage check
    if (policy.min_coverage && best.coverage_limits) {
      const tooLow = [];
      for (const [k, requiredAmt] of Object.entries(policy.min_coverage)) {
        const have = Number(best.coverage_limits[k] || 0);
        if (have < Number(requiredAmt)) {
          tooLow.push(`${k}: have $${have.toLocaleString()}, need $${Number(requiredAmt).toLocaleString()}`);
        }
      }
      if (tooLow.length > 0) {
        pushIssue(blockers, warnings, policy, {
          doc_type: policy.doc_type,
          reason: 'coverage_low',
          detail: tooLow.join('; '),
        });
      }
    }
  }

  return {
    passes: blockers.length === 0,
    blockers,
    warnings,
    computed_at: new Date().toISOString(),
  };
}

function pushIssue(blockers, warnings, policy, issue) {
  if (policy.enforcement === 'block') blockers.push(issue);
  else if (policy.enforcement === 'warn') warnings.push(issue);
}

// Pick the doc with the latest expiry (or most-recently uploaded if no expiry).
function pickBest(candidates) {
  if (!candidates || candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => {
    if (a.expires_at && b.expires_at) {
      return new Date(b.expires_at) - new Date(a.expires_at);
    }
    if (a.expires_at && !b.expires_at) return -1;
    if (!a.expires_at && b.expires_at) return 1;
    return new Date(b.uploaded_at) - new Date(a.uploaded_at);
  })[0];
}

// =============================================================================
// recordDocument — supersedes-aware insert
// =============================================================================

/**
 * Insert a new compliance_documents row. If a prior active row of the same
 * (sub_organization_id, doc_type, doc_subtype) exists, mark it superseded
 * by this new one.
 */
async function recordDocument({
  subOrganizationId,
  docType,
  docSubtype = null,
  fileUrl,
  fileName = null,
  fileMime = null,
  fileSizeBytes = null,
  issuer = null,
  policyNumber = null,
  issuedAt = null,
  effectiveAt = null,
  expiresAt = null,
  coverageLimits = null,
  endorsements = [],
  namedInsureds = [],
  uploadedBy = null,
  uploadedVia = 'gc_upload',
  notes = null,
}) {
  if (!subOrganizationId) throw new Error('subOrganizationId required');
  if (!docType) throw new Error('docType required');
  if (!fileUrl) throw new Error('fileUrl required');

  // 1. Insert new row
  const { data: created, error: insErr } = await supabase
    .from('compliance_documents')
    .insert({
      sub_organization_id: subOrganizationId,
      doc_type: docType,
      doc_subtype: docSubtype,
      file_url: fileUrl,
      file_name: fileName,
      file_mime: fileMime,
      file_size_bytes: fileSizeBytes,
      issuer,
      policy_number: policyNumber,
      issued_at: issuedAt,
      effective_at: effectiveAt,
      expires_at: expiresAt,
      coverage_limits: coverageLimits,
      endorsements,
      named_insureds: namedInsureds,
      uploaded_by: uploadedBy,
      uploaded_via: uploadedVia,
      notes,
      status: 'active',
    })
    .select()
    .single();

  if (insErr) {
    logger.error('[complianceService] recordDocument insert error:', insErr);
    throw insErr;
  }

  // 2. Find prior active doc(s) of same type/subtype and mark superseded
  const subtypeFilter = docSubtype ? { doc_subtype: docSubtype } : {};
  const priorQuery = supabase
    .from('compliance_documents')
    .update({ status: 'superseded', superseded_by: created.id })
    .eq('sub_organization_id', subOrganizationId)
    .eq('doc_type', docType)
    .eq('status', 'active')
    .neq('id', created.id);
  if (docSubtype) {
    priorQuery.eq('doc_subtype', docSubtype);
  } else {
    priorQuery.is('doc_subtype', null);
  }
  const { error: supErr } = await priorQuery;
  if (supErr) logger.warn('[complianceService] supersedes update error:', supErr);

  return created;
}

// =============================================================================
// listExpiringForGc — power list for the daily briefing + GC alerts
// =============================================================================

/**
 * Returns docs expiring within `withinDays` for any sub the GC has an
 * active engagement with.
 */
async function listExpiringForGc({ gcUserId, withinDays = 30 }) {
  const cutoff = new Date(Date.now() + withinDays * 86400 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Sub orgs with active engagements with this GC
  const { data: engagements } = await supabase
    .from('sub_engagements')
    .select('sub_organization_id')
    .eq('gc_user_id', gcUserId)
    .neq('status', 'cancelled');
  const subIds = [...new Set((engagements || []).map((e) => e.sub_organization_id))];
  if (subIds.length === 0) return [];

  const { data, error } = await supabase
    .from('compliance_documents')
    .select(`
      id, sub_organization_id, doc_type, doc_subtype,
      issued_at, expires_at, status,
      sub:sub_organizations (id, legal_name)
    `)
    .in('sub_organization_id', subIds)
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lte('expires_at', cutoffStr)
    .order('expires_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

module.exports = {
  computeForEngagement,
  recordDocument,
  listExpiringForGc,
  // exported for tests
  pickBest,
};
