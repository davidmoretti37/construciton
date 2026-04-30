/**
 * Tool handlers — estimates and pricing intelligence.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission,
  resolveOwnerId, resolveProjectId, resolveEstimateId,
} = require('./_shared');

async function search_estimates(userId, args = {}) {
  const { query, status, project_id } = args;

  let q = supabase
    .from('estimates')
    .select('id, estimate_number, client_name, project_name, total, status, created_at, project_id')
    .eq('user_id', userId);

  if (query) {
    const filter = buildWordSearch(query, ['client_name', 'project_name', 'estimate_number']);
    if (filter) q = q.or(filter);
  }
  if (status) {
    q = q.eq('status', status);
  }
  if (project_id) {
    q = q.eq('project_id', project_id);
  }

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);

  if (error) {
    logger.error('search_estimates error:', error);
    return { error: error.message };
  }

  return data || [];
}

async function get_estimate_details(userId, args) {
  let { estimate_id } = args;

  // Resolve name/number to UUID if needed
  const resolved = await resolveEstimateId(userId, estimate_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  estimate_id = resolved.id;

  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimate_id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { error: 'Estimate not found' };
  }

  return data;
}

async function update_estimate(userId, args = {}) {
  const gate = await requireSupervisorPermission(userId, 'can_create_estimates');
  if (gate) return gate;
  const { estimate_id, project_id, status } = args;

  if (!estimate_id) {
    return { error: 'estimate_id is required' };
  }

  const updates = {};
  if (project_id !== undefined) updates.project_id = project_id;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update' };
  }

  const { data, error } = await supabase
    .from('estimates')
    .update(updates)
    .eq('id', estimate_id)
    .eq('user_id', userId)
    .select('*, projects(id, name)')
    .single();

  if (error) {
    logger.error('update_estimate error:', error);
    return { error: error.message };
  }

  // Auto-update project contract_amount when linking estimate to project
  if (project_id && data.total) {
    const { error: projectError } = await supabase
      .from('projects')
      .update({ contract_amount: data.total })
      .eq('id', project_id);

    if (projectError) {
      logger.error('Failed to update project contract_amount:', projectError);
      // Don't fail the whole operation - estimate is still linked
    } else {
      logger.info(`✅ Auto-updated project ${project_id} contract_amount to ${data.total}`);
    }
  }

  return {
    success: true,
    estimate: {
      id: data.id,
      estimate_number: data.estimate_number,
      client_name: data.client_name,
      total: data.total,
      project_id: data.project_id,
      project_name: data.projects?.name || null
    }
  };
}

// ==================== INVOICES ====================

async function suggest_pricing(userId, args) {
  const { items, complexity } = args;

  if (!items || items.length === 0) {
    return { suggestions: [] };
  }

  // Fetch all pricing history for this user
  const { data: history } = await supabase
    .from('pricing_history')
    .select('work_description, quantity, unit, price_per_unit, total_amount, complexity, confidence_weight, scope_keywords')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500);

  // Fetch user's service items for default pricing
  const { data: userServices } = await supabase
    .from('user_services')
    .select('pricing, custom_items, service_categories(name)')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const suggestions = [];

  for (const item of items) {
    const itemLower = item.toLowerCase();
    const suggestion = { item, sources: [] };

    // Search pricing history for matches
    if (history && history.length > 0) {
      const matches = history.filter(h => {
        const descLower = (h.work_description || '').toLowerCase();
        const keywords = (h.scope_keywords || []).map(k => k.toLowerCase());
        // Check if any word in the item appears in historical description or keywords
        const itemWords = itemLower.split(/\s+/).filter(w => w.length > 3);
        return itemWords.some(word => descLower.includes(word) || keywords.some(k => k.includes(word)));
      });

      if (matches.length > 0) {
        // Weight by confidence
        let weightedSum = 0, totalWeight = 0;
        for (const m of matches) {
          const weight = m.confidence_weight || 1.0;
          weightedSum += (m.price_per_unit || 0) * weight;
          totalWeight += weight;
        }

        suggestion.avgPricePerUnit = totalWeight > 0 ? Math.round(weightedSum / totalWeight * 100) / 100 : null;
        suggestion.priceRange = {
          low: Math.min(...matches.map(m => m.price_per_unit || 0)),
          high: Math.max(...matches.map(m => m.price_per_unit || 0)),
        };
        suggestion.unit = matches[0].unit || 'job';
        suggestion.dataPoints = matches.length;
        suggestion.sources.push('pricing_history');
      }
    }

    // Fallback: check service item default pricing
    if (suggestion.sources.length === 0 && userServices) {
      for (const svc of userServices) {
        const customItems = svc.custom_items || [];
        const pricing = svc.pricing || {};
        for (const ci of customItems) {
          if (ci.name && ci.name.toLowerCase().includes(itemLower.substring(0, 8))) {
            suggestion.avgPricePerUnit = pricing[ci.id]?.price || ci.default_price || null;
            suggestion.unit = ci.unit || 'job';
            suggestion.sources.push('service_catalog');
            break;
          }
        }
        if (suggestion.sources.length > 0) break;
      }
    }

    // Complexity adjustment
    if (suggestion.avgPricePerUnit && complexity) {
      const multiplier = complexity === 'complex' ? 1.15 : complexity === 'simple' ? 0.9 : 1.0;
      suggestion.adjustedPrice = Math.round(suggestion.avgPricePerUnit * multiplier * 100) / 100;
      suggestion.complexityAdjustment = complexity;
    }

    suggestions.push(suggestion);
  }

  return {
    suggestions,
    hasHistoricalData: suggestions.some(s => s.sources.includes('pricing_history')),
    note: suggestions.every(s => s.sources.length === 0)
      ? 'No historical pricing data found. Prices will improve as you create more estimates and projects.'
      : null,
  };
}

/**
 * Assign a worker to a project for its full duration.
 * Creates a project_assignment and optionally a work schedule.
 */
async function convert_estimate_to_invoice(userId, { estimate_id }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;
  const resolved = await resolveEstimateId(userId, estimate_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Fetch the full estimate
  const { data: estimate, error: estErr } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .single();

  if (estErr || !estimate) return { error: 'Estimate not found' };

  // Calculate due date (30 days from now)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  // Insert invoice (invoice_number auto-generated by DB trigger)
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      estimate_id: estimate.id,
      project_id: estimate.project_id || null,
      client_name: estimate.client_name,
      client_email: estimate.client_email,
      client_phone: estimate.client_phone,
      client_address: estimate.client_address,
      project_name: estimate.project_name,
      items: estimate.items,
      subtotal: estimate.subtotal,
      tax_rate: estimate.tax_rate,
      tax_amount: estimate.tax_amount,
      total: estimate.total,
      due_date: dueDateStr,
      payment_terms: estimate.payment_terms || 'Net 30',
      notes: estimate.notes,
      status: 'unpaid',
    })
    .select()
    .single();

  if (invErr) return userSafeError(invErr, "Couldn't create that invoice.");

  // Update estimate status to accepted
  await supabase
    .from('estimates')
    .update({ status: 'accepted', accepted_date: new Date().toISOString() })
    .eq('id', estimate.id);

  return {
    success: true,
    invoice: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      project_name: invoice.project_name,
      total: parseFloat(invoice.total),
      due_date: invoice.due_date,
      status: invoice.status,
      items: invoice.items,
    },
  };
}


module.exports = {
  search_estimates,
  get_estimate_details,
  update_estimate,
  suggest_pricing,
  convert_estimate_to_invoice,
};
