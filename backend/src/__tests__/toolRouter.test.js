const { categorizeIntent, selectTools, routeTools } = require('../services/toolRouter');

// Mock tool definitions matching the real structure — covers all tool names in TOOL_GROUPS
const ALL_TOOL_NAMES = [
  // financial
  'search_invoices', 'get_invoice_details', 'update_invoice', 'void_invoice',
  'convert_estimate_to_invoice', 'record_expense', 'get_financial_overview',
  'get_transactions', 'get_project_financials',
  // project
  'search_projects', 'get_project_details', 'get_project_summary',
  'update_phase_progress', 'delete_project', 'update_project',
  'create_worker_task', 'assign_worker', 'global_search',
  // worker
  'get_workers', 'get_worker_details',
  'create_work_schedule', 'get_schedule_events', 'get_time_records',
  // estimate
  'search_estimates', 'get_estimate_details', 'update_estimate',
  'suggest_pricing', 'share_document', 'get_business_settings',
  // briefing
  'get_daily_briefing', 'get_daily_reports', 'get_photos',
  // reports
  'generate_summary_report',
  // settings
  'update_service_pricing',
];

const mockTools = [...new Set(ALL_TOOL_NAMES)].map(name => ({
  type: 'function',
  function: { name, description: `Mock ${name}` },
}));

describe('categorizeIntent', () => {
  test('recognizes financial intent from "show me my invoices"', () => {
    expect(categorizeIntent('show me my invoices')).toBe('financial');
  });

  test('recognizes worker intent from "what workers are assigned"', () => {
    expect(categorizeIntent('what workers are assigned')).toBe('worker');
  });

  test('single intent — financial', () => {
    expect(categorizeIntent('Show me all unpaid invoices')).toBe('financial');
  });

  test('single intent — project', () => {
    expect(categorizeIntent('What is the project status?')).toBe('project');
  });

  test('single intent — worker', () => {
    expect(categorizeIntent('Which workers are on the crew?')).toBe('worker');
  });

  test('single intent — estimate', () => {
    expect(categorizeIntent('Create a new estimate for roofing')).toBe('estimate');
  });

  test('single intent — briefing', () => {
    expect(categorizeIntent('Give me my morning briefing')).toBe('briefing');
  });

  test('single intent — settings', () => {
    expect(categorizeIntent('Update the service catalog pricing')).toBe('settings');
  });

  test('single intent — reports', () => {
    expect(categorizeIntent('Show me the daily report photos')).toBe('reports');
  });

  test('empty message returns general', () => {
    expect(categorizeIntent('')).toBe('general');
  });

  test('unrecognized message returns general', () => {
    expect(categorizeIntent('hello how are you')).toBe('general');
  });

  // Compound intent tests — the key improvement
  test('compound — financial + project', () => {
    const result = categorizeIntent('How much have we spent on the downtown project?');
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('primary');
    expect(result).toHaveProperty('secondary');
    // Both financial and project should be represented
    const intents = [result.primary, result.secondary];
    expect(intents).toContain('financial');
    expect(intents).toContain('project');
  });

  test('compound — worker + financial', () => {
    const result = categorizeIntent("What is José's total payment for this shift?");
    expect(typeof result).toBe('object');
    const intents = [result.primary, result.secondary];
    expect(intents).toContain('worker');
    expect(intents).toContain('financial');
  });

  test('project timeline routes to project (not worker)', () => {
    const result = categorizeIntent('Show me the project timeline');
    // "project" and "timeline" both score for project
    // Even if "time" partially matches worker, project should dominate
    const primary = typeof result === 'string' ? result : result.primary;
    expect(primary).toBe('project');
  });
});

describe('selectTools', () => {
  test('single intent returns correct tool set', () => {
    const tools = selectTools('financial', mockTools);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('search_invoices');
    expect(names).toContain('get_financial_overview');
    expect(names).not.toContain('get_daily_briefing');
  });

  test('compound intent merges both tool sets', () => {
    const tools = selectTools({ primary: 'financial', secondary: 'project' }, mockTools);
    const names = tools.map(t => t.function.name);
    // Financial tools
    expect(names).toContain('search_invoices');
    expect(names).toContain('get_financial_overview');
    // Project tools
    expect(names).toContain('get_project_details');
    expect(names).toContain('get_project_summary');
  });

  test('compound intent deduplicates tools', () => {
    const tools = selectTools({ primary: 'financial', secondary: 'project' }, mockTools);
    const names = tools.map(t => t.function.name);
    // get_project_financials appears in both — should only be once
    const count = names.filter(n => n === 'get_project_financials').length;
    expect(count).toBe(1);
  });

  test('general returns broad tool set', () => {
    const tools = selectTools('general', mockTools);
    expect(tools.length).toBeGreaterThan(10);
  });

  test('returns general tools for unknown intent string', () => {
    const tools = selectTools('nonexistent_intent', mockTools);
    const names = tools.map(t => t.function.name);
    // Falls back to TOOL_GROUPS.general
    expect(names).toContain('global_search');
    expect(names).toContain('get_daily_briefing');
  });

  test('filters out tools not present in allTools', () => {
    const limitedTools = [
      { type: 'function', function: { name: 'search_invoices', description: 'mock' } },
    ];
    const tools = selectTools('financial', limitedTools);
    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe('search_invoices');
  });

  test('worker tools do not include financial-only tools', () => {
    const tools = selectTools('worker', mockTools);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('get_workers');
    expect(names).toContain('get_worker_details');
    expect(names).not.toContain('void_invoice');
  });
});

describe('routeTools', () => {
  test('returns intent, tools, and toolCount', () => {
    const result = routeTools('Show me invoices', mockTools);
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('tools');
    expect(result).toHaveProperty('toolCount');
    expect(result.toolCount).toBe(result.tools.length);
  });

  test('compound intent label uses + separator', () => {
    const result = routeTools('How much spent on the project expenses?', mockTools);
    // Should be compound — "project" + "financial"
    expect(result.intent).toContain('+');
  });
});
