/**
 * Sub Organization Service
 *
 * Manages global sub identity, dedup by tax_id, and the action-token issuance
 * flow that powers the Sub Magic-Link tier.
 *
 * - GC adds a sub: dedup by EIN/CNPJ; if no match, create org + issue first_claim
 *   token; if match, link via engagement (Sub Free / Owner) or surface existing.
 * - GC requests a doc: issue an upload_doc token, email the sub.
 * - Sub redeems token: backend executes the scoped action (upload, sign, etc.)
 *   and consumes the token.
 *
 * All Supabase access uses the service-role key; ownership is enforced
 * manually at every entry point.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

function getEmailService() {
  // Lazy-load to avoid eager Resend init in test env (matches eSignService pattern)
  // eslint-disable-next-line global-require
  return require('./emailService');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TOKEN_TTL_HOURS = {
  upload_doc: 14 * 24,
  sign_contract: 14 * 24,
  submit_bid: 14 * 24,
  upgrade_invite: 30 * 24,
  signup_invite: 30 * 24,
  first_claim: 30 * 24,
};

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function normalizeTaxId(taxId) {
  if (!taxId) return null;
  return String(taxId).replace(/[^0-9A-Za-z]/g, '');
}

// =============================================================================
// Sub Org CRUD
// =============================================================================

/**
 * Find a sub_organizations row by tax_id (with dedup-friendly normalization).
 * Returns the row or null.
 */
async function findByTaxId({ countryCode = 'US', taxIdType = 'ein', taxId }) {
  const normalized = normalizeTaxId(taxId);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('sub_organizations')
    .select('*')
    .eq('country_code', countryCode)
    .eq('tax_id_type', taxIdType)
    .eq('tax_id', normalized)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('[subOrgService] findByTaxId error:', error);
    throw error;
  }
  return data || null;
}

/**
 * GC adds a sub. Dedups by tax_id; if existing, returns it. If new, creates
 * a sub_organizations row and issues a first_claim action token.
 *
 * Returns: { sub_organization, action_token: { raw, expires_at } | null, was_existing: boolean }
 */
async function addSubByGc({
  gcUserId,
  legalName,
  primaryEmail,
  primaryPhone = null,
  taxId = null,
  taxIdType = 'ein',
  countryCode = 'US',
  trades = [],
}) {
  if (!gcUserId) throw new Error('gcUserId required');
  if (!legalName) throw new Error('legalName required');
  if (!primaryEmail) throw new Error('primaryEmail required');

  const normalizedTaxId = normalizeTaxId(taxId);

  // 1. Dedup check (only if tax_id provided)
  let existing = null;
  if (normalizedTaxId) {
    existing = await findByTaxId({ countryCode, taxIdType, taxId: normalizedTaxId });
  }

  if (existing) {
    return { sub_organization: existing, action_token: null, was_existing: true };
  }

  // 2. Create new sub_organization
  const { data: created, error: insertErr } = await supabase
    .from('sub_organizations')
    .insert({
      legal_name: legalName,
      primary_email: primaryEmail,
      primary_phone: primaryPhone,
      tax_id: normalizedTaxId,
      tax_id_type: normalizedTaxId ? taxIdType : 'none',
      country_code: countryCode,
      trades,
      created_by_gc_user_id: gcUserId,
    })
    .select()
    .single();

  if (insertErr) {
    logger.error('[subOrgService] addSubByGc insert error:', insertErr);
    throw insertErr;
  }

  // 3. Issue first_claim action token (kept as a fallback path for ops/CLI;
  //    the primary flow is now: sub installs Sylk, signs up with their
  //    email, and the backend auto-links them to this row on portal access.)
  const actionToken = await issueActionToken({
    subOrganizationId: created.id,
    scope: 'first_claim',
    createdBy: gcUserId,
  });

  // 4. Send invitation email — the sub uses the standard signup flow,
  //    NOT a magic link. Their email is what links them to this record.
  try {
    const { data: gcProfile } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', gcUserId)
      .maybeSingle();
    const emailSvc = getEmailService();
    const result = await emailSvc.sendSubInvitationEmail({
      subEmail: primaryEmail,
      subName: legalName,
      businessName: gcProfile?.business_name || 'Your contractor',
      ownerName: gcProfile?.business_name,
      signupUrl: process.env.SYLK_SIGNUP_URL || null,
    });
    if (!result.sent) {
      logger.warn('[subOrgService] sendSubInvitationEmail not sent:', result.reason || result.error);
    }
  } catch (e) {
    logger.warn('[subOrgService] sendSubInvitationEmail error (non-fatal):', e.message);
  }

  return { sub_organization: created, action_token: actionToken, was_existing: false };
}

// =============================================================================
// findUnclaimedByEmail — used at sign-up to auto-link by email match
// =============================================================================

/**
 * Find an unclaimed sub_organization whose primary_email matches (case-insensitive).
 * Returns the row or null.
 */
async function findUnclaimedByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from('sub_organizations')
    .select('*')
    .ilike('primary_email', email.trim())
    .is('auth_user_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[subOrgService] findUnclaimedByEmail error:', error);
    throw error;
  }
  return data || null;
}

/**
 * Link an existing sub_organizations row to an authenticated user (set
 * auth_user_id + claimed_at). Used by the auto-link-by-email flow at
 * sign-up or first sub-portal access.
 */
async function linkSubToAuthUser({ subOrganizationId, authUserId }) {
  const { data, error } = await supabase
    .from('sub_organizations')
    .update({
      auth_user_id: authUserId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', subOrganizationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Returns sub_organizations the GC has access to (creator OR has engagement).
 */
async function listSubsForGc(gcUserId) {
  const { data, error } = await supabase
    .from('sub_organizations')
    .select(`
      *,
      engagements:sub_engagements!sub_organization_id (
        id, project_id, status, contract_amount, trade
      )
    `)
    .or(`created_by_gc_user_id.eq.${gcUserId},id.in.(${await subIdsWithEngagement(gcUserId)})`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[subOrgService] listSubsForGc error:', error);
    throw error;
  }
  return data || [];
}

async function subIdsWithEngagement(gcUserId) {
  const { data, error } = await supabase
    .from('sub_engagements')
    .select('sub_organization_id')
    .eq('gc_user_id', gcUserId);
  if (error) return '';
  const ids = [...new Set((data || []).map((r) => r.sub_organization_id))];
  // Returns a comma-joined list for the .or(...id.in.(...)) filter; empty
  // string would invalidate the syntax, so use a sentinel UUID when empty.
  return ids.length ? ids.join(',') : '00000000-0000-0000-0000-000000000000';
}

/**
 * Get a single sub_organization by ID, scoped to GC access.
 */
async function getSubForGc({ subOrgId, gcUserId }) {
  const { data, error } = await supabase
    .from('sub_organizations')
    .select('*')
    .eq('id', subOrgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[subOrgService] getSubForGc error:', error);
    throw error;
  }
  if (!data) return null;

  // Access check: creator OR engagement
  if (data.created_by_gc_user_id === gcUserId) return data;

  const { data: engagement } = await supabase
    .from('sub_engagements')
    .select('id')
    .eq('sub_organization_id', subOrgId)
    .eq('gc_user_id', gcUserId)
    .neq('status', 'cancelled')
    .limit(1);

  if (engagement && engagement.length > 0) return data;

  // No access
  return null;
}

/**
 * GC edits an unclaimed sub's profile. Once claimed (auth_user_id set),
 * only the sub themselves can edit.
 */
async function updateSubByGc({ subOrgId, gcUserId, updates }) {
  const sub = await getSubForGc({ subOrgId, gcUserId });
  if (!sub) throw new Error('Sub not found or access denied');
  if (sub.auth_user_id) {
    throw new Error('Sub has claimed their account; only they can edit their profile');
  }
  if (sub.created_by_gc_user_id !== gcUserId) {
    throw new Error('Only the originating GC can edit an unclaimed sub');
  }

  const allowed = [
    'legal_name', 'dba', 'primary_email', 'primary_phone', 'website',
    'address_line1', 'address_line2', 'city', 'state_code', 'postal_code',
    'trades', 'service_states', 'tax_id', 'tax_id_type', 'country_code',
  ];
  const cleaned = {};
  for (const k of allowed) {
    if (k in updates) cleaned[k] = updates[k];
  }
  if (cleaned.tax_id) cleaned.tax_id = normalizeTaxId(cleaned.tax_id);

  const { data, error } = await supabase
    .from('sub_organizations')
    .update(cleaned)
    .eq('id', subOrgId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// =============================================================================
// Action Token issuance + redemption
// =============================================================================

/**
 * Issues a single-use action token tied to a sub_organization and a scope.
 * Returns: { id, raw, expires_at, scope }. The raw token is only ever
 * returned at creation time — only the sha256 hash is stored.
 */
async function issueActionToken({
  subOrganizationId,
  scope,
  engagementId = null,
  subcontractId = null,
  bidRequestId = null,
  docTypeRequested = null,
  createdBy = null,
}) {
  if (!subOrganizationId) throw new Error('subOrganizationId required');
  if (!TOKEN_TTL_HOURS[scope]) throw new Error(`unknown token scope: ${scope}`);

  const raw = generateToken();
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS[scope] * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('sub_action_tokens')
    .insert({
      sub_organization_id: subOrganizationId,
      token_hash: tokenHash,
      scope,
      engagement_id: engagementId,
      subcontract_id: subcontractId,
      bid_request_id: bidRequestId,
      doc_type_requested: docTypeRequested,
      expires_at: expiresAt,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    logger.error('[subOrgService] issueActionToken error:', error);
    throw error;
  }

  return {
    id: data.id,
    raw,
    expires_at: expiresAt,
    scope,
  };
}

/**
 * Validate a raw token and return the row + sub_organization.
 * Does NOT consume the token — caller must call consumeActionToken on success.
 */
async function lookupActionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = sha256Hex(rawToken);

  const { data: token, error } = await supabase
    .from('sub_action_tokens')
    .select('*, sub_organization:sub_organizations(*)')
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .maybeSingle();

  if (error) {
    logger.error('[subOrgService] lookupActionToken error:', error);
    throw error;
  }
  if (!token) return null;
  if (new Date(token.expires_at) < new Date()) return null;

  return token;
}

/**
 * Mark token consumed. Idempotent — re-marking is a no-op.
 */
async function consumeActionToken(tokenId) {
  await supabase
    .from('sub_action_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenId)
    .is('used_at', null);
}

// =============================================================================
// Claim flow (sub takes ownership of their record by signing up)
// =============================================================================

/**
 * Called when a sub signs up via /api/sub-portal/auth/signup AFTER redeeming
 * a first_claim or signup_invite token. Creates an auth.users row, sets
 * sub_organizations.auth_user_id, and inserts a profiles row with role='sub'.
 *
 * Returns: { user, sub_organization } on success.
 */
async function claimSubAccount({
  subOrganizationId,
  email,
  password,
}) {
  // 1. Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) {
    logger.error('[subOrgService] claimSubAccount createUser error:', authErr);
    throw authErr;
  }
  const newUser = authData.user;

  // 2. Insert profiles row (role='sub', subscription_tier='free')
  const { error: profileErr } = await supabase
    .from('profiles')
    .insert({
      id: newUser.id,
      role: 'sub',
      subscription_tier: 'free',
      business_email: email,
    });
  if (profileErr) {
    logger.error('[subOrgService] claimSubAccount profile insert error:', profileErr);
    // Best-effort cleanup
    await supabase.auth.admin.deleteUser(newUser.id).catch(() => {});
    throw profileErr;
  }

  // 3. Link sub_organization
  const { data: sub, error: linkErr } = await supabase
    .from('sub_organizations')
    .update({
      auth_user_id: newUser.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', subOrganizationId)
    .select()
    .single();
  if (linkErr) {
    logger.error('[subOrgService] claimSubAccount link error:', linkErr);
    throw linkErr;
  }

  return { user: newUser, sub_organization: sub };
}

/**
 * Convert a Sub Free user to a Sub Paid Owner. Called from upgrade_invite
 * token redemption OR from a logged-in sub clicking "Upgrade".
 *
 * - profiles.subscription_tier → 'solo'
 * - sub_organizations.upgraded_at = now()
 * - (Stripe trial start happens at the route layer; this fn just marks state)
 */
async function upgradeSubToOwner({ subOrganizationId }) {
  const { data: sub, error: subErr } = await supabase
    .from('sub_organizations')
    .select('id, auth_user_id')
    .eq('id', subOrganizationId)
    .single();
  if (subErr) throw subErr;
  if (!sub.auth_user_id) {
    throw new Error('Cannot upgrade: sub has not claimed their account yet');
  }

  await supabase
    .from('profiles')
    .update({ subscription_tier: 'solo' })
    .eq('id', sub.auth_user_id);

  const { data: updated, error: updErr } = await supabase
    .from('sub_organizations')
    .update({ upgraded_at: new Date().toISOString() })
    .eq('id', subOrganizationId)
    .select()
    .single();
  if (updErr) throw updErr;
  return updated;
}

module.exports = {
  // CRUD
  findByTaxId,
  findUnclaimedByEmail,
  linkSubToAuthUser,
  addSubByGc,
  listSubsForGc,
  getSubForGc,
  updateSubByGc,
  // Action tokens
  issueActionToken,
  lookupActionToken,
  consumeActionToken,
  // Account flow
  claimSubAccount,
  upgradeSubToOwner,
  // Helpers (exported for tests)
  normalizeTaxId,
  sha256Hex,
};
