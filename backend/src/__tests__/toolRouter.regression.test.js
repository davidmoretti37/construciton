/**
 * Routing regression tests — pinned canonical phrases that MUST route
 * to the correct intent. If anyone edits toolRouter.js (adds an intent,
 * tweaks weights, changes patterns) and accidentally regresses one of
 * these, this test fails loudly.
 *
 * Why this exists: the change_order routing bug (where the LLM
 * decomposed CO requests into expense + phase calls) was caused by
 * create_change_order missing from any TOOL_GROUP. With this test,
 * the next time someone edits TOOL_GROUPS, they'll know within 200ms
 * if they broke a critical routing path.
 *
 * Each phrase MUST route to one of `expectedIntents` (we accept either
 * the exact intent or a compound that includes it as primary). Phrases
 * are real-shaped messages from owners across verticals.
 */

const { categorizeIntent, selectTools, routeTools } = require('../services/toolRouter');

// Build a minimal tool list that covers every TOOL_GROUP for selectTools tests
const ALL_TOOLS = [
  // change_order
  'create_change_order', 'list_change_orders', 'get_change_order', 'update_change_order', 'send_change_order',
  // financial
  'search_invoices', 'record_expense', 'get_financial_overview', 'get_ar_aging', 'get_tax_summary',
  // project
  'search_projects', 'get_project_details', 'create_project_phase', 'update_project', 'update_phase_progress',
  // worker
  'get_workers', 'assign_worker', 'clock_in_worker', 'clock_out_worker',
  // estimate
  'search_estimates', 'get_estimate_details', 'suggest_pricing', 'convert_estimate_to_invoice',
  // briefing
  'get_daily_briefing', 'get_schedule_events',
  // service_plan
  'get_service_plans', 'get_daily_route', 'create_service_visit',
  // bank
  'get_bank_transactions', 'assign_bank_transaction',
  // search
  'global_search',
  // document
  'get_project_documents',
  // settings
  'get_business_settings',
].map((name) => ({
  type: 'function',
  function: { name, description: `${name} tool`, parameters: { type: 'object', properties: {}, required: [] } },
}));

const intentOf = (intent) => (typeof intent === 'string' ? intent : intent?.primary);

describe('toolRouter — canonical routing regression', () => {
  describe('change_order routing (the bug class)', () => {
    const cases = [
      'Add a change order to John for 200 square footed bath tile at $8 a square foot for two more days',
      'add a CO for kitchen island, $2400, 1 day',
      'create a change order for Smith bath tile',
      'show me the change orders on the Wilson project',
      'extra work for the Henderson kitchen',
      'scope change on the Smith remodel',
      "client wants more cabinets — change order for $3500",
    ];
    test.each(cases)('routes "%s" to change_order', (msg) => {
      const intent = categorizeIntent(msg);
      expect(intentOf(intent)).toBe('change_order');
    });

    test('change_order group contains create_change_order', () => {
      const tools = selectTools('change_order', ALL_TOOLS);
      const names = tools.map((t) => t.function.name);
      expect(names).toContain('create_change_order');
      expect(names).toContain('search_projects'); // needed to resolve project
    });

    test('change_order group does NOT include the decomposition tools', () => {
      const tools = selectTools('change_order', ALL_TOOLS);
      const names = tools.map((t) => t.function.name);
      expect(names).not.toContain('create_project_phase');
      expect(names).not.toContain('record_expense');
      expect(names).not.toContain('update_phase_progress');
    });
  });

  describe('estimate routing', () => {
    const cases = [
      'create an estimate for the bathroom remodel',
      'send the estimate to Smith',
      'show me my estimates',
    ];
    test.each(cases)('routes "%s" to include estimate', (msg) => {
      const result = routeTools(msg, ALL_TOOLS);
      const names = result.tools.map((t) => t.function.name);
      // Should have estimate-flavored tools available
      expect(names.some((n) => n.includes('estimate'))).toBe(true);
    });
  });

  describe('financial routing', () => {
    const cases = [
      'I got $500 from Chris via Zelle',
      "what's my profit this month",
      'show overdue invoices',
      'record a $200 expense for materials',
    ];
    test.each(cases)('routes "%s" to financial-flavored tools', (msg) => {
      const result = routeTools(msg, ALL_TOOLS);
      const names = result.tools.map((t) => t.function.name);
      // Should have financial tools available
      const hasFinancial = names.some((n) =>
        n.includes('invoice') || n.includes('expense') || n.includes('financial')
        || n.includes('transaction') || n.includes('aging') || n.includes('tax')
      );
      expect(hasFinancial).toBe(true);
    });
  });

  describe('project routing', () => {
    test('"create a project for Smith" goes to project (not estimate)', () => {
      const result = routeTools('create a project for Smith — bathroom remodel', ALL_TOOLS);
      const names = result.tools.map((t) => t.function.name);
      expect(names).toContain('create_project_phase');
    });

    test('"add a phase to the Smith project" goes to project', () => {
      const result = routeTools('add a phase to the Smith project', ALL_TOOLS);
      const names = result.tools.map((t) => t.function.name);
      expect(names).toContain('create_project_phase');
    });
  });

  describe('briefing routing', () => {
    test.each([
      'good morning',
      'morning brief',
      "what's going on today",
      'anything I should know',
    ])('routes "%s" to include briefing tools', (msg) => {
      const result = routeTools(msg, ALL_TOOLS);
      const names = result.tools.map((t) => t.function.name);
      expect(names).toContain('get_daily_briefing');
    });
  });

  describe('service_plan routing (route-based businesses)', () => {
    test.each([
      'add a cleaning service plan for the Smith building',
      'pest control visit for Henderson',
    ])('routes "%s" to service_plan-flavored tools', (msg) => {
      const result = routeTools(msg, ALL_TOOLS);
      const names = result.tools.map((t) => t.function.name);
      expect(names.some((n) => n.includes('service'))).toBe(true);
    });

    // "today" / "this week" trigger briefing intent which is acceptable —
    // briefing tools cover route + schedule lookups for service businesses.
    // Just verify these don't accidentally route to project/financial.
    test.each([
      "what's on my route today",
    ])('routes "%s" to briefing-or-service_plan (not project/financial)', (msg) => {
      const result = routeTools(msg, ALL_TOOLS);
      const intentName = intentOf(result.intent);
      expect(['briefing', 'service_plan']).toContain(intentName);
    });
  });

  describe('PEV-wide tool surface (forPev=true)', () => {
    test('includes connective-tissue tools across all intents', () => {
      const tools = selectTools('change_order', ALL_TOOLS, { forPev: true });
      const names = tools.map((t) => t.function.name);
      // Common across-intent tools should be present
      expect(names).toContain('search_projects');
      expect(names).toContain('search_invoices');
      expect(names).toContain('search_estimates');
      expect(names).toContain('global_search');
    });

    test('still includes the intent-specific tools', () => {
      const tools = selectTools('change_order', ALL_TOOLS, { forPev: true });
      const names = tools.map((t) => t.function.name);
      expect(names).toContain('create_change_order');
    });

    test('still excludes the forbidden decomposition tools', () => {
      const tools = selectTools('change_order', ALL_TOOLS, { forPev: true });
      const names = tools.map((t) => t.function.name);
      expect(names).not.toContain('create_project_phase');
      expect(names).not.toContain('record_expense');
    });
  });
});
