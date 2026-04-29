/**
 * Two-way SMS tests
 *
 * Covers:
 * - twilioService.normalizePhone (digit-only canonical form for matching)
 * - twilioService.sendSms in mock mode (no Twilio creds → status='mock', row inserted)
 * - twilioService.handleInbound (parses Twilio webhook payload, looks up
 *   company by To, customer by From, persists, fires push)
 * - listThreads / markThreadRead (group-by-customer, unread tally)
 *
 * The Supabase client and twilio package are mocked. We do NOT spin up
 * a real DB or hit the network — the goal is the logic of the service.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
// Intentionally leave TWILIO_ACCOUNT_SID/AUTH unset so isLive()===false
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

// ─── In-memory fake DB shared across all .from() calls ───────────────
const mockDb = {
  profiles: [],
  clients: [],
  sms_messages: [],
};

function mockChainable(table, opts = {}) {
  const filters = { eq: [], or: [], ilike: [], in: [], is: [] };
  let updateValues = null;
  let insertValues = null;
  let selectAfter = false;
  let singleAfter = false;
  let orderField = null;
  let orderAsc = true;
  let limitVal = null;

  const matches = (row) => {
    for (const [col, val] of filters.eq) if (row[col] !== val) return false;
    for (const [col, vals] of filters.in) if (!vals.includes(row[col])) return false;
    for (const [col, val] of filters.is) {
      if (val === null && row[col] !== null && row[col] !== undefined) return false;
    }
    for (const [col, pattern] of filters.ilike) {
      const target = pattern.replace(/%/g, '');
      if (!String(row[col] || '').toLowerCase().includes(target.toLowerCase())) return false;
    }
    if (filters.or.length) {
      const passes = filters.or.some((expr) => {
        // Simple parse for "col.op.val,col.op.val"
        return expr.split(',').some((piece) => {
          const m = piece.match(/^(\w+)\.(eq|ilike)\.(.+)$/);
          if (!m) return false;
          const [, col, op, val] = m;
          if (op === 'eq') return row[col] === val;
          if (op === 'ilike') {
            const target = val.replace(/%/g, '');
            return String(row[col] || '').toLowerCase().includes(target.toLowerCase());
          }
          return false;
        });
      });
      if (!passes) return false;
    }
    return true;
  };

  const exec = async () => {
    if (insertValues) {
      const inserted = (Array.isArray(insertValues) ? insertValues : [insertValues]).map((v) => ({
        id: v.id || `${table}-${mockDb[table].length + 1}`,
        created_at: v.created_at || new Date().toISOString(),
        ...v,
      }));
      mockDb[table].push(...inserted);
      const rows = inserted;
      if (selectAfter) return { data: singleAfter ? rows[0] : rows, error: null };
      return { data: null, error: null };
    }
    if (updateValues) {
      const matched = mockDb[table].filter(matches);
      for (const row of matched) Object.assign(row, updateValues);
      if (selectAfter) return { data: matched, error: null };
      return { data: null, error: null };
    }
    let rows = mockDb[table].filter(matches);
    if (orderField) {
      rows = rows.slice().sort((a, b) => {
        const va = a[orderField], vb = b[orderField];
        if (va === vb) return 0;
        return (va < vb ? -1 : 1) * (orderAsc ? 1 : -1);
      });
    }
    if (limitVal != null) rows = rows.slice(0, limitVal);
    if (singleAfter) return { data: rows[0] || null, error: rows.length === 0 ? { message: 'No rows' } : null };
    return { data: rows, error: null };
  };

  const builder = {
    select: () => { selectAfter = true; return builder; },
    eq: (col, val) => { filters.eq.push([col, val]); return builder; },
    or: (expr) => { filters.or.push(expr); return builder; },
    in: (col, vals) => { filters.in.push([col, vals]); return builder; },
    ilike: (col, pattern) => { filters.ilike.push([col, pattern]); return builder; },
    is: (col, val) => { filters.is.push([col, val]); return builder; },
    insert: (vals) => { insertValues = vals; return builder; },
    update: (vals) => { updateValues = vals; return builder; },
    delete: () => { updateValues = null; return builder; },
    order: (field, opts2) => { orderField = field; orderAsc = (opts2?.ascending ?? true); return builder; },
    limit: (n) => { limitVal = n; return builder; },
    single: () => { singleAfter = true; return exec(); },
    then: (resolve, reject) => exec().then(resolve, reject),
  };
  return builder;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn() },
    from: (table) => mockChainable(table),
  }),
}));

const mockSendPush = jest.fn().mockResolvedValue();
jest.mock('../services/pushNotificationService', () => ({
  sendPushToUser: (...args) => mockSendPush(...args),
}));

const twilioService = require('../services/twilioService');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
  mockDb.profiles.length = 0;
  mockDb.clients.length = 0;
  mockDb.sms_messages.length = 0;
  mockSendPush.mockClear();

  mockDb.profiles.push({
    id: 'company-1',
    role: 'owner',
    owner_id: null,
    twilio_number: '+15551112222',
    business_phone_number: '+15551112222',
    twilio_phone_sid: 'PN_TEST',
  });
  mockDb.clients.push({
    id: 'cust-1',
    owner_id: 'company-1',
    full_name: 'Smith Family',
    phone: '(555) 444-5555',
    sms_phone: null,
    email: 'smith@example.com',
  });
  mockDb.clients.push({
    id: 'cust-2',
    owner_id: 'company-1',
    full_name: 'Jones',
    phone: '+15553334444',
    sms_phone: null,
  });
});

describe('twilioService.normalizePhone', () => {
  test('strips formatting and US country code', () => {
    expect(twilioService.normalizePhone('+1 (555) 123-4567')).toBe('5551234567');
    expect(twilioService.normalizePhone('5551234567')).toBe('5551234567');
    expect(twilioService.normalizePhone('(555) 123 4567')).toBe('5551234567');
  });
  test('returns empty for falsy', () => {
    expect(twilioService.normalizePhone(null)).toBe('');
    expect(twilioService.normalizePhone('')).toBe('');
  });
});

describe('sendSms (outbound, mock mode)', () => {
  test('persists row with status=mock when Twilio creds are missing', async () => {
    const row = await twilioService.sendSms('company-1', '+15554445555', 'Hello world', {
      sentBy: 'user-1',
    });
    expect(row.status).toBe('mock');
    expect(row.direction).toBe('out');
    expect(row.body).toBe('Hello world');
    expect(row.from_number).toBe('+15551112222');
    expect(mockDb.sms_messages).toHaveLength(1);
    // Resolves customer by phone-match against clients table
    expect(row.customer_id).toBe('cust-1');
  });

  test('rejects empty body', async () => {
    await expect(twilioService.sendSms('company-1', '+15554445555', '')).rejects.toThrow(/body/);
  });

  test('rejects missing destination', async () => {
    await expect(twilioService.sendSms('company-1', '', 'hi')).rejects.toThrow(/to/);
  });
});

describe('handleInbound (webhook)', () => {
  test('routes inbound from a known customer to the right company + customer', async () => {
    const fakeReq = {
      body: {
        From: '+15554445555',
        To: '+15551112222',
        Body: 'When can you come back?',
        MessageSid: 'SM_test_123',
      },
    };
    const result = await twilioService.handleInbound(fakeReq);
    expect(result.status).toBe('ok');
    expect(result.companyId).toBe('company-1');
    expect(result.customerId).toBe('cust-1');
    expect(mockDb.sms_messages).toHaveLength(1);
    const stored = mockDb.sms_messages[0];
    expect(stored.direction).toBe('in');
    expect(stored.body).toBe('When can you come back?');
    expect(stored.twilio_sid).toBe('SM_test_123');
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockSendPush.mock.calls[0][0]).toBe('company-1');
  });

  test('still stores message when phone is unknown (customer_id=null)', async () => {
    const fakeReq = {
      body: {
        From: '+19998887777',
        To: '+15551112222',
        Body: 'wrong number?',
        MessageSid: 'SM_unknown',
      },
    };
    const result = await twilioService.handleInbound(fakeReq);
    expect(result.status).toBe('ok');
    expect(result.customerId).toBeNull();
    expect(mockDb.sms_messages[0].customer_id).toBeNull();
  });

  test('ignores message when To-number does not match any company', async () => {
    const fakeReq = {
      body: { From: '+15554445555', To: '+19999999999', Body: 'hi', MessageSid: 'X' },
    };
    const result = await twilioService.handleInbound(fakeReq);
    expect(result.status).toBe('ignored');
    expect(mockDb.sms_messages).toHaveLength(0);
  });
});

describe('listThreads + markThreadRead (threading)', () => {
  test('groups by customer, surfaces unread first, then by recency', async () => {
    // Older outbound to Smith
    await twilioService.sendSms('company-1', '+15554445555', 'old outbound', { sentBy: 'u' });
    // Inbound from Smith — newer, unread
    await twilioService.handleInbound({
      body: { From: '+15554445555', To: '+15551112222', Body: 'unread reply', MessageSid: 'SM_a' },
    });
    // Inbound from Jones — read
    await twilioService.handleInbound({
      body: { From: '+15553334444', To: '+15551112222', Body: 'older inbound', MessageSid: 'SM_b' },
    });
    await twilioService.markThreadRead('company-1', 'cust-2');

    const threads = await twilioService.listThreads('company-1');
    expect(threads.length).toBe(2);
    // Smith has unread → must come first
    expect(threads[0].customer_id).toBe('cust-1');
    expect(threads[0].unread_count).toBe(1);
    expect(threads[1].customer_id).toBe('cust-2');
    expect(threads[1].unread_count).toBe(0);
  });

  test('markThreadRead sets read_at on inbound only', async () => {
    await twilioService.handleInbound({
      body: { From: '+15554445555', To: '+15551112222', Body: 'a', MessageSid: 'SM_x' },
    });
    await twilioService.handleInbound({
      body: { From: '+15554445555', To: '+15551112222', Body: 'b', MessageSid: 'SM_y' },
    });
    const before = mockDb.sms_messages.filter((m) => m.read_at).length;
    expect(before).toBe(0);
    const result = await twilioService.markThreadRead('company-1', 'cust-1');
    expect(result.updated).toBe(2);
    const after = mockDb.sms_messages.filter((m) => m.direction === 'in' && m.read_at).length;
    expect(after).toBe(2);
  });
});

describe('resolveCompanyId', () => {
  test('owners resolve to their own id', async () => {
    const id = await twilioService.resolveCompanyId('company-1');
    expect(id).toBe('company-1');
  });

  test('supervisors resolve to their owner_id', async () => {
    mockDb.profiles.push({ id: 'sup-1', role: 'supervisor', owner_id: 'company-1' });
    const id = await twilioService.resolveCompanyId('sup-1');
    expect(id).toBe('company-1');
  });
});
