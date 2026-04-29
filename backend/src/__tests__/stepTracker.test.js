/**
 * Step tracker tests (Phase 2).
 *
 * Covers the heuristic state machine that tracks per-step lifecycle
 * during a complex agent turn. Verifies:
 *   - returns null for empty / non-array input (so the agent loop can
 *     short-circuit on simple/standard plans without overhead)
 *   - first matching tool call moves a step pending → in_progress
 *   - all expected tools called moves it in_progress → completed
 *   - depends_on prerequisites are honored
 *   - tools are claimed per-step (one tool can't advance two steps)
 *   - markFailed transitions correctly and emits the right event
 *   - SSE events are emitted in the right order with the right shape
 */

const { createStepTracker } = require('../services/stepTracker');

function mockWriter() {
  const events = [];
  return {
    emit: (e) => events.push(e),
    events,
  };
}

describe('createStepTracker', () => {
  test('returns null for empty / missing steps', () => {
    expect(createStepTracker(undefined)).toBeNull();
    expect(createStepTracker(null)).toBeNull();
    expect(createStepTracker([])).toBeNull();
    expect(createStepTracker('not an array')).toBeNull();
  });

  test('returns a tracker for a non-empty step list', () => {
    const tracker = createStepTracker([
      { id: 1, action: 'Do thing one' },
    ], mockWriter());
    expect(tracker).not.toBeNull();
    expect(typeof tracker.onToolRound).toBe('function');
  });
});

describe('step transitions', () => {
  test('first matching tool emits step_started; one-tool steps then complete in the same round', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Create the project', tools_likely: ['create_project_phase'] },
    ], writer);

    tracker.onToolRound([{ name: 'create_project_phase' }]);

    // Both lifecycle events were emitted (in order).
    expect(writer.events.find(e => e.type === 'step_started' && e.step_id === 1)).toBeTruthy();
    expect(writer.events.find(e => e.type === 'step_completed' && e.step_id === 1)).toBeTruthy();
    // Single-tool steps reach 'completed' in the same round — that's correct;
    // the in_progress state is transient inside onToolRound.
    expect(tracker.summary()[0].status).toBe('completed');
  });

  test('all expected tools called → step completed', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Create + email', tools_likely: ['create_project_phase', 'share_document'] },
    ], writer);

    tracker.onToolRound([{ name: 'create_project_phase' }, { name: 'share_document' }]);

    expect(writer.events.find(e => e.type === 'step_started')).toBeTruthy();
    expect(writer.events.find(e => e.type === 'step_completed')).toBeTruthy();
    expect(tracker.summary()[0].status).toBe('completed');
  });

  test('partial completion holds step in_progress until remaining tool runs', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Two tools', tools_likely: ['search_projects', 'update_project'] },
    ], writer);

    tracker.onToolRound([{ name: 'search_projects' }]);
    expect(tracker.summary()[0].status).toBe('in_progress');
    expect(writer.events.find(e => e.type === 'step_completed')).toBeFalsy();

    tracker.onToolRound([{ name: 'update_project' }]);
    expect(tracker.summary()[0].status).toBe('completed');
    expect(writer.events.filter(e => e.type === 'step_completed')).toHaveLength(1);
  });

  test('empty tools_likely + a matched call → step completed (heuristic fallback)', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Generic step with no specific tools' },
    ], writer);

    tracker.onToolRound([{ name: 'search_projects' }]);

    // Generic step "soft-completes" on the first matched call so it
    // doesn't get stuck pending forever.
    expect(tracker.summary()[0].status).toBe('completed');
  });
});

describe('depends_on ordering', () => {
  test('downstream step stays pending until prereq completes', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Step one', tools_likely: ['create_project_phase'] },
      { id: 2, action: 'Step two', tools_likely: ['share_document'], depends_on: [1] },
    ], writer);

    // Round 1: only step 1's tool. Step 2 should NOT start even if its
    // tool also fires later, because we want the dependency honored.
    tracker.onToolRound([{ name: 'create_project_phase' }]);
    expect(tracker.summary()).toEqual([
      expect.objectContaining({ id: 1, status: 'completed' }),
      expect.objectContaining({ id: 2, status: 'pending' }),
    ]);

    // Round 2: step 2's tool now runs.
    tracker.onToolRound([{ name: 'share_document' }]);
    expect(tracker.summary()[1].status).toBe('completed');
  });

  test('a dependent step stays pending if prereq is still pending', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'First', tools_likely: ['search_projects'] },
      { id: 2, action: 'Second', tools_likely: ['share_document'], depends_on: [1] },
    ], writer);

    // Step 2's tool fires before step 1's. Tracker must NOT advance step 2.
    tracker.onToolRound([{ name: 'share_document' }]);
    expect(tracker.summary()[1].status).toBe('pending');
    expect(writer.events.find(e => e.type === 'step_started' && e.step_id === 2)).toBeFalsy();
  });
});

describe('tool attribution', () => {
  test('one tool name advances the earliest matching unfinished step only', () => {
    const writer = mockWriter();
    // Two steps that both list the same tool — the first claim wins.
    const tracker = createStepTracker([
      { id: 1, action: 'A', tools_likely: ['search_projects'] },
      { id: 2, action: 'B', tools_likely: ['search_projects'] },
    ], writer);

    tracker.onToolRound([{ name: 'search_projects' }]);
    expect(tracker.summary()[0].status).toBe('completed');
    expect(tracker.summary()[1].status).toBe('pending');
  });
});

describe('markFailed', () => {
  test('marks a step failed and emits step_failed', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Will fail', tools_likely: ['record_expense'] },
    ], writer);

    tracker.onToolRound([{ name: 'record_expense' }]);
    tracker.markFailed(1, 'API timeout');

    const failedEvent = writer.events.find(e => e.type === 'step_failed');
    expect(failedEvent).toBeTruthy();
    expect(failedEvent.step_id).toBe(1);
    expect(failedEvent.reason).toBe('API timeout');
    expect(tracker.summary()[0].status).toBe('failed');
  });

  test('markFailed overrides a previously-completed status', () => {
    // A tool can RUN and ERROR; onToolRound marks the step completed
    // because the tool was attributed to it, then the agent loop calls
    // markFailed because the result.error was non-empty. The corrective
    // failed event must override.
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'Errored', tools_likely: ['search_projects'] },
    ], writer);

    tracker.onToolRound([{ name: 'search_projects' }]);
    expect(tracker.summary()[0].status).toBe('completed');

    tracker.markFailed(1, 'tool returned error');
    expect(tracker.summary()[0].status).toBe('failed');
    const failed = writer.events.filter(e => e.type === 'step_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBe('tool returned error');
  });

  test('markFailed is a no-op for already-failed steps (no double-emit)', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'X', tools_likely: ['search_projects'] },
    ], writer);
    tracker.markFailed(1, 'first');
    tracker.markFailed(1, 'second');
    const failed = writer.events.filter(e => e.type === 'step_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBe('first');
  });
});

describe('getActiveStepId', () => {
  test('returns the in_progress step if one exists', () => {
    const writer = mockWriter();
    const tracker = createStepTracker([
      { id: 1, action: 'A', tools_likely: ['search_projects', 'update_project'] },
      { id: 2, action: 'B', tools_likely: ['share_document'], depends_on: [1] },
    ], writer);

    tracker.onToolRound([{ name: 'search_projects' }]);
    expect(tracker.getActiveStepId()).toBe(1); // in_progress
  });

  test('returns the next pending step when nothing is in_progress', () => {
    const tracker = createStepTracker([
      { id: 1, action: 'A', tools_likely: ['search_projects'] },
      { id: 2, action: 'B', tools_likely: ['share_document'] },
    ], mockWriter());
    expect(tracker.getActiveStepId()).toBe(1);
  });

  test('returns null when all steps are completed/failed', () => {
    const tracker = createStepTracker([
      { id: 1, action: 'A', tools_likely: ['search_projects'] },
    ], mockWriter());
    tracker.onToolRound([{ name: 'search_projects' }]);
    expect(tracker.getActiveStepId()).toBeNull();
  });
});
