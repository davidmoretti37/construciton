/**
 * Redistribute every phase-owned worker_task for a project so each phase's
 * working-day window is fully covered by its own tasks.
 *
 * Rules (per Marco's audit):
 *   1. Never touch rows with `phase_task_id IS NULL` — those are manual tasks.
 *   2. Always use `task.id` (the JSONB task UUID) as `phase_task_id`.
 *      Do NOT emit legacy formats like "phase-task-N" or "${phaseName}-${i}".
 *   3. Delete-then-reinsert only rows with `phase_task_id IS NOT NULL`.
 *   4. Runs per-project — debounced 500ms so back-to-back mutations coalesce.
 */

import { supabase } from '../../lib/supabase';
import logger from '../logger';
import { scheduleTasksAcrossPhase, computePhaseWindows } from './distributeTasks';

// ---- Per-project debounce ---------------------------------------------------

const pendingTimers = new Map();       // projectId -> setTimeout handle
const inFlight = new Map();            // projectId -> Promise (for awaiters)

/**
 * Kick off a redistribute. By default debounced (fire-and-forget).
 * Set `opts.immediate = true` to await the write synchronously.
 */
export const redistributeProjectTasks = (projectId, opts = {}) => {
  if (!projectId) return Promise.resolve({ ok: false, reason: 'no_project_id' });
  const immediate = !!opts.immediate;
  const delayMs = immediate ? 0 : 500;

  // If someone already triggered this project, cancel and re-schedule.
  if (pendingTimers.has(projectId)) {
    clearTimeout(pendingTimers.get(projectId));
    pendingTimers.delete(projectId);
  }

  // Return a promise that resolves after the scheduled write completes.
  return new Promise((resolve) => {
    const run = async () => {
      pendingTimers.delete(projectId);
      if (inFlight.has(projectId)) {
        // Coalesce — await the running one.
        try {
          const result = await inFlight.get(projectId);
          resolve(result);
        } catch (e) {
          resolve({ ok: false, error: e?.message });
        }
        return;
      }
      const job = applyRedistribution(projectId).catch((e) => {
        logger?.error?.('[redistribute] failed:', e?.message);
        return { ok: false, error: e?.message };
      });
      inFlight.set(projectId, job);
      try {
        const result = await job;
        resolve(result);
      } finally {
        inFlight.delete(projectId);
      }
    };

    if (immediate) {
      run();
    } else {
      pendingTimers.set(projectId, setTimeout(run, delayMs));
    }
  });
};

// ---- Core ------------------------------------------------------------------

const applyRedistribution = async (projectId) => {
  // 1. Fetch project + phases
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, user_id, start_date, end_date, working_days, non_working_dates')
    .eq('id', projectId)
    .maybeSingle();
  if (projectErr || !project) return { ok: false, reason: 'project_not_found' };

  const { data: phasesRaw, error: phasesErr } = await supabase
    .from('project_phases')
    .select('id, name, order_index, planned_days, start_date, end_date, tasks, assigned_worker_id')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });
  if (phasesErr) return { ok: false, reason: phasesErr.message };

  const phases = (phasesRaw || []).filter((p) => Array.isArray(p.tasks) && p.tasks.length > 0);
  if (phases.length === 0) return { ok: true, written: 0, warnings: [] };

  // 2. Chain phases sequentially (computes dates from planned_days if missing)
  const chained = computePhaseWindows(phases, project);

  // 3. Run per-phase distribution
  const allAssignments = [];
  const warnings = [];
  for (const phase of chained) {
    const { assignments, warnings: phaseWarnings } = scheduleTasksAcrossPhase(phase, project);
    warnings.push(...phaseWarnings);
    for (const a of assignments) {
      allAssignments.push({ ...a, phase });
    }
  }
  if (allAssignments.length === 0) return { ok: true, written: 0, warnings };

  // 4. Fetch existing phase-owned tasks for progress/status preservation
  const { data: existing } = await supabase
    .from('worker_tasks')
    .select('id, phase_task_id, status, worker_id')
    .eq('project_id', projectId)
    .not('phase_task_id', 'is', null);

  // Map phase_task_id → existing row (for status preservation)
  const existingByKey = new Map();
  (existing || []).forEach((row) => {
    if (row.phase_task_id) existingByKey.set(row.phase_task_id, row);
  });

  // 5. Build insert payload. phase_task_id ALWAYS the real task.id UUID.
  const inserts = allAssignments.map((a) => {
    const phase = a.phase;
    const task = a.task;
    const phaseTaskId = String(task.id || `${phase.id}-${task.order ?? 0}`);
    const prior = existingByKey.get(phaseTaskId);
    return {
      project_id: projectId,
      owner_id: project.user_id,
      worker_id: prior?.worker_id || null,
      title: task.description || task.name || task.title || 'Untitled task',
      description: task.description || null,
      start_date: a.start_date,
      end_date: a.end_date,
      status: prior?.status || 'pending',
      phase_task_id: phaseTaskId,
    };
  });

  // 6. Transaction-ish: delete phase-owned tasks, reinsert from scratch.
  //    Manual rows (phase_task_id IS NULL) are never touched.
  const { error: delErr } = await supabase
    .from('worker_tasks')
    .delete()
    .eq('project_id', projectId)
    .not('phase_task_id', 'is', null);
  if (delErr) {
    logger?.warn?.('[redistribute] delete failed:', delErr.message);
    return { ok: false, reason: delErr.message };
  }

  if (inserts.length === 0) return { ok: true, written: 0, warnings };

  const { error: insErr } = await supabase.from('worker_tasks').insert(inserts);
  if (insErr) {
    logger?.error?.('[redistribute] insert failed:', insErr.message);
    return { ok: false, reason: insErr.message };
  }

  return { ok: true, written: inserts.length, warnings };
};

export default redistributeProjectTasks;
