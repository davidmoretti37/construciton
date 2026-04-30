/**
 * Engagement Routes
 *
 * Mounted at /api/engagements — auth-required.
 * - POST   /api/engagements                  GC creates an engagement
 * - GET    /api/engagements                  list (GC: theirs; sub: theirs)
 * - GET    /api/engagements/:id              full record + compliance status
 * - PATCH  /api/engagements/:id              transition status, edit fields
 * - GET    /api/engagements/:id/compliance   computed compliance state
 * - POST   /api/engagements/:id/subcontracts create MSA / Work Order subcontract
 */

const express = require('express');
const { authenticateUser } = require('../middleware/authenticate');
const engagementService = require('../services/engagementService');
const complianceService = require('../services/complianceService');
const subOrgService = require('../services/subOrgService');
const invoiceService = require('../services/invoiceService');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// POST /api/engagements
// =============================================================================

router.post('/', authenticateUser, async (req, res) => {
  try {
    const {
      sub_organization_id,
      project_id,
      trade,
      scope_summary,
      contract_amount,
      payment_terms,
      payment_terms_notes,
      retention_pct,
      initial_status = 'invited',
    } = req.body || {};

    if (!sub_organization_id || !project_id || !trade) {
      return res.status(400).json({
        error: 'sub_organization_id, project_id, and trade required',
      });
    }

    // Verify GC owns the project
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', project_id)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.user_id !== req.user.id) return res.status(403).json({ error: 'Project access denied' });

    const created = await engagementService.createEngagement({
      gcUserId: req.user.id,
      subOrganizationId: sub_organization_id,
      projectId: project_id,
      trade,
      scopeSummary: scope_summary,
      contractAmount: contract_amount,
      paymentTerms: payment_terms || 'net_30',
      paymentTermsNotes: payment_terms_notes,
      retentionPct: retention_pct || 0,
      initialStatus: initial_status,
    });

    return res.json({ engagement: created });
  } catch (err) {
    logger.error('[engagements] POST error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create engagement' });
  }
});

// =============================================================================
// GET /api/engagements
// =============================================================================

router.get('/', authenticateUser, async (req, res) => {
  try {
    const { project_id, status } = req.query;
    // Try GC first; if no rows, try sub
    const gcRows = await engagementService.listEngagementsForGc(req.user.id, {
      projectId: project_id || null,
      status: status || null,
    });
    if (gcRows.length > 0) return res.json({ engagements: gcRows });

    const subRows = await engagementService.listEngagementsForSub(req.user.id);
    return res.json({ engagements: subRows });
  } catch (err) {
    logger.error('[engagements] GET error:', err);
    return res.status(500).json({ error: 'Failed to list' });
  }
});

// =============================================================================
// GET /api/engagements/:id
// =============================================================================

router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const engagement = await engagementService.getEngagement({
      engagementId: req.params.id,
      callerUserId: req.user.id,
    });
    if (!engagement) return res.status(404).json({ error: 'Not found or access denied' });

    const compliance = await complianceService.computeForEngagement(engagement.id);

    // Tasks assigned to the sub on this engagement
    const { data: tasks } = await supabase
      .from('worker_tasks')
      .select('id, title, description, start_date, end_date, status, color, created_at')
      .eq('sub_engagement_id', engagement.id)
      .order('start_date', { ascending: true, nullsLast: true });

    return res.json({ engagement, compliance, tasks: tasks || [] });
  } catch (err) {
    logger.error('[engagements] GET /:id error:', err);
    return res.status(500).json({ error: 'Failed to load engagement' });
  }
});

// =============================================================================
// PATCH /api/engagements/:id
// =============================================================================

router.patch('/:id', authenticateUser, async (req, res) => {
  try {
    const { status, ...rest } = req.body || {};
    let result;

    if (status) {
      result = await engagementService.transitionStatus({
        engagementId: req.params.id,
        gcUserId: req.user.id,
        newStatus: status,
      });
    }

    // Editable scalar fields
    const editable = ['scope_summary', 'contract_amount', 'payment_terms',
                      'payment_terms_notes', 'retention_pct',
                      'mobilization_date', 'completion_target_date'];
    const updates = {};
    for (const k of editable) if (k in rest) updates[k] = rest[k];

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('sub_engagements')
        .update(updates)
        .eq('id', req.params.id)
        .eq('gc_user_id', req.user.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return res.json({ engagement: result });
  } catch (err) {
    logger.error('[engagements] PATCH error:', err);
    return res.status(400).json({ error: err.message || 'Failed to update' });
  }
});

// =============================================================================
// GET /api/engagements/:id/compliance
// =============================================================================

router.get('/:id/compliance', authenticateUser, async (req, res) => {
  try {
    const engagement = await engagementService.getEngagement({
      engagementId: req.params.id,
      callerUserId: req.user.id,
    });
    if (!engagement) return res.status(404).json({ error: 'Not found' });
    const compliance = await complianceService.computeForEngagement(engagement.id);
    return res.json({ compliance });
  } catch (err) {
    logger.error('[engagements] compliance error:', err);
    return res.status(500).json({ error: 'Failed to compute compliance' });
  }
});

// =============================================================================
// POST /api/engagements/:id/subcontracts
// =============================================================================
// Creates a subcontract row (MSA or Work Order) tied to this engagement.
// Sends to sub via existing eSignService for signature.
//
// Body: { contract_type, title, body_md, total_amount }

router.post('/:id/subcontracts', authenticateUser, async (req, res) => {
  try {
    const { contract_type = 'work_order', title, body_md, total_amount } = req.body || {};
    if (!['msa', 'work_order', 'change_order'].includes(contract_type)) {
      return res.status(400).json({ error: 'invalid contract_type' });
    }
    if (!title) return res.status(400).json({ error: 'title required' });

    const engagement = await engagementService.getEngagement({
      engagementId: req.params.id,
      callerUserId: req.user.id,
    });
    if (!engagement || engagement.gc_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: created, error } = await supabase
      .from('subcontracts')
      .insert({
        contract_type,
        sub_organization_id: engagement.sub_organization_id,
        gc_user_id: req.user.id,
        engagement_id: engagement.id,
        title,
        body_md: body_md || `## ${title}\n\nScope: ${engagement.scope_summary || ''}\nAmount: $${total_amount || engagement.contract_amount || '—'}`,
        total_amount: total_amount || engagement.contract_amount,
        status: 'draft',
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    // Issue a sign_contract action token so the sub can sign via magic link
    const subOrg = await supabase
      .from('sub_organizations')
      .select('id')
      .eq('id', engagement.sub_organization_id)
      .single();

    const token = await subOrgService.issueActionToken({
      subOrganizationId: subOrg.data.id,
      scope: 'sign_contract',
      subcontractId: created.id,
      engagementId: engagement.id,
      createdBy: req.user.id,
    });

    return res.json({
      subcontract: created,
      action_token_raw: token.raw,
      action_token_id: token.id,
      expires_at: token.expires_at,
    });
  } catch (err) {
    logger.error('[engagements] POST subcontract error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create subcontract' });
  }
});

// =============================================================================
// POST /api/engagements/:id/subcontracts/:subId/request-esign
// =============================================================================
// Fires the native eSignService for a subcontract — generates a signing
// link that the sub can use to draw their signature in browser/mobile.
// Alternative to the action_token sub-portal flow; both are valid.
// On signing, eSignService updates subcontracts.status='signed_by_sub'.
router.post('/:id/subcontracts/:subId/request-esign', authenticateUser, async (req, res) => {
  try {
    const { signerEmail, signerName } = req.body || {};

    // Verify ownership of engagement
    const engagement = await engagementService.getEngagement({
      engagementId: req.params.id,
      callerUserId: req.user.id,
    });
    if (!engagement || engagement.gc_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify subcontract exists + belongs to this engagement
    const { data: sub, error: subErr } = await supabase
      .from('subcontracts')
      .select('id, gc_user_id, engagement_id, title, status')
      .eq('id', req.params.subId)
      .eq('gc_user_id', req.user.id)
      .single();
    if (subErr || !sub) return res.status(404).json({ error: 'Subcontract not found' });
    if (sub.engagement_id !== engagement.id) {
      return res.status(400).json({ error: 'Subcontract not part of this engagement' });
    }

    // Resolve signer — prefer body params, fall back to engagement contacts
    let resolvedEmail = signerEmail;
    let resolvedName = signerName;
    if (!resolvedEmail) {
      const { data: subOrg } = await supabase
        .from('sub_organizations')
        .select('primary_contact_email, primary_contact_name, name')
        .eq('id', engagement.sub_organization_id)
        .single();
      resolvedEmail = subOrg?.primary_contact_email;
      resolvedName = resolvedName || subOrg?.primary_contact_name || subOrg?.name;
    }
    if (!resolvedEmail) {
      return res.status(400).json({ error: 'No signer email available — pass signerEmail in body' });
    }

    const eSign = require('../services/eSignService');
    const sig = await eSign.createSignatureRequest({
      ownerId: req.user.id,
      documentType: 'subcontract',
      documentId: sub.id,
      signerName: resolvedName || 'Subcontractor',
      signerEmail: resolvedEmail,
    });

    // Flip status to 'sent' so the sub-portal reflects the active request
    await supabase
      .from('subcontracts')
      .update({ status: 'sent', sent_at: new Date().toISOString(), esign_request_id: sig.signatureId })
      .eq('id', sub.id)
      .in('status', ['draft']);

    res.json({
      signatureId: sig.signatureId,
      signingUrl: sig.signingUrl,
      expiresAt: sig.expiresAt,
    });
  } catch (err) {
    logger.error('[engagements] subcontract eSign request failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create signing request' });
  }
});

// =============================================================================
// GET /api/engagements/:id/invoices
// =============================================================================

router.get('/:id/invoices', authenticateUser, async (req, res) => {
  try {
    const list = await invoiceService.listInvoicesForEngagement({
      engagementId: req.params.id,
      callerUserId: req.user.id,
    });
    return res.json({ invoices: list });
  } catch (err) {
    logger.error('[engagements] GET invoices error:', err);
    return res.status(500).json({ error: 'Failed to list invoices' });
  }
});

// =============================================================================
// POST /api/engagements/:id/payments — GC records a manual payment
// =============================================================================

router.post('/:id/payments', authenticateUser, async (req, res) => {
  try {
    const {
      amount, paid_at, method, reference, sub_invoice_id,
      milestone_id, notes,
    } = req.body || {};

    const payment = await invoiceService.recordPayment({
      engagementId: req.params.id,
      gcUserId: req.user.id,
      amount, paidAt: paid_at, method, reference,
      subInvoiceId: sub_invoice_id, milestoneId: milestone_id, notes,
    });
    return res.json({ payment });
  } catch (err) {
    logger.error('[engagements] POST /payments error:', err);
    return res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// GET /api/engagements/:id/balance
// =============================================================================

router.get('/:id/balance', authenticateUser, async (req, res) => {
  try {
    const bal = await invoiceService.getEngagementBalance({
      engagementId: req.params.id,
      callerUserId: req.user.id,
    });
    if (!bal) return res.status(404).json({ error: 'Not found or access denied' });
    return res.json({ balance: bal });
  } catch (err) {
    logger.error('[engagements] GET /balance error:', err);
    return res.status(500).json({ error: 'Failed to compute balance' });
  }
});

module.exports = router;
