/**
 * E-Signature HTTP routes.
 *
 * - Auth-required (Supabase JWT): owner-side request/status/cancel
 * - Public (token-protected): customer signing flow
 *
 * Signing endpoints rely on the single-use token in the URL — no cookies, no
 * portal session — so they can be hit from any browser without prior auth.
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const eSign = require('../services/eSignService');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Auth helper for owner-facing endpoints ---
async function requireOwner(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const jwt = auth.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(jwt);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.userId = user.id;
    next();
  } catch (err) {
    logger.error('[eSign] auth error:', err.message);
    return res.status(401).json({ error: 'Auth failed' });
  }
}

// =============================================================================
// Owner endpoints
// =============================================================================

router.post('/request', requireOwner, async (req, res) => {
  const { documentType, documentId, signerName, signerEmail, signerPhone } = req.body || {};
  try {
    const result = await eSign.createSignatureRequest({
      ownerId: req.userId,
      documentType,
      documentId,
      signerName,
      signerEmail,
      signerPhone,
    });
    res.json(result);
  } catch (err) {
    logger.error('[eSign] request failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/status/:documentType/:documentId', requireOwner, async (req, res) => {
  try {
    const result = await eSign.getSignatureStatus({
      documentType: req.params.documentType,
      documentId: req.params.documentId,
      ownerId: req.userId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cancel/:signatureId', requireOwner, async (req, res) => {
  try {
    const result = await eSign.cancelSignatureRequest({
      signatureId: req.params.signatureId,
      ownerId: req.userId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// Public token-protected endpoints
// =============================================================================

router.get('/sign/:token', async (req, res) => {
  try {
    const ctx = await eSign.getSigningContext(req.params.token);
    if (ctx.status !== 'pending') {
      const code = ctx.status === 'expired' || ctx.status === 'consumed' || ctx.status === 'signed' || ctx.status === 'declined' ? 410 : 404;
      return res.status(code).json(ctx);
    }
    res.json(ctx);
  } catch (err) {
    logger.error('[eSign] getSigningContext error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/sign/:token', async (req, res) => {
  const { signaturePngBase64, signerName } = req.body || {};
  const ip = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || null;
  try {
    const result = await eSign.recordSignature({
      token: req.params.token,
      signaturePngBase64,
      signerName,
      ip,
      userAgent,
    });
    res.json(result);
  } catch (err) {
    logger.error('[eSign] recordSignature error:', err.message);
    const code = err.message?.startsWith('TAMPER_DETECTED') ? 409 :
                 err.message?.includes('expired') || err.message?.includes('already') ? 410 :
                 400;
    res.status(code).json({ error: err.message });
  }
});

router.post('/decline/:token', async (req, res) => {
  const { reason } = req.body || {};
  try {
    const result = await eSign.declineSignature({ token: req.params.token, reason });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
