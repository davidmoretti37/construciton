/**
 * Tool handlers — workers, supervisors, scheduling, time tracking, clock in/out.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission,
  toDate, today, getTodayBounds,
  resolveOwnerId, resolveProjectId, resolveWorkerId,
  enrichLocationWithAddress,
  sendNotification, resolveSupervisorRecipient,
} = require('./_shared');

async function get_workers(userId, args = {}) {
  const { status, trade, include_clock_status = true } = args;

  // Supervisors see their owner's workers
  const ownerId = await resolveOwnerId(userId);

  let q = supabase
    .from('workers')
    .select('id, full_name, email, phone, trade, payment_type, hourly_rate, daily_rate, weekly_salary, project_rate, status, created_at')
    .eq('owner_id', ownerId);

  if (status) {
    q = q.eq('status', status);
  }
  if (trade) {
    const filter = buildWordSearch(trade, ['full_name', 'trade']);
    if (filter) q = q.or(filter);
  }

  const { data: workers, error } = await q.order('full_name', { ascending: true });

  if (error) {
    logger.error('get_workers error:', error);
    return { error: error.message };
  }

  if (!workers || workers.length === 0) return [];

  // Get clock-in status
  if (include_clock_status) {
    const { startOfDay } = getTodayBounds();
    const workerIds = workers.map(w => w.id);

    // Fetch ALL unclosed clock-ins (not just today) so the agent sees stale sessions too
    const { data: allOpenClockIns } = await supabase
      .from('time_tracking')
      .select('worker_id, clock_in, clock_out, project_id, location_lat, location_lng, projects(name)')
      .in('worker_id', workerIds)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    const clockInMap = {};
    const staleClockIns = [];
    if (allOpenClockIns) {
      for (const ci of allOpenClockIns) {
        const isToday = ci.clock_in >= startOfDay;
        const entry = {
          clockedIn: true,
          clockInTime: ci.clock_in,
          project: ci.projects?.name || 'Unknown',
          projectId: ci.project_id,
          location: ci.location_lat ? { lat: ci.location_lat, lng: ci.location_lng } : null,
          stale: !isToday
        };
        // Only set primary clock status from today's sessions
        if (isToday) {
          clockInMap[ci.worker_id] = entry;
        } else {
          staleClockIns.push({ workerId: ci.worker_id, ...entry });
        }
      }
    }

    const result = workers.map(w => ({
      ...w,
      clockStatus: clockInMap[w.id] || { clockedIn: false }
    }));

    // Append stale clock-in warnings so the agent can mention them
    if (staleClockIns.length > 0) {
      return {
        workers: result,
        staleClockIns: staleClockIns.map(s => {
          const worker = workers.find(w => w.id === s.workerId);
          return {
            worker_id: s.workerId,
            worker_name: worker?.full_name || 'Unknown',
            clock_in: s.clockInTime,
            project: s.project,
            location: s.location,
            note: `Unclosed clock-in from ${new Date(s.clockInTime).toLocaleDateString()} — may need to be clocked out`
          };
        }),
        warning: `${staleClockIns.length} worker(s) have unclosed clock-ins from previous days that may need attention.`
      };
    }

    return result;
  }

  return workers;
}

async function get_worker_details(userId, args) {
  let { worker_id } = args;

  // Resolve name to UUID if needed
  const resolved = await resolveWorkerId(userId, worker_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  worker_id = resolved.id;

  // Supervisors see their owner's workers
  const ownerId = await resolveOwnerId(userId);

  // Get worker
  const { data: worker, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (error || !worker) {
    return { error: 'Worker not found' };
  }

  // Get current clock-in (with location)
  const { data: activeClockIn } = await supabase
    .from('time_tracking')
    .select('id, clock_in, project_id, location_lat, location_lng, projects(name)')
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1);

  // Get recent time entries (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentTimeEntries } = await supabase
    .from('time_tracking')
    .select('id, clock_in, clock_out, project_id, hours_worked, projects(name)')
    .eq('worker_id', worker_id)
    .gte('clock_in', weekAgo.toISOString())
    .order('clock_in', { ascending: false })
    .limit(20);

  // Get project assignments
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('project_id, projects(id, name, status)')
    .eq('worker_id', worker_id);

  // Calculate hours this week
  let hoursThisWeek = 0;
  if (recentTimeEntries) {
    for (const entry of recentTimeEntries) {
      if (entry.hours_worked) {
        hoursThisWeek += parseFloat(entry.hours_worked);
      } else if (entry.clock_in && entry.clock_out) {
        hoursThisWeek += (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60);
      }
    }
  }

  return {
    ...worker,
    clockedIn: activeClockIn && activeClockIn.length > 0,
    activeClockIn: activeClockIn?.[0] || null,
    recentTimeEntries: recentTimeEntries || [],
    assignments: (assignments || []).map(a => a.projects).filter(Boolean),
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100
  };
}


async function get_schedule_events(userId, args) {
  const { start_date, end_date, worker_id, project_id } = args;
  const endDate = end_date || start_date;

  // Personal events (meetings, appointments)
  let eventsQuery = supabase
    .from('schedule_events')
    .select('*')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .gte('start_datetime', `${start_date}T00:00:00`)
    .lte('start_datetime', `${endDate}T23:59:59`);

  const { data: events, error: eventsError } = await eventsQuery
    .order('start_datetime', { ascending: true });

  // Work schedules
  let workQuery = supabase
    .from('work_schedules')
    .select('*, workers(full_name, trade), projects(name)')
    .eq('created_by', userId)
    .lte('start_date', endDate)
    .gte('end_date', start_date);

  if (worker_id) workQuery = workQuery.eq('worker_id', worker_id);
  if (project_id) workQuery = workQuery.eq('project_id', project_id);

  const { data: workSchedules } = await workQuery;

  // Worker tasks for the date range
  let tasksQuery = supabase
    .from('worker_tasks')
    .select('id, title, status, start_date, end_date, project_id, projects(name)')
    .eq('owner_id', userId)
    .lte('start_date', endDate)
    .gte('end_date', start_date);

  if (project_id) tasksQuery = tasksQuery.eq('project_id', project_id);

  const { data: tasks } = await tasksQuery.order('start_date', { ascending: true }).limit(50);

  return {
    events: events || [],
    workSchedules: workSchedules || [],
    tasks: tasks || []
  };
}

async function get_time_records(userId, args = {}) {
  const { worker_id, project_id, start_date, end_date, include_active = true } = args;

  // Resolve worker ID if name provided
  let resolvedWorkerId = null;
  if (worker_id) {
    const workerResolved = await resolveWorkerId(userId, worker_id);
    if (workerResolved.error) return workerResolved;
    if (workerResolved.suggestions) return workerResolved;
    resolvedWorkerId = workerResolved.id;
  }

  // Resolve project ID if name provided
  let resolvedProjectId = null;
  if (project_id) {
    const projectResolved = await resolveProjectId(userId, project_id);
    if (projectResolved.error) return projectResolved;
    if (projectResolved.suggestions) return projectResolved;
    resolvedProjectId = projectResolved.id;
  }

  // Default date range: today
  const startDate = start_date || today();
  const endDate = end_date || startDate;

  // Get user's worker IDs for security
  const { data: userWorkers } = await supabase
    .from('workers')
    .select('id')
    .eq('owner_id', userId);

  const workerIds = (userWorkers || []).map(w => w.id);
  if (workerIds.length === 0) return [];

  // Build query
  let q = supabase
    .from('time_tracking')
    .select('*, workers(full_name, trade), projects(name)')
    .in('worker_id', workerIds)
    .gte('clock_in', `${startDate}T00:00:00`)
    .lte('clock_in', `${endDate}T23:59:59`)
    .order('clock_in', { ascending: false });

  if (resolvedWorkerId) {
    q = q.eq('worker_id', resolvedWorkerId);
  }

  if (resolvedProjectId) {
    q = q.eq('project_id', resolvedProjectId);
  }

  if (!include_active) {
    q = q.not('clock_out', 'is', null);
  }

  const { data, error } = await q.limit(100);

  if (error) {
    logger.error('get_time_records error:', error);
    return { error: error.message };
  }

  // Also fetch any active (un-clocked-out) sessions that started before the date range
  // These would be missed by the date filter above but are still relevant
  let allRecords = data || [];
  if (include_active) {
    let activeQ = supabase
      .from('time_tracking')
      .select('*, workers(full_name, trade), projects(name)')
      .in('worker_id', workerIds)
      .is('clock_out', null)
      .lt('clock_in', `${startDate}T00:00:00`);

    if (resolvedWorkerId) {
      activeQ = activeQ.eq('worker_id', resolvedWorkerId);
    }
    if (resolvedProjectId) {
      activeQ = activeQ.eq('project_id', resolvedProjectId);
    }

    const { data: activeData } = await activeQ.limit(50);
    if (activeData && activeData.length > 0) {
      // Merge, avoiding duplicates
      const existingIds = new Set(allRecords.map(r => r.id));
      for (const rec of activeData) {
        if (!existingIds.has(rec.id)) {
          allRecords.push(rec);
        }
      }
    }
  }

  // Calculate hours and format response
  return await Promise.all(allRecords.map(async record => {
    let totalHours = 0;
    let status = 'active';

    if (record.clock_out) {
      const clockIn = new Date(record.clock_in);
      const clockOut = new Date(record.clock_out);
      totalHours = (clockOut - clockIn) / (1000 * 60 * 60); // Convert ms to hours

      // Subtract break time if exists
      if (record.break_start && record.break_end) {
        const breakStart = new Date(record.break_start);
        const breakEnd = new Date(record.break_end);
        const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
        totalHours -= breakHours;
      }

      status = 'completed';
    }

    return {
      id: record.id,
      workerName: record.workers?.full_name || 'Unknown',
      trade: record.workers?.trade,
      projectName: record.projects?.name || 'Unknown',
      clockIn: record.clock_in,
      clockOut: record.clock_out,
      totalHours: Math.round(totalHours * 100) / 100,
      status,
      notes: record.notes,
      location: await enrichLocationWithAddress(
        record.location_lat,
        record.location_lng
      )
    };
  }));
}

async function get_worker_metrics(userId, args = {}) {
  const { worker_id, limit = 25 } = args || {};
  let q = supabase
    .from('worker_metrics_v')
    .select('worker_id, worker_name, status, hours_30d, days_clocked_30d, reports_30d, reports_per_day_30d, last_clock_in, last_report, days_since_last_clock_in')
    .order('hours_30d', { ascending: false })
    .limit(Math.min(limit, 100));
  if (worker_id) q = q.eq('worker_id', worker_id);
  const { data, error } = await q;
  if (error) return userSafeError(error, "Couldn't load worker metrics.");
  return { workers: data || [] };
}

async function assign_worker(userId, args) {
  let { worker_id, project_id } = args;

  // Resolve names to UUIDs if needed
  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  // Verify project ownership and get dates (support supervisors)
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date, status, user_id')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (projErr || !project) return { error: 'Project not found' };

  // Get supervisor's owner_id if they're a supervisor
  const { data: profile } = await supabase
    .from('profiles')
    .select('owner_id, role')
    .eq('id', userId)
    .single();

  const ownerId = profile?.role === 'supervisor' ? profile.owner_id : userId;

  // Verify worker ownership (use parent owner for supervisors)
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name, trade')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (wrkErr || !worker) return { error: 'Worker not found' };

  // Check if already assigned
  const { data: existing } = await supabase
    .from('project_assignments')
    .select('id')
    .eq('project_id', project_id)
    .eq('worker_id', worker_id)
    .single();

  if (existing) {
    return {
      alreadyAssigned: true,
      message: `${worker.full_name} is already assigned to ${project.name}`,
    };
  }

  // Disambiguation: if a supervisor profile under the same owner also matches
  // the requested name, surface both so the AI can ask which the user meant.
  // This prevents silently assigning the worker when the user said the
  // supervisor's name (e.g. "Lana Moretti" — supervisor profile vs worker "Lana").
  const supervisorMatches = await findSupervisorMatchesForName(ownerId, args.worker_id);
  if (supervisorMatches.length > 0) {
    return {
      ambiguous: true,
      message: `"${args.worker_id}" matches both a worker and a supervisor. Which did you mean?`,
      suggestions: [
        { kind: 'worker', id: worker.id, name: worker.full_name, trade: worker.trade, tool: 'assign_worker' },
        ...supervisorMatches.map(s => ({ kind: 'supervisor', id: s.id, name: s.business_name, role: 'supervisor', tool: 'assign_supervisor' })),
      ],
    };
  }

  // Create the assignment
  const { error: assignErr } = await supabase
    .from('project_assignments')
    .insert({ project_id, worker_id });

  if (assignErr) {
    logger.error('assign_worker insert error:', assignErr);
    return userSafeError(assignErr, "Couldn't assign that worker. Try again.");
  }

  // Notify the worker about the new assignment
  const { data: wUser } = await supabase.from('workers').select('user_id').eq('id', worker_id).single();
  if (wUser?.user_id) {
    sendNotification({
      userId: wUser.user_id,
      title: 'New Project Assignment',
      body: `You've been assigned to ${project.name}`,
      type: 'worker_update',
      data: { screen: 'Assignments' },
      projectId: project_id,
      workerId: worker_id,
    });
  }

  return {
    success: true,
    message: `${worker.full_name} (${worker.trade}) assigned to ${project.name}`,
    worker: { id: worker.id, name: worker.full_name, trade: worker.trade },
    project: { id: project.id, name: project.name, startDate: project.start_date, endDate: project.end_date },
  };
}

/**
 * Look up supervisor profiles under `ownerId` whose `business_name` matches
 * any whole word in `idOrName`. Used to detect cross-table name collisions
 * during worker/supervisor assignment.
 */
async function findSupervisorMatchesForName(ownerId, idOrName) {
  if (!idOrName) return [];
  if (idOrName.match(/^[0-9a-f]{8}-/i)) return [];
  const filter = buildWordSearch(idOrName, ['business_name']);
  if (!filter) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, business_name')
    .eq('owner_id', ownerId)
    .eq('role', 'supervisor')
    .or(filter)
    .limit(5);
  return data || [];
}

/**
 * Resolve a supervisor name/UUID to a profile under the current owner.
 */
async function resolveSupervisorId(userId, idOrName) {
  if (!idOrName) return { error: 'No supervisor specified' };
  const ownerId = await resolveOwnerId(userId);

  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('profiles')
      .select('id, business_name')
      .eq('id', idOrName)
      .eq('owner_id', ownerId)
      .eq('role', 'supervisor')
      .single();
    if (!data) return { error: 'Supervisor not found or access denied' };
    return { id: idOrName, name: data.business_name };
  }

  const matches = await findSupervisorMatchesForName(ownerId, idOrName);
  if (matches.length === 0) return { error: `No supervisor found matching "${idOrName}"` };
  if (matches.length === 1) return { id: matches[0].id, name: matches[0].business_name };
  return {
    suggestions: matches.map(s => ({ id: s.id, name: s.business_name })),
    message: `Multiple supervisors match "${idOrName}". Which one?`,
  };
}

/**
 * Assign a supervisor to a project by setting projects.assigned_supervisor_id.
 * The supervisor must be a profile with role='supervisor' under the same owner.
 */
async function assign_supervisor(userId, args) {
  let { supervisor_id, project_id } = args;

  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const resolvedSup = await resolveSupervisorId(userId, supervisor_id);
  if (resolvedSup.error) return { error: resolvedSup.error };
  if (resolvedSup.suggestions) return resolvedSup;
  supervisor_id = resolvedSup.id;

  // Owner-only — supervisors can't reassign themselves or peers.
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, assigned_supervisor_id')
    .eq('id', project_id)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) {
    return { error: 'Project not found, or you are not the owner. Only the owner can assign a supervisor.' };
  }

  if (project.assigned_supervisor_id === supervisor_id) {
    return {
      alreadyAssigned: true,
      message: `${resolvedSup.name} is already the supervisor on ${project.name}.`,
    };
  }

  const { error: updErr } = await supabase
    .from('projects')
    .update({ assigned_supervisor_id: supervisor_id, updated_at: new Date().toISOString() })
    .eq('id', project_id);

  if (updErr) {
    logger.error('assign_supervisor update error:', updErr);
    return userSafeError(updErr, "Couldn't assign that supervisor. Try again.");
  }

  sendNotification({
    userId: supervisor_id,
    title: 'New Project Assignment',
    body: `You've been assigned as supervisor on ${project.name}`,
    type: 'project_status',
    data: { screen: 'ProjectDetail', projectId: project_id },
    projectId: project_id,
  });

  return {
    success: true,
    message: `${resolvedSup.name} assigned as supervisor on ${project.name}.`,
    supervisor: { id: supervisor_id, name: resolvedSup.name },
    project: { id: project.id, name: project.name },
  };
}

/**
 * Remove a worker from a project. Deletes the project_assignments row.
 * Permission mirrors assign_worker: owner OR the assigned supervisor.
 * Idempotent — returns a friendly message if the worker wasn't assigned.
 */
async function unassign_worker(userId, args) {
  let { worker_id, project_id } = args;

  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, user_id')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (projErr || !project) return { error: 'Project not found' };

  const { data: worker } = await supabase
    .from('workers')
    .select('id, full_name, trade, user_id')
    .eq('id', worker_id)
    .single();

  if (!worker) return { error: 'Worker not found' };

  const { data: existing } = await supabase
    .from('project_assignments')
    .select('id')
    .eq('project_id', project_id)
    .eq('worker_id', worker_id)
    .maybeSingle();

  if (!existing) {
    return {
      alreadyUnassigned: true,
      message: `${worker.full_name} wasn't assigned to ${project.name}.`,
    };
  }

  const { error: delErr } = await supabase
    .from('project_assignments')
    .delete()
    .eq('project_id', project_id)
    .eq('worker_id', worker_id);

  if (delErr) {
    logger.error('unassign_worker delete error:', delErr);
    return userSafeError(delErr, "Couldn't unassign that worker. Try again.");
  }

  if (worker.user_id) {
    sendNotification({
      userId: worker.user_id,
      title: 'Project Assignment Removed',
      body: `You've been removed from ${project.name}`,
      type: 'worker_update',
      data: { screen: 'Assignments' },
      projectId: project_id,
      workerId: worker_id,
    });
  }

  return {
    success: true,
    message: `${worker.full_name} unassigned from ${project.name}.`,
    worker: { id: worker.id, name: worker.full_name, trade: worker.trade },
    project: { id: project.id, name: project.name },
  };
}

/**
 * Remove the supervisor from a project. Sets projects.assigned_supervisor_id to NULL.
 * Owner-only — supervisors cannot unassign themselves or peers.
 * Idempotent — returns a friendly message if no supervisor was assigned.
 */
async function unassign_supervisor(userId, args) {
  let { project_id } = args;

  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, assigned_supervisor_id')
    .eq('id', project_id)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) {
    return { error: 'Project not found, or you are not the owner. Only the owner can unassign a supervisor.' };
  }

  if (!project.assigned_supervisor_id) {
    return {
      alreadyUnassigned: true,
      message: `${project.name} has no supervisor assigned.`,
    };
  }

  const previousSupervisorId = project.assigned_supervisor_id;

  const { data: prevProfile } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('id', previousSupervisorId)
    .single();
  const previousName = prevProfile?.business_name || 'The supervisor';

  const { error: updErr } = await supabase
    .from('projects')
    .update({ assigned_supervisor_id: null, updated_at: new Date().toISOString() })
    .eq('id', project_id);

  if (updErr) {
    logger.error('unassign_supervisor update error:', updErr);
    return userSafeError(updErr, "Couldn't unassign that supervisor. Try again.");
  }

  sendNotification({
    userId: previousSupervisorId,
    title: 'Project Assignment Removed',
    body: `You've been removed as supervisor from ${project.name}`,
    type: 'project_status',
    data: { screen: 'ProjectDetail', projectId: project_id },
    projectId: project_id,
  });

  return {
    success: true,
    message: `${previousName} unassigned as supervisor from ${project.name}.`,
    supervisor: { id: previousSupervisorId, name: previousName },
    project: { id: project.id, name: project.name },
  };
}

/**
 * Generate a summary report from daily reports for a project/date range.
 * Aggregates notes and photos into a single client-ready summary.
 */
async function create_work_schedule(userId, { worker, project, start_date, end_date, start_time, end_time, notes }) {
  const resolvedWorker = await resolveWorkerId(userId, worker);
  if (resolvedWorker.error) return resolvedWorker;
  if (resolvedWorker.suggestions) return resolvedWorker;

  let projectId = null;
  let projectName = null;
  if (project) {
    const resolvedProject = await resolveProjectId(userId, project);
    if (resolvedProject.error) return resolvedProject;
    if (resolvedProject.suggestions) return resolvedProject;
    projectId = resolvedProject.id;

    // Get project name for response
    const { data: proj } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();
    projectName = proj?.name;
  }

  // Get worker name for response
  const { data: workerData } = await supabase
    .from('workers')
    .select('full_name')
    .eq('id', resolvedWorker.id)
    .single();

  const { data, error } = await supabase
    .from('worker_schedules')
    .insert({
      worker_id: resolvedWorker.id,
      project_id: projectId,
      start_date,
      end_date: end_date || start_date,
      start_time: start_time || null,
      end_time: end_time || null,
      notes: notes || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) return userSafeError(error, "Couldn't create that schedule.");

  return {
    success: true,
    schedule: {
      id: data.id,
      worker_name: workerData?.full_name,
      project_name: projectName,
      start_date: data.start_date,
      end_date: data.end_date,
      start_time: data.start_time,
      end_time: data.end_time,
    },
  };
}


async function create_worker_task(userId, { project, title, description, start_date, end_date }) {
  const resolved = await resolveProjectId(userId, project);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const taskStartDate = start_date || today();

  // Get project name for response
  const { data: proj } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolved.id)
    .single();

  const { data, error } = await supabase
    .from('worker_tasks')
    .insert({
      owner_id: userId,
      project_id: resolved.id,
      title,
      description: description || null,
      start_date: taskStartDate,
      end_date: end_date || taskStartDate,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return userSafeError(error, "Couldn't create that task.");

  // Notify workers assigned to this project about the new task
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('worker_id, workers(user_id)')
    .eq('project_id', resolved.id);
  for (const a of (assignments || [])) {
    if (a.workers?.user_id) {
      sendNotification({
        userId: a.workers.user_id,
        title: 'New Task',
        body: `New task: ${title}${proj?.name ? ` on ${proj.name}` : ''}`,
        type: 'worker_update',
        data: { screen: 'Assignments' },
        projectId: resolved.id,
      });
    }
  }

  
  // Reflow phase-owned worker_tasks so the calendar is gap-free.
  try { await redistributeTasksForProject(project_id || (args && args.project_id)); } catch (_) {}
  return {
    success: true,
    task: {
      id: data.id,
      title: data.title,
      project_name: proj?.name,
      start_date: data.start_date,
      end_date: data.end_date,
      status: data.status,
    },
  };
}

function formatHoursMinutes(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseClockTime(timeStr) {
  if (!timeStr) return new Date().toISOString();
  // HH:MM format → combine with today
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    const today = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);
    return today.toISOString();
  }
  return new Date(timeStr).toISOString();
}

async function clock_in_worker(userId, args) {
  let { worker_id, project_id, clock_in_time } = args;

  // Resolve names to UUIDs
  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const ownerId = await resolveOwnerId(userId);

  // Verify worker ownership
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (wrkErr || !worker) return { error: 'Worker not found or access denied' };

  // Verify project ownership
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (projErr || !project) return { error: 'Project not found or access denied' };

  // Check not already clocked in
  const { data: activeSession } = await supabase
    .from('time_tracking')
    .select('id')
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .limit(1)
    .single();

  if (activeSession) {
    return { error: `${worker.full_name} is already clocked in. Clock them out first.` };
  }

  const clockInTimestamp = parseClockTime(clock_in_time);

  const { data: record, error: insertErr } = await supabase
    .from('time_tracking')
    .insert({
      worker_id,
      project_id,
      clock_in: clockInTimestamp,
    })
    .select('id, worker_id, project_id, clock_in')
    .single();

  if (insertErr) {
    logger.error('clock_in_worker insert error:', insertErr);
    return { error: 'Failed to clock in worker' };
  }

  // Send notification (fire and forget)
  const clockInBody = `${worker.full_name} clocked in on ${project.name}`;
  sendNotification({
    userId: ownerId,
    title: 'Worker Clocked In',
    body: clockInBody,
    type: 'worker_update',
    data: { screen: 'Workers' },
    workerId: worker_id,
  });
  const clockInSupId = await resolveSupervisorRecipient(project_id, ownerId, 'can_manage_workers');
  if (clockInSupId && clockInSupId !== userId) {
    sendNotification({
      userId: clockInSupId,
      title: 'Worker Clocked In',
      body: clockInBody,
      type: 'worker_update',
      data: { screen: 'Workers' },
      workerId: worker_id,
    });
  }

  return {
    success: true,
    message: `${worker.full_name} clocked in to ${project.name}`,
    workerName: worker.full_name,
    projectName: project.name,
    clockInTime: clockInTimestamp,
    timeTrackingId: record.id,
  };
}

async function clock_out_worker(userId, args) {
  let { worker_id, clock_out_time, notes } = args;

  // Resolve name to UUID
  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  const ownerId = await resolveOwnerId(userId);

  // Verify worker ownership
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name, payment_type, hourly_rate, daily_rate')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (wrkErr || !worker) return { error: 'Worker not found or access denied' };

  // Find active session
  const { data: activeSession, error: sessionErr } = await supabase
    .from('time_tracking')
    .select(`
      id, worker_id, project_id, clock_in,
      projects!inner ( id, name )
    `)
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .limit(1)
    .single();

  if (sessionErr || !activeSession) {
    return { error: `${worker.full_name} is not currently clocked in.` };
  }

  const clockOutTimestamp = parseClockTime(clock_out_time);

  // Update clock_out
  const { error: updateErr } = await supabase
    .from('time_tracking')
    .update({ clock_out: clockOutTimestamp, notes: notes || null })
    .eq('id', activeSession.id);

  if (updateErr) {
    logger.error('clock_out_worker update error:', updateErr);
    return { error: 'Failed to clock out worker' };
  }

  // Calculate hours worked
  const clockIn = new Date(activeSession.clock_in);
  const clockOut = new Date(clockOutTimestamp);
  const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);

  // Calculate labor cost and create transaction
  let laborCost = 0;
  let costDescription = '';

  switch (worker.payment_type) {
    case 'hourly':
      laborCost = hoursWorked * (worker.hourly_rate || 0);
      costDescription = `${worker.full_name} - ${formatHoursMinutes(hoursWorked)} @ $${worker.hourly_rate}/hr`;
      break;
    case 'daily':
      if (hoursWorked < 5) {
        laborCost = (worker.daily_rate || 0) * 0.5;
        costDescription = `${worker.full_name} - Half day (${formatHoursMinutes(hoursWorked)}) @ $${worker.daily_rate}/day`;
      } else {
        laborCost = worker.daily_rate || 0;
        costDescription = `${worker.full_name} - Full day (${formatHoursMinutes(hoursWorked)}) @ $${worker.daily_rate}/day`;
      }
      break;
    default:
      // weekly, project_based — no auto labor cost
      break;
  }

  if (laborCost > 0) {
    const { error: txnErr } = await supabase
      .from('project_transactions')
      .insert({
        project_id: activeSession.project_id,
        type: 'expense',
        category: 'labor',
        description: costDescription,
        amount: laborCost,
        date: new Date().toISOString().split('T')[0],
        worker_id: worker.id,
        time_tracking_id: activeSession.id,
        is_auto_generated: true,
        notes: notes || null,
      });

    if (txnErr) {
      logger.error('clock_out_worker labor transaction error:', txnErr);
      // Worker is still clocked out, just no transaction
    }
  }

  const projectName = activeSession.projects?.name || '';

  // Send notification (fire and forget)
  const clockOutBody = `${worker.full_name} clocked out from ${projectName} (${formatHoursMinutes(hoursWorked)})`;
  sendNotification({
    userId: ownerId,
    title: 'Worker Clocked Out',
    body: clockOutBody,
    type: 'worker_update',
    data: { screen: 'Workers' },
    workerId: worker_id,
  });
  const clockOutSupId = await resolveSupervisorRecipient(activeSession.project_id, ownerId, 'can_manage_workers');
  if (clockOutSupId && clockOutSupId !== userId) {
    sendNotification({
      userId: clockOutSupId,
      title: 'Worker Clocked Out',
      body: clockOutBody,
      type: 'worker_update',
      data: { screen: 'Workers' },
      workerId: worker_id,
    });
  }

  return {
    success: true,
    message: `${worker.full_name} clocked out from ${projectName} — ${formatHoursMinutes(hoursWorked)} worked`,
    workerName: worker.full_name,
    projectName,
    hoursWorked: Math.round(hoursWorked * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
  };
}


module.exports = {
  get_workers,
  get_worker_details,
  get_schedule_events,
  get_time_records,
  get_worker_metrics,
  assign_worker,
  assign_supervisor,
  unassign_worker,
  unassign_supervisor,
  create_work_schedule,
  create_worker_task,
  clock_in_worker,
  clock_out_worker,
};
