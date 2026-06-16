/**
 * Weekly Summary Helper
 *
 * Generates a weekly AI summary draft for a project, sharing logic between:
 *   - Manual trigger:  POST /api/portal-admin/summaries/generate
 *   - Auto trigger:    weeklySummaryJob.js (when client_portal_settings.weekly_summary_enabled = true)
 *
 * Output is saved as a draft in `ai_weekly_summaries`. The owner is the only
 * one who can approve & send it (PATCH /summaries/:id/approve), so an auto-
 * generated draft never reaches the client without owner review.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const anthropicClient = require('./anthropicClient');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Default week range = last 7 days ending today (UTC).
 */
function defaultWeekRange() {
  const today = new Date();
  const weekEnd = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 6);
  const weekStart = start.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

const SYSTEM_PROMPT = `You are writing a weekly project update for a homeowner client. Be clear, friendly, and non-technical. Use simple language. Focus on progress and what's coming next. Always respond with valid JSON only — no prose before or after the JSON object.`;

function buildUserPrompt({ project, phases, reports, weekStart, weekEnd }) {
  const phasesBlock = phases?.length
    ? `Current Phases:\n${phases.map(p => `- ${p.name}: ${p.completion_percentage ?? 0}% (${p.status || 'unknown'})`).join('\n')}`
    : '';

  const reportsBlock = reports.map(r => {
    let entry = `\n${r.report_date}:`;
    if (r.work_performed) entry += `\nWork: ${JSON.stringify(r.work_performed)}`;
    if (r.notes) entry += `\nNotes: ${r.notes}`;
    if (r.weather) entry += `\nWeather: ${JSON.stringify(r.weather)}`;
    if (r.materials) entry += `\nMaterials: ${JSON.stringify(r.materials)}`;
    if (r.delays) entry += `\nDelays: ${JSON.stringify(r.delays)}`;
    return entry;
  }).join('\n');

  return `Project: ${project.name}
Overall Progress: ${project.percent_complete ?? 0}%
Status: ${project.status || 'in_progress'}

${phasesBlock}

Daily Reports from ${weekStart} to ${weekEnd}:${reportsBlock}

Write a concise 3-5 paragraph weekly summary. Include:
1. What was accomplished this week
2. Current status of the project
3. What's planned for next week
4. Any delays or issues the client should know about (frame positively)

Also provide 3-5 bullet point highlights.

Respond in JSON format:
{
  "summary": "the full summary text",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"]
}`;
}

function parseSummaryResponse(text) {
  try {
    const jsonMatch = String(text).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || String(text),
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      };
    }
  } catch (e) {
    logger.warn('[weeklySummaryHelper] JSON parse failed, falling back to raw text:', e.message);
  }
  return { summary: String(text), highlights: [] };
}

/**
 * Generate (or regenerate, via upsert) a draft weekly summary for a project.
 * Returns the saved row, or { skipped: true, reason } when generation is
 * impossible (no daily reports, missing project, AI unavailable).
 *
 * Args:
 *   projectId   — required
 *   ownerId     — required (must own the project)
 *   weekStart, weekEnd — optional ISO dates; defaults to last 7 days
 */
async function generateWeeklySummaryDraft({ projectId, ownerId, weekStart, weekEnd }) {
  if (!projectId || !ownerId) {
    throw new Error('projectId and ownerId required');
  }

  const range = (!weekStart || !weekEnd) ? defaultWeekRange() : { weekStart, weekEnd };

  const { data: project } = await supabase
    .from('projects')
    .select('name, status, percent_complete')
    .eq('id', projectId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (!project) {
    return { skipped: true, reason: 'project_not_found' };
  }

  const { data: reports } = await supabase
    .from('daily_reports')
    .select('report_date, notes, work_performed, weather, materials, delays, next_day_plan')
    .eq('project_id', projectId)
    .gte('report_date', range.weekStart)
    .lte('report_date', range.weekEnd)
    .order('report_date');

  if (!reports || reports.length === 0) {
    return { skipped: true, reason: 'no_daily_reports' };
  }

  const { data: phases } = await supabase
    .from('project_phases')
    .select('name, status, completion_percentage')
    .eq('project_id', projectId)
    .order('order_index');

  if (!anthropicClient.isAvailable()) {
    return { skipped: true, reason: 'anthropic_unavailable' };
  }

  let aiText;
  try {
    const result = await anthropicClient.callMessages({
      model: 'claude-sonnet-4.6',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt({ project, phases, reports, ...range }),
      max_tokens: 1000,
      temperature: 0.5,
      timeout_ms: 45000,
    });
    aiText = result.text;
  } catch (e) {
    logger.error('[weeklySummaryHelper] AI call failed:', e.message);
    return { skipped: true, reason: 'ai_error', error: e.message };
  }

  const parsed = parseSummaryResponse(aiText);

  const { data: row, error: saveError } = await supabase
    .from('ai_weekly_summaries')
    .upsert({
      project_id: projectId,
      owner_id: ownerId,
      week_start: range.weekStart,
      week_end: range.weekEnd,
      summary_text: parsed.summary,
      highlights: parsed.highlights,
      status: 'draft',
    }, { onConflict: 'project_id,week_start' })
    .select()
    .single();

  if (saveError) {
    logger.error('[weeklySummaryHelper] save error:', saveError.message);
    throw saveError;
  }

  return { skipped: false, summary: row };
}

module.exports = {
  generateWeeklySummaryDraft,
  defaultWeekRange,
};
