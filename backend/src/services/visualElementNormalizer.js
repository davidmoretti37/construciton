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
        .select('id, name, client_name, client_phone, client_email, client_address, contract_amount')
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
        // Fill empty prices using the project's contract_amount
        ensureItemsArePriced(data, proj.contract_amount);
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
        .select('id, name, client_name, client_phone, client_email, client_address, contract_amount')
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
      ensureItemsArePriced(data, matched.contract_amount);
      logger.info(`[ve-normalizer] resolved estimate-preview → project ${matched.name} (${matched.id})`);
    } else {
      logger.warn(`[ve-normalizer] could not resolve estimate-preview project — projectName="${projectName}" clientName="${clientName}"`);
    }
  } catch (e) {
    logger.warn('[ve-normalizer] resolve-by-name failed:', e.message);
  }
}

/**
 * If the model emitted line items but left every price at 0, distribute
 * the project's contract_amount across the items so the user sees a
 * useful starting point instead of TOTAL: $0.00. Default to equal split.
 *
 * This is the system handling pricing instead of relying on the model
 * to do it via a follow-up suggest_pricing call (which it routinely
 * skips). The user can edit any line in the EstimateBuilder afterward;
 * the goal is to never ship a $0 card.
 */
function ensureItemsArePriced(data, contractAmount) {
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.lineItems) ? data.lineItems : null;
  if (!items || items.length === 0) return;

  // Compute the current total. Each item may use price/total/unit_price/pricePerUnit/amount.
  const itemValue = (it) => {
    const qty = Number(it.quantity ?? 1) || 1;
    const unit = Number(it.unit_price ?? it.unitPrice ?? it.pricePerUnit ?? it.price ?? 0) || 0;
    const direct = Number(it.total ?? it.amount ?? 0) || 0;
    return direct > 0 ? direct : qty * unit;
  };

  const currentTotal = items.reduce((sum, it) => sum + itemValue(it), 0);
  if (currentTotal > 0) {
    // Already priced. Just make sure subtotal/total reflect it.
    if (!Number(data.subtotal)) data.subtotal = currentTotal;
    if (!Number(data.total)) data.total = currentTotal;
    return;
  }

  const contract = Number(contractAmount) || 0;
  if (contract <= 0) return; // nothing to distribute

  // Equal split. Round to 2 decimal places. Last item gets the rounding remainder
  // so the sum exactly equals contract.
  const per = Math.floor((contract / items.length) * 100) / 100;
  let runningSum = 0;
  items.forEach((it, idx) => {
    const isLast = idx === items.length - 1;
    const value = isLast ? Math.round((contract - runningSum) * 100) / 100 : per;
    runningSum += value;
    it.quantity = it.quantity ?? 1;
    it.unit = it.unit ?? 'job';
    // Set every common shape so EstimatePreview renders the price no
    // matter which field it reads.
    it.unit_price = value;
    it.unitPrice = value;
    it.pricePerUnit = value;
    it.price = value;
    it.total = value;
    it.amount = value;
  });

  data.subtotal = contract;
  data.total = contract;
  logger.info(`[ve-normalizer] auto-priced estimate: split $${contract} across ${items.length} items`);
}

module.exports = { normalizeVisualElements };
