/**
 * Tests for the authenticateUser middleware pattern.
 *
 * The actual middleware is defined inline in server.js. We recreate the same
 * logic here so we can unit-test it without starting the server or needing
 * a real Supabase connection.
 */

// Recreate the auth middleware pattern from server.js
const createAuthMiddleware = (supabaseMock) => async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabaseMock.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Helper to create a mock response object
function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  return res;
}

// Helper to create a mock request object
function createMockReq(headers = {}) {
  return { headers, user: null };
}

describe('authenticateUser middleware', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  // Supabase mock that returns a valid user
  const supabaseSuccess = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
  };

  // Supabase mock that returns an error
  const supabaseError = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' },
      }),
    },
  };

  // Supabase mock that throws an exception
  const supabaseThrows = {
    auth: {
      getUser: jest.fn().mockRejectedValue(new Error('Network error')),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when no authorization header is present', async () => {
    const middleware = createAuthMiddleware(supabaseSuccess);
    const req = createMockReq({});
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Missing or invalid authorization header');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when authorization header lacks Bearer prefix', async () => {
    const middleware = createAuthMiddleware(supabaseSuccess);
    const req = createMockReq({ authorization: 'Basic abc123' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Missing or invalid authorization header');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when authorization header uses wrong scheme', async () => {
    const middleware = createAuthMiddleware(supabaseSuccess);
    const req = createMockReq({ authorization: 'Token xyz' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Missing or invalid authorization header');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when supabase returns an error for the token', async () => {
    const middleware = createAuthMiddleware(supabaseError);
    const req = createMockReq({ authorization: 'Bearer invalid-token-here' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
    expect(next).not.toHaveBeenCalled();
    expect(supabaseError.auth.getUser).toHaveBeenCalledWith('invalid-token-here');
  });

  test('returns 401 when supabase returns null user without error', async () => {
    const supabaseNullUser = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };
    const middleware = createAuthMiddleware(supabaseNullUser);
    const req = createMockReq({ authorization: 'Bearer some-token' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when supabase throws an exception', async () => {
    const middleware = createAuthMiddleware(supabaseThrows);
    const req = createMockReq({ authorization: 'Bearer some-token' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Authentication failed');
    expect(next).not.toHaveBeenCalled();
  });

  test('sets req.user and calls next() for valid token', async () => {
    const middleware = createAuthMiddleware(supabaseSuccess);
    const req = createMockReq({ authorization: 'Bearer valid-token-abc' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(req.user).toEqual(mockUser);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull(); // status() should not have been called
    expect(supabaseSuccess.auth.getUser).toHaveBeenCalledWith('valid-token-abc');
  });

  test('extracts token correctly from Bearer header with JWT-like token', async () => {
    const middleware = createAuthMiddleware(supabaseSuccess);
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
    const req = createMockReq({ authorization: `Bearer ${token}` });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(supabaseSuccess.auth.getUser).toHaveBeenCalledWith(token);
    expect(next).toHaveBeenCalled();
  });
});
