/**
 * Internal Routes — gated by INTERNAL_CRON_KEY shared-secret header.
 *
 * Called by Supabase pg_cron (or any external scheduler). NEVER expose to
 * end users. Mounted at /api/internal.
 *
 * - POST /api/internal/compliance/run-alerts   walks expiring docs, sends
 *                                              renewal emails + notifications
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const subOrgService = require('../services/subOrgService');
const logger = require('../utils/logger');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// Shared-secret middleware
// =============================================================================

router.use((req, res, next) => {
  const expected = process.env.INTERNAL_CRON_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'INTERNAL_CRON_KEY not configured' });
  }
  const provided = req.get('X-Cron-Key');
  if (provided !== expected) {
    return res.status(401).json({ error: 'Invalid cron key' });
  }
  next();
});

// =============================================================================
// POST /api/internal/compliance/run-alerts
// =============================================================================
// Walks `compliance_documents.status='active' AND expires_at <= today + 30d`
// and emits notifications + (best-effort) renewal-token emails.

const ALERT_LEAD_DAYS = [30, 15, 0]; // notify on these thresholds

router.post('/compliance/run-alerts', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today.getTime() + 30 * 86400 * 1000);

    const { data: docs, error } = await supabase
      .from('compliance_documents')
      .select(`
        id, sub_organization_id, doc_type, expires_at, status,
        sub:sub_organizations (
          id, legal_name, primary_email, auth_user_id, created_by_gc_user_id
        )
      `)
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lte('expires_at', cutoff.toISOString().slice(0, 10));

    if (error) throw error;

    let notificationsCreated = 0;
    let tokensIssued = 0;

    for (const doc of (docs || [])) {
      const expiresAt = new Date(doc.expires_at);
      const daysToExpiry = Math.floor((expiresAt - today) / (1000 * 3600 * 24));

      // Only notify on the threshold days
      if (!ALERT_LEAD_DAYS.includes(daysToExpiry) && daysToExpiry >= 0) continue;
      if (daysToExpiry < 0 && daysToExpiry !== -1) continue; // 1-day-after stamp

      const subjectStatus = daysToExpiry < 0 ? 'expired' :
                            daysToExpiry === 0 ? 'expires today' :
                            `expires in ${daysToExpiry} days`;
      const titleType = daysToExpiry < 0 ? 'sub_doc_expired' : 'sub_doc_expiring';

      // 1. Notify GC owner(s) — anyone with active engagement
      const { data: gcEngagements } = await supabase
        .from('sub_engagements')
        .select('gc_user_id')
        .eq('sub_organization_id', doc.sub_organization_id)
        .neq('status', 'cancelled');
      const gcUserIds = [...new Set((gcEngagements || []).map((r) => r.gc_user_id))];
      // Always include creator GC even without an engagement
      if (doc.sub?.created_by_gc_user_id && !gcUserIds.includes(doc.sub.created_by_gc_user_id)) {
        gcUserIds.push(doc.sub.created_by_gc_user_id);
      }

      for (const gcId of gcUserIds) {
        await supabase.from('notifications').insert({
          user_id: gcId,
          title: `${doc.sub?.legal_name || 'Subcontractor'} compliance ${subjectStatus}`,
          body: `${doc.doc_type.toUpperCase()} ${subjectStatus} — request a renewed copy.`,
          type: titleType,
          icon: 'shield-half-outline',
          color: daysToExpiry < 0 ? '#DC2626' : '#F59E0B',
        });
        notificationsCreated++;
      }

      // 2. Issue a renewal token + notify the sub (if they have an account)
      if (doc.sub?.auth_user_id) {
        await supabase.from('notifications').insert({
          user_id: doc.sub.auth_user_id,
          title: `Your ${doc.doc_type.toUpperCase()} ${subjectStatus}`,
          body: 'Tap to upload a renewed copy.',
          type: 'sub_doc_expiring',
          icon: 'cloud-upload-outline',
          color: daysToExpiry < 0 ? '#DC2626' : '#F59E0B',
        });
        notificationsCreated++;
      }

      // 3. Magic-link upload token (independent of account state)
      try {
        await subOrgService.issueActionToken({
          subOrganizationId: doc.sub_organization_id,
          scope: 'upload_doc',
          docTypeRequested: doc.doc_type,
        });
        tokensIssued++;
      } catch (e) {
        logger.warn('[internal] could not issue renewal token:', e.message);
      }
    }

    return res.json({
      docs_scanned: (docs || []).length,
      notifications_created: notificationsCreated,
      tokens_issued: tokensIssued,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[internal] run-alerts error:', err);
    return res.status(500).json({ error: 'Run failed' });
  }
});

module.exports = router;
