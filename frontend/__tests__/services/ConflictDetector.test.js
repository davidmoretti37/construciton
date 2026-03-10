/**
 * ConflictDetector Tests
 *
 * Validates scheduling, skill mismatch, budget, and timeline
 * conflict detection — all pure functions (no mocks needed).
 */

import {
  detectSchedulingConflicts,
  detectSkillMismatch,
  detectBudgetIssues,
  detectTimelineIssues,
  formatConflictsForPrompt,
  runAllConflictChecks,
} from '../../src/services/agents/core/ConflictDetector';

// ============================================================
// detectSchedulingConflicts
// ============================================================
describe('detectSchedulingConflicts', () => {
  test('worker on overlapping date → double_booking conflict', () => {
    const schedule = [{
      worker_id: 'w-1',
      start_date: '2025-03-10',
      end_date: '2025-03-14',
      project_name: 'Kitchen Remodel',
    }];

    const conflicts = detectSchedulingConflicts('w-1', ['2025-03-12'], schedule);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('double_booking');
    expect(conflicts[0].severity).toBe('high');
    expect(conflicts[0].existingProject).toBe('Kitchen Remodel');
  });

  test('no overlap → empty array', () => {
    const schedule = [{
      worker_id: 'w-1',
      start_date: '2025-03-10',
      end_date: '2025-03-14',
      project_name: 'Kitchen Remodel',
    }];

    const conflicts = detectSchedulingConflicts('w-1', ['2025-03-20'], schedule);
    expect(conflicts).toHaveLength(0);
  });

  test('different worker → no conflict', () => {
    const schedule = [{
      worker_id: 'w-2',
      start_date: '2025-03-10',
      end_date: '2025-03-14',
      project_name: 'Kitchen Remodel',
    }];

    const conflicts = detectSchedulingConflicts('w-1', ['2025-03-12'], schedule);
    expect(conflicts).toHaveLength(0);
  });

  test('null/empty schedule → empty array', () => {
    expect(detectSchedulingConflicts('w-1', ['2025-03-12'], null)).toEqual([]);
    expect(detectSchedulingConflicts('w-1', ['2025-03-12'], [])).toEqual([]);
  });

  test('null/empty dates → empty array', () => {
    expect(detectSchedulingConflicts('w-1', null, [{ worker_id: 'w-1' }])).toEqual([]);
    expect(detectSchedulingConflicts('w-1', [], [{ worker_id: 'w-1' }])).toEqual([]);
  });
});

// ============================================================
// detectSkillMismatch
// ============================================================
describe('detectSkillMismatch', () => {
  test('worker trade matches required → empty', () => {
    const worker = { full_name: 'John', trade: 'Electrician' };
    const mismatches = detectSkillMismatch(worker, ['electrician']);
    expect(mismatches).toHaveLength(0);
  });

  test('worker "electrician" vs required "electrical" → matches via alias', () => {
    const worker = { full_name: 'John', trade: 'Electrician' };
    const mismatches = detectSkillMismatch(worker, ['electrical']);
    expect(mismatches).toHaveLength(0);
  });

  test('worker "plumber" vs required "electrical" → mismatch', () => {
    const worker = { full_name: 'John', trade: 'Plumber' };
    const mismatches = detectSkillMismatch(worker, ['electrical']);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].type).toBe('skill_mismatch');
    expect(mismatches[0].severity).toBe('medium');
    expect(mismatches[0].required).toBe('electrical');
  });

  test('null worker or null skills → empty', () => {
    expect(detectSkillMismatch(null, ['electrical'])).toEqual([]);
    expect(detectSkillMismatch({ trade: 'Electrician' }, null)).toEqual([]);
    expect(detectSkillMismatch({ trade: 'Electrician' }, [])).toEqual([]);
  });

  test('comma-separated trades match any required', () => {
    const worker = { full_name: 'John', trade: 'Electrician, Plumber' };
    const mismatches = detectSkillMismatch(worker, ['plumbing']);
    expect(mismatches).toHaveLength(0);
  });
});

// ============================================================
// detectBudgetIssues
// ============================================================
describe('detectBudgetIssues', () => {
  test('expenses > contract → critical over_budget', () => {
    const project = { name: 'Kitchen', contractAmount: 50000, expenses: 55000, incomeCollected: 30000 };
    const issues = detectBudgetIssues(project);

    const critical = issues.find(i => i.type === 'over_budget');
    expect(critical).toBeTruthy();
    expect(critical.severity).toBe('critical');
    expect(critical.overBy).toBe(5000);
  });

  test('expenses > income → high negative_cash_flow', () => {
    const project = { name: 'Kitchen', contractAmount: 100000, expenses: 40000, incomeCollected: 20000 };
    const issues = detectBudgetIssues(project);

    const high = issues.find(i => i.type === 'negative_cash_flow');
    expect(high).toBeTruthy();
    expect(high.severity).toBe('high');
  });

  test('>50% spent <30% collected → medium low_collection', () => {
    const project = { name: 'Kitchen', contractAmount: 100000, expenses: 60000, incomeCollected: 20000 };
    const issues = detectBudgetIssues(project);

    const medium = issues.find(i => i.type === 'low_collection');
    expect(medium).toBeTruthy();
    expect(medium.severity).toBe('medium');
  });

  test('>80% spent but under budget → low approaching_budget', () => {
    const project = { name: 'Kitchen', contractAmount: 50000, expenses: 45000, incomeCollected: 50000 };
    const issues = detectBudgetIssues(project);

    const low = issues.find(i => i.type === 'approaching_budget');
    expect(low).toBeTruthy();
    expect(low.severity).toBe('low');
    expect(low.percentSpent).toBe(90);
  });

  test('healthy budget → empty issues', () => {
    const project = { name: 'Kitchen', contractAmount: 100000, expenses: 20000, incomeCollected: 40000 };
    const issues = detectBudgetIssues(project);
    expect(issues).toHaveLength(0);
  });

  test('null project → empty', () => {
    expect(detectBudgetIssues(null)).toEqual([]);
  });
});

// ============================================================
// detectTimelineIssues
// ============================================================
describe('detectTimelineIssues', () => {
  test('past deadline → high overdue', () => {
    const project = { name: 'Kitchen', end_date: '2025-01-01', status: 'active' };
    const issues = detectTimelineIssues(project, new Date('2025-01-10'));

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('overdue');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].daysOverdue).toBe(9);
  });

  test('≤7 days remaining → medium deadline_approaching', () => {
    const project = { name: 'Kitchen', end_date: '2025-03-20', status: 'active' };
    const issues = detectTimelineIssues(project, new Date('2025-03-15'));

    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('deadline_approaching');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].daysRemaining).toBe(5);
  });

  test('>7 days → empty', () => {
    const project = { name: 'Kitchen', end_date: '2025-06-01', status: 'active' };
    const issues = detectTimelineIssues(project, new Date('2025-03-15'));
    expect(issues).toHaveLength(0);
  });

  test('completed project → empty (even if past deadline)', () => {
    const project = { name: 'Kitchen', end_date: '2025-01-01', status: 'completed' };
    const issues = detectTimelineIssues(project, new Date('2025-03-15'));
    expect(issues).toHaveLength(0);
  });

  test('null project → empty', () => {
    expect(detectTimelineIssues(null)).toEqual([]);
  });
});

// ============================================================
// formatConflictsForPrompt
// ============================================================
describe('formatConflictsForPrompt', () => {
  test('filters by minSeverity', () => {
    const conflicts = [
      { severity: 'critical', message: 'Critical issue' },
      { severity: 'low', message: 'Low issue' },
    ];

    const result = formatConflictsForPrompt(conflicts, { minSeverity: 'high' });

    expect(result).toContain('Critical issue');
    expect(result).not.toContain('Low issue');
  });

  test('respects maxItems', () => {
    const conflicts = Array.from({ length: 10 }, (_, i) => ({
      severity: 'high',
      message: `Issue ${i}`,
    }));

    const result = formatConflictsForPrompt(conflicts, { maxItems: 3 });

    const lines = result.split('\n').filter(l => l.startsWith('!!'));
    expect(lines).toHaveLength(3);
  });

  test('empty conflicts → empty string', () => {
    expect(formatConflictsForPrompt([])).toBe('');
    expect(formatConflictsForPrompt(null)).toBe('');
  });
});

// ============================================================
// runAllConflictChecks
// ============================================================
describe('runAllConflictChecks', () => {
  test('aggregates budget + timeline across multiple projects', () => {
    const context = {
      currentDate: '2025-03-15',
      projects: [
        { name: 'Project A', contractAmount: 50000, expenses: 55000, incomeCollected: 30000, end_date: '2025-01-01', status: 'active' },
        { name: 'Project B', contractAmount: 100000, expenses: 20000, incomeCollected: 40000, end_date: '2025-06-01', status: 'active' },
      ],
    };

    const conflicts = runAllConflictChecks(context);

    // Project A: over_budget (critical) + negative_cash_flow (high) + overdue (high)
    // Project B: healthy
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    expect(conflicts.some(c => c.type === 'over_budget')).toBe(true);
    expect(conflicts.some(c => c.type === 'overdue')).toBe(true);
  });

  test('empty projects → empty conflicts', () => {
    expect(runAllConflictChecks({ projects: [] })).toEqual([]);
    expect(runAllConflictChecks({})).toEqual([]);
  });
});
