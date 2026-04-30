/**
 * Tool handlers — daily reports, photos, daily checklist reports.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError, crypto,
  validateUpload, requireSupervisorPermission, safeStorageKey,
  toDate, today, getTodayBounds,
  resolveOwnerId, resolveProjectId, resolveServicePlanId, resolveWorkerId,
} = require('./_shared');

async function get_daily_reports(userId, args = {}) {
  const { project_id, worker_id, start_date, end_date } = args;

  // Resolve project ID if name provided
  let resolvedProjectId = null;
  if (project_id) {
    const projectResolved = await resolveProjectId(userId, project_id);
    if (projectResolved.error) return projectResolved;
    if (projectResolved.suggestions) return projectResolved;
    resolvedProjectId = projectResolved.id;
  }

  // Resolve worker ID if name provided
  let resolvedWorkerId = null;
  if (worker_id) {
    const workerResolved = await resolveWorkerId(userId, worker_id);
    if (workerResolved.error) return workerResolved;
    if (workerResolved.suggestions) return workerResolved;
    resolvedWorkerId = workerResolved.id;
  }

  // First get user's project IDs for security (include supervisor-assigned projects)
  const { data: userProjects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  if (projectError) {
    logger.error('get_daily_reports - project query error:', projectError);
    return { error: projectError.message };
  }

  const projectIds = (userProjects || []).map(p => p.id);
  logger.info(`get_daily_reports: Found ${projectIds.length} projects for user ${userId}`);

  if (projectIds.length === 0) {
    logger.warn('get_daily_reports: No projects found for user');
    return [];
  }

  let q = supabase
    .from('daily_reports')
    .select('id, report_date, notes, photos, custom_tasks, task_progress, tags, worker_id, owner_id, reporter_type, project_id, phase_id, workers(full_name), projects(name), project_phases(name)')
    .or(`project_id.in.(${projectIds.join(',')}),owner_id.eq.${userId}`);

  if (resolvedProjectId) q = q.eq('project_id', resolvedProjectId);
  if (resolvedWorkerId) q = q.eq('worker_id', resolvedWorkerId);
  if (start_date) q = q.gte('report_date', start_date);
  if (end_date) q = q.lte('report_date', end_date);

  const { data, error } = await q.order('report_date', { ascending: false }).limit(20);

  if (error) {
    logger.error('get_daily_reports error:', error);
    return { error: error.message };
  }

  logger.info(`get_daily_reports: Found ${(data || []).length} reports`);

  return (data || []).map(r => ({
    ...r,
    workerName: r.workers?.full_name || (r.reporter_type === 'owner' ? 'Owner' : 'Unknown'),
    projectName: r.projects?.name,
    phaseName: r.project_phases?.name,
    photoCount: r.photos?.length || 0
  }));
}

async function get_photos(userId, args = {}) {
  const { project_id, phase_id, start_date, end_date } = args;

  // Resolve project ID if name provided
  let resolvedProjectId = null;
  if (project_id) {
    const projectResolved = await resolveProjectId(userId, project_id);
    if (projectResolved.error) return projectResolved;
    if (projectResolved.suggestions) return projectResolved;
    resolvedProjectId = projectResolved.id;
  }

  // First get user's project IDs for security (include supervisor-assigned projects)
  const { data: userProjects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  if (projectError) {
    logger.error('get_photos - project query error:', projectError);
    return { error: projectError.message };
  }

  const projectIds = (userProjects || []).map(p => p.id);
  if (projectIds.length === 0) {
    logger.warn('get_photos: No projects found for user');
    return { photos: [], totalCount: 0 };
  }

  let q = supabase
    .from('daily_reports')
    .select('id, report_date, photos, worker_id, project_id, phase_id, workers(full_name), projects(name), project_phases(name)')
    .in('project_id', projectIds)
    .not('photos', 'is', null);

  if (resolvedProjectId) q = q.eq('project_id', resolvedProjectId);
  if (phase_id) q = q.eq('phase_id', phase_id);
  if (start_date) q = q.gte('report_date', start_date);
  if (end_date) q = q.lte('report_date', end_date);

  const { data, error } = await q.order('report_date', { ascending: false }).limit(30);

  if (error) {
    logger.error('get_photos error:', error);
    return { error: error.message };
  }

  // Flatten photos from reports
  const photos = [];
  for (const report of (data || [])) {
    if (report.photos && Array.isArray(report.photos)) {
      for (const photo of report.photos) {
        photos.push({
          url: typeof photo === 'string' ? photo : photo.url,
          reportDate: report.report_date,
          projectName: report.projects?.name,
          phaseName: report.project_phases?.name,
          workerName: report.workers?.full_name
        });
      }
    }
  }

  logger.info(`get_photos: Found ${photos.length} photos from ${(data || []).length} reports`);
  return { photos, totalCount: photos.length };
}

async function create_daily_report(userId, args = {}) {
  const {
    project_id,
    phase_id,
    phase_name,
    report_date,
    notes,
    tags,
    next_day_plan,
    attach_chat_images = true,
  } = args;
  const attachments = args._attachments || [];

  if (!project_id) {
    return { error: 'project_id is required (project name or UUID).' };
  }

  const resolved = await resolveProjectId(userId, project_id);
  if (resolved?.error) return resolved;
  if (resolved?.suggestions) return resolved;

  // Resolve phase: explicit id wins, otherwise fuzzy on phase_name. Both optional.
  let resolvedPhaseId = phase_id || null;
  if (!resolvedPhaseId && phase_name) {
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id, name')
      .eq('project_id', resolved.id);
    const needle = String(phase_name).trim().toLowerCase();
    const exact = (phases || []).filter((p) => p.name.toLowerCase() === needle);
    const fuzzy = exact.length ? exact : (phases || []).filter((p) => p.name.toLowerCase().includes(needle));
    if (fuzzy.length === 1) resolvedPhaseId = fuzzy[0].id;
  }
  if (resolvedPhaseId) {
    const { data: ok } = await supabase
      .from('project_phases')
      .select('id')
      .eq('id', resolvedPhaseId)
      .eq('project_id', resolved.id)
      .maybeSingle();
    if (!ok) resolvedPhaseId = null;
  }

  // Upload any images attached to the chat turn
  const uploadedPhotos = [];
  const uploadFails = [];
  if (attach_chat_images && Array.isArray(attachments) && attachments.length > 0) {
    for (const att of attachments) {
      const mimeType = att?.mimeType || 'image/jpeg';
      if (!att?.base64 || !mimeType.startsWith('image/')) continue;
      const v = validateUpload({ ...att, mimeType });
      if (v) {
        uploadFails.push({ name: att.name || 'image', error: v.error });
        continue;
      }
      try {
        const ext = (mimeType.split('/')[1] || 'jpg').split('+')[0];
        const filePath = safeStorageKey(`${userId}/${resolved.id}/daily-reports`, `${Date.now()}.${ext}`);
        const bytes = Buffer.from(att.base64, 'base64');
        const { error: upErr } = await supabase.storage
          .from('project-documents')
          .upload(filePath, bytes, { contentType: mimeType, upsert: false });
        if (upErr) {
          logger.error('daily-report image upload error:', upErr);
          uploadFails.push({ name: att.name || 'image', error: 'upload failed' });
          continue;
        }
        const { data: pub } = supabase.storage.from('project-documents').getPublicUrl(filePath);
        uploadedPhotos.push(pub?.publicUrl || filePath);
      } catch (e) {
        logger.error('daily-report image upload exception:', e);
        uploadFails.push({ name: att?.name || 'image', error: 'upload failed' });
      }
    }
  }

  const insertRow = {
    project_id: resolved.id,
    phase_id: resolvedPhaseId,
    owner_id: userId,
    reporter_type: 'owner',
    report_date: report_date || today(),
    notes: notes || null,
    photos: uploadedPhotos,
  };
  if (Array.isArray(tags) && tags.length) insertRow.tags = tags;
  if (next_day_plan) insertRow.next_day_plan = next_day_plan;

  const { data, error } = await supabase
    .from('daily_reports')
    .insert(insertRow)
    .select('id, project_id, phase_id, report_date, photos, notes, next_day_plan')
    .single();

  if (error) {
    logger.error('create_daily_report error:', error);
    return {
      ...userSafeError(error, "Couldn't create that daily report."),
      uploaded_photos_count: uploadedPhotos.length,
      upload_failures: uploadFails.length ? uploadFails : undefined,
    };
  }

  return {
    success: true,
    report: {
      id: data.id,
      project_id: data.project_id,
      phase_id: data.phase_id,
      report_date: data.report_date,
      photo_count: (data.photos || []).length,
      notes: data.notes,
      next_day_plan: data.next_day_plan,
    },
    project_name: resolved.name || null,
    upload_failures: uploadFails.length ? uploadFails : undefined,
  };
}

async function get_daily_checklist_report(userId, { project_id, service_plan_id, date, start_date, end_date } = {}) {
  if (!project_id && !service_plan_id) {
    return { error: 'Either project_id or service_plan_id is required' };
  }

  // Resolve by name if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }
  if (service_plan_id) {
    const resolved = await resolveServicePlanId(userId, service_plan_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    service_plan_id = resolved.id;
  }

  const today = new Date().toISOString().split('T')[0];
  const from = date || start_date || (() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  })();
  const to = date || end_date || today;

  // Fetch reports
  let query = supabase
    .from('daily_service_reports')
    .select('id, report_date, reporter_id, photos, notes, created_at')
    .gte('report_date', from)
    .lte('report_date', to)
    .order('report_date', { ascending: true });

  if (project_id) query = query.eq('project_id', project_id);
  else query = query.eq('service_plan_id', service_plan_id);

  const { data: reports, error } = await query;
  if (error) return { error: error.message };
  if (!reports || reports.length === 0) {
    return { period: { from, to }, reports: [], message: 'No daily reports found for this period.' };
  }

  // Fetch entries for all reports
  const reportIds = reports.map(r => r.id);
  const { data: entries } = await supabase
    .from('daily_report_entries')
    .select('*')
    .in('report_id', reportIds)
    .order('sort_order', { ascending: true });

  // Fetch reporter names
  const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
  const { data: reporters } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', reporterIds);
  const reporterMap = {};
  (reporters || []).forEach(r => { reporterMap[r.id] = r.full_name; });

  // Group entries by report
  const entryMap = {};
  (entries || []).forEach(e => {
    if (!entryMap[e.report_id]) entryMap[e.report_id] = [];
    entryMap[e.report_id].push(e);
  });

  // Build response grouped by date
  const byDate = {};
  reports.forEach(report => {
    const reportEntries = entryMap[report.id] || [];
    const checklist = reportEntries
      .filter(e => e.entry_type === 'checklist')
      .map(e => ({
        title: e.title,
        completed: e.completed,
        quantity: e.quantity ? parseFloat(e.quantity) : null,
        quantity_unit: e.quantity_unit,
        photo_url: e.photo_url,
        notes: e.notes,
      }));
    const labor = reportEntries
      .filter(e => e.entry_type === 'labor')
      .map(e => ({
        role: e.title,
        count: e.quantity ? parseFloat(e.quantity) : 0,
      }));

    if (!byDate[report.report_date]) byDate[report.report_date] = [];
    byDate[report.report_date].push({
      reporter: reporterMap[report.reporter_id] || 'Unknown',
      photos: report.photos || [],
      notes: report.notes,
      checklist,
      labor,
    });
  });

  return { period: { from, to }, reports: byDate };
}

async function get_daily_checklist_summary(userId, { project_id, service_plan_id, start_date, end_date } = {}) {
  if (!project_id && !service_plan_id) {
    return { error: 'Either project_id or service_plan_id is required' };
  }

  // Resolve by name if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }
  if (service_plan_id) {
    const resolved = await resolveServicePlanId(userId, service_plan_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    service_plan_id = resolved.id;
  }

  const today = new Date().toISOString().split('T')[0];
  const from = start_date || (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  })();
  const to = end_date || today;

  // Fetch all reports in range
  let query = supabase
    .from('daily_service_reports')
    .select('id, report_date')
    .gte('report_date', from)
    .lte('report_date', to);

  if (project_id) query = query.eq('project_id', project_id);
  else query = query.eq('service_plan_id', service_plan_id);

  const { data: reports, error } = await query;
  if (error) return { error: error.message };
  if (!reports || reports.length === 0) {
    return { period: { from, to }, total_reports: 0, message: 'No daily reports found for this period.' };
  }

  // Fetch all entries
  const reportIds = reports.map(r => r.id);
  const { data: entries } = await supabase
    .from('daily_report_entries')
    .select('*')
    .in('report_id', reportIds);

  // Aggregate checklist items
  const checklistEntries = (entries || []).filter(e => e.entry_type === 'checklist');
  const laborEntries = (entries || []).filter(e => e.entry_type === 'labor');

  // Quantity totals by item title
  const quantityTotals = {};
  checklistEntries.forEach(e => {
    if (e.quantity) {
      if (!quantityTotals[e.title]) {
        quantityTotals[e.title] = { total: 0, unit: e.quantity_unit, days: 0 };
      }
      quantityTotals[e.title].total += parseFloat(e.quantity);
      quantityTotals[e.title].days += 1;
    }
  });

  // Completion rates by item title
  const completionRates = {};
  checklistEntries.forEach(e => {
    if (!completionRates[e.title]) {
      completionRates[e.title] = { completed: 0, total: 0 };
    }
    completionRates[e.title].total += 1;
    if (e.completed) completionRates[e.title].completed += 1;
  });

  // Labor totals by role
  const laborTotals = {};
  laborEntries.forEach(e => {
    if (!laborTotals[e.title]) {
      laborTotals[e.title] = { total_headcount: 0, days: 0 };
    }
    laborTotals[e.title].total_headcount += parseFloat(e.quantity || 0);
    laborTotals[e.title].days += 1;
  });

  return {
    period: { from, to },
    total_reports: reports.length,
    days_reported: [...new Set(reports.map(r => r.report_date))].length,
    quantities: Object.entries(quantityTotals).map(([title, data]) => ({
      item: title,
      total: data.total,
      unit: data.unit,
      days_logged: data.days,
      daily_average: Math.round((data.total / data.days) * 100) / 100,
    })),
    completion_rates: Object.entries(completionRates).map(([title, data]) => ({
      item: title,
      completed: data.completed,
      total: data.total,
      rate: Math.round((data.completed / data.total) * 100) + '%',
    })),
    labor: Object.entries(laborTotals).map(([role, data]) => ({
      role,
      total_headcount: data.total_headcount,
      days: data.days,
      avg_per_day: Math.round((data.total_headcount / data.days) * 10) / 10,
    })),
  };
}


module.exports = {
  get_daily_reports,
  get_photos,
  create_daily_report,
  get_daily_checklist_report,
  get_daily_checklist_summary,
};
