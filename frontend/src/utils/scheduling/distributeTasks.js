/**
 * Pure task distribution helpers — no DB, no async.
 *
 * Fills every working day inside a phase window using floor-division +
 * remainder spread so the calendar has no gaps.
 *
 * Examples:
 *   8 working days / 4 tasks  → [2, 2, 2, 2]   (even)
 *   8 working days / 3 tasks  → [3, 3, 2]      (remainder on first)
 *   7 working days / 4 tasks  → [2, 2, 2, 1]
 *   3 days / 5 tasks          → [1, 1, 1, 0, 0] → last 2 share final day, warning emitted
 */

// ---- Date helpers -----------------------------------------------------------

// Local-time serialization. Do NOT use `toISOString().split('T')[0]` — that's
// UTC and will flip a day for anyone west of UTC.
const toLocalISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseLocalDate = (yyyyMmDd) => {
  if (!yyyyMmDd) return null;
  if (yyyyMmDd instanceof Date) return new Date(yyyyMmDd);
  // Parse as local midnight, NOT UTC. `new Date('2026-04-22')` is UTC —
  // `new Date('2026-04-22T00:00:00')` is local.
  return new Date(String(yyyyMmDd) + 'T00:00:00');
};

const isWorkingDayLocal = (date, workingDays, nonWorkingDates) => {
  const wd = Array.isArray(workingDays) && workingDays.length > 0
    ? workingDays
    : [1, 2, 3, 4, 5];
  const nonWorking = new Set(nonWorkingDates || []);
  if (nonWorking.has(toLocalISODate(date))) return false;
  const jsDay = date.getDay();          // 0=Sun, 6=Sat
  const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon, 7=Sun
  return wd.includes(isoDay);
};

/**
 * Enumerate every working day in [start, end] inclusive as local-ISO strings.
 */
export const listWorkingDays = (startDate, endDate, workingDays, nonWorkingDates) => {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || end < start) return [];
  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWorkingDayLocal(cursor, workingDays, nonWorkingDates)) {
      out.push(toLocalISODate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

export const countWorkingDays = (startDate, endDate, workingDays, nonWorkingDates) =>
  listWorkingDays(startDate, endDate, workingDays, nonWorkingDates).length;

/**
 * Walk forward from `from` (inclusive) until we find the next working day,
 * returning it as a local-ISO date string. Used to chain phases sequentially.
 */
export const nextWorkingDay = (from, workingDays, nonWorkingDates) => {
  const cursor = parseLocalDate(from);
  if (!cursor) return null;
  for (let i = 0; i < 366; i++) {
    if (isWorkingDayLocal(cursor, workingDays, nonWorkingDates)) {
      return toLocalISODate(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
};

// ---- Core distribution ------------------------------------------------------

/**
 * Distribute N tasks across a phase's working-day window.
 *
 * @param {object} phase   - { start_date, end_date, tasks: [{ id, description, ... }] }
 * @param {object} project - { working_days, non_working_dates }
 * @returns {{ assignments: Array, warnings: Array }}
 *
 * `assignments` shape: [{ task, start_date, end_date, dayCount }]
 * `warnings` shape:    [{ code, message }]
 *
 * The caller owns DB writes — this function returns pure data.
 */
export const scheduleTasksAcrossPhase = (phase, project) => {
  const warnings = [];
  const workingDays = project?.working_days || [1, 2, 3, 4, 5];
  const nonWorkingDates = project?.non_working_dates || [];

  const tasks = Array.isArray(phase?.tasks) ? phase.tasks.filter((t) => t && (t.description || t.name || t.title)) : [];
  if (tasks.length === 0) return { assignments: [], warnings };

  if (!phase?.start_date || !phase?.end_date) {
    warnings.push({ code: 'phase_missing_dates', message: `Phase "${phase?.name || 'unnamed'}" has no start/end dates — skipped.` });
    return { assignments: [], warnings };
  }

  const days = listWorkingDays(phase.start_date, phase.end_date, workingDays, nonWorkingDates);
  if (days.length === 0) {
    warnings.push({
      code: 'phase_no_working_days',
      message: `Phase "${phase.name}" has no working days between ${phase.start_date} and ${phase.end_date}.`,
    });
    return { assignments: [], warnings };
  }

  // Floor + remainder distribution
  const base = Math.floor(days.length / tasks.length);
  const remainder = days.length % tasks.length;

  // Edge case: tasks > working days → first `days.length` tasks get 1 day,
  // extras collapse onto the last day. Warn the user.
  if (base === 0) {
    warnings.push({
      code: 'tasks_exceed_days',
      message: `Phase "${phase.name}" has ${tasks.length} tasks but only ${days.length} working days. Extra tasks share the final day.`,
    });
    const assignments = tasks.map((task, i) => {
      const dayIdx = Math.min(i, days.length - 1);
      const date = days[dayIdx];
      return { task, start_date: date, end_date: date, dayCount: 1 };
    });
    return { assignments, warnings };
  }

  const assignments = [];
  let cursor = 0;
  for (let i = 0; i < tasks.length; i++) {
    const span = base + (i < remainder ? 1 : 0);
    const startIdx = cursor;
    const endIdx = cursor + span - 1;
    assignments.push({
      task: tasks[i],
      start_date: days[startIdx],
      end_date: days[endIdx],
      dayCount: span,
    });
    cursor += span;
  }
  return { assignments, warnings };
};

/**
 * Chain phases sequentially: phase[0] starts at project.start_date, phase[1]
 * starts on the next working day AFTER phase[0]'s last task, etc.
 *
 * Returns phases with computed start_date / end_date set (falling back to the
 * incoming dates if `planned_days` alone is all we have).
 *
 * @param {Array}  phases  - ordered by order_index ASC
 * @param {object} project - { start_date, working_days, non_working_dates }
 */
export const computePhaseWindows = (phases, project) => {
  const workingDays = project?.working_days || [1, 2, 3, 4, 5];
  const nonWorkingDates = project?.non_working_dates || [];

  let cursor = project?.start_date
    ? nextWorkingDay(project.start_date, workingDays, nonWorkingDates)
    : null;

  return phases.map((phase) => {
    // Honor explicit dates when both are present (user set them manually).
    if (phase.start_date && phase.end_date) {
      // Advance cursor past this phase so the next one chains correctly.
      cursor = nextWorkingDay(
        addOneCalendarDay(phase.end_date),
        workingDays,
        nonWorkingDates
      );
      return { ...phase };
    }

    // Derive from planned_days when dates missing.
    const days = parseInt(phase.planned_days, 10);
    if (!cursor || !days || days < 1) {
      return { ...phase };
    }
    const window = listNWorkingDays(cursor, days, workingDays, nonWorkingDates);
    if (window.length === 0) return { ...phase };
    const start = window[0];
    const end = window[window.length - 1];
    cursor = nextWorkingDay(addOneCalendarDay(end), workingDays, nonWorkingDates);
    return { ...phase, start_date: start, end_date: end };
  });
};

// ---- Tiny helpers used above ------------------------------------------------

const addOneCalendarDay = (yyyyMmDd) => {
  const d = parseLocalDate(yyyyMmDd);
  if (!d) return null;
  d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
};

const listNWorkingDays = (startDate, n, workingDays, nonWorkingDates) => {
  const cursor = parseLocalDate(startDate);
  if (!cursor) return [];
  const out = [];
  let guard = 0;
  while (out.length < n && guard < 1000) {
    if (isWorkingDayLocal(cursor, workingDays, nonWorkingDates)) {
      out.push(toLocalISODate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return out;
};

export const __internal = { toLocalISODate, parseLocalDate, isWorkingDayLocal };
