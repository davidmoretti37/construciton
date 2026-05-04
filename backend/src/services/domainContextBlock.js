// Domain context block — injects the user's real projects + clients into
// every chat system prompt so the agent can't hallucinate names that don't
// exist. The single biggest source of hallucination in this codebase was
// the model inventing project / client names out of thin air ("Sarah
// Johnson Kitchen Remodel" when the actual record was "Sarah Bathroom
// Remodel"). Showing the model the real list eliminates the failure mode.
//
// Cost: ~500 tokens per turn for a contractor with 5–10 active projects
// + 15 clients. Lives in the dynamic (non-cached) prompt block because
// it changes when the user creates a new project; that's fine — Haiku
// at $0.80/M input means ~$0.0004 per turn, well below the cost of one
// hallucinated estimate that has to be cleaned up by hand.

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Caps to keep token usage bounded. Tune later if heavy-volume contractors
// hit the ceiling — 50 active projects is already a lot.
const MAX_PROJECTS = 50;
const MAX_CLIENTS = 50;

/**
 * Build a compact, model-friendly snapshot of the owner's domain entities.
 * Returns an empty string when there's nothing to show, so the prompt
 * doesn't grow with empty headers for new users.
 */
async function buildDomainContextBlock(userId) {
  if (!userId) return '';

  try {
    const [projectsRes, clientsRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, client_name, status, contract_amount')
        .eq('user_id', userId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(MAX_PROJECTS),
      supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_CLIENTS),
    ]);

    const projects = projectsRes.data || [];
    const clients = clientsRes.data || [];

    if (projects.length === 0 && clients.length === 0) return '';

    const lines = [];
    lines.push('');
    lines.push('=== DOMAIN CONTEXT — ACTUAL ENTITIES IN THIS USER\'S ACCOUNT ===');
    lines.push('');
    lines.push('CRITICAL: Before emitting an estimate-preview / change-order-preview / draws-preview / invoice-preview that references a project or client, you MUST use one of the entities below. NEVER invent names — if a name the user mentions doesn\'t match anything here, ask which one they mean (or call search_projects to confirm) instead of making one up. Auto-completing "Sarah" to "Sarah Johnson Kitchen Remodel" when the real record is "Sarah Bathroom Remodel" is a hallucination — it corrupts the customer\'s books.');
    lines.push('');

    if (projects.length > 0) {
      lines.push(`Active projects (${projects.length}):`);
      for (const p of projects) {
        const amount = p.contract_amount != null
          ? ` ($${parseFloat(p.contract_amount).toLocaleString('en-US', { maximumFractionDigits: 0 })})`
          : '';
        const status = p.status && p.status !== 'active' ? ` [${p.status}]` : '';
        const client = p.client_name ? ` — client: ${p.client_name}` : '';
        lines.push(`  • ${p.name}${client}${amount}${status} — id: ${p.id}`);
      }
      lines.push('');
    }

    if (clients.length > 0) {
      lines.push(`Clients (${clients.length}):`);
      for (const c of clients) {
        const email = c.email ? ` <${c.email}>` : '';
        lines.push(`  • ${c.full_name}${email}`);
      }
      lines.push('');
    }

    lines.push('=== END DOMAIN CONTEXT ===');
    lines.push('');

    return lines.join('\n');
  } catch (e) {
    logger.warn('[domainContextBlock] build failed:', e.message);
    return '';
  }
}

module.exports = { buildDomainContextBlock };
