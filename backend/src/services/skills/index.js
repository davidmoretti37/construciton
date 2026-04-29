/**
 * Skills — Phase 6.
 *
 * A "skill" is a named capability bundle: { template, toolSubset,
 * examples, fewShotPrompt }. The orchestrator invokes a skill via the
 * `invoke_skill` runtime tool, the runner executes the bundle as a
 * focused mini-loop, and the result comes back as a structured payload
 * the orchestrator integrates into its reply.
 *
 * Why skills exist as a distinct concept from sub-agents:
 *   - Sub-agents are FUNCTIONAL specialists (Researcher = read,
 *     Builder = create, etc.) — broad, multi-purpose.
 *   - Skills are TASK-SPECIFIC playbooks (audit_project, weekly_review,
 *     draft_estimate_for_repeat_client) — narrow, deterministic.
 *
 * Skills give the orchestrator a way to invoke "do this exact known
 * recipe" instead of describing a new workflow each time. Cheaper than
 * delegating to a sub-agent because the recipe is in code.
 *
 * Phase 6 ships three reference skills. The pattern is registry-driven
 * so adding a new skill is one entry below + an orchestrator hint.
 */

const logger = require('../../utils/logger');

const SKILLS = {
  // ─────────────────────────────────────────────────────────────────
  // audit_project — pull every signal on a project + write a 1-page summary
  // ─────────────────────────────────────────────────────────────────
  audit_project: {
    name: 'audit_project',
    description: 'Pulls every signal on a project (financials, daily reports, photos, time records, change history) and produces a structured one-page summary. Use when the owner asks for a project audit, a status report for a client, or a deep-dive on how a job is doing.',
    toolWhitelist: [
      'search_projects',
      'get_project_details',
      'get_project_summary',
      'get_project_financials',
      'get_project_health',
      'get_daily_reports',
      'get_photos',
      'get_time_records',
      'get_entity_history',
    ],
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project name or UUID. Names are auto-resolved.' },
        start_date: { type: 'string', description: 'Optional start of audit window (YYYY-MM-DD).' },
        end_date: { type: 'string', description: 'Optional end of audit window (YYYY-MM-DD).' },
      },
      required: ['project_id'],
    },
    /**
     * Skill executor. Drives a focused mini-loop with the LLM, but the
     * loop is shaped by the skill recipe rather than emergent agent
     * behavior. Returns a structured result the orchestrator can render.
     */
    async run({ args, userId, runSubAgent, writer }) {
      const projectId = args.project_id;
      if (!projectId) return { error: 'project_id is required' };
      // Defer to the Researcher sub-agent with a tightly-scoped task.
      // This keeps the LLM call disciplined while reusing all the
      // existing infrastructure (tools, approval gate, trace ids).
      const window = (args.start_date && args.end_date)
        ? ` for the window ${args.start_date} → ${args.end_date}`
        : '';
      const task = `Audit project "${projectId}"${window}. Pull: project details, financials, daily reports, photos, time records, change history. Produce a one-page summary with: project name + status + % complete, total spend vs contract, days behind/ahead, last 3 daily reports highlighting concerns, top 3 most active workers by hours, any recent destructive changes (deletions, voids). Lead with the top-line: contract / spent / margin / days-on-target. End with a 1-sentence "what to do next" recommendation. Be concrete; numbers over adjectives.`;
      return runSubAgent({
        kind: 'researcher',
        task,
        parentContext: { project_id: projectId, audit_window: { start: args.start_date, end: args.end_date } },
        userId,
        writer,
      });
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // weekly_review — what changed in the business this week, with insights
  // ─────────────────────────────────────────────────────────────────
  weekly_review: {
    name: 'weekly_review',
    description: 'Compiles a weekly business review: invoices sent, money in, expenses booked, projects that progressed, workers who worked, anything overdue. Use when the owner asks "how was my week?" or "weekly summary".',
    toolWhitelist: [
      'get_business_briefing',
      'get_cash_flow',
      'get_ar_aging',
      'get_payroll_summary',
      'get_daily_reports',
      'search_invoices',
      'search_estimates',
      'get_workers',
    ],
    parameters: {
      type: 'object',
      properties: {
        week_start: { type: 'string', description: 'Optional start date (YYYY-MM-DD). Defaults to last Monday.' },
      },
    },
    async run({ args, userId, runSubAgent, writer }) {
      const start = args.week_start || '(last Monday)';
      const task = `Compile a weekly review for the business starting ${start}. Pull cash flow, AR aging, payroll summary, daily reports for the week, and any invoices/estimates created or paid. Format: 4 short sections — MONEY (in/out/owed), WORK (projects + workers active), CONCERNS (overdue invoices, projects behind, missing reports), NEXT WEEK (1-line ask). Numbers over adjectives. End with one specific action the owner should take Monday.`;
      return runSubAgent({
        kind: 'researcher',
        task,
        parentContext: { week_start: args.week_start || null },
        userId,
        writer,
      });
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // draft_estimate — pull comparable past projects, propose line items
  // ─────────────────────────────────────────────────────────────────
  draft_estimate: {
    name: 'draft_estimate',
    description: 'Drafts an estimate by pulling pricing patterns from comparable past projects/estimates and proposing line items. Returns an estimate-preview structure the user confirms. Use when the owner says "draft me an estimate for X" with a concrete description but no line items yet.',
    toolWhitelist: [
      'suggest_pricing',
      'search_estimates',
      'search_projects',
      'get_business_settings',
      'get_business_contracts',
    ],
    parameters: {
      type: 'object',
      properties: {
        client_name: { type: 'string' },
        scope: { type: 'string', description: 'One-paragraph description of the work to be quoted.' },
        target_amount: { type: 'number', description: 'Optional target total (USD). Helps the skill anchor pricing.' },
      },
      required: ['scope'],
    },
    async run({ args, userId, runSubAgent, writer }) {
      const target = Number.isFinite(args.target_amount) ? `, target ~$${Math.round(args.target_amount)}` : '';
      const task = `Draft an estimate for: ${args.scope}${args.client_name ? ` (client: ${args.client_name})` : ''}${target}. Pull suggest_pricing for the relevant trade and look at the user's past estimates for comparable scopes. Return a structured proposal with: line items (description, quantity, unit, price, total), subtotal, recommended margin %, total. Keep line items at the user's typical granularity — 4-8 items for a residential job, 8-15 for commercial. End with 1 sentence on price confidence ("strong match — 4 comparable past jobs averaged $42k") or note when historical data is thin.`;
      return runSubAgent({
        kind: 'builder',
        task,
        parentContext: { client_name: args.client_name || null, scope: args.scope, target_amount: args.target_amount || null },
        userId,
        writer,
      });
    },
  },
};

function listSkills() {
  return Object.values(SKILLS);
}

function getSkill(name) {
  return SKILLS[name] || null;
}

/**
 * Build the runtime tool definition the orchestrator uses to invoke a
 * skill. Generated from the registry so adding a skill auto-extends
 * the tool's `name` enum.
 */
function buildSkillToolDef() {
  return {
    type: 'function',
    function: {
      name: 'invoke_skill',
      description: 'Run a named capability bundle (skill). Skills are deterministic playbooks for common multi-step tasks — cheaper and more predictable than describing the same workflow as free-form sub-agent dispatch each time. Available skills:\n' +
        Object.values(SKILLS).map(s => `  - \`${s.name}\`: ${s.description}`).join('\n') +
        '\n\nPick a skill ONLY when the user\'s request matches one of these patterns precisely. For anything else, use `dispatch_subagent` or fire tools directly.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: Object.keys(SKILLS),
            description: 'Which skill to invoke.',
          },
          args: {
            type: 'object',
            description: 'Arguments for the skill — see the skill\'s description for required fields.',
          },
        },
        required: ['name'],
      },
    },
  };
}

/**
 * Run a skill by name. Throws if not found. The runner injects
 * runSubAgent so the skill can defer to a specialist.
 */
async function runSkill({ name, args, userId, runSubAgent, writer }) {
  const skill = getSkill(name);
  if (!skill) {
    return { error: `Unknown skill: ${name}` };
  }
  if (!runSubAgent) {
    return { error: 'runSubAgent dependency not provided to runSkill' };
  }
  try {
    logger.info(`[skill:${name}] starting`);
    const result = await skill.run({ args: args || {}, userId, runSubAgent, writer });
    logger.info(`[skill:${name}] completed`);
    return result;
  } catch (err) {
    return { error: `Skill ${name} failed: ${err?.message || err}` };
  }
}

module.exports = {
  SKILLS,
  listSkills,
  getSkill,
  buildSkillToolDef,
  runSkill,
};
