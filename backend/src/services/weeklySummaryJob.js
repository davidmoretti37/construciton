/**
 * Weekly Summary Job
 *
 * Daily tick. On Mondays, generates a draft weekly summary for every project
 * where:
 *   - client_portal_settings.weekly_summary_enabled = true
 *   - the project is shared with at least one client (project_clients exists)
 *   - no ai_weekly_summaries row exists yet for the prior Mon–Sun week
 *
 * Drafts only. Owner reviews and approves to send (PATCH /summaries/:id/approve).
 * Owner is notified when a fresh draft is ready.
 *
 * Idempotency:
 *   - The (project_id, week_start) unique index prevents duplicate inserts
 *     even if the job runs twice in the same day.
 *   - Once a row exists for that week, generation is skipped on subsequent ticks.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { generateWeeklySummaryDraft } = require('./weeklySummaryHelper');
const { notify } = require('./notificationService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Default daily. Override for dev/testing.
const TICK_MS = parseInt(process.env.WEEKLY_SUMMARY_INTERVAL_MS, 10)
  || 24 * 60 * 60 * 1000;

// Force-run on every tick regardless of weekday (for staging / manual tests).
const FORCE_RUN = process.env.WEEKLY_SUMMARY_FORCE === '1';

// Day-of-week to fire on. 1 = Monday (default — prior week is Mon..Sun).
const RUN_DOW = parseInt(process.env.WEEKLY_SUMMARY_DOW, 10) || 1;

/**
 * Returns ISO dates for the most recently completed Mon..Sun week.
 * If today is Monday: returns last Mon..Sun.
 */
function priorMondayWeek(now = new Date()) {
  const d = new Date(now);
  // Convert to UTC midnight to keep dates clean
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  // Days back to most recent Sunday (end of prior week if today is Mon..Sun)
  const daysBackToSunday = dow === 0 ? 7 : dow;
  const weekEnd = new Date(d);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - daysBackToSunday);
  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  };
}

async function runWeeklySummaryTick() {
  try {
    const today = new Date();
    if (!FORCE_RUN && today.getUTCDay() !== RUN_DOW) {
      return 0; // Wrong weekday, skip
    }

    const { weekStart, weekEnd } = priorMondayWeek(today);

    // Pull projects with the toggle on. Service-role client bypasses RLS.
    const { data: settingsRows, error } = await supabase
      .from('client_portal_settings')
      .select('project_id, owner_id')
      .eq('weekly_summary_enabled', true);

    if (error) {
      logger.warn('[weeklySummary] fetch settings failed:', error.message);
      return 0;
    }
    if (!settingsRows || settingsRows.length === 0) return 0;

    const projectIds = settingsRows.map(s => s.project_id);

    // Only act on projects actually shared with a client.
    const { data: shared } = await supabase
      .from('project_clients')
      .select('project_id')
      .in('project_id', projectIds);
    const sharedSet = new Set((shared || []).map(s => s.project_id));

    // Skip projects that already have a summary for this week.
    const { data: existing } = await supabase
      .from('ai_weekly_summaries')
      .select('project_id')
      .in('project_id', projectIds)
      .eq('week_start', weekStart);
    const existingSet = new Set((existing || []).map(e => e.project_id));

    let generated = 0;
    let skipped = 0;

    for (const row of settingsRows) {
      if (!sharedSet.has(row.project_id)) {
        skipped++;
        continue;
      }
      if (existingSet.has(row.project_id)) {
        skipped++;
        continue;
      }

      try {
        const result = await generateWeeklySummaryDraft({
          projectId: row.project_id,
          ownerId: row.owner_id,
          weekStart,
          weekEnd,
        });

        if (result.skipped) {
          // no_daily_reports / ai_error / etc — log but don't notify owner.
          // We'll retry next week (the unique index covers this week, so we
          // won't even retry the same week tomorrow).
          logger.info(`[weeklySummary] skipped project ${row.project_id}: ${result.reason}`);
          skipped++;
          continue;
        }

        generated++;

        // Look up the project name for a useful notification body.
        const { data: project } = await supabase
          .from('projects')
          .select('name')
          .eq('id', row.project_id)
          .maybeSingle();

        await notify({
          userId: row.owner_id,
          type: 'system',
          title: 'Weekly summary ready to review',
          body: `A draft summary for ${project?.name || 'your project'} (${weekStart} – ${weekEnd}) is ready. Review and send to your client.`,
          icon: 'sparkles-outline',
          color: '#8B5CF6',
          actionData: {
            project_id: row.project_id,
            summary_id: result.summary?.id,
            week_start: weekStart,
            week_end: weekEnd,
          },
        });
      } catch (e) {
        logger.error(`[weeklySummary] generation failed for project ${row.project_id}:`, e.message);
      }
    }

    if (generated + skipped > 0) {
      logger.info(`[weeklySummary] tick ${weekStart}..${weekEnd}: generated=${generated} skipped=${skipped}`);
    }
    return generated;
  } catch (e) {
    logger.error('[weeklySummary] tick threw:', e.message);
    return 0;
  }
}

function startWeeklySummaryJob() {
  if (process.env.DISABLE_WEEKLY_SUMMARY === '1') {
    logger.info('[weeklySummary] Disabled by env');
    return null;
  }
  // Initial run delayed past server boot
  setTimeout(() => { runWeeklySummaryTick().catch(() => {}); }, 90 * 1000);
  return setInterval(() => {
    runWeeklySummaryTick().catch(() => {});
  }, TICK_MS);
}

module.exports = {
  runWeeklySummaryTick,
  startWeeklySummaryJob,
  priorMondayWeek,
};
