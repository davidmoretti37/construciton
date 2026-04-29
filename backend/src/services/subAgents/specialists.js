/**
 * Foreman sub-agent specialists — Phase 5.
 *
 * Each specialist is a small, focused agent with:
 *   - a restricted tool set (subset of the registry)
 *   - a dedicated system prompt tuned for its domain
 *   - a model tier hint (most run on Haiku; Researcher escalates to
 *     Sonnet when synthesis-heavy)
 *   - a hard iteration cap so a misbehaving sub-agent can't run forever
 *
 * The orchestrator (main Foreman) dispatches to these via the
 * `dispatch_subagent` tool. A sub-agent runs in an isolated context —
 * it doesn't see the orchestrator's tool history, only the task brief
 * and any explicit context the orchestrator handed over.
 *
 * Why specialists instead of a single big agent: smaller tool surface
 * = better tool selection accuracy (Anthropic's research shows tool
 * count strongly affects accuracy past ~30 tools); restricted tool set
 * = approval-gate failure modes are bounded; specialized prompt = more
 * domain-correct phrasing without bloating the main system prompt.
 *
 * This module is registry-driven. Adding a sub-agent is one entry below
 * + an orchestrator system-prompt update telling Foreman when to call it.
 */

const registry = require('../tools/registry');
const { CATEGORIES, RISK_LEVELS } = require('../tools/categories');

/**
 * @typedef {Object} SpecialistDef
 * @property {string} kind            — short id (used in the dispatch tool args)
 * @property {string} name            — human-readable name
 * @property {string} description     — why this specialist exists; used in the
 *                                       orchestrator's system prompt
 * @property {string[]} categories    — tool categories this specialist can use
 * @property {string[]} extraTools    — tools to add even if their category isn't included
 * @property {Set<string>} riskAllowList — risk levels permitted (read/write_safe by
 *                                       default; only Bookkeeper / Communicator
 *                                       can write_destructive / external_write)
 * @property {string} model           — 'haiku' | 'sonnet'
 * @property {number} maxIterations   — hard cap on agent loop rounds
 * @property {string} systemPrompt    — full prompt for this specialist
 */

const SPECIALISTS = {
  // ─────────────────────────────────────────────────────────────────
  // Researcher — read-only synthesis. "Audit X", "summarize Y".
  // ─────────────────────────────────────────────────────────────────
  researcher: {
    kind: 'researcher',
    name: 'Researcher',
    description: 'Pulls data, runs analytics, writes summaries. Read-only — never mutates state. Use for "audit", "summarize", "what happened with X", "explain Y", "build me a report".',
    categories: [
      CATEGORIES.PROJECTS,
      CATEGORIES.ESTIMATES,
      CATEGORIES.INVOICES,
      CATEGORIES.EXPENSES,
      CATEGORIES.TRANSACTIONS,
      CATEGORIES.FINANCIAL_REPORTS,
      CATEGORIES.BANK,
      CATEGORIES.WORKERS,
      CATEGORIES.SCHEDULING,
      CATEGORIES.SERVICE_PLANS,
      CATEGORIES.DOCUMENTS,
      CATEGORIES.REPORTS,
      CATEGORIES.SEARCH,
      CATEGORIES.BRIEFING,
    ],
    extraTools: [],
    riskAllowList: new Set([RISK_LEVELS.READ]),
    model: 'sonnet', // synthesis is the value-add; pay for the better reasoning
    maxIterations: 6,
    systemPrompt: `You are RESEARCHER, a Foreman sub-agent specialized in pulling data and writing concise summaries for service-business owners.

Your job:
  - Use READ-ONLY tools to pull whatever data the task brief asks about.
  - Synthesize into a clean answer. Numbers + the one-line takeaway.
  - You CANNOT mutate state — no creates, updates, deletes, sends. If
    the task implies a mutation, surface that as a recommendation in
    your summary; the parent agent will execute.

Output format:
  - 3-6 sentences max. Lead with numbers. End with the key insight.
  - No greetings, no closing. Just the answer.

Tool guidance:
  - For "how is project X doing?" → get_project_summary (one call).
  - For "audit project X" → get_project_details + get_project_financials + get_daily_reports.
  - For "what's overdue?" → get_ar_aging.
  - Cross-cutting questions: global_search first, then the specific tool for whatever it returns.
  - Default to ONE tool per question. Two if a real dependency forces it.

You are speaking to another AI (the orchestrator), not the end user. Skip pleasantries; output dense data.`,
  },

  // ─────────────────────────────────────────────────────────────────
  // Builder — project + service-plan + estimate creation.
  // ─────────────────────────────────────────────────────────────────
  builder: {
    kind: 'builder',
    name: 'Builder',
    description: 'Creates and edits projects, service plans, estimates. Use for "create a kitchen remodel for X", "set up a weekly cleaning route for Y", "draft an estimate for Z".',
    categories: [
      CATEGORIES.PROJECTS,
      CATEGORIES.ESTIMATES,
      CATEGORIES.SERVICE_PLANS,
      CATEGORIES.SCHEDULING,
      CATEGORIES.SEARCH,
    ],
    extraTools: ['suggest_pricing', 'global_search'],
    riskAllowList: new Set([RISK_LEVELS.READ, RISK_LEVELS.WRITE_SAFE]),
    model: 'sonnet', // structured creation benefits from better reasoning
    maxIterations: 5,
    systemPrompt: `You are BUILDER, a Foreman sub-agent specialized in creating projects, service plans, and estimates for service-business owners.

Your job:
  - Take a creation brief from the orchestrator and produce the
    appropriate visual-element card (project-preview / service-plan-preview
    / estimate-preview) for the user to confirm.
  - You CAN call write_safe tools (create_*, update_*) when the task
    explicitly says to commit, not just preview.
  - You CANNOT delete, void, or send anything to a third party.

Output format:
  - Emit the card as a visualElement.
  - Add a one-sentence summary of what's in the card.

You are speaking to the orchestrator, which speaks to the user. Be concise.`,
  },

  // ─────────────────────────────────────────────────────────────────
  // Bookkeeper — financial mutations. Bank reconciliation, expenses.
  // ─────────────────────────────────────────────────────────────────
  bookkeeper: {
    kind: 'bookkeeper',
    name: 'Bookkeeper',
    description: 'Records expenses, reconciles bank charges, categorizes transactions. Use for "record this expense", "reconcile that Home Depot charge", "categorize last month\'s bank activity".',
    categories: [
      CATEGORIES.EXPENSES,
      CATEGORIES.TRANSACTIONS,
      CATEGORIES.BANK,
      CATEGORIES.INVOICES,
      CATEGORIES.FINANCIAL_REPORTS,
      CATEGORIES.SEARCH,
    ],
    // Bookkeeper needs to LOOK UP projects to attach expenses, but it
    // must not be able to mutate the project itself. We add read-only
    // project tools as explicit extras instead of including the
    // PROJECTS category wholesale (which would expose destructive
    // tools like delete_project + create_project_phase).
    extraTools: ['search_projects', 'get_project_details', 'get_project_financials', 'get_project_summary'],
    riskAllowList: new Set([RISK_LEVELS.READ, RISK_LEVELS.WRITE_SAFE, RISK_LEVELS.WRITE_DESTRUCTIVE]),
    model: 'haiku',
    maxIterations: 5,
    systemPrompt: `You are BOOKKEEPER, a Foreman sub-agent specialized in financial recording and reconciliation for service-business owners.

Your job:
  - Record expenses, assign bank transactions to projects, update
    invoice statuses, void invoices when the user has confirmed.
  - You CAN call write_destructive financial tools (void_invoice,
    delete_expense), but the approval-gate framework still gates them
    — never assume confirmation; surface the pending action and let the
    orchestrator handle the user confirmation flow.

Output format:
  - One sentence per action: "Recorded $1,230 Home Depot to Garcia
    project, materials category." Numbers, name the project.
  - If you blocked on the approval gate, say so clearly — the
    orchestrator needs to pass the confirm UX up to the user.

Speak like an accountant: precise, dry, numerical.`,
  },

  // ─────────────────────────────────────────────────────────────────
  // Communicator — outbound. Share docs, request signatures.
  // ─────────────────────────────────────────────────────────────────
  communicator: {
    kind: 'communicator',
    name: 'Communicator',
    description: 'Shares documents with clients, requests e-signatures. Use for "send the Davis estimate", "get the Smith contract signed".',
    categories: [
      CATEGORIES.DOCUMENTS,
      CATEGORIES.ESTIMATES,
      CATEGORIES.INVOICES,
      CATEGORIES.SEARCH,
    ],
    extraTools: [],
    // Communicator can fire external_write tools — but the approval
    // gate still gates each call. Sub-agent isolation does not bypass
    // the gate.
    riskAllowList: new Set([RISK_LEVELS.READ, RISK_LEVELS.WRITE_SAFE, RISK_LEVELS.EXTERNAL_WRITE]),
    model: 'haiku',
    maxIterations: 4,
    systemPrompt: `You are COMMUNICATOR, a Foreman sub-agent specialized in outbound client communication for service-business owners.

Your job:
  - Share documents (estimates, invoices, contracts) via the existing
    share_document tool, with the right method (email by default).
  - Request e-signatures when the user asked to.
  - You CANNOT send SMS — that capability is disabled at the product
    level. If the brief mentions "text the customer", surface that as
    a constraint and offer email instead.

Approval gate behavior:
  - external_write tools (share_document, request_signature) ALWAYS
    fire the gate. You'll get a "blocked, awaiting approval" result on
    the first call. Surface that to the orchestrator — do NOT retry.
  - The orchestrator will get the user's confirmation and re-issue.

Output format: one sentence. "Sending estimate EST-2025-018 to Carolyn at carolyn@…" — name the document, name the recipient.`,
  },
};

/**
 * Build the actual tool list a specialist sees, given the registry.
 * Filters by category + adds explicit extras + applies the risk-allow
 * list. Returns full OpenAI-style tool definitions.
 */
function getToolsForSpecialist(spec, allTools) {
  const allowedNames = new Set();
  // 1) Add all tools whose category is in the specialist's list
  for (const cat of spec.categories) {
    for (const name of registry.getToolsByCategory(cat)) {
      allowedNames.add(name);
    }
  }
  // 2) Add explicit extras (e.g. global_search even if its category isn't included)
  for (const name of spec.extraTools || []) {
    allowedNames.add(name);
  }
  // 3) Filter by risk-level allow list
  const filtered = [];
  for (const name of allowedNames) {
    const meta = registry.getMetadata(name);
    if (!meta) continue;
    if (!spec.riskAllowList.has(meta.risk_level)) continue;
    filtered.push(name);
  }
  // 4) Map to definitions
  const allowedSet = new Set(filtered);
  return allTools.filter(t => allowedSet.has(t.function?.name));
}

function listSpecialists() {
  return Object.values(SPECIALISTS);
}

function getSpecialist(kind) {
  return SPECIALISTS[kind] || null;
}

module.exports = {
  SPECIALISTS,
  listSpecialists,
  getSpecialist,
  getToolsForSpecialist,
};
