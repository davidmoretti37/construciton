import { supabase } from '../../lib/supabase';

// Helper: resolve supervisor/owner profile names for reports
const resolveReporterProfiles = async (reports) => {
  const ownerIds = [...new Set(reports.filter(r => r.owner_id && (r.reporter_type === 'supervisor' || r.reporter_type === 'owner')).map(r => r.owner_id))];
  if (ownerIds.length === 0) return;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, business_name')
    .in('id', ownerIds);
  if (profiles) {
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.id] = p; });
    reports.forEach(r => {
      if (r.owner_id && profileMap[r.owner_id]) {
        r.profiles = profileMap[r.owner_id];
      }
    });
  }
};

// ============================================================
// Daily Reports Functions
// ============================================================

/**
 * Save a daily report
 * Note: Progress is no longer tracked via daily reports. Task completion is done in the Schedule.
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {string} phaseId - Phase ID (optional)
 * @param {array} photos - Array of photo URLs
 * @param {array} completedStepIds - Array of completed step IDs (legacy, not used)
 * @param {array} customTasks - Array of custom task descriptions (legacy, not used)
 * @param {string} notes - Report notes
 * @param {object} taskProgress - Map of taskId to progress percentage (legacy, not used)
 * @param {boolean} isOwner - Whether the reporter is the owner
 * @param {array} tags - Array of work category tags (stores work description)
 * @returns {Promise<object|null>} Created report or null
 */
export const saveDailyReport = async (workerId, projectId, phaseId, photos, completedStepIds, customTasks, notes, taskProgress = {}, isOwner = false, tags = []) => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const today = new Date();
    const reportDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const reportData = {
      project_id: projectId,
      phase_id: phaseId || null,
      report_date: reportDateStr,
      photos: photos || [],
      completed_steps: [], // Legacy field, no longer used
      custom_tasks: [], // Legacy field, no longer used
      notes: notes || '',
      tags: tags || [], // Now stores work description
    };

    // If owner OR if no workerId (supervisor case), use owner_id
    if (isOwner || !workerId) {
      reportData.owner_id = userId;
      reportData.worker_id = null;
      reportData.reporter_type = isOwner ? 'owner' : 'supervisor';
    } else {
      reportData.worker_id = workerId;
      reportData.owner_id = null;
      reportData.reporter_type = 'worker';
    }

    const { data, error } = await supabase
      .from('daily_reports')
      .insert(reportData)
      .select('id, project_id, phase_id, worker_id, owner_id, report_date, photos, notes, tags, completed_steps, custom_tasks, reporter_type, created_at')
      .single();

    if (error) throw error;

    // Note: Progress is now calculated from task completion in Schedule, not daily reports

    return data;
  } catch (error) {
    console.error('Error saving daily report:', error);
    return null;
  }
};

/**
 * Fetch a single daily report by ID
 * @param {string} reportId - Report ID
 * @returns {Promise<object|null>} Report object or null
 */
export const fetchDailyReportById = async (reportId) => {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select(`
        id, project_id, phase_id, worker_id, owner_id, report_date, photos, notes, tags, completed_steps, custom_tasks, reporter_type, task_progress, created_at,
        weather, manpower, work_performed, materials, equipment, delays, safety, visitors, photo_captions, next_day_plan,
        workers (id, full_name, trade),
        projects (id, name, location, status),
        project_phases (id, name, completion_percentage)
      `)
      .eq('id', reportId)
      .single();

    if (error) throw error;

    // Resolve supervisor/owner name
    if (data && data.owner_id && (data.reporter_type === 'supervisor' || data.reporter_type === 'owner')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, business_name')
        .eq('id', data.owner_id)
        .single();
      if (profile) data.profiles = profile;
    }

    return data;
  } catch (error) {
    console.error('Error fetching daily report by ID:', error);
    return null;
  }
};

/**
 * Fetch daily reports for a project
 * @param {string} projectId - Project ID
 * @param {object} filters - Optional filters (workerId, phaseId, startDate, endDate)
 * @returns {Promise<array>} Array of reports
 */
export const fetchDailyReports = async (projectId, filters = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const selectFields = `
        id, project_id, service_plan_id, phase_id, worker_id, owner_id, report_date, photos, notes, tags, completed_steps, custom_tasks, reporter_type, created_at,
        weather, manpower, work_performed, materials, equipment, delays, safety, visitors, photo_captions, next_day_plan,
        workers (id, full_name, trade),
        projects (id, name, user_id, assigned_supervisor_id),
        project_phases (id, name),
        service_plans:service_plan_id (id, name)
      `;

    let query;
    if (filters.workerView) {
      // Worker context: no owner/supervisor filter, RLS handles access
      query = supabase
        .from('daily_reports')
        .select(selectFields)
        .order('report_date', { ascending: false });
    } else {
      // Owner/supervisor context: filter by project ownership
      query = supabase
        .from('daily_reports')
        .select(selectFields.replace('projects (', 'projects!inner ('))
        .or(`user_id.eq.${user.id},assigned_supervisor_id.eq.${user.id}`, { foreignTable: 'projects' })
        .order('report_date', { ascending: false });
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (filters.workerId) {
      query = query.eq('worker_id', filters.workerId);
    }

    if (filters.phaseId) {
      query = query.eq('phase_id', filters.phaseId);
    }

    if (filters.startDate) {
      query = query.gte('report_date', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('report_date', filters.endDate);
    }

    query = query.limit(30);

    const { data, error } = await query;

    if (error) throw error;
    let reports = data || [];

    // Also fetch service plan reports (not caught by projects!inner join)
    if (!filters.workerView && !projectId) {
      let spQuery = supabase
        .from('daily_reports')
        .select(selectFields + ', service_plans:service_plan_id (id, name)')
        .not('service_plan_id', 'is', null)
        .is('project_id', null)
        .order('report_date', { ascending: false });

      if (filters.workerId) spQuery = spQuery.eq('worker_id', filters.workerId);
      if (filters.startDate) spQuery = spQuery.gte('report_date', filters.startDate);
      if (filters.endDate) spQuery = spQuery.lte('report_date', filters.endDate);
      spQuery = spQuery.limit(30);

      const { data: spData } = await spQuery;
      if (spData?.length) {
        const existingIds = new Set(reports.map(r => r.id));
        const newReports = spData.filter(r => !existingIds.has(r.id));
        reports = [...reports, ...newReports].sort((a, b) =>
          new Date(b.report_date) - new Date(a.report_date)
        );
      }
    }

    await resolveReporterProfiles(reports);
    return reports;
  } catch (error) {
    console.error('Error fetching daily reports:', error);
    return [];
  }
};

/**
 * Fetch all photos for a project grouped by phase
 * @param {string} projectId - Project ID
 * @returns {Promise<object>} Photos grouped by phase
 */
export const fetchProjectPhotosByPhase = async (projectId) => {
  try {
    const { data: reports, error } = await supabase
      .from('daily_reports')
      .select(`
        id,
        photos,
        report_date,
        phase_id,
        project_phases (id, name)
      `)
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(50);

    if (error) throw error;

    const photosByPhase = {};
    let totalPhotos = 0;

    reports?.forEach(report => {
      if (!report.photos || report.photos.length === 0) return;

      const phaseId = report.phase_id || 'unassigned';
      const phaseName = report.project_phases?.name || 'General';

      if (!photosByPhase[phaseId]) {
        photosByPhase[phaseId] = {
          phaseName,
          photos: []
        };
      }

      report.photos.forEach(url => {
        photosByPhase[phaseId].photos.push({
          url,
          reportId: report.id,
          date: report.report_date
        });
        totalPhotos++;
      });
    });

    return { photosByPhase, totalPhotos };
  } catch (error) {
    console.error('Error fetching project photos:', error);
    return { photosByPhase: {}, totalPhotos: 0 };
  }
};

/**
 * Fetch worker's daily reports for a specific date
 * @param {string} workerId - Worker ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<array>} Array of reports
 */
export const fetchWorkerDailyReports = async (workerId, date) => {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select(`
        id, project_id, phase_id, worker_id, owner_id, report_date, photos, notes, tags,
        completed_steps, custom_tasks, reporter_type, created_at,
        projects (id, name, location, status),
        project_phases (id, name, completion_percentage)
      `)
      .eq('worker_id', workerId)
      .eq('report_date', date)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching worker daily reports:', error);
    return [];
  }
};

/**
 * Fetch photos with intelligent filtering for AI-powered retrieval
 * @param {object} filters - Filter criteria
 * @returns {Promise<Array>} Array of photo objects with metadata
 */
export const fetchPhotosWithFilters = async (filters = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('daily_reports')
      .select(`
        id,
        photos,
        tags,
        report_date,
        notes,
        worker_id,
        project_id,
        phase_id,
        owner_id,
        reporter_type,
        workers (id, full_name, trade),
        projects!inner (id, name, user_id, location),
        project_phases (id, name)
      `)
      .eq('projects.user_id', user.id)
      .order('report_date', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    if (filters.workerId) {
      query = query.eq('worker_id', filters.workerId);
    }

    if (filters.phaseId) {
      query = query.eq('phase_id', filters.phaseId);
    }

    if (filters.startDate) {
      query = query.gte('report_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('report_date', filters.endDate);
    }

    const { data: reports, error } = await query;

    if (error) throw error;

    let filteredReports = reports || [];

    // Also fetch service plan reports (not caught by projects!inner)
    if (!filters.projectId) {
      let spQuery = supabase
        .from('daily_reports')
        .select(`id, photos, tags, report_date, notes, worker_id, project_id, phase_id, owner_id, reporter_type,
          workers (id, full_name, trade), service_plans:service_plan_id (id, name), project_phases (id, name)`)
        .not('service_plan_id', 'is', null)
        .is('project_id', null)
        .order('report_date', { ascending: false });
      if (filters.workerId) spQuery = spQuery.eq('worker_id', filters.workerId);
      if (filters.startDate) spQuery = spQuery.gte('report_date', filters.startDate);
      if (filters.endDate) spQuery = spQuery.lte('report_date', filters.endDate);
      const { data: spData } = await spQuery;
      if (spData?.length) {
        const existingIds = new Set(filteredReports.map(r => r.id));
        filteredReports = [...filteredReports, ...spData.filter(r => !existingIds.has(r.id))];
      }
    }

    await resolveReporterProfiles(filteredReports);

    if (filters.projectName) {
      const searchTerm = filters.projectName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        (r.projects?.name || r.service_plans?.name || '').toLowerCase().includes(searchTerm)
      );
    }

    if (filters.workerName) {
      const searchTerm = filters.workerName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        r.workers?.full_name?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.phaseName) {
      const searchTerm = filters.phaseName.toLowerCase();
      filteredReports = filteredReports.filter(r => {
        const phaseMatch = r.project_phases?.name?.toLowerCase().includes(searchTerm);
        const tagMatch = r.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
        return phaseMatch || tagMatch;
      });
    }

    if (filters.tags) {
      const tagsArray = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      if (tagsArray.length > 0) {
        const searchTags = tagsArray.map(t => t.toLowerCase());
        filteredReports = filteredReports.filter(r => {
          const reportTags = (r.tags || []).map(t => t.toLowerCase());
          return searchTags.some(searchTag =>
            reportTags.some(reportTag =>
              reportTag.includes(searchTag) || searchTag.includes(reportTag)
            )
          );
        });
      }
    }

    const photos = [];
    const limit = filters.limit || 50;

    for (const report of filteredReports) {
      if (!report.photos || report.photos.length === 0) continue;

      for (const photoUrl of report.photos) {
        if (photos.length >= limit) break;

        photos.push({
          url: photoUrl,
          reportId: report.id,
          reportDate: report.report_date,
          projectId: report.project_id,
          projectName: report.projects?.name || report.service_plans?.name || 'Unknown Project',
          projectLocation: report.projects?.location,
          phaseId: report.phase_id,
          phaseName: report.project_phases?.name || 'General',
          workerId: report.worker_id,
          workerName: report.workers?.full_name || (report.reporter_type === 'owner' ? 'Owner' : report.reporter_type === 'supervisor' ? (report.profiles?.business_name || 'Supervisor') : 'Unknown'),
          workerTrade: report.workers?.trade,
          tags: report.tags || [],
          notes: report.notes,
          uploadedBy: report.workers?.full_name || (report.reporter_type === 'owner' ? 'Owner' : report.reporter_type === 'supervisor' ? (report.profiles?.business_name || 'Supervisor') : 'Unknown'),
        });
      }

      if (photos.length >= limit) break;
    }

    return photos;
  } catch (error) {
    console.error('Error fetching photos with filters:', error);
    return [];
  }
};

/**
 * Fetch daily reports with intelligent filtering for AI-powered retrieval
 * @param {object} filters - Filter criteria
 * @returns {Promise<Array>} Array of daily report objects with metadata
 */
export const fetchDailyReportsWithFilters = async (filters = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Default to last 30 days if no date range specified (prevents full table scan)
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    const startDate = filters.startDate || defaultStartDate.toISOString().split('T')[0];

    let query = supabase
      .from('daily_reports')
      .select(`
        id, project_id, phase_id, worker_id, owner_id, report_date, photos, notes, tags, completed_steps, custom_tasks, reporter_type, task_progress, created_at,
        workers (id, full_name, trade),
        projects!inner (id, name, user_id, assigned_supervisor_id, location, status),
        project_phases (id, name, completion_percentage)
      `)
      .or(`user_id.eq.${user.id},assigned_supervisor_id.eq.${user.id}`, { foreignTable: 'projects' })
      .gte('report_date', startDate)
      .order('report_date', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.workerId) {
      query = query.eq('worker_id', filters.workerId);
    }
    if (filters.phaseId) {
      query = query.eq('phase_id', filters.phaseId);
    }
    if (filters.endDate) {
      query = query.lte('report_date', filters.endDate);
    }

    const limit = filters.limit || 20;
    query = query.limit(limit);

    const { data: reports, error } = await query;

    if (error) throw error;

    let filteredReports = reports || [];

    // Also fetch service plan reports (not caught by projects!inner)
    if (!filters.projectId) {
      let spQuery = supabase
        .from('daily_reports')
        .select(`id, project_id, service_plan_id, phase_id, worker_id, owner_id, report_date, photos, notes, tags, completed_steps, custom_tasks, reporter_type, task_progress, created_at,
          workers (id, full_name, trade), service_plans:service_plan_id (id, name), project_phases (id, name, completion_percentage)`)
        .not('service_plan_id', 'is', null)
        .is('project_id', null)
        .gte('report_date', startDate)
        .order('report_date', { ascending: false })
        .limit(limit);
      if (filters.workerId) spQuery = spQuery.eq('worker_id', filters.workerId);
      if (filters.endDate) spQuery = spQuery.lte('report_date', filters.endDate);
      const { data: spData } = await spQuery;
      if (spData?.length) {
        const existingIds = new Set(filteredReports.map(r => r.id));
        filteredReports = [...filteredReports, ...spData.filter(r => !existingIds.has(r.id))]
          .sort((a, b) => new Date(b.report_date) - new Date(a.report_date));
      }
    }

    await resolveReporterProfiles(filteredReports);

    if (filters.projectName) {
      const searchTerm = filters.projectName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        (r.projects?.name || r.service_plans?.name || '').toLowerCase().includes(searchTerm)
      );
    }

    if (filters.workerName) {
      const searchTerm = filters.workerName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        r.workers?.full_name?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.phaseName) {
      const searchTerm = filters.phaseName.toLowerCase();
      filteredReports = filteredReports.filter(r => {
        const phaseMatch = r.project_phases?.name?.toLowerCase().includes(searchTerm);
        const tagMatch = r.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
        return phaseMatch || tagMatch;
      });
    }

    if (filters.tags) {
      const tagsArray = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      if (tagsArray.length > 0) {
        const searchTags = tagsArray.map(t => t.toLowerCase());
        filteredReports = filteredReports.filter(r => {
          const reportTags = (r.tags || []).map(t => t.toLowerCase());
          return searchTags.some(searchTag =>
            reportTags.some(reportTag =>
              reportTag.includes(searchTag) || searchTag.includes(reportTag)
            )
          );
        });
      }
    }

    return filteredReports.map(report => ({
      id: report.id,
      reportDate: report.report_date,
      projectId: report.project_id,
      projectName: report.projects?.name || report.service_plans?.name || 'Unknown Project',
      projectLocation: report.projects?.location,
      projectStatus: report.projects?.status,
      phaseId: report.phase_id,
      phaseName: report.project_phases?.name || 'General',
      phaseProgress: report.project_phases?.completion_percentage || 0,
      workerId: report.worker_id,
      workerName: report.workers?.full_name || (report.reporter_type === 'owner' ? 'Owner' : report.reporter_type === 'supervisor' ? (report.profiles?.business_name || 'Supervisor') : 'Unknown'),
      workerTrade: report.workers?.trade,
      reporterType: report.reporter_type,
      photos: report.photos || [],
      photoCount: (report.photos || []).length,
      notes: report.notes,
      completedSteps: report.completed_steps || [],
      customTasks: report.custom_tasks || [],
      taskProgress: report.task_progress || {},
      tags: report.tags || [],
      createdAt: report.created_at,
    }));
  } catch (error) {
    console.error('Error fetching daily reports with filters:', error);
    return [];
  }
};
