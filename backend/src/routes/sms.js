/**
 * Two-way SMS routes for Sylk.
 *
 * Two routers exported:
 *  - smsApiRouter   — mounted at /api/sms, requires Bearer auth on each endpoint
 *  - smsWebhookRouter — mounted at /webhooks/twilio, public + signature-validated
 *
 * The webhook is mounted outside /api so it isn't intercepted by the
 * geocoding router's `router.use(authenticateUser)` catch-all.
 *
 * Authenticated endpoints (Bearer token, /api/sms):
 *   POST   /send                       — outbound message
 *   GET    /threads                    — thread list grouped by customer
 *   GET    /threads/:customerId        — full thread history
 *   POST   /threads/:customerId/read   — mark thread read
 *   POST   /provision                  — buy a Twilio number for the company
 *
 * Public Twilio webhook (/webhooks/twilio):
 *   POST   /sms                        — Twilio posts inbound messages here
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { authenticateUser } = require('../middleware/authenticate');
const logger = require('../utils/logger');
const twilioService = require('../services/twilioService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const apiRouter = express.Router();
const webhookRouter = express.Router();

// Send-rate limiter: prevents one company from blasting hundreds of texts
// per minute, which would be both expensive and a Twilio TOS issue.
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString());
        if (payload.sub) return `sms_send:${payload.sub}`;
      } catch (_) { /* fallthrough */ }
    }
    return ipKeyGenerator(req);
  },
  message: 'Too many SMS sends — please slow down.',
});

// Webhook limiter: bound on inbound IP, public endpoint without auth.
// Twilio sends inbound from a finite IP range so this won't punish them.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────
// Send a message
// ─────────────────────────────────────────────────────────────────
apiRouter.post('/send', authenticateUser, sendLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { to, body, customerId } = req.body || {};

    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'body is required' });
    }
    if (!to && !customerId) {
      return res.status(400).json({ error: 'to or customerId is required' });
    }

    const companyId = await twilioService.resolveCompanyId(userId);

    // If only customerId was given, look up the phone now so the persisted
    // row records the actual destination.
    let toNumber = to;
    if (!toNumber && customerId) {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id, phone, sms_phone, owner_id')
        .eq('id', customerId)
        .single();
      if (!client || client.owner_id !== companyId) {
        return res.status(404).json({ error: 'Customer not found in this company' });
      }
      toNumber = client.sms_phone || client.phone;
      if (!toNumber) {
        return res.status(400).json({ error: 'Customer has no phone on file' });
      }
    }

    const row = await twilioService.sendSms(companyId, toNumber, body, {
      customerId: customerId || null,
      sentBy: userId,
    });

    res.json({ message: row, mock: !twilioService.isLive() });
  } catch (err) {
    logger.error('[SMS] /send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// Threads list (grouped by customer)
// ─────────────────────────────────────────────────────────────────
apiRouter.get('/threads', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = await twilioService.resolveCompanyId(userId);
    const threads = await twilioService.listThreads(companyId);
    res.json({ threads });
  } catch (err) {
    logger.error('[SMS] /threads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// Full thread history
// ─────────────────────────────────────────────────────────────────
apiRouter.get('/threads/:customerId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = await twilioService.resolveCompanyId(userId);
    const messages = await twilioService.getThread(companyId, req.params.customerId);
    res.json({ messages });
  } catch (err) {
    logger.error('[SMS] /threads/:customerId error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// Mark thread read
// ─────────────────────────────────────────────────────────────────
apiRouter.post('/threads/:customerId/read', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = await twilioService.resolveCompanyId(userId);
    const result = await twilioService.markThreadRead(companyId, req.params.customerId);
    res.json(result);
  } catch (err) {
    logger.error('[SMS] /threads/:customerId/read error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// Provision a Twilio number on demand
// ─────────────────────────────────────────────────────────────────
apiRouter.post('/provision', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = await twilioService.resolveCompanyId(userId);
    if (companyId !== userId) {
      // Only the owner can buy numbers; supervisors share the owner's number.
      return res.status(403).json({ error: 'Only the owner can provision a phone number' });
    }
    const { areaCode } = req.body || {};
    const result = await twilioService.provisionNumber(companyId, areaCode);
    res.json(result);
  } catch (err) {
    logger.error('[SMS] /provision error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// Twilio inbound webhook — public, signature-validated
// ─────────────────────────────────────────────────────────────────
webhookRouter.post('/sms', webhookLimiter, async (req, res) => {
  try {
    if (!twilioService.validateInboundSignature(req)) {
      logger.warn('[SMS] inbound signature invalid');
      return res.status(403).type('text/xml').send('<Response/>');
    }
    const result = await twilioService.handleInbound(req);
    if (result.status !== 'ok') {
      logger.info('[SMS] inbound:', result);
    }
    // Respond with empty TwiML — we don't auto-reply at the Twilio layer.
    // Owners reply via the inbox UI, which goes through /api/sms/send.
    res.status(200).type('text/xml').send('<Response/>');
  } catch (err) {
    logger.error('[SMS] webhook error:', err.message);
    res.status(200).type('text/xml').send('<Response/>');
  }
});

module.exports = { smsApiRouter: apiRouter, smsWebhookRouter: webhookRouter };
