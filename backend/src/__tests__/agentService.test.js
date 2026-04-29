/**
 * Tests for the agentic loop in agentService.js
 *
 * Validates:
 * - SSE event emission (thinking, delta, done, error, clear, metadata)
 * - Tool-calling loop: tool_start/tool_end events and conversation threading
 * - Max tool rounds termination (MAX_TOOL_ROUNDS = 8)
 * - Empty response fallback message
 * - Client disconnection handling (background persistence continues)
 * - Supabase job persistence (complete/fail)
 * - Tool call deduplication (cache)
 */

// ============================================================
// ENV + MOCKS — must be set before any require()
// ============================================================

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Track Supabase update calls for assertion
const mockUpdate = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockResolvedValue({ error: null });
const mockInsert = jest.fn().mockReturnThis();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn() },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: mockEq,
      or: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: mockInsert,
      update: mockUpdate,
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
  }),
}));

// Chain: .update({...}).eq('id', jobId) — update returns obj with eq
mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });

jest.mock('node-fetch');
jest.mock('abort-controller', () => {
  return class MockAbortController {
    constructor() {
      this.signal = {};
      this.abort = jest.fn();
    }
  };
});

// Mock all internal service dependencies to isolate agentService
jest.mock('../services/tools/definitions', () => ({
  toolDefinitions: [
    {
      type: 'function',
      function: {
        name: 'search_projects',
        description: 'Search projects',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_project_details',
        description: 'Get project details',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ],
  getToolStatusMessage: jest.fn((name) => `Looking up ${name}...`),
}));

jest.mock('../services/tools/handlers', () => ({
  executeTool: jest.fn().mockResolvedValue({ id: 'proj-1', name: 'Test Project', status: 'active' }),
}));

jest.mock('../services/tools/systemPrompt', () => ({
  buildSystemPrompt: jest.fn(() => 'You are a helpful construction assistant.'),
}));

jest.mock('../services/toolRouter', () => {
  const routedResult = {
    intent: 'project',
    tools: [
      {
        type: 'function',
        function: {
          name: 'search_projects',
          description: 'Search projects',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ],
    toolCount: 1,
  };
  return {
    routeTools: jest.fn(() => routedResult),
    routeToolsAsync: jest.fn(async () => routedResult),
    categorizeIntent: jest.fn(() => 'project'),
    selectTools: jest.fn(() => routedResult.tools),
  };
});

jest.mock('../services/modelRouter', () => ({
  selectModel: jest.fn(() => ({ model: 'claude-haiku-4.5', reason: 'low tool count', toolCount: 1 })),
  trackUsage: jest.fn(),
}));

jest.mock('../services/requestMemory', () => ({
  getContextForPrompt: jest.fn(() => ''),
  remember: jest.fn(),
  recall: jest.fn(() => null),
  has: jest.fn(() => false),
  shutdown: jest.fn(),
}));

// ============================================================
// SILENCE LOGS
// ============================================================

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
  try { require('../services/requestMemory').shutdown?.(); } catch (e) {}
});

// ============================================================
// IMPORTS (after all mocks are set up)
// ============================================================

const { PassThrough } = require('stream');
const fetch = require('node-fetch');
const { processAgentRequest } = require('../services/agentService');
const { executeTool } = require('../services/tools/handlers');

// ============================================================
// HELPERS
// ============================================================

function createMockRes() {
  return {
    write: jest.fn(),
    writeHead: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    setHeader: jest.fn(),
  };
}

function createMockReq() {
  return {
    on: jest.fn(),
  };
}

/**
 * Build a PassThrough stream that simulates an OpenRouter SSE response.
 * Each item in `chunks` is written as a `data: ...\n\n` line.
 * A final `data: [DONE]\n\n` is appended automatically.
 */
function buildSSEStream(chunks) {
  const stream = new PassThrough();
  // Write all chunks asynchronously so listeners can attach
  process.nextTick(() => {
    for (const chunk of chunks) {
      stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    stream.write('data: [DONE]\n\n');
    stream.end();
  });
  return stream;
}

/**
 * Build a simple text response stream.
 * The content is delivered as a JSON object with a "text" field, which is
 * what the production Claude responses look like.
 */
function buildTextResponseStream(text) {
  // Split the JSON content across multiple chunks to simulate streaming
  const fullContent = `{"text":"${text}"}`;
  const mid = Math.floor(fullContent.length / 2);
  const part1 = fullContent.substring(0, mid);
  const part2 = fullContent.substring(mid);

  return buildSSEStream([
    { choices: [{ delta: { content: part1 }, finish_reason: null }] },
    { choices: [{ delta: { content: part2 }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
}

/**
 * Build a tool-call response stream.
 * Simulates Claude requesting one or more tool calls.
 */
function buildToolCallStream(toolCalls) {
  const chunks = [];
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];
    // First chunk: id + function name
    chunks.push({
      choices: [{
        delta: {
          tool_calls: [{
            index: i,
            id: tc.id,
            function: { name: tc.name, arguments: '' },
          }],
        },
        finish_reason: null,
      }],
    });
    // Second chunk: arguments
    chunks.push({
      choices: [{
        delta: {
          tool_calls: [{
            index: i,
            function: { arguments: JSON.stringify(tc.args) },
          }],
        },
        finish_reason: null,
      }],
    });
  }
  // Final chunk with finish reason
  chunks.push({
    choices: [{ delta: {}, finish_reason: 'tool_calls' }],
  });
  return buildSSEStream(chunks);
}

function mockFetchResponse(stream) {
  fetch.mockResolvedValueOnce({
    ok: true,
    body: stream,
    text: jest.fn().mockResolvedValue(''),
  });
}

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_JOB_ID = 'job-test-001';
const TEST_MESSAGES = [{ role: 'user', content: 'Show me my projects' }];
const TEST_CONTEXT = { businessName: 'Test Construction Co' };

// ============================================================
// TESTS
// ============================================================

describe('processAgentRequest — text response (no tool calls)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the update mock chain after clearing
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('emits thinking, delta, and done events for a simple text response', async () => {
    // Round 1: tool_choice=required, so Claude must call a tool
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: Claude returns final text
    const textStream = buildTextResponseStream('Here are your projects.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // Collect all SSE events
    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const types = events.map(e => e.type);

    // Must have thinking events (one per round)
    expect(types.filter(t => t === 'thinking').length).toBeGreaterThanOrEqual(1);

    // Must have at least one delta with the response text
    const deltas = events.filter(e => e.type === 'delta');
    expect(deltas.length).toBeGreaterThanOrEqual(1);
    const fullText = deltas.map(d => d.content).join('');
    expect(fullText).toContain('Here are your projects');

    // Must end with 'done'
    const nonHeartbeatTypes = types.filter(t => t !== 'heartbeat');
    expect(nonHeartbeatTypes[nonHeartbeatTypes.length - 1]).toBe('done');
  });

  test('sends fallback message when response is empty', async () => {
    // Round 1: tool call
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: empty content
    const emptyStream = buildSSEStream([
      { choices: [{ delta: { content: '' }, finish_reason: 'stop' }] },
    ]);
    mockFetchResponse(emptyStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const deltas = events.filter(e => e.type === 'delta');
    const allDeltaText = deltas.map(d => d.content).join('');
    // Fallback copy was reworded — the agent now offers a recovery
    // suggestion rather than only "wasn't able to process". Match the
    // characteristic phrase from the current implementation.
    expect(allDeltaText).toMatch(/(wasn'?t able to process|couldn'?t compose|started looking that up)/i);
  });
});

describe('processAgentRequest — tool-calling loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('executes tools and sends tool_start/tool_end events', async () => {
    // Round 1: Claude calls search_projects
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: { query: 'kitchen' } },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: Claude returns final text
    const textStream = buildTextResponseStream('Found 3 kitchen projects.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // executeTool should have been called
    expect(executeTool).toHaveBeenCalledWith('search_projects', { query: 'kitchen' }, TEST_USER_ID);

    // Check for tool_start and tool_end events
    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const types = events.map(e => e.type);
    expect(types).toContain('tool_start');
    expect(types).toContain('tool_end');

    // tool_start should include the tool name and a status message
    const toolStart = events.find(e => e.type === 'tool_start');
    expect(toolStart.tool).toBe('search_projects');
    expect(toolStart.message).toBeTruthy();
  });

  test('handles multiple tool calls in a single round', async () => {
    // Round 1: Claude calls two tools at once
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: { query: 'roof' } },
      { id: 'call-2', name: 'get_project_details', args: { project_id: 'p-123' } },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: final text
    const textStream = buildTextResponseStream('Here is the project detail.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // Both tools should be called
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledWith('search_projects', { query: 'roof' }, TEST_USER_ID);
    expect(executeTool).toHaveBeenCalledWith('get_project_details', { project_id: 'p-123' }, TEST_USER_ID);

    // Should see two tool_start and two tool_end events
    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const toolStarts = events.filter(e => e.type === 'tool_start');
    const toolEnds = events.filter(e => e.type === 'tool_end');
    expect(toolStarts).toHaveLength(2);
    expect(toolEnds).toHaveLength(2);
  });

  test('emits clear event before tool execution to discard intermediate text', async () => {
    // Round 1: tool call with some intermediate text
    const stream = new PassThrough();
    process.nextTick(() => {
      // Claude streams some "thinking" text before the tool call
      stream.write(`data: ${JSON.stringify({
        choices: [{ delta: { content: 'Let me search...' }, finish_reason: null }],
      })}\n\n`);
      // Then the tool call
      stream.write(`data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'search_projects', arguments: '{}' } }] }, finish_reason: null }],
      })}\n\n`);
      stream.write(`data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      })}\n\n`);
      stream.write('data: [DONE]\n\n');
      stream.end();
    });
    mockFetchResponse(stream);

    // Round 2: final text
    const textStream = buildTextResponseStream('Results are in.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const types = events.map(e => e.type);
    // A 'clear' event should appear between rounds (before tool execution in the conversation)
    expect(types).toContain('clear');
  });

  test('caches duplicate tool calls within the same request', async () => {
    // Round 1: first tool call
    const toolStream1 = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: { query: 'test' } },
    ]);
    mockFetchResponse(toolStream1);

    // Round 2: same tool call again (duplicate)
    const toolStream2 = buildToolCallStream([
      { id: 'call-2', name: 'search_projects', args: { query: 'test' } },
    ]);
    mockFetchResponse(toolStream2);

    // Round 3: final text
    const textStream = buildTextResponseStream('Done.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // executeTool should only be called once because the second call is a cache hit
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});

describe('processAgentRequest — max rounds termination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('terminates after MAX_TOOL_ROUNDS (8) and sends fallback message', async () => {
    // Set up 8 rounds of tool calls — each round Claude keeps calling tools
    for (let i = 0; i < 8; i++) {
      const toolStream = buildToolCallStream([
        { id: `call-${i}`, name: 'search_projects', args: { round: i } },
      ]);
      mockFetchResponse(toolStream);
    }

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const types = events.map(e => e.type);

    // Should have 8 thinking events (one per round)
    expect(types.filter(t => t === 'thinking').length).toBe(8);

    // The last meaningful events should be a delta (fallback) + done
    const nonHeartbeatEvents = events.filter(e => e.type !== 'heartbeat');
    const lastDelta = [...nonHeartbeatEvents].reverse().find(e => e.type === 'delta');
    expect(lastDelta.content).toContain('more direction');

    expect(nonHeartbeatEvents[nonHeartbeatEvents.length - 1].type).toBe('done');
  });
});

describe('processAgentRequest — error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('recovers from API error and retries on next round', async () => {
    // Round 1: API error (non-ok response)
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    });

    // Round 2: successful text response
    const textStream = buildTextResponseStream('Recovered successfully.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const deltas = events.filter(e => e.type === 'delta');
    const fullText = deltas.map(d => d.content).join('');
    expect(fullText).toContain('Recovered successfully');
  });

  test('sends error fallback after error on max round', async () => {
    // Fill all 8 rounds with API errors
    for (let i = 0; i < 8; i++) {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Server Error'),
      });
    }

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const deltas = events.filter(e => e.type === 'delta');
    const fullText = deltas.map(d => d.content).join('');
    // Should have some kind of fallback message (either error fallback or max rounds fallback)
    expect(fullText.length).toBeGreaterThan(0);

    const types = events.map(e => e.type).filter(t => t !== 'heartbeat');
    expect(types[types.length - 1]).toBe('done');
  });
});

describe('processAgentRequest — client disconnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('continues processing when client disconnects mid-stream', async () => {
    // Round 1: tool call
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: text response
    const textStream = buildTextResponseStream('Background result.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    // Simulate: when req.on('close', cb) is called, fire the callback immediately
    // to simulate the client disconnecting before the response completes
    req.on.mockImplementation((event, cb) => {
      if (event === 'close') {
        // Trigger disconnect after a short delay
        setTimeout(cb, 5);
      }
    });

    // After disconnect, res.write should throw (simulating broken pipe)
    let disconnected = false;
    res.write.mockImplementation(() => {
      if (disconnected) {
        throw new Error('write after end');
      }
    });
    setTimeout(() => { disconnected = true; }, 10);

    // Should complete without throwing
    await expect(
      processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID)
    ).resolves.toBeUndefined();
  });

  test('registers close listener on req', async () => {
    // Simple text response (tool required first round)
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    const textStream = buildTextResponseStream('Hello.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // req.on should have been called with 'close'
    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});

describe('processAgentRequest — Supabase persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('calls supabase update with completed status on success', async () => {
    // Round 1: tool call
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: text
    const textStream = buildTextResponseStream('All done.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // The writer.complete() call should trigger an update with status: 'completed'
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_at: expect.any(String),
      })
    );
  });
});

describe('processAgentRequest — message format handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('handles multipart content arrays (image uploads)', async () => {
    const multipartMessages = [{
      role: 'user',
      content: [
        { type: 'text', text: 'What project is this?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ],
    }];

    // Round 1: tool call
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: text
    const textStream = buildTextResponseStream('This is the downtown project.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    // Should not throw on multipart content
    await expect(
      processAgentRequest(multipartMessages, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID)
    ).resolves.toBeUndefined();
  });

  test('handles string content messages', async () => {
    const stringMessages = [{ role: 'user', content: 'Show my invoices' }];

    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    const textStream = buildTextResponseStream('Here are your invoices.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await expect(
      processAgentRequest(stringMessages, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID)
    ).resolves.toBeUndefined();
  });
});

describe('processAgentRequest — metadata parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('emits metadata event when response contains visualElements and actions', async () => {
    // Round 1: tool call (required on first round)
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    // Round 2: response with visualElements and actions in JSON
    const jsonContent = '{"text":"Here are your projects.","visualElements":[{"type":"projectCard","data":{"id":"p1"}}],"actions":[{"type":"navigate","screen":"Projects"}]}';
    const stream = buildSSEStream([
      { choices: [{ delta: { content: jsonContent }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]);
    mockFetchResponse(stream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const metadataEvent = events.find(e => e.type === 'metadata');
    expect(metadataEvent).toBeDefined();
    expect(metadataEvent.visualElements).toHaveLength(1);
    expect(metadataEvent.visualElements[0].type).toBe('projectCard');
    expect(metadataEvent.actions).toHaveLength(1);
    expect(metadataEvent.actions[0].type).toBe('navigate');
  });
});

describe('processAgentRequest — tool result memory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('remembers tool results via requestMemory', async () => {
    const memory = require('../services/requestMemory');

    // Override executeTool to return a project with id
    executeTool.mockResolvedValueOnce({ id: 'proj-abc', name: 'Roof Repair', status: 'active' });

    // Round 1: tool call for get_project_details
    const toolStream = new PassThrough();
    process.nextTick(() => {
      toolStream.write(`data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'get_project_details', arguments: '{"project_id":"proj-abc"}' } }] }, finish_reason: null }],
      })}\n\n`);
      toolStream.write(`data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      })}\n\n`);
      toolStream.write('data: [DONE]\n\n');
      toolStream.end();
    });
    mockFetchResponse(toolStream);

    // Round 2: text response
    const textStream = buildTextResponseStream('Project details loaded.');
    mockFetchResponse(textStream);

    const res = createMockRes();
    const req = createMockReq();

    await processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, req, TEST_JOB_ID);

    // memory.remember should have been called with the project result
    expect(memory.remember).toHaveBeenCalledWith(
      TEST_USER_ID,
      'project_proj-abc',
      expect.objectContaining({ id: 'proj-abc', name: 'Roof Repair' }),
      'get_project_details'
    );
  });
});

describe('processAgentRequest — null req handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq, then: (fn) => fn({ error: null }) });
    mockEq.mockResolvedValue({ error: null });
  });

  test('works without a req object (no disconnect detection)', async () => {
    const toolStream = buildToolCallStream([
      { id: 'call-1', name: 'search_projects', args: {} },
    ]);
    mockFetchResponse(toolStream);

    const textStream = buildTextResponseStream('Works without req.');
    mockFetchResponse(textStream);

    const res = createMockRes();

    // Pass null for req — should not throw
    await expect(
      processAgentRequest(TEST_MESSAGES, TEST_USER_ID, TEST_CONTEXT, res, null, TEST_JOB_ID)
    ).resolves.toBeUndefined();

    const events = res.write.mock.calls.map(call => {
      const raw = call[0];
      const jsonStr = raw.replace(/^data: /, '').replace(/\n\n$/, '');
      try { return JSON.parse(jsonStr); } catch { return null; }
    }).filter(Boolean);

    const types = events.map(e => e.type).filter(t => t !== 'heartbeat');
    expect(types[types.length - 1]).toBe('done');
  });
});
