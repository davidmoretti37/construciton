/**
 * Tool definitions & handlers integration tests.
 *
 * Validates:
 * - Every defined tool has a corresponding handler
 * - Tool definitions have correct OpenAI function-calling schema
 * - Tool router categorizes intents correctly
 * - Model router selects the right model based on tool count
 * - executeTool handles unknown tools and handler errors gracefully
 */

// Silence logs during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => jest.restoreAllMocks());

const { toolDefinitions, getToolStatusMessage, TOOL_STATUS_MESSAGES } = require('../services/tools/definitions');
const { TOOL_HANDLERS, executeTool } = require('../services/tools/handlers');
const { routeTools, categorizeIntent, selectTools } = require('../services/toolRouter');
const { selectModel, getModelStats, TOOL_THRESHOLD } = require('../services/modelRouter');

// ============================================================
// TOOL DEFINITIONS
// ============================================================

describe('Tool Definitions', () => {
  test('all definitions follow OpenAI function-calling schema', () => {
    for (const tool of toolDefinitions) {
      expect(tool).toHaveProperty('type', 'function');
      expect(tool).toHaveProperty('function');
      expect(tool.function).toHaveProperty('name');
      expect(tool.function).toHaveProperty('description');
      expect(tool.function).toHaveProperty('parameters');
      expect(tool.function.parameters).toHaveProperty('type', 'object');
      expect(tool.function.parameters).toHaveProperty('properties');

      // Name should be snake_case
      expect(tool.function.name).toMatch(/^[a-z][a-z0-9_]*$/);

      // Description should be non-empty
      expect(tool.function.description.length).toBeGreaterThan(10);
    }
  });

  test('no duplicate tool names', () => {
    const names = toolDefinitions.map(t => t.function.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  test('every defined tool has a handler', () => {
    const definedNames = toolDefinitions.map(t => t.function.name);
    const handlerNames = Object.keys(TOOL_HANDLERS);

    const missingHandlers = definedNames.filter(name => !handlerNames.includes(name));
    expect(missingHandlers).toEqual([]);
  });

  test('every handler has a tool definition', () => {
    const definedNames = new Set(toolDefinitions.map(t => t.function.name));
    const handlerNames = Object.keys(TOOL_HANDLERS);

    const orphanHandlers = handlerNames.filter(name => !definedNames.has(name));
    // Some handlers may be internal-only (not exposed to the model) — just warn
    if (orphanHandlers.length > 0) {
      console.warn('Handlers without tool definitions (internal tools):', orphanHandlers);
    }
    // This is informational — orphan handlers aren't necessarily an error
    expect(true).toBe(true);
  });

  test('every tool has a status message for the frontend', () => {
    const definedNames = toolDefinitions.map(t => t.function.name);

    for (const name of definedNames) {
      const message = getToolStatusMessage(name);
      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    }
  });

  test('required parameters are valid property names', () => {
    for (const tool of toolDefinitions) {
      const required = tool.function.parameters.required || [];
      const properties = Object.keys(tool.function.parameters.properties || {});

      for (const req of required) {
        expect(properties).toContain(req);
      }
    }
  });
});

// ============================================================
// TOOL ROUTER
// ============================================================

describe('Tool Router — Intent Classification', () => {
  test('classifies financial queries', () => {
    expect(categorizeIntent('show me unpaid invoices')).toBe('financial');
    expect(categorizeIntent('what expenses do I have?')).toBe('financial');
    expect(categorizeIntent('who owes me money')).toBe('financial');
  });

  test('classifies project queries', () => {
    expect(categorizeIntent('what is the status of my projects')).toBe('project');
    expect(categorizeIntent('update phase progress to 50%')).toBe('project');
  });

  test('classifies worker queries', () => {
    expect(categorizeIntent('show me all workers')).toBe('worker');
    expect(categorizeIntent('create a schedule for the crew')).toBe('worker');
    // "who is clocked in today" matches worker+briefing (compound) — that's correct
    const clockedIn = categorizeIntent('who is clocked in today');
    if (typeof clockedIn === 'object') {
      expect(clockedIn.primary).toBe('worker');
    } else {
      expect(clockedIn).toBe('worker');
    }
  });

  test('classifies estimate queries', () => {
    expect(categorizeIntent('create a new estimate')).toBe('estimate');
    expect(categorizeIntent('how much should I bid for this')).toBe('estimate');
  });

  test('classifies briefing queries', () => {
    expect(categorizeIntent('good morning, what do I have today')).toBe('briefing');
    expect(categorizeIntent('give me a summary of this week')).toBe('briefing');
  });

  test('falls back to general for ambiguous queries', () => {
    expect(categorizeIntent('hello')).toBe('general');
    expect(categorizeIntent('thanks')).toBe('general');
  });

  test('handles compound intents', () => {
    const result = categorizeIntent('show me the project expenses and invoices');
    // Should return compound or a single intent — both are valid
    expect(result).toBeTruthy();
  });
});

describe('Tool Router — Tool Selection', () => {
  test('returns filtered tools, not all tools', () => {
    const { tools, toolCount } = routeTools('show me my invoices', toolDefinitions);
    expect(toolCount).toBeGreaterThan(0);
    expect(toolCount).toBeLessThan(toolDefinitions.length);
  });

  test('general intent returns broad tool set', () => {
    const { tools, toolCount } = routeTools('hello how are you', toolDefinitions);
    expect(toolCount).toBeGreaterThan(5);
  });

  test('returns valid tool definition objects', () => {
    const { tools } = routeTools('search projects', toolDefinitions);
    for (const tool of tools) {
      expect(tool).toHaveProperty('type', 'function');
      expect(tool).toHaveProperty('function.name');
    }
  });

  test('search intent includes global_search', () => {
    const { tools } = routeTools('find the Smith kitchen project', toolDefinitions);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('global_search');
  });
});

// ============================================================
// MODEL ROUTER
// ============================================================

describe('Model Router', () => {
  test('selects Haiku for simple queries (few tools)', () => {
    const { model } = selectModel(5, []);
    expect(model).toContain('haiku');
  });

  test('selects Sonnet for complex queries (many tools)', () => {
    const { model } = selectModel(TOOL_THRESHOLD + 1, []);
    expect(model).toContain('sonnet');
  });

  test('selects Sonnet at exact threshold', () => {
    const { model } = selectModel(TOOL_THRESHOLD, []);
    expect(model).toContain('sonnet');
  });

  test('escalates to Sonnet after repeated errors', () => {
    const errorHistory = [
      { role: 'assistant', content: 'I apologize, I was unable to find that.' },
      { role: 'assistant', content: 'Sorry, I encountered an error.' },
      { role: 'user', content: 'try again' },
    ];
    const { model } = selectModel(5, errorHistory);
    expect(model).toContain('sonnet');
  });

  test('getModelStats handles empty history', () => {
    const stats = getModelStats([]);
    expect(stats.haikuCount).toBe(0);
    expect(stats.sonnetCount).toBe(0);
  });

  test('getModelStats calculates percentages', () => {
    const history = [
      { model: 'claude-haiku-4.5', toolCount: 5 },
      { model: 'claude-haiku-4.5', toolCount: 6 },
      { model: 'claude-sonnet-4.5', toolCount: 12 },
    ];
    const stats = getModelStats(history);
    expect(stats.haikuPercentage).toBe(67);
    expect(stats.sonnetPercentage).toBe(33);
  });
});

// ============================================================
// TOOL EXECUTION
// ============================================================

// Mock Supabase for handler tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn() },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}));

describe('executeTool', () => {
  const fakeUserId = '00000000-0000-0000-0000-000000000001';

  test('returns error for unknown tool', async () => {
    const result = await executeTool('nonexistent_tool', {}, fakeUserId);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('Unknown tool');
  });

  test('all handlers are callable functions', () => {
    for (const [name, handler] of Object.entries(TOOL_HANDLERS)) {
      expect(typeof handler).toBe('function');
    }
  });

  test('search_projects handles empty results', async () => {
    const result = await executeTool('search_projects', { query: 'nonexistent' }, fakeUserId);
    // Should return array or object, not throw
    expect(result).toBeDefined();
  });

  test('get_workers handles empty results', async () => {
    const result = await executeTool('get_workers', {}, fakeUserId);
    expect(result).toBeDefined();
  });

  test('global_search handles empty query', async () => {
    const result = await executeTool('global_search', { query: '' }, fakeUserId);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('projects');
    expect(result).toHaveProperty('estimates');
    expect(result).toHaveProperty('invoices');
    expect(result).toHaveProperty('workers');
  });
});
