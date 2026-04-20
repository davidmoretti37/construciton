/**
 * Portal Authentication Middleware
 * Supports two auth methods:
 *   1. Authorization: Bearer <supabase_jwt> — for mobile app clients (Supabase Auth)
 *   2. X-Portal-Token — for web portal clients (magic link sessions)
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Authenticates portal clients via Supabase JWT or session token.
 * Sets req.client with the client record on success.
 */
const authenticatePortalClient = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  try {
    // Method 1: Supabase Auth (mobile app clients)
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.split(' ')[1];
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid auth token' });
      }

      // Look up client record by user_id
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, owner_id, full_name, email, phone')
        .eq('user_id', user.id)
        .single();

      if (clientError || !client) {
        return res.status(401).json({ error: 'No client account linked to this user' });
      }

      req.client = {
        id: client.id,
        owner_id: client.owner_id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
      };

      return next();
    }

    // Method 2: Portal session token via httpOnly cookie only (no localStorage fallback)
    const sessionToken = req.cookies?.portal_session;
    if (!sessionToken) {
      return res.status(401).json({ error: 'Missing authentication' });
    }

    const { data: session, error } = await supabase
      .from('client_sessions')
      .select(`
        id,
        client_id,
        expires_at,
        clients (
          id,
          owner_id,
          full_name,
          email,
          phone
        )
      `)
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !session || !session.clients) {
      logger.warn('[Portal] Invalid or expired session token');
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Verify client still has at least one active project share (revoked clients get blocked)
    const { data: activeShares } = await supabase
      .from('project_clients')
      .select('id')
      .eq('client_id', session.clients.id)
      .limit(1);

    if (!activeShares || activeShares.length === 0) {
      logger.warn(`[Portal] Client ${session.clients.id} has no active project shares — session revoked`);
      // Clean up orphaned session
      await supabase.from('client_sessions').delete().eq('id', session.id);
      return res.status(401).json({ error: 'Access has been revoked' });
    }

    req.client = {
      id: session.clients.id,
      sessionId: session.id,
      owner_id: session.clients.owner_id,
      full_name: session.clients.full_name,
      email: session.clients.email,
      phone: session.clients.phone,
    };

    next();
  } catch (error) {
    logger.error('[Portal] Auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Verifies that the authenticated client has access to a specific project.
 * Must be used after authenticatePortalClient.
 * Reads projectId from req.params.projectId.
 */
const verifyProjectAccess = async (req, res, next) => {
  const { projectId } = req.params;
  const clientId = req.client.id;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    const { data, error } = await supabase
      .from('project_clients')
      .select('id')
      .eq('project_id', projectId)
      .eq('client_id', clientId)
      .single();

    if (error || !data) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

    next();
  } catch (error) {
    logger.error('[Portal] Project access check error:', error.message);
    return res.status(500).json({ error: 'Failed to verify project access' });
  }
};

module.exports = { authenticatePortalClient, verifyProjectAccess };
