/**
 * P12 — MCP integrations routes.
 *
 * Mounted at /api/integrations.
 *
 * Authenticated endpoints (Bearer JWT):
 *   GET    /                     — list available + per-user status
 *   POST   /:type/connect        — start OAuth (or instant-connect for no-auth integrations)
 *   GET    /:type/callback       — OAuth callback (no auth required by middleware
 *                                   — provider redirects with `state` param we verify)
 *   POST   /:type/disconnect     — purge tokens, mark disconnected
 *
 * The OAuth `state` param is signed JWT-style with the userId so the
 * provider's callback can be authenticated without an active session.
 */

const express = require('express');
const crypto = require('crypto');
const { authenticateUser } = require('../middleware/authenticate');
const logger = require('../utils/logger');
const { listAll, listAvailable, get } = require('../services/mcp/mcpRegistry');
const credentialStore = require('../services/mcp/credentialStore');
const { loadAdapter } = require('../services/mcp/mcpClient');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// Sign / verify OAuth `state` to authenticate the callback redirect
// when there's no active JWT bearer (the user came back from the
// provider's site, not from the app).
// ─────────────────────────────────────────────────────────────────
function signState(userId, integrationType) {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev';
  const payload = `${userId}.${integrationType}.${Date.now()}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyState(stateB64) {
  if (!stateB64) return null;
  try {
    const decoded = Buffer.from(stateB64, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 4) return null;
    const [userId, integrationType, ts, sig] = parts;
    const payload = `${userId}.${integrationType}.${ts}`;
    const secret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null; // 15 min window
    return { userId, integrationType };
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// GET / — list available integrations + this user's connection status
// ─────────────────────────────────────────────────────────────────
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userIntegrations = await credentialStore.listForUser(userId);
    const userMap = new Map(userIntegrations.map(u => [u.integration_type, u]));

    const integrations = listAll().map(entry => {
      const conn = userMap.get(entry.type);
      return {
        type: entry.type,
        name: entry.name,
        description: entry.description,
        icon: entry.icon,
        category: entry.category,
        oauth: entry.oauth,
        coming_soon: !!entry.coming_soon,
        enabled: !!entry.enabled,
        scopes: entry.scopes || [],
        connection: conn
          ? {
              status: conn.status,
              connected_at: conn.connected_at,
              expires_at: conn.expires_at,
              last_synced_at: conn.last_synced_at,
              last_error: conn.last_error,
              scopes: conn.scopes,
            }
          : null,
      };
    });

    res.json({ integrations });
  } catch (err) {
    logger.error('[integrations] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /:type/connect — start OAuth, OR for no-auth integrations,
// connect immediately
// ─────────────────────────────────────────────────────────────────
router.post('/:type/connect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.params.type;
    const entry = get(type);
    if (!entry || !entry.enabled || entry.coming_soon) {
      return res.status(404).json({ error: 'Integration not available' });
    }

    if (!entry.oauth) {
      // No OAuth — connect instantly (e.g., echo test integration).
      await credentialStore.saveCredential({
        userId,
        integrationType: type,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        scopes: [],
        metadata: { mode: 'no_auth' },
      });
      return res.json({ connected: true, type });
    }

    // OAuth path — adapter must implement oauthAuthorizeUrl.
    const adapter = loadAdapter(type);
    if (!adapter || typeof adapter.oauthAuthorizeUrl !== 'function') {
      return res.status(500).json({ error: 'Adapter does not implement OAuth' });
    }
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/integrations/${type}/callback`;
    const state = signState(userId, type);
    const authorizeUrl = await adapter.oauthAuthorizeUrl(state, redirectUri);
    res.json({ authorize_url: authorizeUrl });
  } catch (err) {
    logger.error('[integrations] connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /:type/callback — OAuth callback redirect target. NO auth
// middleware here; provider hits this URL directly. We authenticate
// via the signed `state` param.
// ─────────────────────────────────────────────────────────────────
router.get('/:type/callback', async (req, res) => {
  try {
    const type = req.params.type;
    const code = req.query.code;
    const stateB64 = req.query.state;
    const verified = verifyState(stateB64);
    if (!verified || verified.integrationType !== type) {
      return res.status(400).type('text/html').send('<p>Invalid or expired authorization state. Please retry from Sylk.</p>');
    }
    if (!code) {
      const errParam = req.query.error_description || req.query.error || 'no code';
      return res.status(400).type('text/html').send(`<p>OAuth declined: ${errParam}</p>`);
    }

    const adapter = loadAdapter(type);
    if (!adapter || typeof adapter.oauthExchangeCode !== 'function') {
      return res.status(500).type('text/html').send('<p>Adapter cannot exchange code.</p>');
    }
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/integrations/${type}/callback`;
    // Some providers (Intuit/QBO) attach extra params on the redirect
    // (e.g. realmId). Forward the entire query map so adapters can pick
    // out provider-specific bits without a special-case branch here.
    const exchanged = await adapter.oauthExchangeCode(code, redirectUri, req.query || {});

    await credentialStore.saveCredential({
      userId: verified.userId,
      integrationType: type,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresAt: exchanged.expiresAt,
      scopes: exchanged.scopes,
      metadata: exchanged.metadata || {},
    });

    // Render a tiny "you can close this" page that pings the app via
    // deep link (sylk://integrations/connected?type=...). Falls back to
    // plain text if the user opened the URL outside the app.
    res.type('text/html').send(`<!DOCTYPE html>
<html><head><title>Connected</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;padding:40px;text-align:center;color:#111}h1{font-size:18px}p{color:#666}</style>
</head><body>
<h1>Connected to ${type} ✓</h1>
<p>You can close this window and return to Sylk.</p>
<script>setTimeout(function(){location.href='sylk://integrations/connected?type=${encodeURIComponent(type)}';},800);</script>
</body></html>`);
  } catch (err) {
    logger.error('[integrations] callback error:', err.message);
    res.status(500).type('text/html').send(`<p>Connection failed: ${err.message}</p>`);
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /:type/disconnect — purge tokens, mark disconnected
// ─────────────────────────────────────────────────────────────────
router.post('/:type/disconnect', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.params.type;
    await credentialStore.disconnect(userId, type);
    res.json({ disconnected: true, type });
  } catch (err) {
    logger.error('[integrations] disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
