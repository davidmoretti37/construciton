/**
 * Pure unit tests for distributeTasks — no DB, no native, no mocks.
 * Verifies the floor+remainder algorithm and working-day enumeration.
 */

const {
  listWorkingDays,
  countWorkingDays,
  nextWorkingDay,
  scheduleTasksAcrossPhase,
  computePhaseWindows,
} = require('../../../src/utils/scheduling/distributeTasks');

describe('listWorkingDays', () => {
  it('returns Mon-Fri only by default', () => {
    // 2026-04-20 is a Monday, 2026-04-26 is a Sunday
    const days = listWorkingDays('2026-04-20', '2026-04-26');
    expect(days).toEqual([
      '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24',
    ]);
  });

  it('honors custom workingDays (Mon, Wed, Fri)', () => {
    const days = listWorkingDays('2026-04-20', '2026-04-26', [1, 3, 5]);
    expect(days).toEqual(['2026-04-20', '2026-04-22', '2026-04-24']);
  });

  it('skips non-working dates', () => {
    const days = listWorkingDays('2026-04-20', '2026-04-24', [1, 2, 3, 4, 5], ['2026-04-22']);
    expect(days).toEqual(['2026-04-20', '2026-04-21', '2026-04-23', '2026-04-24']);
  });

  it('returns empty when end < start', () => {
    expect(listWorkingDays('2026-04-26', '2026-04-20')).toEqual([]);
  });
});

describe('countWorkingDays', () => {
  it('counts five weekdays in a Mon-Sun range', () => {
    expect(countWorkingDays('2026-04-20', '2026-04-26')).toBe(5);
  });
});

describe('nextWorkingDay', () => {
  it('returns the same day if already a working day', () => {
    expect(nextWorkingDay('2026-04-20')).toBe('2026-04-20'); // Mon
  });

  it('skips forward over a weekend', () => {
    expect(nextWorkingDay('2026-04-25')).toBe('2026-04-27'); // Sat → Mon
  });

  it('skips a non-working date', () => {
    expect(nextWorkingDay('2026-04-22', [1, 2, 3, 4, 5], ['2026-04-22', '2026-04-23']))
      .toBe('2026-04-24');
  });
});

describe('scheduleTasksAcrossPhase — floor+remainder', () => {
  const project = { working_days: [1, 2, 3, 4, 5], non_working_dates: [] };

  it('8 days / 4 tasks → [2,2,2,2]', () => {
    const phase = {
      name: 'Test',
      start_date: '2026-04-20', // Mon
      end_date: '2026-04-29',   // Wed (8 working days: Apr 20-24, 27-29)
      tasks: [
        { id: 't1', description: 'A' },
        { id: 't2', description: 'B' },
        { id: 't3', description: 'C' },
        { id: 't4', description: 'D' },
      ],
    };
    const { assignments, warnings } = scheduleTasksAcrossPhase(phase, project);
    expect(warnings).toHaveLength(0);
    expect(assignments.map(a => a.dayCount)).toEqual([2, 2, 2, 2]);
    expect(assignments[0].start_date).toBe('2026-04-20');
    expect(assignments[3].end_date).toBe('2026-04-29');
  });

  it('8 days / 3 tasks → [3,3,2]', () => {
    const phase = {
      name: 'Test',
      start_date: '2026-04-20',
      end_date: '2026-04-29',
      tasks: [{ id: 't1', description: 'A' }, { id: 't2', description: 'B' }, { id: 't3', description: 'C' }],
    };
    const { assignments } = scheduleTasksAcrossPhase(phase, project);
    expect(assignments.map(a => a.dayCount)).toEqual([3, 3, 2]);
  });

  it('7 days / 4 tasks → [2,2,2,1]', () => {
    const phase = {
      name: 'Test',
      start_date: '2026-04-20', // Mon
      end_date: '2026-04-28',   // Tue (7 working days: 20-24, 27-28)
      tasks: [
        { id: 't1', description: 'A' },
        { id: 't2', description: 'B' },
        { id: 't3', description: 'C' },
        { id: 't4', description: 'D' },
      ],
    };
    const { assignments } = scheduleTasksAcrossPhase(phase, project);
    expect(assignments.map(a => a.dayCount)).toEqual([2, 2, 2, 1]);
  });

  it('tasks > days collapses extras onto last day with warning', () => {
    const phase = {
      name: 'Tight',
      start_date: '2026-04-20', // Mon
      end_date: '2026-04-22',   // Wed (3 working days)
      tasks: [
        { id: 't1', description: 'A' },
        { id: 't2', description: 'B' },
        { id: 't3', description: 'C' },
        { id: 't4', description: 'D' },
        { id: 't5', description: 'E' },
      ],
    };
    const { assignments, warnings } = scheduleTasksAcrossPhase(phase, project);
    expect(warnings.find(w => w.code === 'tasks_exceed_days')).toBeTruthy();
    expect(assignments).toHaveLength(5);
    expect(assignments[3].start_date).toBe('2026-04-22');
    expect(assignments[4].start_date).toBe('2026-04-22');
  });

  it('returns empty assignments when phase has no dates', () => {
    const { assignments, warnings } = scheduleTasksAcrossPhase(
      { name: 'X', tasks: [{ id: 't1', description: 'A' }] },
      project,
    );
    expect(assignments).toEqual([]);
    expect(warnings.find(w => w.code === 'phase_missing_dates')).toBeTruthy();
  });

  it('returns empty when no working days fall inside the window', () => {
    const phase = {
      name: 'Weekend',
      start_date: '2026-04-25', // Sat
      end_date: '2026-04-26',   // Sun
      tasks: [{ id: 't1', description: 'A' }],
    };
    const { assignments, warnings } = scheduleTasksAcrossPhase(phase, project);
    expect(assignments).toEqual([]);
    expect(warnings.find(w => w.code === 'phase_no_working_days')).toBeTruthy();
  });

  it('skips non-working dates inside the window', () => {
    const projectWithHoliday = {
      working_days: [1, 2, 3, 4, 5],
      non_working_dates: ['2026-04-22'],
    };
    const phase = {
      name: 'Holiday',
      start_date: '2026-04-20', // Mon
      end_date: '2026-04-24',   // Fri (4 working days after holiday)
      tasks: [
        { id: 't1', description: 'A' },
        { id: 't2', description: 'B' },
      ],
    };
    const { assignments } = scheduleTasksAcrossPhase(phase, projectWithHoliday);
    expect(assignments.map(a => a.dayCount)).toEqual([2, 2]);
    expect(assignments[0].start_date).toBe('2026-04-20');
    expect(assignments[0].end_date).toBe('2026-04-21');
    expect(assignments[1].start_date).toBe('2026-04-23');
    expect(assignments[1].end_date).toBe('2026-04-24');
  });

  it('drops blank tasks (no description/name/title)', () => {
    const phase = {
      name: 'Test',
      start_date: '2026-04-20',
      end_date: '2026-04-21',
      tasks: [
        { id: 't1', description: 'A' },
        { id: 't2' },
        null,
      ],
    };
    const { assignments } = scheduleTasksAcrossPhase(phase, project);
    expect(assignments).toHaveLength(1);
  });
});

describe('computePhaseWindows — sequential phase chaining', () => {
  it('chains phases by planned_days, skipping weekends', () => {
    const phases = [
      { name: 'P1', planned_days: 3 },
      { name: 'P2', planned_days: 2 },
    ];
    const project = { start_date: '2026-04-20', working_days: [1, 2, 3, 4, 5], non_working_dates: [] };
    const out = computePhaseWindows(phases, project);
    expect(out[0].start_date).toBe('2026-04-20'); // Mon
    expect(out[0].end_date).toBe('2026-04-22');   // Wed
    expect(out[1].start_date).toBe('2026-04-23'); // Thu
    expect(out[1].end_date).toBe('2026-04-24');   // Fri
  });

  it('honors explicit phase dates and chains the next phase after them', () => {
    const phases = [
      { name: 'P1', start_date: '2026-04-20', end_date: '2026-04-22' },
      { name: 'P2', planned_days: 2 },
    ];
    const project = { start_date: '2026-04-20', working_days: [1, 2, 3, 4, 5], non_working_dates: [] };
    const out = computePhaseWindows(phases, project);
    expect(out[1].start_date).toBe('2026-04-23');
    expect(out[1].end_date).toBe('2026-04-24');
  });

  it('skips weekends when chaining a phase that ends on a Friday', () => {
    const phases = [
      { name: 'P1', planned_days: 5 },
      { name: 'P2', planned_days: 1 },
    ];
    const project = { start_date: '2026-04-20', working_days: [1, 2, 3, 4, 5], non_working_dates: [] };
    const out = computePhaseWindows(phases, project);
    expect(out[0].end_date).toBe('2026-04-24'); // Fri
    expect(out[1].start_date).toBe('2026-04-27'); // Mon
  });
});
