// Visual element normalizer — runs server-side before SSE metadata emit.
//
// Purpose: enforce that estimate-preview / change-order-preview / draws-preview
// cards always contain the canonical project_id + client info before they
// reach the frontend. Models occasionally drop project_id from emit even
// when the prompt requires it. Once a card lands at the frontend without
// project_id, every downstream path (chat render, save, edit, send) has
// to guess — and saveEstimate's name-fallback creates wrong links.
//
// Strategy: catch it at the server boundary instead. Resolve project_id
// from clientName / projectName by exact match against the user's
// projects table (same logic as the auto_link_estimate_to_project SQL
// trigger). Copy client_phone / email / address from the project record
// onto the visualElement so the EstimatePreview render path AND the
// frontend save path see complete data.

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Normalize visualElements in place. Returns the array (mutated) so callers
 * can continue to pass the same reference around. No-op when there's
 * nothing to normalize.
 */
async function normalizeVisualElements(visualElements, userId) {
  if (!Array.isArray(visualElements) || visualElements.length === 0) return visualElements;
  if (!userId) return visualElements;

  for (const ve of visualElements) {
    if (!ve || !ve.data) continue;
    if (ve.type === 'estimate-preview') {
      await normalizeEstimatePreview(ve, userId);
    }
  }
  return visualElements;
}

async function normalizeEstimatePreview(ve, userId) {
  const data = ve.data;
  // If project_id is already set, just enrich missing client fields
  // from the project record so the render shows full contact info.
  if (data.project_id || data.projectId) {
    const projectId = data.project_id || data.projectId;
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select('id, name, client_name, client_phone, client_email, client_address')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
      if (proj) {
        data.project_id = proj.id;
        if (!data.projectName) data.projectName = proj.name;
        if (!data.clientName && !data.client?.name) data.clientName = proj.client_name;
        if (!data.clientPhone && !data.client_phone) data.clientPhone = proj.client_phone;
        if (!data.clientEmail) data.clientEmail = proj.client_email;
        if (!data.clientAddress) data.clientAddress = proj.client_address;
      }
    } catch (e) {
      logger.warn('[ve-normalizer] enrich-by-id failed:', e.message);
    }
    return;
  }

  // No project_id — try to resolve from name signal.
  const projectName = data.projectName || data.project_name || null;
  const clientName =
    data.clientName ||
    (typeof data.client === 'string' ? data.client : data.client?.name) ||
    data.client_name ||
    null;

  if (!projectName && !clientName) return; // nothing to match on

  try {
    let matched = null;

    if (projectName) {
      const { data: byName } = await supabase
        .from('projects')
        .select('id, name, client_name, client_phone, client_email, client_address')
        .eq('user_id', userId)
        .ilike('name', projectName)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1);
      if (byName && byName.length > 0) matched = byName[0];
    }

    if (!matched && clientName) {
      const { data: byClient } = await supabase
        .from('projects')
        .select('id, name, client_name, client_phone, client_email, client_address')
        .eq('user_id', userId)
        .ilike('client_name', clientName)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1);
      if (byClient && byClient.length > 0) matched = byClient[0];
    }

    if (matched) {
      data.project_id = matched.id;
      if (!data.projectName) data.projectName = matched.name;
      if (!data.clientName && !data.client?.name) data.clientName = matched.client_name;
      if (!data.clientPhone && !data.client_phone) data.clientPhone = matched.client_phone;
      if (!data.clientEmail) data.clientEmail = matched.client_email;
      if (!data.clientAddress) data.clientAddress = matched.client_address;
      logger.info(`[ve-normalizer] resolved estimate-preview → project ${matched.name} (${matched.id})`);
    } else {
      logger.warn(`[ve-normalizer] could not resolve estimate-preview project — projectName="${projectName}" clientName="${clientName}"`);
    }
  } catch (e) {
    logger.warn('[ve-normalizer] resolve-by-name failed:', e.message);
  }
}

module.exports = { normalizeVisualElements };
