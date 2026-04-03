/**
 * Portal Authentication Middleware
 * Validates client session tokens from X-Portal-Token header.
 * Portal clients don't use Supabase Auth — they authenticate via magic links.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Authenticates portal clients via session token.
 * Sets req.client with the client record on success.
 */
const authenticatePortalClient = async (req, res, next) => {
  const token = req.headers['x-portal-token'];

  if (!token) {
    return res.status(401).json({ error: 'Missing portal session token' });
  }

  try {
    // Look up session and join to client record
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
      .eq('session_token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !session || !session.clients) {
      logger.warn('[Portal] Invalid or expired session token');
      return res.status(401).json({ error: 'Invalid or expired session' });
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
