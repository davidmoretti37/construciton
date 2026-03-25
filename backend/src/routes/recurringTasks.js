/**
 * Recurring Daily Tasks API
 * Templates + daily logs for repetitive project tasks
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

router.use(authenticateUser);

// ============================================================
// TEMPLATES
// ============================================================

// GET /:projectId — list active recurring task templates
router.get('/:projectId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;

    // Verify access (owner or assigned worker)
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check if user is owner or worker on this project
    if (project.user_id !== userId) {
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', userId)
        .single();
      if (!worker) return res.status(403).json({ error: 'Not authorized' });
    }

    const { data, error } = await supabase
      .from('project_recurring_tasks')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    logger.error('[RecurringTasks] List error:', error.message);
    res.status(500).json({ error: 'Failed to list recurring tasks' });
  }
});

// POST / — create recurring task templates (bulk)
router.post('/', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { project_id, phase_id, tasks } = req.body;

    if (!project_id || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'project_id and tasks array are required' });
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', ownerId)
      .single();

    if (!project) return res.status(404).json({ error: 'Project not found or not authorized' });

    const inserts = tasks.map((t, i) => ({
      project_id,
      phase_id: phase_id || null,
      owner_id: ownerId,
      title: t.title,
      requires_quantity: t.requires_quantity || false,
      quantity_unit: t.quantity_unit || null,
      sort_order: t.sort_order ?? i,
    }));

    const { data, error } = await supabase
      .from('project_recurring_tasks')
      .insert(inserts)
      .select();

    if (error) throw error;

    logger.info(`[RecurringTasks] Created ${data.length} templates for project ${project_id}`);
    res.status(201).json(data);
  } catch (error) {
    logger.error('[RecurringTasks] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create recurring tasks' });
  }
});

// DELETE /:taskId — soft delete
router.delete('/:taskId', async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { taskId } = req.params;

    const { error } = await supabase
      .from('project_recurring_tasks')
      .update({ is_active: false })
      .eq('id', taskId)
      .eq('owner_id', ownerId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    logger.error('[RecurringTasks] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete recurring task' });
  }
});

// ============================================================
// DAILY LOGS
// ============================================================

// GET /:projectId/logs — get daily log entries
router.get('/:projectId/logs', async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;
    const { date, start_date, end_date, worker_id } = req.query;

    let query = supabase
      .from('recurring_task_daily_logs')
      .select('*, project_recurring_tasks(title, quantity_unit, requires_quantity)')
      .eq('project_id', projectId)
      .order('log_date', { ascending: true });

    if (date) {
      query = query.eq('log_date', date);
    } else if (start_date && end_date) {
      query = query.gte('log_date', start_date).lte('log_date', end_date);
    } else {
      // Default: last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query.gte('log_date', sevenDaysAgo.toISOString().split('T')[0]);
    }

    if (worker_id) query = query.eq('worker_id', worker_id);

    const { data, error } = await query;
    if (error) throw error;

    // Get worker names
    const workerIds = [...new Set((data || []).map(l => l.worker_id).filter(Boolean))];
    let workerNames = {};
    if (workerIds.length > 0) {
      const { data: workers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', workerIds);
      if (workers) workers.forEach(w => { workerNames[w.id] = w.full_name; });
    }

    // Group by date
    const byDate = {};
    (data || []).forEach(log => {
      if (!byDate[log.log_date]) byDate[log.log_date] = [];
      byDate[log.log_date].push({
        id: log.id,
        title: log.project_recurring_tasks?.title || 'Unknown',
        completed: log.completed,
        quantity: log.quantity ? parseFloat(log.quantity) : null,
        quantity_unit: log.project_recurring_tasks?.quantity_unit,
        worker_name: workerNames[log.worker_id] || null,
        notes: log.notes,
      });
    });

    res.json(byDate);
  } catch (error) {
    logger.error('[RecurringTasks] Logs error:', error.message);
    res.status(500).json({ error: 'Failed to get daily logs' });
  }
});

// POST /logs — create or update a daily log entry (upsert)
router.post('/logs', async (req, res) => {
  try {
    const userId = req.user.id;
    const { recurring_task_id, project_id, log_date, completed, quantity, notes } = req.body;

    if (!recurring_task_id || !project_id) {
      return res.status(400).json({ error: 'recurring_task_id and project_id are required' });
    }

    const date = log_date || new Date().toISOString().split('T')[0];

    // Get worker_id if user is a worker
    let workerId = userId; // default to user's profile id
    const { data: worker } = await supabase
      .from('workers')
      .select('id')
      .eq('user_id', userId)
      .single();
    // If they're a worker, use their worker profile id; otherwise use their auth id

    // Get project owner for owner_id field
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', project_id)
      .single();

    const ownerId = project?.user_id || userId;

    const { data, error } = await supabase
      .from('recurring_task_daily_logs')
      .upsert({
        recurring_task_id,
        project_id,
        owner_id: ownerId,
        worker_id: userId,
        log_date: date,
        completed: completed || false,
        quantity: quantity || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'recurring_task_id,worker_id,log_date',
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    logger.error('[RecurringTasks] Log upsert error:', error.message);
    res.status(500).json({ error: 'Failed to save daily log' });
  }
});

module.exports = router;
