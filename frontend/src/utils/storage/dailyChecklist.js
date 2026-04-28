import { supabase } from '../../lib/supabase';

/**
 * Daily-checklist storage helpers shared between the agenda view (today
 * injection) and the existing DailyChecklistSection. The agenda call paths
 * stay intentionally lightweight: one query for templates, one for today's
 * reports + entries, then a client-side merge.
 *
 * Toggle uses the same upsert pattern as DailyChecklistSection.handleToggleItem:
 *   - if a daily_report_entries row exists for this template → update completed
 *   - else: ensure a daily_service_reports row for (user, project, today),
 *           then insert the entry with completed = newValue
 */

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Fetch today's checklist items for a set of projects, joined with the
 * current user's report+entries so each item knows whether it's completed.
 *
 * Returns flat list of:
 *   { template_id, title, project_id, project_name, completed, entry_id,
 *     report_id, sort_order, owner_id, requires_photo, quantity_unit }
 *
 * @param {Array<{ id: string, name?: string }>} projects - projects in scope
 * @param {string} ownerId - the business owner id (used for report rows)
 * @param {string} userId  - the currently logged-in user (reporter_id filter)
 */
export async function fetchTodayChecklist(projects, ownerId, userId) {
  if (!projects || projects.length === 0 || !ownerId || !userId) return [];
  const projectIds = projects.map(p => p.id).filter(Boolean);
  if (projectIds.length === 0) return [];

  const today = todayStr();

  // 1. Active templates for these projects (recurring + today's one-offs)
  const { data: templates, error: tErr } = await supabase
    .from('daily_checklist_templates')
    .select('id, project_id, title, item_type, sort_order, is_active, specific_date, requires_photo, quantity_unit, owner_id')
    .in('project_id', projectIds)
    .eq('is_active', true)
    .or(`specific_date.is.null,specific_date.eq.${today}`)
    .order('sort_order', { ascending: true });

  if (tErr || !templates || templates.length === 0) return [];

  // 2. Today's reports for this user across these projects
  const { data: reports } = await supabase
    .from('daily_service_reports')
    .select('id, project_id')
    .eq('reporter_id', userId)
    .eq('report_date', today)
    .in('project_id', projectIds);

  const reportByProject = new Map();
  (reports || []).forEach(r => { if (r.project_id) reportByProject.set(r.project_id, r.id); });

  // 3. Entries for those reports
  const reportIds = (reports || []).map(r => r.id);
  let entriesByTemplate = new Map();
  if (reportIds.length > 0) {
    const { data: entries } = await supabase
      .from('daily_report_entries')
      .select('id, report_id, checklist_template_id, completed')
      .in('report_id', reportIds)
      .eq('entry_type', 'checklist');
    (entries || []).forEach(e => {
      if (e.checklist_template_id) entriesByTemplate.set(e.checklist_template_id, e);
    });
  }

  const projectName = new Map();
  projects.forEach(p => projectName.set(p.id, p.name || ''));

  return templates.map(t => {
    const entry = entriesByTemplate.get(t.id);
    return {
      template_id: t.id,
      title: t.title,
      project_id: t.project_id,
      project_name: projectName.get(t.project_id) || '',
      sort_order: t.sort_order || 0,
      requires_photo: !!t.requires_photo,
      quantity_unit: t.quantity_unit || null,
      owner_id: t.owner_id || ownerId,
      report_id: reportByProject.get(t.project_id) || null,
      entry_id: entry?.id || null,
      completed: !!entry?.completed,
    };
  });
}

/**
 * Toggle a checklist item's completed state. Inserts the daily_service_reports
 * row + daily_report_entries row if missing. Returns the new entry id and
 * report id so the caller can update its merged list without a full refetch.
 */
export async function toggleChecklistEntry(item, userId) {
  const newCompleted = !item.completed;

  // Existing entry → just flip completed
  if (item.entry_id) {
    const { error } = await supabase
      .from('daily_report_entries')
      .update({ completed: newCompleted })
      .eq('id', item.entry_id);
    if (error) throw error;
    return { ...item, completed: newCompleted };
  }

  // No entry yet: ensure a report exists, then insert
  let reportId = item.report_id;
  if (!reportId) {
    const { data: newReport, error: rErr } = await supabase
      .from('daily_service_reports')
      .insert({
        project_id: item.project_id,
        owner_id: item.owner_id,
        reporter_id: userId,
        report_date: todayStr(),
      })
      .select('id')
      .single();
    if (rErr || !newReport) throw rErr || new Error('Could not create daily report');
    reportId = newReport.id;
  }

  const { data: newEntry, error: eErr } = await supabase
    .from('daily_report_entries')
    .insert({
      report_id: reportId,
      entry_type: 'checklist',
      checklist_template_id: item.template_id,
      title: item.title,
      completed: newCompleted,
      quantity_unit: item.quantity_unit,
      sort_order: item.sort_order,
    })
    .select('id')
    .single();
  if (eErr || !newEntry) throw eErr || new Error('Could not create entry');

  return { ...item, completed: newCompleted, entry_id: newEntry.id, report_id: reportId };
}
