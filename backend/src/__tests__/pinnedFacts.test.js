/**
 * Pinned facts — deterministic logic tests.
 * Mocks the supabase client so this runs without env / DB.
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
  })),
}));

describe('pinnedFacts.buildSystemPromptBlock', () => {
  let pinnedFacts;

  beforeEach(() => {
    jest.resetModules();
  });

  test('returns empty string when no pins', async () => {
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    pinnedFacts = require('../services/pinnedFacts');
    const block = await pinnedFacts.buildSystemPromptBlock('u1');
    expect(block).toBe('');
  });

  test('formats pins as a clean prompt block', async () => {
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                order: () => ({
                  limit: () => Promise.resolve({
                    data: [
                      { key: 'active_project', value: 'Smith Bathroom Remodel', expires_at: null, updated_at: '2026-05-04T00:00:00Z' },
                      { key: 'pending_co', value: 'CO-007 awaiting client response', expires_at: null, updated_at: '2026-05-03T00:00:00Z' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    pinnedFacts = require('../services/pinnedFacts');
    const block = await pinnedFacts.buildSystemPromptBlock('u1');
    expect(block).toContain('# IN-FLIGHT FACTS');
    expect(block).toContain('- active_project: Smith Bathroom Remodel');
    expect(block).toContain('- pending_co: CO-007 awaiting client response');
  });
});
