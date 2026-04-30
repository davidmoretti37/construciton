/**
 * Compliance Document Routes
 *
 * Mounted at /api/compliance — auth-required for GC + sub user routes.
 * Storage uploads go through the backend (service-role) so storage RLS
 * doesn't have to encode the active-engagement permission graph.
 *
 * - POST   /api/compliance/documents          GC manual entry of a doc
 * - GET    /api/compliance/documents          list docs (filtered by sub_org_id query param)
 * - GET    /api/compliance/documents/:id      single doc metadata
 * - GET    /api/compliance/documents/:id/url  5-min signed Storage URL after access check
 * - PATCH  /api/compliance/documents/:id      verify, reject, edit metadata (GC only)
 * - DELETE /api/compliance/documents/:id      soft-delete (status=revoked)
 * - POST   /api/compliance/documents/upload-blob   accepts base64 from sub portal,
 *                                                  uploads to Storage, then records doc
 */

const express = require('express');
const { authenticateUser } = require('../middleware/authenticate');
const complianceService = require('../services/complianceService');
const subOrgService = require('../services/subOrgService');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const BUCKET = 'compliance-documents';

// =============================================================================
// Helper: caller-can-access-this-sub guard
// =============================================================================

async function callerCanAccessSub(userId, subOrgId) {
  // Sub themselves
  const { data: sub } = await supabase
    .from('sub_organizations')
    .select('id, auth_user_id, created_by_gc_user_id')
    .eq('id', subOrgId)
    .maybeSingle();
  if (!sub) return { allowed: false };
  if (sub.auth_user_id === userId) return { allowed: true, role: 'sub' };
  if (sub.created_by_gc_user_id === userId) return { allowed: true, role: 'gc_creator' };

  // GC with active engagement
  const { data: engagements } = await supabase
    .from('sub_engagements')
    .select('id')
    .eq('sub_organization_id', subOrgId)
    .eq('gc_user_id', userId)
    .neq('status', 'cancelled')
    .limit(1);
  if (engagements && engagements.length > 0) return { allowed: true, role: 'gc_engaged' };

  return { allowed: false };
}

// =============================================================================
// POST /api/compliance/documents
// =============================================================================

router.post('/documents', authenticateUser, async (req, res) => {
  try {
    const {
      sub_organization_id,
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

    if (!sub_organization_id || !doc_type || !file_url) {
      return res.status(400).json({ error: 'sub_organization_id, doc_type, and file_url are required' });
    }

    const access = await callerCanAccessSub(req.user.id, sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    const created = await complianceService.recordDocument({
      subOrganizationId: sub_organization_id,
      docType: doc_type,
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
      uploadedBy: req.user.id,
      uploadedVia: access.role === 'sub' ? 'sub_portal' : 'gc_upload',
    });

    return res.json({ compliance_document: created });
  } catch (err) {
    logger.error('[compliance] POST /documents error:', err);
    return res.status(500).json({ error: 'Failed to record doc' });
  }
});

// =============================================================================
// GET /api/compliance/documents?sub_organization_id=...
// =============================================================================

router.get('/documents', authenticateUser, async (req, res) => {
  try {
    const { sub_organization_id, status = 'active' } = req.query;
    if (!sub_organization_id) {
      return res.status(400).json({ error: 'sub_organization_id query param required' });
    }
    const access = await callerCanAccessSub(req.user.id, sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('sub_organization_id', sub_organization_id)
      .eq('status', status)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return res.json({ documents: data || [] });
  } catch (err) {
    logger.error('[compliance] GET /documents error:', err);
    return res.status(500).json({ error: 'Failed to list docs' });
  }
});

// =============================================================================
// GET /api/compliance/documents/:id
// =============================================================================

router.get('/documents/:id', authenticateUser, async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const access = await callerCanAccessSub(req.user.id, doc.sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    return res.json({ compliance_document: doc });
  } catch (err) {
    logger.error('[compliance] GET /documents/:id error:', err);
    return res.status(500).json({ error: 'Failed to load doc' });
  }
});

// =============================================================================
// GET /api/compliance/documents/:id/url
// =============================================================================

router.get('/documents/:id/url', authenticateUser, async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('compliance_documents')
      .select('id, sub_organization_id, file_url')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const access = await callerCanAccessSub(req.user.id, doc.sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    // file_url is the storage path (e.g., {sub_org_id}/{doc_type}/{doc_id}.pdf).
    // If a full URL was stored (legacy), extract the path.
    const path = doc.file_url.includes(`${BUCKET}/`)
      ? doc.file_url.split(`${BUCKET}/`)[1].split('?')[0]
      : doc.file_url;

    const { data: signed, error: sErr } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(path, 300); // 5 minutes

    if (sErr) {
      logger.error('[compliance] signed URL error:', sErr);
      return res.status(500).json({ error: 'Failed to issue signed URL' });
    }

    return res.json({ url: signed.signedUrl, expires_in: 300 });
  } catch (err) {
    logger.error('[compliance] GET /documents/:id/url error:', err);
    return res.status(500).json({ error: 'Failed to issue URL' });
  }
});

// =============================================================================
// PATCH /api/compliance/documents/:id
// =============================================================================
// GC verifies/rejects, or sub edits metadata. Status changes only by GC.

router.patch('/documents/:id', authenticateUser, async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const access = await callerCanAccessSub(req.user.id, doc.sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    const isGc = access.role === 'gc_creator' || access.role === 'gc_engaged';
    const updates = {};

    // Both sub + GC can update simple metadata
    const editable = ['issuer', 'policy_number', 'issued_at', 'effective_at',
                      'expires_at', 'coverage_limits', 'endorsements',
                      'named_insureds', 'notes'];
    for (const k of editable) {
      if (k in req.body) updates[k] = req.body[k];
    }

    // Only GC can flip verification state
    if (isGc) {
      if ('verification_status' in req.body) {
        updates.verification_status = req.body.verification_status;
        if (req.body.verification_status === 'verified') {
          updates.verified_at = new Date().toISOString();
          updates.verified_by = req.user.id;
        }
        if (req.body.verification_status === 'rejected') {
          updates.rejection_reason = req.body.rejection_reason || 'No reason given';
        }
      }
    }

    const { data: updated, error: upErr } = await supabase
      .from('compliance_documents')
      .update(updates)
      .eq('id', doc.id)
      .select()
      .single();
    if (upErr) throw upErr;
    return res.json({ compliance_document: updated });
  } catch (err) {
    logger.error('[compliance] PATCH error:', err);
    return res.status(500).json({ error: 'Failed to update doc' });
  }
});

// =============================================================================
// DELETE /api/compliance/documents/:id  (soft delete -> status=revoked)
// =============================================================================

router.delete('/documents/:id', authenticateUser, async (req, res) => {
  try {
    const { data: doc } = await supabase
      .from('compliance_documents')
      .select('id, sub_organization_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const access = await callerCanAccessSub(req.user.id, doc.sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    await supabase
      .from('compliance_documents')
      .update({ status: 'revoked' })
      .eq('id', doc.id);

    return res.json({ ok: true });
  } catch (err) {
    logger.error('[compliance] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to revoke doc' });
  }
});

// =============================================================================
// POST /api/compliance/documents/upload-blob
// =============================================================================
// Accept a base64 payload from the sub portal or GC, upload to Supabase Storage,
// then create the compliance_documents row.
//
// Body: { sub_organization_id, doc_type, doc_subtype, file_name, file_mime,
//         file_base64, expires_at, ... }

router.post('/documents/upload-blob', authenticateUser, async (req, res) => {
  try {
    const {
      sub_organization_id,
      doc_type,
      doc_subtype,
      file_name,
      file_mime = 'application/pdf',
      file_base64,
      action_token_id,
      ...rest
    } = req.body || {};

    if (!sub_organization_id || !doc_type || !file_base64) {
      return res.status(400).json({
        error: 'sub_organization_id, doc_type, and file_base64 required',
      });
    }
    const access = await callerCanAccessSub(req.user.id, sub_organization_id);
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' });

    const buffer = Buffer.from(file_base64, 'base64');
    const ext = file_name?.split('.').pop()?.toLowerCase() || 'pdf';
    const stamp = Date.now();
    const path = `${sub_organization_id}/${doc_type}/${stamp}.${ext}`;

    const { error: upErr } = await supabase
      .storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file_mime, upsert: false });
    if (upErr) {
      logger.error('[compliance] upload error:', upErr);
      return res.status(500).json({ error: 'Storage upload failed' });
    }

    const created = await complianceService.recordDocument({
      subOrganizationId: sub_organization_id,
      docType: doc_type,
      docSubtype: doc_subtype,
      fileUrl: path,
      fileName: file_name,
      fileMime: file_mime,
      fileSizeBytes: buffer.length,
      uploadedBy: req.user.id,
      uploadedVia: access.role === 'sub' ? 'sub_portal' : 'gc_upload',
      ...filterAllowed(rest),
    });

    // Consume matching doc-request tokens so the request disappears from
    // the sub's inbox. Two cases:
    //   1. Explicit action_token_id passed (when sub taps the Home action).
    //   2. Sub uploaded via the Documents tab WITHOUT going through the
    //      action item — auto-consume any open upload_doc token for this
    //      sub_organization + doc_type combo.
    try {
      const consumeQ = supabase
        .from('sub_action_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('sub_organization_id', sub_organization_id)
        .is('used_at', null);

      if (action_token_id) {
        await consumeQ.eq('id', action_token_id);
      } else {
        await consumeQ
          .eq('scope', 'upload_doc')
          .eq('doc_type_requested', doc_type);
      }
    } catch (e) {
      logger.warn('[compliance] failed to consume action token(s):', e.message);
    }

    return res.json({ compliance_document: created });
  } catch (err) {
    logger.error('[compliance] upload-blob error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

function filterAllowed(rest) {
  const map = {
    issuer: 'issuer',
    policy_number: 'policyNumber',
    issued_at: 'issuedAt',
    effective_at: 'effectiveAt',
    expires_at: 'expiresAt',
    coverage_limits: 'coverageLimits',
    endorsements: 'endorsements',
    named_insureds: 'namedInsureds',
    notes: 'notes',
  };
  const out = {};
  for (const [k, mapped] of Object.entries(map)) {
    if (k in rest) out[mapped] = rest[k];
  }
  return out;
}

module.exports = router;
