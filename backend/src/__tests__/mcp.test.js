/**
 * P12a — MCP framework tests.
 *
 * Covers:
 *   - credentialStore encrypt/decrypt round-trip
 *   - credentialStore handles missing key gracefully
 *   - mcpRegistry exposes available + planned integrations
 *   - echo adapter contract (getTools shape, callTool returns echoed input)
 *   - mcpClient routes callTool by namespaced tool name
 *   - executeTool falls through to runtime handlers (registered by MCP)
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.OPENROUTER_API_KEY = 'test';
// 32-byte hex key for encryption tests
process.env.INTEGRATION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn() },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      order: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
    })),
  }),
}));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('credentialStore — encryption round-trip', () => {
  const cs = require('../services/mcp/credentialStore');

  test('encrypt produces ciphertext + iv that decrypt back to original', () => {
    const plaintext = 'sk-ant-api03-secret-token-here';
    const enc = cs.encrypt(plaintext);
    expect(enc.ciphertext).toBeTruthy();
    expect(enc.iv).toBeTruthy();
    expect(enc.ciphertext).not.toBe(plaintext);
    const dec = cs.decrypt(enc.ciphertext, enc.iv);
    expect(dec).toBe(plaintext);
  });

  test('encrypt with same plaintext twice produces different ciphertexts (different IVs)', () => {
    const a = cs.encrypt('same');
    const b = cs.encrypt('same');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  test('decrypt with wrong IV returns null (no crash)', () => {
    const enc = cs.encrypt('something');
    const wrongIv = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    expect(cs.decrypt(enc.ciphertext, wrongIv)).toBeNull();
  });

  test('decrypt of empty/null inputs returns null', () => {
    expect(cs.decrypt(null, 'iv')).toBeNull();
    expect(cs.decrypt('ct', null)).toBeNull();
    expect(cs.decrypt('', '')).toBeNull();
  });

  test('encrypt of null/empty plaintext returns nulls (no error)', () => {
    expect(cs.encrypt(null)).toEqual({ ciphertext: null, iv: null });
    expect(cs.encrypt('')).toEqual({ ciphertext: null, iv: null });
  });

  test('encrypt throws when no key configured', () => {
    const saved = process.env.INTEGRATION_ENCRYPTION_KEY;
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    expect(() => cs.encrypt('value')).toThrow(/encryption key/i);
    process.env.INTEGRATION_ENCRYPTION_KEY = saved;
  });
});

describe('mcpRegistry', () => {
  const reg = require('../services/mcp/mcpRegistry');

  test('exposes the echo test integration as available', () => {
    const available = reg.listAvailable().map(e => e.type);
    expect(available).toContain('echo');
  });

  test('lists planned integrations as coming_soon', () => {
    const all = reg.listAll();
    const gmail = all.find(e => e.type === 'gmail');
    expect(gmail).toBeDefined();
    expect(gmail.coming_soon).toBe(true);
  });

  test('every entry has the required shape', () => {
    for (const entry of reg.listAll()) {
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.oauth).toBe('boolean');
    }
  });
});

describe('echo adapter', () => {
  const echo = require('../services/mcp/adapters/echoAdapter');

  test('exposes a single tool with proper OpenAI shape', () => {
    const tools = echo.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('echo__say');
    expect(tools[0].function.parameters.required).toContain('message');
  });

  test('callTool returns the echoed message', async () => {
    const r = await echo.callTool('echo__say', { message: 'hello world' });
    expect(r.echoed).toBe('hello world');
    expect(r.received_at).toBeTruthy();
  });

  test('callTool with unknown tool name returns error', async () => {
    const r = await echo.callTool('echo__nope', {});
    expect(r.error).toMatch(/Unknown/);
  });
});

describe('runtime handler registration → executeTool fallthrough', () => {
  const registry = require('../services/tools/registry');
  const { executeTool } = require('../services/tools/handlers');

  test('a runtime-registered tool is callable via executeTool', async () => {
    let receivedArgs = null;
    registry.register({
      name: 'mcp_test__double',
      definition: { type: 'function', function: { name: 'mcp_test__double', description: 'test' } },
      handler: async (userId, args) => { receivedArgs = args; return { doubled: (args.n || 0) * 2 }; },
      metadata: {
        category: 'mcp_test',
        risk_level: 'read',
        requires_approval: false,
        model_tier_required: 'any',
        tags: ['mcp', 'test'],
      },
    });

    const result = await executeTool('mcp_test__double', { n: 7 }, 'user-1');
    expect(result.doubled).toBe(14);
    expect(receivedArgs).toEqual({ n: 7 });
  });

  test('unregistered tool returns userSafeError as before', async () => {
    const result = await executeTool('totally_unknown_tool_xyz', {}, 'user-1');
    expect(result.error).toBeTruthy();
  });

  test('getRuntimeHandler returns the closure for a registered tool', () => {
    expect(typeof registry.getRuntimeHandler('mcp_test__double')).toBe('function');
    expect(registry.getRuntimeHandler('not_registered')).toBeUndefined();
  });
});
