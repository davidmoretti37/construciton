/**
 * Tool handlers - Supabase query functions for each tool.
 * All queries are filtered by userId (owner_id) for security.
 * Uses service role key (bypasses RLS) so we MUST filter manually.
 *
 * SECURITY AUDIT (2026-02-17): All 31 tool handler functions verified to filter by user_id.
 * Uses service_role key — every query manually enforces ownership via .or(user_id) or .eq(owner_id).
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const logger = require('../../../utils/logger');
const { geocodingCache } = require('../../../utils/geocodingCache');
const { userSafeError } = require('../../userSafeError');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== UPLOAD GUARDS ====================
// Caps applied to every base64 attachment ingested by tool handlers. Without
// these a single tool call could write a multi-GB blob into Supabase storage
// or smuggle an executable past the chat agent.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB after base64 decode
const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
]);

function validateUpload(att) {
  if (!att || typeof att.base64 !== 'string' || !att.mimeType) {
    return { error: 'Attachment is missing data or mime type.' };
  }
  if (!ALLOWED_UPLOAD_MIME.has(att.mimeType)) {
    return { error: 'File type not allowed.' };
  }
  // base64 expands ~4 chars per 3 bytes, so 4*N/3 ≈ original size.
  const approxBytes = Math.floor((att.base64.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return { error: 'File too large (max 25 MB).' };
  }
  return null;
}

/**
 * Supervisor capability gate. Owners always pass. Supervisors must have the
 * named permission column set to true on their profile. Other roles fail.
 * Returns null on pass, or `{ error: '<msg>' }` to bubble back as a tool result.
 *
 * Permission keys: can_create_projects, can_create_estimates, can_create_invoices,
 * can_message_clients, can_pay_workers, can_manage_workers.
 */
async function requireSupervisorPermission(userId, permissionKey) {
  const { data: prof } = await supabase
    .from('profiles')
    .select(`role, ${permissionKey}`)
    .eq('id', userId)
    .single();

  if (!prof) return { error: "Couldn't verify your account." };
  if (prof.role === 'owner') return null;
  if (prof.role === 'supervisor' && prof[permissionKey] === true) return null;
  return { error: "You don't have permission to do that. Ask the owner to enable it." };
}

function safeStorageKey(parentId, originalName) {
  const base = (typeof originalName === 'string' ? originalName : 'file')
    .replace(/[\\/]/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 200) || 'file';
  return `${parentId}/${crypto.randomUUID()}-${base}`;
}

// ==================== HELPER ====================

function toDate(str) {
  if (!str) return null;
  return str; // Already YYYY-MM-DD format
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function getTodayBounds() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { startOfDay, endOfDay };
}

/**
 * Resolve userId to the actual owner_id for supervisors.
 * Supervisors' workers are owned by their parent owner.
 */
async function resolveOwnerId(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('owner_id, role')
    .eq('id', userId)
    .single();
  return profile?.role === 'supervisor' ? profile.owner_id : userId;
}

/**
 * Build a Supabase .or() filter that matches ANY word in ANY field.
 * "John kitchen remodel" → name.ilike.%John%,name.ilike.%kitchen%,...
 */
function buildWordSearch(query, fields) {
  const words = query.trim().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return null;
  return words
    .flatMap(w => fields.map(f => `${f}.ilike.%${w}%`))
    .join(',');
}

/**
 * Enrich location coordinates with human-readable address
 * Uses geocoding cache to minimize API calls
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object|null>} { lat, lng, address } or null
 */
async function enrichLocationWithAddress(lat, lng) {
  if (!lat || !lng) return null;

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  // Get address from cache or geocode
  const address = await geocodingCache.getAddress(latitude, longitude);

  return {
    lat: latitude,
    lng: longitude,
    address: address || `${latitude}, ${longitude}` // Fallback to coordinates
  };
}

/**
 * Send a push + in-app notification via the Supabase Edge Function.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function sendNotification({ userId, title, body, type, data, projectId, workerId }) {
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: { userId, title, body, type, data, projectId, workerId },
    });
  } catch (err) {
    logger.error('Notification send failed:', err.message);
  }
}

// Returns assigned_supervisor_id IFF the project has a supervisor distinct from
// the owner AND the owner has granted that supervisor the required permission.
// Returns null otherwise so the caller can skip the fanout cleanly.
async function resolveSupervisorRecipient(projectId, ownerId, requiredPermission) {
  if (!projectId) return null;
  try {
    const { data: proj } = await supabase
      .from('projects')
      .select('assigned_supervisor_id')
      .eq('id', projectId)
      .single();
    const supId = proj?.assigned_supervisor_id;
    if (!supId || supId === ownerId) return null;
    if (!requiredPermission) return supId;
    const { data: sup } = await supabase
      .from('profiles')
      .select(requiredPermission)
      .eq('id', supId)
      .single();
    return sup?.[requiredPermission] ? supId : null;
  } catch (err) {
    logger.error('resolveSupervisorRecipient failed:', err.message);
    return null;
  }
}

/**
 * Recalculates phase completion percentage from worker_tasks.
 * The project_phases.tasks JSONB field may be stale when worker_tasks.status changes,
 * so we cross-reference and recalculate on-the-fly.
 * @param {Array} phases - Array of phase objects with tasks JSONB
 * @param {Array} workerTasks - Array of worker_tasks with phase_task_id and status
 * @returns {Array} Phases with corrected completion_percentage and status
 */
function recalculatePhaseProgress(phases, workerTasks) {
  if (!phases || phases.length === 0) return phases;

  // Build task status map
  const taskStatusMap = {};
  if (workerTasks) {
    for (const wt of workerTasks) {
      if (wt.phase_task_id) {
        taskStatusMap[wt.phase_task_id] = {
          completed: wt.status === 'completed',
          workerTaskId: wt.id,
        };
      }
    }
  }

  let globalTaskIndex = 0;

  for (const phase of phases) {
    if (phase.tasks && Array.isArray(phase.tasks)) {
      // Cross-reference worker_tasks completion status
      phase.tasks.forEach((task, localIndex) => {
        const possibleIds = [
          task.id,
          `phase-task-${globalTaskIndex}`,
          `${phase.name}-${localIndex}`,
        ].filter(Boolean);

        for (const phaseTaskId of possibleIds) {
          if (taskStatusMap.hasOwnProperty(phaseTaskId)) {
            task.completed = taskStatusMap[phaseTaskId].completed;
            task.workerTaskId = taskStatusMap[phaseTaskId].workerTaskId;
            break;
          }
        }

        globalTaskIndex++;
      });

      // Recalculate completion percentage
      const totalTasks = phase.tasks.length;
      const completedTasks = phase.tasks.filter(t => t.completed).length;
      phase.completion_percentage = totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0;

      // Derive status from percentage
      if (phase.completion_percentage === 0) {
        phase.status = 'not_started';
      } else if (phase.completion_percentage >= 100) {
        phase.status = 'completed';
      } else {
        phase.status = 'in_progress';
      }
    }
  }

  return phases;
}

/**
 * Resolve a project ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveProjectId(userId, idOrName) {
  if (!idOrName) return { error: 'No project specified' };

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', idOrName)
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .single();
    if (!data) return { error: 'Project not found or access denied' };
    return { id: idOrName };
  }

  const trimmed = idOrName.trim();
  if (!trimmed) return { error: 'No project specified' };

  const ownerFilter = `user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`;

  // Step 1: Exact name match (case-insensitive)
  const { data: exact } = await supabase
    .from('projects')
    .select('id, name, status')
    .or(ownerFilter)
    .ilike('name', trimmed)
    .limit(5);

  if (exact && exact.length === 1) return { id: exact[0].id };
  if (exact && exact.length > 1) {
    return {
      suggestions: exact.map(p => p.name),
      message: 'Multiple projects match that name. Which one did you mean?',
    };
  }

  // Step 2: Phrase contains (full input as substring)
  const { data: phrase } = await supabase
    .from('projects')
    .select('id, name, status')
    .or(ownerFilter)
    .ilike('name', `%${trimmed}%`)
    .limit(5);

  if (phrase && phrase.length === 1) return { id: phrase[0].id };
  if (phrase && phrase.length > 1) {
    return {
      suggestions: phrase.map(p => p.name),
      message: 'Multiple projects match that name. Which one did you mean?',
    };
  }

  // Step 3: Keyword search — strip noise words, search meaningful terms
  const noiseWords = new Set(['project', 'job', 'the', 'my', 'a', 'an', 'for', 'on', 'site', 'work']);
  const keywords = trimmed.split(/\s+/).filter(w => w.length > 1 && !noiseWords.has(w.toLowerCase()));

  if (keywords.length > 0) {
    const filter = keywords.map(w => `name.ilike.%${w}%`).join(',');

    const { data: fallback } = await supabase
      .from('projects')
      .select('id, name, status')
      .or(ownerFilter)
      .or(filter)
      .limit(5);

    if (fallback && fallback.length === 1) return { id: fallback[0].id };
    if (fallback && fallback.length > 1) {
      return {
        suggestions: fallback.map(p => p.name),
        message: 'Multiple projects match that name. Which one did you mean?',
      };
    }
  }

  return { error: 'No projects found matching that name.' };
}

/**
 * Resolve a service plan ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveServicePlanId(userId, idOrName) {
  if (!idOrName) return { error: 'No service plan specified' };

  const ownerId = await resolveOwnerId(userId);

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', idOrName)
      .eq('owner_id', ownerId)
      .single();
    if (!data) return { error: 'Service plan not found or access denied' };
    return { id: idOrName };
  }

  const trimmed = idOrName.trim();
  if (!trimmed) return { error: 'No service plan specified' };

  // Step 1: Exact name match (case-insensitive)
  const { data: exact } = await supabase
    .from('service_plans')
    .select('id, name, service_type, status')
    .eq('owner_id', ownerId)
    .ilike('name', trimmed)
    .limit(5);

  if (exact && exact.length === 1) return { id: exact[0].id };
  if (exact && exact.length > 1) {
    return {
      suggestions: exact.map(p => p.name),
      message: 'Multiple service plans match that name. Which one did you mean?',
    };
  }

  // Step 2: Phrase contains
  const { data: phrase } = await supabase
    .from('service_plans')
    .select('id, name, service_type, status')
    .eq('owner_id', ownerId)
    .ilike('name', `%${trimmed}%`)
    .limit(5);

  if (phrase && phrase.length === 1) return { id: phrase[0].id };
  if (phrase && phrase.length > 1) {
    return {
      suggestions: phrase.map(p => p.name),
      message: 'Multiple service plans match that name. Which one did you mean?',
    };
  }

  // Step 3: Keyword search
  const noiseWords = new Set(['plan', 'service', 'the', 'my', 'a', 'an', 'for', 'on']);
  const keywords = trimmed.split(/\s+/).filter(w => w.length > 1 && !noiseWords.has(w.toLowerCase()));

  if (keywords.length > 0) {
    const filter = keywords.map(w => `name.ilike.%${w}%`).join(',');
    const { data: fallback } = await supabase
      .from('service_plans')
      .select('id, name, service_type, status')
      .eq('owner_id', ownerId)
      .or(filter)
      .limit(5);

    if (fallback && fallback.length === 1) return { id: fallback[0].id };
    if (fallback && fallback.length > 1) {
      return {
        suggestions: fallback.map(p => p.name),
        message: 'Multiple service plans match that name. Which one did you mean?',
      };
    }
  }

  return { error: 'No service plans found matching that name.' };
}

/**
 * Resolve a worker ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveWorkerId(userId, idOrName) {
  if (!idOrName) return { error: 'No worker specified' };

  // Supervisors' workers are owned by their parent owner
  const ownerId = await resolveOwnerId(userId);

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('workers')
      .select('id')
      .eq('id', idOrName)
      .eq('owner_id', ownerId)
      .single();
    if (!data) return { error: 'Worker not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['full_name', 'trade']);
  if (!filter) return { error: 'No worker specified' };

  const { data } = await supabase
    .from('workers')
    .select('id, full_name, trade')
    .eq('owner_id', ownerId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: 'No workers found matching that name.' };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(w => w.trade ? `${w.full_name} (${w.trade})` : w.full_name),
    message: 'Multiple workers match that name. Which one did you mean?',
  };
}

/**
 * Resolve an estimate ID, number, or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveEstimateId(userId, idOrName) {
  if (!idOrName) return { error: 'No estimate specified' };

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('estimates')
      .select('id')
      .eq('id', idOrName)
      .eq('user_id', userId)
      .single();
    if (!data) return { error: 'Estimate not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['client_name', 'project_name', 'estimate_number']);
  if (!filter) return { error: 'No estimate specified' };

  const { data } = await supabase
    .from('estimates')
    .select('id, estimate_number, client_name, project_name, status')
    .eq('user_id', userId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: 'No estimates found matching that name or number.' };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(e => {
      const parts = [e.estimate_number, e.client_name, e.project_name].filter(Boolean);
      return parts.join(' — ') || 'estimate';
    }),
    message: 'Multiple estimates match. Which one did you mean?',
  };
}

/**
 * Resolve an invoice ID, number, or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveInvoiceId(userId, idOrName) {
  if (!idOrName) return { error: 'No invoice specified' };

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', idOrName)
      .eq('user_id', userId)
      .single();
    if (!data) return { error: 'Invoice not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['client_name', 'project_name', 'invoice_number']);
  if (!filter) return { error: 'No invoice specified' };

  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, project_name, status')
    .eq('user_id', userId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: 'No invoices found matching that name or number.' };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(i => {
      const parts = [i.invoice_number, i.client_name, i.project_name].filter(Boolean);
      return parts.join(' — ') || 'invoice';
    }),
    message: 'Multiple invoices match. Which one did you mean?',
  };
}

// ==================== PROJECTS ====================

// Fire-and-forget redistribute call used by AI tools that change phase
// structure or project timeline. Calls the backend equivalent: re-enumerate
// phase tasks + rewrite worker_tasks dates. Wraps in setImmediate so the
// AI tool response is not blocked.
async function redistributeTasksForProject(projectId) {
  if (!projectId) return;
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, start_date, end_date, working_days, non_working_dates')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return;
    const { data: phases } = await supabase
      .from('project_phases')
      .select('id, name, order_index, planned_days, start_date, end_date, tasks')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });
    if (!phases || phases.length === 0) return;
    const workingDays = project.working_days || [1, 2, 3, 4, 5];
    const nonWorkingDates = project.non_working_dates || [];
    const toLocalISODate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const parseDate = (s) => s ? new Date(String(s) + 'T00:00:00') : null;
    const isWorkingDay = (date) => {
      const nonWorking = new Set(nonWorkingDates || []);
      if (nonWorking.has(toLocalISODate(date))) return false;
      const jsDay = date.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      return workingDays.includes(isoDay);
    };
    const listWorkingDays = (start, end) => {
      const s = parseDate(start); const e = parseDate(end);
      if (!s || !e || e < s) return [];
      const out = []; const cur = new Date(s);
      while (cur <= e) {
        if (isWorkingDay(cur)) out.push(toLocalISODate(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return out;
    };
    // Compute phase windows sequentially from planned_days when dates missing.
    let cursor = project.start_date ? parseDate(project.start_date) : null;
    const resolvedPhases = phases.map((phase) => {
      if (phase.start_date && phase.end_date) {
        cursor = parseDate(phase.end_date);
        if (cursor) cursor.setDate(cursor.getDate() + 1);
        return phase;
      }
      const n = parseInt(phase.planned_days, 10);
      if (!cursor || !n || n < 1) return phase;
      const picked = [];
      while (picked.length < n && cursor) {
        if (isWorkingDay(cursor)) picked.push(toLocalISODate(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      if (picked.length === 0) return phase;
      return { ...phase, start_date: picked[0], end_date: picked[picked.length - 1] };
    });
    // Delete phase-owned tasks only, rebuild.
    await supabase
      .from('worker_tasks')
      .delete()
      .eq('project_id', projectId)
      .not('phase_task_id', 'is', null);
    const inserts = [];
    for (const phase of resolvedPhases) {
      const tasks = Array.isArray(phase.tasks) ? phase.tasks.filter((t) => t && (t.description || t.name || t.title)) : [];
      if (tasks.length === 0) continue;
      const days = listWorkingDays(phase.start_date, phase.end_date);
      if (days.length === 0) continue;
      const base = Math.floor(days.length / tasks.length);
      const remainder = days.length % tasks.length;
      if (base === 0) {
        tasks.forEach((task, i) => {
          const idx = Math.min(i, days.length - 1);
          inserts.push({
            project_id: projectId,
            owner_id: project.user_id,
            title: task.description || task.name || task.title || 'Untitled',
            start_date: days[idx], end_date: days[idx],
            status: 'pending',
            phase_task_id: String(task.id || `${phase.id}-${task.order ?? 0}`),
          });
        });
        continue;
      }
      let cur = 0;
      for (let i = 0; i < tasks.length; i++) {
        const span = base + (i < remainder ? 1 : 0);
        const s = days[cur]; const e = days[cur + span - 1];
        inserts.push({
          project_id: projectId,
          owner_id: project.user_id,
          title: tasks[i].description || tasks[i].name || tasks[i].title || 'Untitled',
          start_date: s, end_date: e,
          status: 'pending',
          phase_task_id: String(tasks[i].id || `${phase.id}-${tasks[i].order ?? 0}`),
        });
        cur += span;
      }
    }
    if (inserts.length > 0) {
      await supabase.from('worker_tasks').insert(inserts);
    }
  } catch (e) {
    logger.warn('[redistribute-backend] failed:', e?.message);
  }
}


module.exports = {
  supabase, logger, userSafeError, crypto, geocodingCache,
  MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME,
  validateUpload, requireSupervisorPermission, safeStorageKey,
  toDate, today, getTodayBounds,
  resolveOwnerId, buildWordSearch, enrichLocationWithAddress,
  sendNotification, resolveSupervisorRecipient,
  recalculatePhaseProgress,
  resolveProjectId, resolveServicePlanId, resolveWorkerId,
  resolveEstimateId, resolveInvoiceId,
  redistributeTasksForProject,
};
