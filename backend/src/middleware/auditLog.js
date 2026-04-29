/**
 * Audit Log Middleware
 *
 * Generic write-operation audit. Wrap any mutation route with
 * `auditLog({ entityType, table })` and the middleware will:
 *   1. Pre-fetch the row's "before" state for UPDATE/DELETE
 *   2. Let the handler run, capture the response body
 *   3. Re-fetch the "after" state on success
 *   4. Asynchronously enqueue an audit_log row write — never blocks
 *      the response
 *
 * Sensitive fields (api keys, tokens, passwords) are redacted from
 * before/after JSON before persistence. Bulk operations roll up to
 * a single audit row with item_count instead of N rows.
 *
 * Routes that don't fit the URL-and-id pattern (chained writes,
 * voice-driven flows) can call `recordAudit(...)` directly.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Field names whose values must never land in audit_log. Match is
// case-insensitive and substring-based — `auth_token`, `apiKey`,
// `STRIPE_SECRET` all redact. Add new sensitive keys here, not at
// every call site.
const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /refresh[_-]?token/i,
  /authorization/i,
  /credit[_-]?card/i,
  /card[_-]?number/i,
  /ssn/i,
  /cvv/i,
  /private[_-]?key/i,
  /webhook[_-]?secret/i,
  /session[_-]?token/i,
  /magic[_-]?link/i,
  /encryption[_-]?key/i,
  /salt/i,
];

const REDACTION_PLACEHOLDER = '[REDACTED]';

function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_FIELD_PATTERNS.some((re) => re.test(key));
}

/**
 * Deep clone a JSON-serialisable value with sensitive fields stripped.
 * Returns null/undefined unchanged. Strings, numbers, booleans pass
 * through. Recursively walks objects and arrays.
 */
function redactSensitive(input) {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(redactSensitive);
  if (typeof input !== 'object') return input;

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTION_PLACEHOLDER;
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = redactSensitive(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Resolve the company_id (tenant scope) for an arbitrary row. Sylk's
 * data model is "owner_id-everywhere" — every important table either
 * has an owner_id column or a user_id column whose meaning is
 * "owner". This helper checks both so middleware doesn't need to
 * know which.
 */
function resolveCompanyId(row, fallbackUserId) {
  if (!row) return fallbackUserId || null;
  return row.owner_id || row.user_id || row.company_id || fallbackUserId || null;
}

/**
 * Infer the actor type from the request. Used when the caller didn't
 * pass an explicit actorType. Mirrors the source check: if the agent
 * tool runner attached `req.actorType = 'foreman'`, that wins;
 * otherwise we fall back to role lookup.
 */
function inferActorType(req) {
  if (req?.actorType) return req.actorType;
  if (req?.client) return 'client';
  if (req?.user?.role === 'supervisor') return 'supervisor';
  if (req?.user?.role === 'worker') return 'worker';
  if (req?.user) return 'user';
  return 'system';
}

/**
 * Infer the request source. Mobile sends an X-Client header;
 * Foreman tool calls flag `req.source = 'foreman'`; the website
 * portal sends a portal session cookie.
 */
function inferSource(req) {
  if (req?.source) return req.source;
  const header = (req?.headers?.['x-client'] || '').toLowerCase();
  if (header === 'mobile') return 'mobile';
  if (header === 'web') return 'web';
  if (req?.cookies?.portal_session) return 'portal';
  return 'api';
}

/**
 * Pull the client IP, respecting X-Forwarded-For (Express's trust
 * proxy is on, so req.ip already reflects the real client when set
 * up correctly).
 */
function inferIp(req) {
  if (!req) return null;
  return req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || null;
}

/**
 * Record an audit_log row. Fire-and-forget: never blocks, never
 * throws. Errors land in logger.error so ops can spot a broken log
 * pipeline without breaking the originating mutation.
 *
 * Direct-call API for routes that do bespoke flows (e.g. portal
 * approvals, agent tool handlers).
 */
function recordAudit({
  companyId,
  actorUserId = null,
  actorType = 'system',
  action,
  entityType,
  entityId = null,
  beforeJson = null,
  afterJson = null,
  itemCount = null,
  ip = null,
  userAgent = null,
  source = 'api',
}) {
  // Self-recursion guard: never log writes to audit_log itself.
  if (entityType === 'audit_log') return Promise.resolve();

  if (!companyId) {
    logger.warn('[Audit] Skipping write — no companyId resolved');
    return Promise.resolve();
  }

  if (!action || !entityType) {
    logger.warn('[Audit] Skipping write — action and entityType required');
    return Promise.resolve();
  }

  const row = {
    company_id: companyId,
    actor_user_id: actorUserId,
    actor_type: actorType,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_json: beforeJson ? redactSensitive(beforeJson) : null,
    after_json: afterJson ? redactSensitive(afterJson) : null,
    item_count: itemCount,
    ip,
    user_agent: userAgent,
    source,
  };

  // Fire-and-forget. Promise is returned so tests can await, but
  // production callers don't.
  return supabase
    .from('audit_log')
    .insert(row)
    .then(({ error }) => {
      if (error) {
        logger.error('[Audit] Insert failed:', error.message, {
          entityType,
          action,
          entityId,
        });
      }
    })
    .catch((err) => {
      logger.error('[Audit] Insert threw:', err?.message);
    });
}

/**
 * Express middleware factory. Wraps a mutation route. Captures the
 * before-state for UPDATE/DELETE before the handler runs, then on
 * a 2xx response captures the after-state and writes the audit row
 * asynchronously (never blocking the response).
 *
 * Usage:
 *   router.patch('/:id', auditLog({ entityType: 'project', table: 'projects' }), handler);
 *   router.delete('/:id', auditLog({ entityType: 'project', table: 'projects' }), handler);
 *   router.post('/', auditLog({ entityType: 'project', table: 'projects' }), handler);
 *
 * Options:
 *   - entityType (required): canonical noun ('project','estimate',...)
 *   - table (required): supabase table name to read before/after from
 *   - getEntityId(req, res): extract entity id (default: req.params.id, fallback to res body id)
 *   - getCompanyId(req, beforeRow, afterRow): override company_id resolution
 *   - action: override action (auto-mapped from req.method otherwise)
 *   - skipBefore: skip before-state fetch (use for inserts where before is always null)
 */
function auditLog(options = {}) {
  const {
    entityType,
    table,
    getEntityId,
    getCompanyId,
    action: actionOverride,
    skipBefore = false,
  } = options;

  if (!entityType || !table) {
    throw new Error('[Audit] auditLog() requires entityType and table');
  }

  return async function auditLogMiddleware(req, res, next) {
    const method = req.method;
    const inferredAction = actionOverride
      || (method === 'POST' ? 'create'
        : method === 'PATCH' || method === 'PUT' ? 'update'
          : method === 'DELETE' ? 'delete'
            : null);

    // If we can't infer an action (e.g. GET), bail out — middleware
    // shouldn't be on read-only routes anyway, but defend in depth.
    if (!inferredAction) return next();

    const entityIdFromReq = (typeof getEntityId === 'function')
      ? getEntityId(req)
      : req.params.id;

    // Pre-fetch before state for update/delete. Skip for create —
    // there's nothing to read yet.
    let beforeRow = null;
    if (!skipBefore && (inferredAction === 'update' || inferredAction === 'delete') && entityIdFromReq) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('id', entityIdFromReq)
          .maybeSingle();
        if (!error) beforeRow = data;
      } catch (e) {
        // Don't block the mutation if the before-fetch fails.
        logger.warn(`[Audit] Before-fetch failed for ${entityType}:`, e?.message);
      }
    }

    // Wrap res.json so we can intercept the response body without
    // interfering with handlers that already use it.
    const originalJson = res.json.bind(res);
    let responseBody = null;
    res.json = function (body) {
      responseBody = body;
      return originalJson(body);
    };

    // After response is sent, kick off the audit write. We listen
    // on 'finish' so we have the final status code; 'close' would
    // also fire on aborted requests where we don't want to log.
    res.on('finish', () => {
      // Only audit successful mutations.
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      (async () => {
        try {
          // Resolve entity id: prefer pre-known, else dig out of
          // response body (POSTs return { id } or the row itself).
          let finalEntityId = entityIdFromReq;
          if (!finalEntityId && responseBody && typeof responseBody === 'object') {
            finalEntityId = responseBody.id || responseBody?.data?.id || null;
          }

          // Re-fetch after state for update/create. For delete the
          // row no longer exists, so after_json is null.
          let afterRow = null;
          if (inferredAction !== 'delete' && finalEntityId) {
            try {
              const { data } = await supabase
                .from(table)
                .select('*')
                .eq('id', finalEntityId)
                .maybeSingle();
              afterRow = data;
            } catch (e) {
              logger.warn(`[Audit] After-fetch failed for ${entityType}:`, e?.message);
            }
          }

          // Fall back to response body if we couldn't re-read the row
          // (e.g. soft-delete where the row is still there but RLS
          // hides it under a different scope).
          if (!afterRow && inferredAction !== 'delete' && responseBody && typeof responseBody === 'object') {
            // Heuristic: if responseBody has an id, treat it as the row.
            if (responseBody.id) afterRow = responseBody;
          }

          const companyId = (typeof getCompanyId === 'function')
            ? getCompanyId(req, beforeRow, afterRow)
            : resolveCompanyId(beforeRow || afterRow, req?.user?.id);

          await recordAudit({
            companyId,
            actorUserId: req?.user?.id || null,
            actorType: inferActorType(req),
            action: inferredAction,
            entityType,
            entityId: finalEntityId || null,
            beforeJson: beforeRow,
            afterJson: afterRow,
            ip: inferIp(req),
            userAgent: req?.headers?.['user-agent'] || null,
            source: inferSource(req),
          });
        } catch (e) {
          logger.error('[Audit] Background write failed:', e?.message);
        }
      })();
    });

    next();
  };
}

/**
 * Bulk-action helper. Coalesces N rows of the same kind into a single
 * audit_log row with item_count = N. Used by CSV imports, bulk
 * transaction reconciliation, etc.
 */
function recordBulkAudit({
  companyId,
  actorUserId = null,
  actorType = 'system',
  action,
  entityType,
  itemCount,
  beforeJson = null,
  afterJson = null,
  ip = null,
  userAgent = null,
  source = 'api',
}) {
  return recordAudit({
    companyId,
    actorUserId,
    actorType,
    action: action.startsWith('bulk_') ? action : `bulk_${action}`,
    entityType,
    entityId: null,
    beforeJson,
    afterJson,
    itemCount,
    ip,
    userAgent,
    source,
  });
}

module.exports = {
  auditLog,
  recordAudit,
  recordBulkAudit,
  redactSensitive,
  // Exported for tests
  __test__: {
    isSensitiveKey,
    resolveCompanyId,
    inferActorType,
    inferSource,
    inferIp,
  },
};
