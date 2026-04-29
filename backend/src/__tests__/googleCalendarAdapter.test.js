/**
 * P12b — Google Calendar adapter tests.
 *
 * No real Google calls. fetch is mocked to assert the adapter's URL
 * shape, headers, body, response normalization, and error paths.
 */

process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';

const adapter = require('../services/mcp/adapters/google_calendarAdapter');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
});

function mockFetchOk(json) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
}

function mockFetchFail(status, text) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: text }),
    text: async () => text,
  });
}

describe('getTools', () => {
  test('exposes two tools with proper OpenAI shape', () => {
    const tools = adapter.getTools();
    expect(tools).toHaveLength(2);
    const names = tools.map(t => t.function.name);
    expect(names).toEqual(expect.arrayContaining([
      'google_calendar__list_events',
      'google_calendar__search_events',
    ]));
    for (const t of tools) {
      expect(t.type).toBe('function');
      expect(t.metadata.risk_level).toBe('read');
      expect(t.metadata.requires_approval).toBe(false);
    }
  });

  test('search_events requires query', () => {
    const t = adapter.getTools().find(t => t.function.name === 'google_calendar__search_events');
    expect(t.function.parameters.required).toContain('query');
  });
});

describe('oauthAuthorizeUrl', () => {
  test('produces a valid Google authorize URL with required params', async () => {
    const url = await adapter.oauthAuthorizeUrl('signed-state', 'https://example.com/callback');
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    const u = new URL(url);
    expect(u.searchParams.get('client_id')).toBe('test-client-id');
    expect(u.searchParams.get('redirect_uri')).toBe('https://example.com/callback');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('scope')).toContain('calendar.readonly');
    expect(u.searchParams.get('access_type')).toBe('offline'); // critical for refresh tokens
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('signed-state');
  });

  test('throws when client creds missing', async () => {
    const saved = process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    await expect(adapter.oauthAuthorizeUrl('s', 'r')).rejects.toThrow(/Google OAuth not configured/);
    process.env.GOOGLE_OAUTH_CLIENT_ID = saved;
  });
});

describe('oauthExchangeCode', () => {
  test('POSTs to Google token endpoint with form-encoded body', async () => {
    mockFetchOk({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      token_type: 'Bearer',
    });
    const out = await adapter.oauthExchangeCode('auth-code', 'https://example.com/callback');
    expect(out.accessToken).toBe('access-1');
    expect(out.refreshToken).toBe('refresh-1');
    expect(out.expiresAt).toBeTruthy();
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(out.scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(opts.body).toContain('code=auth-code');
    expect(opts.body).toContain('grant_type=authorization_code');
    expect(opts.body).toContain('client_id=test-client-id');
  });

  test('throws on non-200 response', async () => {
    mockFetchFail(400, 'invalid_grant');
    await expect(adapter.oauthExchangeCode('bad', 'r')).rejects.toThrow(/Google token exchange failed/);
  });
});

describe('oauthRefresh', () => {
  test('exchanges refresh_token for fresh access_token', async () => {
    mockFetchOk({
      access_token: 'access-2',
      expires_in: 3600,
      token_type: 'Bearer',
    });
    const out = await adapter.oauthRefresh('refresh-1');
    expect(out.accessToken).toBe('access-2');
    expect(out.expiresAt).toBeTruthy();
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.body).toContain('grant_type=refresh_token');
    expect(opts.body).toContain('refresh_token=refresh-1');
  });

  test('reuses prior refresh_token when Google omits it', async () => {
    mockFetchOk({ access_token: 'access-3', expires_in: 3600 });
    const out = await adapter.oauthRefresh('refresh-1');
    // Adapter intentionally returns null so caller can fall through to existing token.
    expect(out.refreshToken).toBeNull();
  });
});

describe('callTool — list_events', () => {
  test('builds URL with default 7-day window when args omitted', async () => {
    mockFetchOk({ items: [] });
    await adapter.callTool('google_calendar__list_events', {}, { accessToken: 'a' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/calendars\/primary\/events\?/);
    const u = new URL(url);
    expect(u.searchParams.get('singleEvents')).toBe('true');
    expect(u.searchParams.get('orderBy')).toBe('startTime');
    expect(u.searchParams.get('maxResults')).toBe('20');
    expect(u.searchParams.get('timeMin')).toBeTruthy();
    expect(u.searchParams.get('timeMax')).toBeTruthy();
    expect(opts.headers.Authorization).toBe('Bearer a');
  });

  test('clamps max_results to 50', async () => {
    mockFetchOk({ items: [] });
    await adapter.callTool('google_calendar__list_events', { max_results: 9999 }, { accessToken: 'a' });
    const url = global.fetch.mock.calls[0][0];
    const u = new URL(url);
    expect(u.searchParams.get('maxResults')).toBe('50');
  });

  test('normalizes events shape', async () => {
    mockFetchOk({
      items: [
        {
          id: 'evt-1',
          summary: 'Walkthrough',
          location: '123 Oak St',
          start: { dateTime: '2026-05-01T14:00:00Z' },
          end: { dateTime: '2026-05-01T15:00:00Z' },
          organizer: { email: 'me@example.com' },
          attendees: [{ email: 'sarah@example.com' }, { email: 'mark@example.com' }],
          htmlLink: 'https://calendar.google.com/event?eid=...',
          status: 'confirmed',
        },
        {
          id: 'evt-2',
          summary: 'All-day note',
          start: { date: '2026-05-02' },
          end: { date: '2026-05-03' },
        },
      ],
    });
    const r = await adapter.callTool('google_calendar__list_events', {}, { accessToken: 'a' });
    expect(r.count).toBe(2);
    expect(r.events[0].summary).toBe('Walkthrough');
    expect(r.events[0].start).toBe('2026-05-01T14:00:00Z');
    expect(r.events[0].attendees).toEqual(['sarah@example.com', 'mark@example.com']);
    expect(r.events[1].all_day).toBe(true);
  });

  test('returns error on missing credential', async () => {
    const r = await adapter.callTool('google_calendar__list_events', {}, null);
    expect(r.error).toMatch(/Not connected/);
  });

  test('maps 401 to a reconnect message', async () => {
    mockFetchFail(401, 'Invalid Credentials');
    const r = await adapter.callTool('google_calendar__list_events', {}, { accessToken: 'expired' });
    expect(r.error).toMatch(/expired/i);
  });
});

describe('callTool — search_events', () => {
  test('requires query arg', async () => {
    const r = await adapter.callTool('google_calendar__search_events', {}, { accessToken: 'a' });
    expect(r.error).toMatch(/query is required/);
  });

  test('passes q to Google with 30-day-look-back timeMin', async () => {
    mockFetchOk({ items: [] });
    await adapter.callTool('google_calendar__search_events', { query: 'Davis' }, { accessToken: 'a' });
    const url = global.fetch.mock.calls[0][0];
    const u = new URL(url);
    expect(u.searchParams.get('q')).toBe('Davis');
    expect(u.searchParams.get('timeMin')).toBeTruthy();
    expect(u.searchParams.get('orderBy')).toBe('startTime');
  });
});

describe('unknown tool', () => {
  test('returns error for an unknown calendar tool', async () => {
    const r = await adapter.callTool('google_calendar__nope', {}, { accessToken: 'a' });
    expect(r.error).toMatch(/Unknown tool/);
  });
});
