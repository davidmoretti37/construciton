/**
 * P12 — encrypted credential store for MCP integrations.
 *
 * OAuth tokens are sensitive. We encrypt them at rest using AES-256-GCM
 * with a key stored in the INTEGRATION_ENCRYPTION_KEY env var (32 bytes,
 * hex-encoded). Each row gets its own IV. Only the backend service-role
 * can decrypt — they never leave the server.
 *
 * Key rotation: if INTEGRATION_ENCRYPTION_KEY changes, existing tokens
 * become unreadable. The decrypt path returns null, the integration's
 * status flips to 'expired', and the user is prompted to reconnect.
 * No data corruption — just a forced re-OAuth.
 *
 * NOT SECURITY-CRITICAL design choices:
 *  - We use the service-role Supabase client, which bypasses RLS. The
 *    RLS policies on user_integrations are defense-in-depth for direct
 *    DB access from authenticated clients (which we never do).
 *  - Tokens never reach the frontend. The `getCredential` API returns
 *    plaintext only inside backend code paths; we never serialize them
 *    over the wire.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ALGORITHM = 'aes-256-gcm';

/** 32-byte key, hex-encoded in env. Required for any encrypt/decrypt. */
function getKey() {
  const hex = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!hex) return null;
  try {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) {
      logger.warn(`[credentialStore] INTEGRATION_ENCRYPTION_KEY must be 32 bytes hex (got ${buf.length})`);
      return null;
    }
    return buf;
  } catch (e) {
    logger.warn(`[credentialStore] INTEGRATION_ENCRYPTION_KEY parse failed: ${e.message}`);
    return null;
  }
}

/**
 * Encrypt a token. Returns { ciphertext, iv } as hex strings, or null
 * if no key is configured.
 */
function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return { ciphertext: null, iv: null };
  const key = getKey();
  if (!key) {
    logger.error('[credentialStore] cannot encrypt — INTEGRATION_ENCRYPTION_KEY not set');
    throw new Error('Integration encryption key not configured');
  }
  const iv = crypto.randomBytes(12); // GCM standard
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as ct||tag concatenated; we know tag is last 16 bytes
  return {
    ciphertext: Buffer.concat([ct, tag]).toString('hex'),
    iv: iv.toString('hex'),
  };
}

/** Decrypt; returns plaintext or null on failure (key missing, key rotated, corruption). */
function decrypt(ciphertextHex, ivHex) {
  if (!ciphertextHex || !ivHex) return null;
  const key = getKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(ciphertextHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    if (buf.length < 17) return null; // need at least 16-byte tag + 1 byte ct
    const tag = buf.slice(buf.length - 16);
    const ct = buf.slice(0, buf.length - 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    // Key rotation, corruption, or wrong key — return null so caller flips status to 'expired'.
    logger.warn(`[credentialStore] decrypt failed: ${e.message}`);
    return null;
  }
}

/**
 * Save (or update) credentials for a user+integration.
 * accessToken/refreshToken are stored encrypted; everything else as-is.
 */
async function saveCredential({ userId, integrationType, accessToken, refreshToken, expiresAt, scopes, metadata }) {
  if (!userId || !integrationType) throw new Error('userId + integrationType required');
  const enc1 = encrypt(accessToken);
  const enc2 = encrypt(refreshToken);
  // Use the access token's IV for storage; we encrypted both with separate
  // IVs but track only one because the schema has one token_iv column.
  // Refresh token encryption uses the same key but a DIFFERENT IV embedded
  // in its own ciphertext header — store both IVs by JSON-encoding the
  // refresh token payload as `<iv_hex>:<ct_hex>`.
  const refreshTokenWithIv = enc2.ciphertext ? `${enc2.iv}:${enc2.ciphertext}` : null;

  const row = {
    user_id: userId,
    integration_type: integrationType,
    status: 'connected',
    access_token_encrypted: enc1.ciphertext,
    refresh_token_encrypted: refreshTokenWithIv,
    token_iv: enc1.iv,
    expires_at: expiresAt || null,
    scopes: Array.isArray(scopes) ? scopes : null,
    metadata: metadata || {},
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('user_integrations')
    .upsert(row, { onConflict: 'user_id,integration_type', ignoreDuplicates: false });
  if (error) throw new Error(`saveCredential: ${error.message}`);
}

/** Get the decrypted credential for a user+integration, or null. */
async function getCredential(userId, integrationType) {
  const { data } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', integrationType)
    .eq('status', 'connected')
    .maybeSingle();
  if (!data) return null;
  const accessToken = decrypt(data.access_token_encrypted, data.token_iv);
  let refreshToken = null;
  if (data.refresh_token_encrypted && data.refresh_token_encrypted.includes(':')) {
    const [ivHex, ctHex] = data.refresh_token_encrypted.split(':');
    refreshToken = decrypt(ctHex, ivHex);
  }
  if (!accessToken && data.access_token_encrypted) {
    // Decryption failed → key rotation or corruption. Flip to expired.
    logger.warn(`[credentialStore] decrypt failed for user ${userId} integration ${integrationType}; marking expired`);
    await markStatus(userId, integrationType, 'expired', 'decryption failed (key rotation?)');
    return null;
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: data.expires_at,
    scopes: data.scopes,
    metadata: data.metadata,
    connectedAt: data.connected_at,
  };
}

/** List all integrations for a user (status + metadata, NO tokens). */
async function listForUser(userId) {
  const { data } = await supabase
    .from('user_integrations')
    .select('integration_type, status, expires_at, scopes, metadata, connected_at, last_error, last_synced_at')
    .eq('user_id', userId)
    .order('connected_at', { ascending: false });
  return data || [];
}

async function markStatus(userId, integrationType, status, lastError = null) {
  const update = { status, updated_at: new Date().toISOString() };
  if (lastError) update.last_error = String(lastError).slice(0, 1000);
  if (status === 'disconnected') update.disconnected_at = new Date().toISOString();
  await supabase
    .from('user_integrations')
    .update(update)
    .eq('user_id', userId)
    .eq('integration_type', integrationType);
}

/** Disconnect — purge tokens, flip status. The row is kept for audit
 *  history; tokens are zeroed out so they can't be used again even if
 *  the encryption key leaks later. */
async function disconnect(userId, integrationType) {
  await supabase
    .from('user_integrations')
    .update({
      status: 'disconnected',
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_iv: null,
      expires_at: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('integration_type', integrationType);
}

/**
 * Look up which user owns a given external-system identifier — used by
 * webhook receivers to route an event (which arrives as "realmId X
 * changed") back to the right user. Searches the metadata jsonb for
 * `realmId` (QBO) or `account_id` (Monday) etc.
 */
async function findUserByRealmId(integrationType, realmId) {
  if (!realmId) return null;
  const { data } = await supabase
    .from('user_integrations')
    .select('user_id, metadata')
    .eq('integration_type', integrationType)
    .eq('status', 'connected')
    .filter('metadata->>realmId', 'eq', String(realmId))
    .maybeSingle();
  return data?.user_id || null;
}

/** Update metadata after a sync (last_synced_at + arbitrary metadata fields). */
async function touchSync(userId, integrationType, metadataPatch = {}) {
  const { data: current } = await supabase
    .from('user_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('integration_type', integrationType)
    .maybeSingle();
  const merged = { ...(current?.metadata || {}), ...metadataPatch };
  await supabase
    .from('user_integrations')
    .update({ last_synced_at: new Date().toISOString(), metadata: merged })
    .eq('user_id', userId)
    .eq('integration_type', integrationType);
}

module.exports = {
  encrypt,
  decrypt,
  saveCredential,
  getCredential,
  listForUser,
  markStatus,
  disconnect,
  touchSync,
  findUserByRealmId,
  // Exported for tests:
  _hasKey: () => !!getKey(),
};
