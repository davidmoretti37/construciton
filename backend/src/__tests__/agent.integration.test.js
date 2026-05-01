/**
 * PEV integration tests — exercise the full pipeline end-to-end with
 * stubbed tools but real LLM stages. Catches the kind of UX failures
 * that unit tests miss: technical text leaking to user, asking when
 * search would have worked, etc.
 *
 * Skips without OPENROUTER_API_KEY.
 *
 * The cases here mirror real bugs the user has hit, including:
 *   - "delete duplicate $1600 expenses on John tile phase" → must NOT
 *     show "step s1 (search_projects) returned error: Something went
 *     wrong with that action" in the user-facing reply
 *   - Tool errors must be humanized
 *   - Continuations must not get classified as 'clarification'
 */

const { runPev } = require('../services/agent/pev');

const NO_KEY = !process.env.OPENROUTER_API_KEY;

const COMMON_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description: 'List/find existing projects by client/project name. Use to resolve a project reference like "John" or "Smith".',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, status: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Fetch transactions for a project, optionally filtered by amount, phase, or category. Use to find expenses, including duplicates.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          amount: { type: 'number' },
          phase: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_expense',
      description: 'Delete a recorded expense. Destructive — gated by approval.',
      parameters: {
        type: 'object',
        properties: { transaction_id: { type: 'string' } },
        required: ['transaction_id'],
      },
    },
  },
];

(NO_KEY ? describe.skip : describe)('PEV integration — UX guarantees', () => {
  jest.setTimeout(120_000);

  test('tool error → user sees humanized text, not raw "Something went wrong"', async () => {
    const fakeTool = async (name) => {
      if (name === 'search_projects') {
        // Simulate the exact failure shape from the user's screenshot:
        // executeTool wraps a thrown error to this generic string.
        return { error: 'Something went wrong with that action.' };
      }
      return { ok: true };
    };

    const result = await runPev({
      userMessage: 'There are duplicate $1600 expenses on John tile phase, please remove them',
      tools: COMMON_TOOLS,
      userId: 'u-test',
      executeTool: fakeTool,
    });

    // Tolerate degraded mode (rate-limited LLM)
    const classifyStage = result.trace?.stages?.find((s) => s.stage === 'classify');
    if (classifyStage?.fallback) return;

    // Critical assertion: the user-facing text must NOT contain the raw
    // technical strings that leaked in the screenshot.
    const userText = (result.response?.text || result.question || '').toLowerCase();
    expect(userText).not.toMatch(/step s\d+ \(/);
    expect(userText).not.toMatch(/something went wrong with that action/);
    expect(userText).not.toMatch(/ask the user to clarify or adjust/);
    expect(userText).not.toMatch(/returned error:/);

    // Should be a coherent reply (non-empty, more than a stub)
    expect(userText.length).toBeGreaterThan(15);
  });

  test('continuation message ("just delete them") classified with prior context', async () => {
    const fakeTool = async (name, args) => {
      if (name === 'search_projects') return { results: [{ id: 'proj-john', name: 'John Smith' }] };
      if (name === 'get_transactions') return { results: [
        { id: 't1', amount: 1600 }, { id: 't2', amount: 1600 }, { id: 't3', amount: 1600 },
      ] };
      return { ok: true };
    };

    const conversationHistory = [
      { role: 'user', content: 'delete duplicate $1600 expenses on John tile phase' },
      { role: 'assistant', content: 'Found 3 entries. Which should I delete?' },
    ];

    const result = await runPev({
      userMessage: "I don't know, just delete them",
      tools: COMMON_TOOLS,
      userId: 'u-test',
      executeTool: fakeTool,
      conversationHistory,
    });

    const classifyStage = result.trace?.stages?.find((s) => s.stage === 'classify');
    if (classifyStage?.fallback) return;

    // Must NOT classify as 'clarification' (which would respond with the
    // generic "Could you say a bit more"). Must understand it as a
    // continuation of the prior delete request.
    expect(classifyStage?.classification).not.toBe('clarification');
  });
});
